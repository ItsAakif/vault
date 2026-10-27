// @vitest-environment node
/**
 * Smoke test: the active `CloudIntegration` row (provider 'google', isActive true) is the
 * canonical Drive token store for the web path, and the JWT `session.user.accessToken` is a
 * read-only fallback (T035 / ADR-006 D1).
 *
 * `@/lib/db`, `next-auth/next`, `googleapis` and the heavy `@/lib/google-drive-backend` are
 * mocked, so no DB, no Google client and no network are touched. `@/lib/auth` is mocked so the
 * route tests can assert the Drive client is (not) built; the unit tests load the real
 * `getGoogleDriveClient` via `vi.importActual` so the DB-row-first / JWT-fallback / throw ladder
 * is exercised against the real implementation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { db } from '@/lib/db'
import { getGoogleDriveClient } from '@/lib/auth'
import { getActiveGoogleIntegration } from '@/lib/cloud-storage/google-integration'

import * as driveStatus from '@/app/api/drive/status/route'
import * as driveSetup from '@/app/api/drive/setup/route'

// Shared handle on the mocked `google.auth.OAuth2` instances (hoisted: factories run first).
const googleAuth = vi.hoisted(() => {
  const setCredentials = vi.fn()
  function OAuth2() {
    return { setCredentials }
  }
  return { setCredentials, OAuth2 }
})

// Shared handle on the mocked Drive backend (hoisted: factories run first).
const backend = vi.hoisted(() => {
  const initializeVaultStructure = vi.fn()
  class FakeGoogleDriveBackendService {
    initializeVaultStructure = initializeVaultStructure
    // Next constructs this with (oauth2Client, userId); the mock ignores both.
    constructor(_oauth2Client: unknown, _userId: string) {}
  }
  return { initializeVaultStructure, FakeGoogleDriveBackendService }
})

vi.mock('next-auth/next', () => ({ getServerSession: vi.fn() }))
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
vi.mock('@/lib/auth', () => ({
  authOptions: {},
  getGoogleDriveClient: vi.fn(),
}))
vi.mock('@/lib/google-drive-backend', () => ({
  default: backend.FakeGoogleDriveBackendService,
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

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(`http://localhost${path}`, init)
}

describe('smoke: CloudIntegration row is the canonical Drive token store (T035)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    // Every route and helper logs caught errors; keep the test output clean.
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  describe('getActiveGoogleIntegration', () => {
    it('returns the active row from the canonical query', async () => {
      vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(ACTIVE_ROW as never)

      const result = await getActiveGoogleIntegration('u1')

      expect(result).toBe(ACTIVE_ROW)
      expect(vi.mocked(db.cloudIntegration.findFirst)).toHaveBeenCalledWith({
        where: { userId: 'u1', provider: 'google', isActive: true },
      })
    })

    it('returns null when there is no active row', async () => {
      vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(null as never)

      await expect(getActiveGoogleIntegration('u1')).resolves.toBeNull()
    })
  })

  describe('getGoogleDriveClient', () => {
    async function realGetGoogleDriveClient() {
      const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
      return actual.getGoogleDriveClient
    }

    it('prefers the active DB row even when the session has no accessToken', async () => {
      const client = await realGetGoogleDriveClient()
      vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(ACTIVE_ROW as never)

      const oauth2Client = await client({ user: { id: 'u1', email: 'demo@vault.com' } } as never)

      expect(oauth2Client).toBeDefined()
      expect(googleAuth.setCredentials).toHaveBeenCalledWith({
        access_token: 'db-access',
        refresh_token: 'db-refresh',
        expiry_date: 1_893_456_000_000,
      })
    })

    it('falls back to the JWT tokens when there is no DB row', async () => {
      const client = await realGetGoogleDriveClient()
      vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(null as never)

      await client({
        user: {
          id: 'u1',
          email: 'demo@vault.com',
          accessToken: 'jwt-access',
          refreshToken: 'jwt-refresh',
          expiresAt: 1_893_456_000_000,
        },
      } as never)

      expect(googleAuth.setCredentials).toHaveBeenCalledWith({
        access_token: 'jwt-access',
        refresh_token: 'jwt-refresh',
        expiry_date: 1_893_456_000_000,
      })
    })

    it('throws when neither the DB row nor the JWT tokens exist', async () => {
      const client = await realGetGoogleDriveClient()
      vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(null as never)

      await expect(
        client({ user: { id: 'u1', email: 'demo@vault.com' } } as never)
      ).rejects.toThrow('No Google Drive authorization available')
    })
  })

  describe('GET /api/drive/status', () => {
    it('reports not_configured (200) when a session has a JWT accessToken but no active row', async () => {
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: 'u1', email: 'demo@vault.com', accessToken: 'jwt-access' },
      } as never)
      vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(null as never)

      const response = await driveStatus.GET(request('/api/drive/status'))

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({
        success: false,
        status: 'not_configured',
        message: 'Google Drive not connected. Connect Google Drive from Settings > Integrations.',
        isConnected: false,
        vaultExists: false,
      })
      expect(vi.mocked(db.cloudIntegration.findFirst)).toHaveBeenCalledWith({
        where: { userId: 'u1', provider: 'google', isActive: true },
      })
      expect(vi.mocked(getGoogleDriveClient)).not.toHaveBeenCalled()
    })

    it('reports connected (200) when a session has an active row but no JWT accessToken', async () => {
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: 'u1', email: 'demo@vault.com' },
      } as never)
      vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(ACTIVE_ROW as never)
      vi.mocked(getGoogleDriveClient).mockResolvedValue({} as never)
      backend.initializeVaultStructure.mockResolvedValue({
        vaultFolderId: 'vault-1',
        folders: { Notes: 'f1', Resources: 'f2' },
      })

      const response = await driveStatus.GET(request('/api/drive/status'))
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.status).toBe('connected')
      expect(json.isConnected).toBe(true)
      expect(json.data.vaultFolderId).toBe('vault-1')
      expect(vi.mocked(getGoogleDriveClient)).toHaveBeenCalledTimes(1)
    })
  })

  describe('POST /api/drive/setup', () => {
    it('returns 403 when the session has no active row', async () => {
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: 'u1', email: 'demo@vault.com' },
      } as never)
      vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(null as never)

      const response = await driveSetup.POST(
        request('/api/drive/setup', { method: 'POST' })
      )

      expect(response.status).toBe(403)
      await expect(response.json()).resolves.toEqual({
        error: 'Google Drive access required. Connect Google Drive first.',
      })
      expect(vi.mocked(getGoogleDriveClient)).not.toHaveBeenCalled()
    })
  })
})
