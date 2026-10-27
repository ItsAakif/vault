// @vitest-environment node
/**
 * Smoke test: the nine Drive / files / sync route families authenticate with the NextAuth
 * session cookie instead of the retired Bearer-only `withAuth` wrapper (T034 / ADR-006 D2).
 *
 * Every `getServerSession` (both specifier variants), `@/lib/auth`, `@/lib/db`, `googleapis`,
 * and the three heavy domain modules are mocked, so no DB, no Google client and no network are
 * touched. With no session every handler must return exactly `{ error: 'Unauthorized' }` 401;
 * with a session the same handlers must reach their bodies (proven by asserting the mocked
 * dependency was called), which a wrapper-shaped route could not do.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { db } from '@/lib/db'
import { fileManager } from '@/lib/file-management/unified-manager'
import { offlineSync } from '@/lib/sync/offline-sync'

import * as integrations from '@/app/api/integrations/route'
import * as driveAuth from '@/app/api/drive/auth/route'
import * as driveSync from '@/app/api/drive/sync/route'
import * as driveFolders from '@/app/api/drive/folders/route'
import * as driveFiles from '@/app/api/drive/files/route'
import * as driveFile from '@/app/api/drive/files/[fileId]/route'
import * as files from '@/app/api/files/route'
import * as filesUpload from '@/app/api/files/upload/route'
import * as sync from '@/app/api/sync/route'

// Shared handle on the mocked `google.auth.OAuth2` instances (hoisted: factories run first).
const googleAuth = vi.hoisted(() => {
  const getToken = vi.fn()
  const generateAuthUrl = vi.fn(() => 'https://accounts.google.com/o/oauth2/v2/auth?mock=1')
  function OAuth2() {
    return { getToken, generateAuthUrl }
  }
  return { getToken, generateAuthUrl, OAuth2 }
})

vi.mock('next-auth/next', () => ({ getServerSession: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({
  db: {
    cloudIntegration: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    activity: { create: vi.fn(), findMany: vi.fn() },
    file: { findMany: vi.fn() },
  },
}))
vi.mock('googleapis', () => ({
  google: { auth: { OAuth2: googleAuth.OAuth2 } },
}))
vi.mock('@/lib/cloud-storage/google-drive', () => ({
  GoogleDriveProvider: vi.fn(),
}))
vi.mock('@/lib/file-management/unified-manager', () => ({
  fileManager: { searchFiles: vi.fn(), uploadFile: vi.fn() },
}))
vi.mock('@/lib/sync/offline-sync', () => ({
  offlineSync: { getSyncStatus: vi.fn(), queueChange: vi.fn(), syncChanges: vi.fn() },
}))

const SESSION = { user: { id: 'user-1', email: 'demo@vault.com' } }
const AUTH_401 = { error: 'Unauthorized' }
const DRIVE_NOT_CONNECTED = { success: false, error: 'Google Drive not connected' }

function request(
  path: string,
  init?: ConstructorParameters<typeof NextRequest>[1]
): NextRequest {
  return new NextRequest(`http://localhost${path}`, init)
}

function jsonRequest(method: string, path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// A dynamic route handler in Next 15 receives `params` as a Promise (ADR-002 item 2).
function params(fileId: string): { params: Promise<{ fileId: string }> } {
  return { params: Promise.resolve({ fileId }) }
}

/**
 * Every one of the 20 exported handlers across the nine converted files. `invoke` performs a
 * call that, with no session, must be short-circuited by the auth guard.
 */
