// @vitest-environment node
/**
 * Smoke test (T046 / ADR-008 D1-D4): the canonical Drive-availability predicate and the one
 * Drive error contract.
 *
 * `@/lib/db` and `googleapis` are mocked, so no DB, no Google client and no network are touched.
 * The REAL `./google-integration` and the REAL `./drive-availability` are loaded, so the
 * row -> tokens -> client ladder is exercised end to end.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { db } from '@/lib/db'
import {
  DRIVE_CONNECT_URL,
  DRIVE_GRANT_INVALID,
  DRIVE_NOT_CONNECTED,
  DRIVE_UNAVAILABLE_STATUS,
  isDriveUnavailableCode,
} from '@/lib/cloud-storage/drive-error-codes'
import {
  checkDriveConnection,
  requireDriveAccess,
  driveNotConnectedBody,
  driveGrantInvalidBody,
  isDriveGrantError,
  driveErrorResponse,
} from '@/lib/cloud-storage/drive-availability'

// Shared handle on the mocked `google.auth.OAuth2` constructor (hoisted: factories run first).
// The mock's own call count records construction.
const googleAuth = vi.hoisted(() => {
  const setCredentials = vi.fn()
  const OAuth2 = vi.fn(function MockOAuth2() {
    return { setCredentials }
  })
  return { setCredentials, OAuth2 }
})

vi.mock('@/lib/db', () => ({
  db: {
    cloudIntegration: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))
vi.mock('googleapis', () => ({
  google: { auth: { OAuth2: googleAuth.OAuth2 } },
}))

const ACTIVE_ROW = {
  id: 'ci-1',
  userId: 'u1',
  provider: 'google',
  accessToken: 'db-access',
  refreshToken: 'db-refresh',
  tokenType: 'Bearer',
  expiresAt: new Date(1_893_456_000_000),
  scopes: '[]',
  isActive: true,
}

const GRANT_ERRORS: unknown[] = [
  { code: 401 },
  { code: 403, message: 'Request had insufficient authentication scopes.' },
  { message: 'invalid_grant' },
]

describe('smoke: the shared Drive-availability predicate and error contract (T046)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    // The helpers log caught errors; keep the test output clean.
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  describe('drive-error-codes', () => {
    it('exposes the ADR-008 D3 vocabulary', () => {
      expect(DRIVE_NOT_CONNECTED).toBe('DRIVE_NOT_CONNECTED')
      expect(DRIVE_GRANT_INVALID).toBe('DRIVE_GRANT_INVALID')
      expect(DRIVE_CONNECT_URL).toBe('/settings/cloud-storage')
      expect(DRIVE_UNAVAILABLE_STATUS).toBe(403)
    })

    it('isDriveUnavailableCode narrows only the two Drive codes', () => {
      expect(isDriveUnavailableCode('DRIVE_NOT_CONNECTED')).toBe(true)
      expect(isDriveUnavailableCode('DRIVE_GRANT_INVALID')).toBe(true)
      expect(isDriveUnavailableCode('NOT_A_CODE')).toBe(false)
      expect(isDriveUnavailableCode(undefined)).toBe(false)
      expect(isDriveUnavailableCode(null)).toBe(false)
      expect(isDriveUnavailableCode(403)).toBe(false)
    })
  })

  describe('checkDriveConnection', () => {
    it('is connected when an active CloudIntegration row exists', async () => {
      vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(ACTIVE_ROW as never)

      const result = await checkDriveConnection('u1')

      expect(result).toEqual({ connected: true, integration: ACTIVE_ROW })
      expect(vi.mocked(db.cloudIntegration.findFirst)).toHaveBeenCalledWith({
        where: { userId: 'u1', provider: 'google', isActive: true },
      })
    })

    it('is not connected when there is no active row', async () => {
      vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(null as never)

      await expect(checkDriveConnection('u1')).resolves.toEqual({ connected: false })
    })
  })

  describe('requireDriveAccess', () => {
    it('returns the DRIVE_NOT_CONNECTED 403 body and builds no client when there is no row', async () => {
      vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(null as never)

      const result = await requireDriveAccess('u1')

      expect(result).toEqual({
        ok: false,
        status: 403,
        body: {
          error: 'Google Drive not configured',
          message: 'Connect Google Drive from Settings > Cloud Storage to use this feature.',
          code: 'DRIVE_NOT_CONNECTED',
          connectUrl: '/settings/cloud-storage',
        },
      })
      expect(googleAuth.OAuth2).not.toHaveBeenCalled()
      expect(googleAuth.setCredentials).not.toHaveBeenCalled()
    })

    it('returns a client built from the canonical row when one exists', async () => {
      vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(ACTIVE_ROW as never)

      const result = await requireDriveAccess('u1')

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('expected ok:true')
      expect(result.userId).toBe('u1')
      expect(result.client).toBeDefined()
      expect(googleAuth.OAuth2).toHaveBeenCalledTimes(1)
      expect(googleAuth.setCredentials).toHaveBeenCalledWith({
        access_token: 'db-access',
        refresh_token: 'db-refresh',
        expiry_date: 1_893_456_000_000,
      })
    })
  })

  describe('isDriveGrantError', () => {
    it('is true for a 401, an insufficient-scope 403, invalid_grant and a 401 response status', () => {
      expect(isDriveGrantError({ code: 401 })).toBe(true)
      expect(
        isDriveGrantError({ code: 403, message: 'Request had insufficient authentication scopes.' })
      ).toBe(true)
      expect(isDriveGrantError({ message: 'invalid_grant' })).toBe(true)
      expect(isDriveGrantError({ response: { status: 401 } })).toBe(true)
    })

    it('is false for a generic error and for a quota 403', () => {
      expect(isDriveGrantError(new Error('boom'))).toBe(false)
      expect(isDriveGrantError({ code: 403, message: 'userRateLimitExceeded' })).toBe(false)
    })
  })

  describe('driveErrorResponse', () => {
    it('maps a dead grant to 403 DRIVE_GRANT_INVALID', async () => {
      for (const error of GRANT_ERRORS) {
        const response = driveErrorResponse(error, 'Failed to fetch content')
        const json = await response.json()

        expect(response.status).toBe(403)
        expect(json).toEqual(driveGrantInvalidBody())
        expect(json).toEqual({
          error: 'Google Drive access expired or was revoked',
          message: 'Reconnect Google Drive from Settings > Cloud Storage to continue.',
          code: 'DRIVE_GRANT_INVALID',
          connectUrl: '/settings/cloud-storage',
        })
      }
    })

    it('keeps the route 500 { error, details } shape for anything else', async () => {
      const response = driveErrorResponse(new Error('boom'), 'Failed to fetch content')

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({
        error: 'Failed to fetch content',
        details: 'boom',
      })
    })
  })

  describe('the ADR-008 D3 bodies', () => {
    it('driveNotConnectedBody deep-equals the D3 table', () => {
      expect(driveNotConnectedBody()).toEqual({
        error: 'Google Drive not configured',
        message: 'Connect Google Drive from Settings > Cloud Storage to use this feature.',
        code: 'DRIVE_NOT_CONNECTED',
        connectUrl: '/settings/cloud-storage',
      })
    })

    it('driveGrantInvalidBody deep-equals the D3 table', () => {
      expect(driveGrantInvalidBody()).toEqual({
        error: 'Google Drive access expired or was revoked',
        message: 'Reconnect Google Drive from Settings > Cloud Storage to continue.',
        code: 'DRIVE_GRANT_INVALID',
        connectUrl: '/settings/cloud-storage',
      })
    })
  })
})
