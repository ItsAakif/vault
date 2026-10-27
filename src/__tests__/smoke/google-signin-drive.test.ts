// @vitest-environment node
/**
 * Smoke test (T040 / ADR-007 D3): signing in with Google writes the canonical CloudIntegration
 * row, but only when the observed grant actually includes the Drive scope.
 *
 * `@/lib/db` is mocked, so no database is touched. What matters is the upsert payload:
 * the scope gate, the observed scopes, the expiry, and the rule that an absent `refresh_token`
 * must not null a stored one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }))

vi.mock('@/lib/db', () => ({
  db: {
    cloudIntegration: {
      upsert,
    },
  },
}))

import {
  DRIVE_SCOPE,
  grantedScopes,
  grantsDrive,
  persistSignInDriveTokens,
} from '@/lib/cloud-storage/google-signin'

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const USER_ID = 'u1'
const EXPIRES_AT = 1_700_000_000

function upsertArg() {
  return {
    where: upsert.mock.calls[0][0].where as Record<string, unknown>,
    update: upsert.mock.calls[0][0].update as Record<string, unknown>,
    create: upsert.mock.calls[0][0].create as Record<string, unknown>,
  }
}

describe('smoke: Google sign-in persists the Drive grant (T040)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    upsert.mockResolvedValue({})
  })

  describe('grantsDrive', () => {
    it('is true only when the exact Drive scope token is granted', () => {
      expect(grantsDrive(DRIVE_SCOPE)).toBe(true)
      expect(grantsDrive(`openid email profile ${DRIVE_SCOPE}`)).toBe(true)
    })

    it('does not accept a suffix-collision scope such as drive.file', () => {
      expect(grantsDrive(DRIVE_FILE_SCOPE)).toBe(false)
      expect(grantsDrive(`openid email ${DRIVE_FILE_SCOPE}`)).toBe(false)
    })

    it('is false for undefined, null and empty/whitespace scope', () => {
      expect(grantsDrive(undefined)).toBe(false)
      expect(grantsDrive(null)).toBe(false)
      expect(grantsDrive('')).toBe(false)
      expect(grantsDrive('   ')).toBe(false)
    })
  })

  describe('grantedScopes', () => {
    it('splits on whitespace and drops empties', () => {
      expect(grantedScopes(`  openid   email\t${DRIVE_SCOPE}  `)).toEqual([
        'openid',
        'email',
        DRIVE_SCOPE,
      ])
      expect(grantedScopes(undefined)).toEqual([])
    })
  })

  describe('persistSignInDriveTokens', () => {
    it('writes the canonical row when Drive was granted', async () => {
      const scope = `openid email ${DRIVE_SCOPE}`

      const result = await persistSignInDriveTokens({
        userId: USER_ID,
        account: {
          access_token: 'access-1',
          refresh_token: 'refresh-1',
          expires_at: EXPIRES_AT,
          scope,
        },
      })

      expect(result).toBe('written')
      expect(upsert).toHaveBeenCalledTimes(1)

      const { where, update, create } = upsertArg()
      expect(where).toEqual({ userId_provider: { userId: USER_ID, provider: 'google' } })
      expect(update.accessToken).toBe('access-1')
      expect(update.refreshToken).toBe('refresh-1')
      expect(update.isActive).toBe(true)
      expect(update.tokenType).toBe('Bearer')
      expect(update.scopes).toBe(JSON.stringify(['openid', 'email', DRIVE_SCOPE]))
      expect(update.expiresAt).toEqual(new Date(EXPIRES_AT * 1000))
      expect(update.updatedAt).toBeInstanceOf(Date)

      expect(create).toMatchObject({
        userId: USER_ID,
        provider: 'google',
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        tokenType: 'Bearer',
        scopes: JSON.stringify(['openid', 'email', DRIVE_SCOPE]),
        isActive: true,
      })
      expect(create.expiresAt).toEqual(new Date(EXPIRES_AT * 1000))
    })

    it('omits refreshToken on update when the account has none, and stores null on create', async () => {
      const result = await persistSignInDriveTokens({
        userId: USER_ID,
        account: { access_token: 'access-1', scope: DRIVE_SCOPE },
      })

      expect(result).toBe('written')
      const { update, create } = upsertArg()
      expect('refreshToken' in update).toBe(false)
      expect(create.refreshToken).toBeNull()
      // No expiry observed -> leave it undefined rather than inventing one.
      expect(update.expiresAt).toBeUndefined()
    })

    it('includes refreshToken on update when the account has one', async () => {
      await persistSignInDriveTokens({
        userId: USER_ID,
        account: { access_token: 'access-1', refresh_token: 'refresh-1', scope: DRIVE_SCOPE },
      })

      const { update } = upsertArg()
      expect('refreshToken' in update).toBe(true)
      expect(update.refreshToken).toBe('refresh-1')
    })

    it('skips when Drive was not granted', async () => {
      const result = await persistSignInDriveTokens({
        userId: USER_ID,
        account: { access_token: 'access-1', scope: `openid email ${DRIVE_FILE_SCOPE}` },
      })

      expect(result).toBe('skipped')
      expect(upsert).not.toHaveBeenCalled()
    })

    it('skips when the scope is undefined', async () => {
      const result = await persistSignInDriveTokens({
        userId: USER_ID,
        account: { access_token: 'access-1' },
      })

      expect(result).toBe('skipped')
      expect(upsert).not.toHaveBeenCalled()
    })

    it('skips when the scope is empty', async () => {
      const result = await persistSignInDriveTokens({
        userId: USER_ID,
        account: { access_token: 'access-1', scope: '' },
      })

      expect(result).toBe('skipped')
      expect(upsert).not.toHaveBeenCalled()
    })

    it('skips when the access token is absent', async () => {
      const result = await persistSignInDriveTokens({
        userId: USER_ID,
        account: { scope: DRIVE_SCOPE },
      })

      expect(result).toBe('skipped')
      expect(upsert).not.toHaveBeenCalled()
    })

    it('rejects when the database write rejects (the caller contains it)', async () => {
      upsert.mockRejectedValue(new Error('database unavailable'))

      await expect(
        persistSignInDriveTokens({
          userId: USER_ID,
          account: { access_token: 'access-1', scope: DRIVE_SCOPE },
        })
      ).rejects.toThrow('database unavailable')
    })
  })
})