const handlers: Array<[string, () => Promise<Response>]> = [
  ['integrations GET', () => integrations.GET(request('/api/integrations'))],
  ['integrations POST', () => integrations.POST(jsonRequest('POST', '/api/integrations', { provider: 'google' }))],
  ['drive/auth GET', () => driveAuth.GET(request('/api/drive/auth'))],
  ['drive/auth POST', () => driveAuth.POST(jsonRequest('POST', '/api/drive/auth', { code: 'auth-code' }))],
  ['drive/auth DELETE', () => driveAuth.DELETE(request('/api/drive/auth', { method: 'DELETE' }))],
  ['drive/sync GET', () => driveSync.GET(request('/api/drive/sync'))],
  ['drive/sync POST', () => driveSync.POST(jsonRequest('POST', '/api/drive/sync', { action: 'sync' }))],
  ['drive/folders GET', () => driveFolders.GET(request('/api/drive/folders'))],
  ['drive/folders POST', () => driveFolders.POST(jsonRequest('POST', '/api/drive/folders', { name: 'Inbox' }))],
  ['drive/files GET', () => driveFiles.GET(request('/api/drive/files'))],
  ['drive/files POST', () => driveFiles.POST(jsonRequest('POST', '/api/drive/files', { fileName: 'a.txt', fileContent: '' }))],
  ['drive/files DELETE', () => driveFiles.DELETE(request('/api/drive/files?fileId=file-1', { method: 'DELETE' }))],
  ['drive/files/[fileId] GET', () => driveFile.GET(request('/api/drive/files/file-1'), params('file-1'))],
  ['drive/files/[fileId] PUT', () => driveFile.PUT(jsonRequest('PUT', '/api/drive/files/file-1', {}), params('file-1'))],
  ['drive/files/[fileId] DELETE', () => driveFile.DELETE(request('/api/drive/files/file-1', { method: 'DELETE' }), params('file-1'))],
  ['files GET', () => files.GET(request('/api/files'))],
  ['files POST', () => files.POST(new NextRequest('http://localhost/api/files', { method: 'POST', body: new FormData() }))],
  ['files/upload POST', () => filesUpload.POST(new NextRequest('http://localhost/api/files/upload', { method: 'POST', body: new FormData() }))],
  ['sync GET', () => sync.GET(request('/api/sync'))],
  ['sync POST', () => sync.POST(jsonRequest('POST', '/api/sync', { changes: [] }))],
]

