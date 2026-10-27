// @vitest-environment node
/**
 * Route-level test for the narrowed cloud-storage settings API (T064 / ADR-012 D1).
 *
 * The surface now knows about exactly one provider, `google`. These tests are the assertion
 * that fails if the removed OneDrive / Dropbox / Local descriptors, PATCH branches or
 * `test?provider=microsoft|dropbox` success paths come back.
 *
 * `getServerSession` and `@/lib/db` are mocked following the pattern established by the
 * `src/__tests__/smoke/**` route suites: the exported handlers are called directly with a real
 * `NextRequest`, no DB and no network are touched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { db } from '@/lib/db'

import * as cloudStorage from '@/app/api/settings/cloud-storage/route'
import * as cloudStorageTest from '@/app/api/settings/cloud-storage/test/route'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('next-auth/next', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({
  db: {
    cloudIntegration: { findMany: vi.fn() },
    userPreferences: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))

const SESSION = { user: { id: 'user-1', email: 'demo@vault.com' } }

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(`http://localhost${path}`, init)
}

function jsonRequest(method: string, path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function preferencesWith(cloudProviders: Record<string, unknown>) {
  return { notificationCategories: JSON.stringify({ cloudProviders }) }
}

describe('cloud-storage settings API is narrowed to Google Drive only (T064)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue(SESSION as never)
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  describe('GET /api/settings/cloud-storage', () => {
    it('returns exactly one provider descriptor, and it is google', async () => {
      vi.mocked(db.cloudIntegration.findMany).mockResolvedValue([] as never)

      const response = await cloudStorage.GET(request('/api/settings/cloud-storage'))
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(Array.isArray(body.providers)).toBe(true)
      expect(body.providers.length).toBe(1)
      expect(body.providers[0].id).toBe('google')
      // The google descriptor is kept byte-identical: the three deleted ids must not appear.
      expect(body.providers.map((p: { id: string }) => p.id)).toEqual(['google'])
    })
  })

  describe('PATCH /api/settings/cloud-storage', () => {
    it("rejects providerId 'dropbox' with 400 Invalid request data", async () => {
      const response = await cloudStorage.PATCH(
        jsonRequest('PATCH', '/api/settings/cloud-storage', { providerId: 'dropbox', config: {} })
      )
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('Invalid request data')
      expect(vi.mocked(db.userPreferences.upsert)).not.toHaveBeenCalled()
    })

    it("rejects providerId 'microsoft' with 400 Invalid request data", async () => {
      const response = await cloudStorage.PATCH(
        jsonRequest('PATCH', '/api/settings/cloud-storage', { providerId: 'microsoft', config: {} })
      )
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('Invalid request data')
      expect(vi.mocked(db.userPreferences.upsert)).not.toHaveBeenCalled()
    })

    it("rejects providerId 'local' with 400 Invalid request data", async () => {
      const response = await cloudStorage.PATCH(
        jsonRequest('PATCH', '/api/settings/cloud-storage', { providerId: 'local', config: {} })
      )
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('Invalid request data')
      expect(vi.mocked(db.userPreferences.upsert)).not.toHaveBeenCalled()
    })

    it("accepts providerId 'google' with 200 { success: true }", async () => {
      vi.mocked(db.userPreferences.findUnique).mockResolvedValue(null as never)
      vi.mocked(db.userPreferences.upsert).mockResolvedValue({} as never)

      const response = await cloudStorage.PATCH(
        jsonRequest('PATCH', '/api/settings/cloud-storage', { providerId: 'google', config: {} })
      )
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.success).toBe(true)
      expect(vi.mocked(db.userPreferences.upsert)).toHaveBeenCalledTimes(1)
    })
  })

  describe('GET /api/settings/cloud-storage/test', () => {
    it("returns 400 Unknown provider for ?provider=microsoft (no fake success)", async () => {
      vi.mocked(db.userPreferences.findUnique).mockResolvedValue(
        preferencesWith({
          microsoft: { clientId: 'a-valid-looking-id', clientSecret: 'a-valid-looking-secret' },
        }) as never
      )

      const response = await cloudStorageTest.GET(
        request('/api/settings/cloud-storage/test?provider=microsoft')
      )
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body).toEqual({ success: false, message: 'Unknown provider' })
    })

    it("returns 400 Unknown provider for ?provider=dropbox (no fake success)", async () => {
      vi.mocked(db.userPreferences.findUnique).mockResolvedValue(
        preferencesWith({
          dropbox: { clientId: 'a-long-enough-client-id', clientSecret: 'a-long-enough-secret' },
        }) as never
      )

      const response = await cloudStorageTest.GET(
        request('/api/settings/cloud-storage/test?provider=dropbox')
      )
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body).toEqual({ success: false, message: 'Unknown provider' })
    })

    it('returns 200 and a success boolean for a configured ?provider=google', async () => {
      vi.mocked(db.userPreferences.findUnique).mockResolvedValue(
        preferencesWith({
          google: {
            clientId: '1234567890.apps.googleusercontent.com',
            clientSecret: 'a-client-secret',
          },
        }) as never
      )

      const response = await cloudStorageTest.GET(
        request('/api/settings/cloud-storage/test?provider=google')
      )
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(typeof body.success).toBe('boolean')
    })
  })
})
