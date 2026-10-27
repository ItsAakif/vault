// @vitest-environment node
/**
 * Smoke test: the Drive OAuth boundary is hardened (T036 / ADR-006 D4a + D4b).
 *
 * - `src/lib/cloud-storage/oauth-state.ts` is exercised for real (round trip, tamper, expiry,
 *   garbage, fail-closed) so the nonce is proven, not assumed.
 * - `GET /api/drive/callback` is called with `next-auth/next`, `@/lib/db` and `googleapis`
 *   mocked. The credential-free discriminator is the no-session case: no token exchange
 *   (`getToken` never called) and no DB write, just a redirect to `error=not_authenticated`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { db } from '@/lib/db'
import { createOAuthState, verifyOAuthState, STATE_TTL_MS } from '@/lib/cloud-storage/oauth-state'

import * as callback from '@/app/api/drive/callback/route'

// Shared handle on the mocked Google client (hoisted: factories run before imports resolve).
const googleAuth = vi.hoisted(() => {
  const getToken = vi.fn()
  const setCredentials = vi.fn()
  const aboutGet = vi.fn()
  function OAuth2() {
    return { getToken, setCredentials }
  }
  function drive() {
    return { about: { get: aboutGet } }
  }
  return { getToken, setCredentials, aboutGet, OAuth2, drive }
})

vi.mock('next-auth/next', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({
  db: {
    cloudIntegration: { upsert: vi.fn() },
    activity: { create: vi.fn() },
  },
}))
vi.mock('googleapis', () => ({
  google: { auth: { OAuth2: googleAuth.OAuth2 }, drive: googleAuth.drive },
}))

const TEST_SECRET = 'test-nextauth-secret-for-oauth-state'
const NEXTAUTH_URL = 'http://localhost:3000'
const SESSION = { user: { id: 'user-1', email: 'demo@vault.com' } }

function request(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`)
}

describe('smoke: Drive OAuth boundary hardening (T036)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXTAUTH_SECRET', TEST_SECRET)
    vi.stubEnv('NEXTAUTH_URL', NEXTAUTH_URL)
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    googleAuth.aboutGet.mockResolvedValue({ data: { user: { emailAddress: 'demo@vault.com' } } })
  })

  afterEach(() => {
    errorSpy.mockRestore()
    warnSpy.mockRestore()
    logSpy.mockRestore()
    vi.unstubAllEnvs()
  })

  describe('oauth-state nonce (src/lib/cloud-storage/oauth-state.ts)', () => {
    it('round-trips a signed nonce back to the bound user id, and is neither the id nor its base64', () => {
      const state = createOAuthState('u1')

      expect(state).not.toBe('u1')
      expect(state).not.toBe(Buffer.from('u1', 'utf8').toString('base64'))
      expect(state).not.toBe(Buffer.from('u1', 'utf8').toString('base64url'))
      expect(verifyOAuthState(state)).toEqual({ userId: 'u1' })
    })

    it('returns the second user id, so the route-level userId !== session.user.id check is meaningful', () => {
      expect(verifyOAuthState(createOAuthState('u2'))).toEqual({ userId: 'u2' })
    })

    it('rejects a tampered payload (encoded part changed)', () => {
      const [encoded, signature] = createOAuthState('u1').split('.')
      const flipped = (encoded[0] === 'A' ? 'B' : 'A') + encoded.slice(1)

      expect(verifyOAuthState(`${flipped}.${signature}`)).toBeNull()
    })

    it('rejects a tampered signature', () => {
      const [encoded, signature] = createOAuthState('u1').split('.')
      const last = signature[signature.length - 1]
      const swapped = last === 'A' ? 'B' : 'A'
      const tampered = `${encoded}.${signature.slice(0, -1)}${swapped}`

      expect(verifyOAuthState(tampered)).toBeNull()
    })

    it('rejects an expired nonce (now beyond the TTL)', () => {
      const state = createOAuthState('u1')

      expect(verifyOAuthState(state, Date.now() + STATE_TTL_MS + 1)).toBeNull()
    })

    it('rejects garbage: no separator, three parts, empty, and a raw user id', () => {
      expect(verifyOAuthState('garbage')).toBeNull()
      expect(verifyOAuthState('a.b.c')).toBeNull()
      expect(verifyOAuthState('')).toBeNull()
      expect(verifyOAuthState('u1')).toBeNull()
    })

    it('fails closed: createOAuthState throws and verifyOAuthState returns null with no secret', () => {
      const state = createOAuthState('u1')
      vi.stubEnv('NEXTAUTH_SECRET', '')

      expect(() => createOAuthState('u1')).toThrow()
      expect(verifyOAuthState(state)).toBeNull()
    })
  })

  describe('GET /api/drive/callback', () => {
    it('without a session: no token exchange, no DB write, redirect with error=not_authenticated', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null as never)

      const response = await callback.GET(request('/api/drive/callback?code=x&state=y'))
      const location = response.headers.get('location') ?? ''

      expect(location).toContain('error=not_authenticated')
      expect(location).toContain('provider=google')
      expect(googleAuth.getToken).not.toHaveBeenCalled()
      expect(vi.mocked(db.cloudIntegration.upsert)).not.toHaveBeenCalled()
      expect(vi.mocked(db.activity.create)).not.toHaveBeenCalled()
    })

    it('with a session and a state bound to a different user: error=invalid_state, no getToken', async () => {
      vi.mocked(getServerSession).mockResolvedValue(SESSION as never)
      const state = createOAuthState('someone-else')

      const response = await callback.GET(
        request(`/api/drive/callback?code=x&state=${encodeURIComponent(state)}`)
      )

      expect(response.headers.get('location')).toContain('error=invalid_state')
      expect(googleAuth.getToken).not.toHaveBeenCalled()
      expect(vi.mocked(db.cloudIntegration.upsert)).not.toHaveBeenCalled()
    })

    it('with a session and an unsigned state (raw user id): error=invalid_state, no getToken', async () => {
      vi.mocked(getServerSession).mockResolvedValue(SESSION as never)

      const response = await callback.GET(request('/api/drive/callback?code=x&state=user-1'))

      expect(response.headers.get('location')).toContain('error=invalid_state')
      expect(googleAuth.getToken).not.toHaveBeenCalled()
    })

    it('with a session and a tampered state: error=invalid_state, no getToken', async () => {
      vi.mocked(getServerSession).mockResolvedValue(SESSION as never)
      const [encoded, signature] = createOAuthState('user-1').split('.')
      const flipped = (encoded[0] === 'A' ? 'B' : 'A') + encoded.slice(1)
      const tampered = `${flipped}.${signature}`

      const response = await callback.GET(
        request(`/api/drive/callback?code=x&state=${encodeURIComponent(tampered)}`)
      )

      expect(response.headers.get('location')).toContain('error=invalid_state')
      expect(googleAuth.getToken).not.toHaveBeenCalled()
    })

    it('with a session and a valid state: exchanges once and upserts under session.user.id', async () => {
      vi.mocked(getServerSession).mockResolvedValue(SESSION as never)
      const state = createOAuthState('user-1')
      googleAuth.getToken.mockResolvedValue({
        tokens: {
          access_token: 'at-1',
          refresh_token: 'rt-1',
          expiry_date: Date.now() + 3_600_000,
        },
      })
      vi.mocked(db.cloudIntegration.upsert).mockResolvedValue({} as never)
      vi.mocked(db.activity.create).mockResolvedValue({} as never)

      const response = await callback.GET(
        request(`/api/drive/callback?code=auth-code&state=${encodeURIComponent(state)}`)
      )

      expect(response.headers.get('location')).toContain('success=google_connected')
      expect(googleAuth.getToken).toHaveBeenCalledTimes(1)
      expect(googleAuth.getToken).toHaveBeenCalledWith('auth-code')

      const upsert = vi.mocked(db.cloudIntegration.upsert)
      expect(upsert).toHaveBeenCalledTimes(1)
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_provider: { userId: 'user-1', provider: 'google' },
          },
          create: expect.objectContaining({ userId: 'user-1', provider: 'google' }),
        })
      )

      // The activity log is written for the session user too.
      expect(vi.mocked(db.activity.create)).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1' }) })
      )
    })
  })
})