describe('smoke: drive routes require a NextAuth session (T034)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    // Every route logs caught errors; keep the test output clean.
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
    vi.unstubAllEnvs()
  })

  describe('without a session: 401 { error: "Unauthorized" }', () => {
    for (const [name, invoke] of handlers) {
      it(`${name} returns 401 with the uniform auth body`, async () => {
        vi.mocked(getServerSession).mockResolvedValue(null as never)

        const response = await invoke()

        expect(response.status).toBe(401)
        await expect(response.json()).resolves.toEqual(AUTH_401)
      })
    }
  })

  describe('with a session: the handler body is reached', () => {
    beforeEach(() => {
      vi.mocked(getServerSession).mockResolvedValue(SESSION as never)
      googleAuth.getToken.mockReset()
      googleAuth.generateAuthUrl.mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?mock=1')
    })

    it('GET /api/integrations returns 200 with an empty integration list', async () => {
      vi.mocked(db.cloudIntegration.findMany).mockResolvedValue([] as never)

      const response = await integrations.GET(request('/api/integrations'))

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ success: true, integrations: [] })
      expect(vi.mocked(db.cloudIntegration.findMany)).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } })
      )
    })

    it('POST /api/integrations rejects Google with the deterministic pointing error', async () => {
      const response = await integrations.POST(jsonRequest('POST', '/api/integrations', { provider: 'google' }))

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: 'Use /api/drive/auth for Google Drive integration',
      })
    })

    it('GET /api/drive/auth returns the 500 credential-free discriminator when Google env is empty', async () => {
      vi.stubEnv('GOOGLE_CLIENT_ID', '')
      vi.stubEnv('GOOGLE_CLIENT_SECRET', '')

      const response = await driveAuth.GET(request('/api/drive/auth'))

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: 'Google Drive integration not configured',
      })
    })

    it('POST /api/drive/auth exchanges a code and persists the tokens (not the auth 401)', async () => {
      googleAuth.getToken.mockResolvedValue({
        tokens: { access_token: 'at-1', refresh_token: 'rt-1', expiry_date: Date.now() + 3_600_000 },
      })
      vi.mocked(db.cloudIntegration.upsert).mockResolvedValue({} as never)
      vi.mocked(db.activity.create).mockResolvedValue({} as never)

      const response = await driveAuth.POST(jsonRequest('POST', '/api/drive/auth', { code: 'auth-code' }))

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({
        success: true,
        message: 'Google Drive connected successfully',
      })
      expect(vi.mocked(db.cloudIntegration.upsert)).toHaveBeenCalledTimes(1)
      expect(googleAuth.getToken).toHaveBeenCalledWith('auth-code')
    })

    it('DELETE /api/drive/auth deactivates the integration (not the auth 401)', async () => {
      vi.mocked(db.cloudIntegration.updateMany).mockResolvedValue({ count: 1 } as never)
      vi.mocked(db.activity.create).mockResolvedValue({} as never)

      const response = await driveAuth.DELETE(request('/api/drive/auth', { method: 'DELETE' }))

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({
        success: true,
        message: 'Google Drive disconnected successfully',
      })
      expect(vi.mocked(db.cloudIntegration.updateMany)).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', provider: 'google' } })
      )
    })

    it('GET /api/drive/sync reports disconnected (200) when there is no CloudIntegration row', async () => {
      vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(null as never)

      const response = await driveSync.GET(request('/api/drive/sync'))

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({
        success: true,
        connected: false,
        message: 'Google Drive not connected',
      })
    })

    it('GET /api/drive/files hits the inner domain guard (not the auth guard) when Drive is not connected', async () => {
      vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(null as never)

      const response = await driveFiles.GET(request('/api/drive/files'))
      const json = await response.json()

      expect(response.status).toBe(401)
      expect(json).toEqual(DRIVE_NOT_CONNECTED)
      expect(json).not.toEqual(AUTH_401)
      expect(vi.mocked(db.cloudIntegration.findFirst)).toHaveBeenCalledTimes(1)
    })

    const domainGuardCases: Array<[string, () => Promise<Response>]> = [
      ['drive/sync POST', () => driveSync.POST(jsonRequest('POST', '/api/drive/sync', { action: 'sync' }))],
      ['drive/folders GET', () => driveFolders.GET(request('/api/drive/folders'))],
      ['drive/folders POST', () => driveFolders.POST(jsonRequest('POST', '/api/drive/folders', { name: 'Inbox' }))],
      ['drive/files POST', () => driveFiles.POST(jsonRequest('POST', '/api/drive/files', { fileName: 'a.txt', fileContent: '' }))],
      ['drive/files DELETE', () => driveFiles.DELETE(request('/api/drive/files?fileId=file-1', { method: 'DELETE' }))],
      ['drive/files/[fileId] GET', () => driveFile.GET(request('/api/drive/files/file-1'), params('file-1'))],
      ['drive/files/[fileId] PUT', () => driveFile.PUT(jsonRequest('PUT', '/api/drive/files/file-1', {}), params('file-1'))],
      ['drive/files/[fileId] DELETE', () => driveFile.DELETE(request('/api/drive/files/file-1', { method: 'DELETE' }), params('file-1'))],
    ]

    for (const [name, invoke] of domainGuardCases) {
      it(`${name} reaches the domain guard and returns '${DRIVE_NOT_CONNECTED.error}' (not the auth 401)`, async () => {
        vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(null as never)

        const response = await invoke()
        const json = await response.json()

        expect(response.status).toBe(401)
        expect(json).toEqual(DRIVE_NOT_CONNECTED)
        expect(json).not.toEqual(AUTH_401)
        expect(vi.mocked(db.cloudIntegration.findFirst)).toHaveBeenCalledWith({
          where: { userId: 'user-1', provider: 'google', isActive: true },
        })
      })
    }

    it('GET /api/files returns 200 from the mocked file manager', async () => {
      vi.mocked(fileManager.searchFiles).mockResolvedValue({ files: [], total: 0 } as never)

      const response = await files.GET(request('/api/files'))

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ success: true, data: { files: [], total: 0 } })
      expect(vi.mocked(fileManager.searchFiles)).toHaveBeenCalledWith('user-1', expect.any(Object))
    })

    it('POST /api/files reaches the uploader (empty form gives 400, not the auth 401)', async () => {
      const response = await files.POST(
        new NextRequest('http://localhost/api/files', { method: 'POST', body: new FormData() })
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ success: false, error: 'No file provided' })
      expect(vi.mocked(getServerSession)).toHaveBeenCalled()
    })

    it('POST /api/files/upload reaches the uploader (empty form gives 400, not the auth 401)', async () => {
      const response = await filesUpload.POST(
        new NextRequest('http://localhost/api/files/upload', { method: 'POST', body: new FormData() })
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ success: false, error: 'No files provided' })
      expect(vi.mocked(getServerSession)).toHaveBeenCalled()
    })

    it('GET /api/sync returns 200 from the mocked offline sync status', async () => {
      vi.mocked(offlineSync.getSyncStatus).mockResolvedValue({ pending: 0 } as never)

      const response = await sync.GET(request('/api/sync'))

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ success: true, data: { pending: 0 } })
      expect(vi.mocked(offlineSync.getSyncStatus)).toHaveBeenCalledWith('user-1')
    })

    it('POST /api/sync queues changes with the constant deviceId "unknown"', async () => {
      vi.mocked(offlineSync.queueChange).mockResolvedValue(undefined as never)
      vi.mocked(offlineSync.syncChanges).mockResolvedValue({ applied: 1 } as never)

      const response = await sync.POST(
        jsonRequest('POST', '/api/sync', { changes: [{ id: 'change-1', entity: 'note' }] })
      )

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ success: true, data: { applied: 1 } })
      expect(vi.mocked(offlineSync.queueChange)).toHaveBeenCalledWith({
        id: 'change-1',
        entity: 'note',
        userId: 'user-1',
        deviceId: 'unknown',
      })
    })
  })
})
