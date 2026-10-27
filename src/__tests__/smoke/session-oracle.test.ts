// @vitest-environment node
/**
 * Smoke test (T044 / ADR-007 D7): the dev/test-only minted-session oracle.
 *
 * Case 1 (acceptance-bearing): a token minted by `mintSessionToken` round-trips through the real
 * `next-auth/jwt` `decode`, and the payload carries `id` + `sub` - the two keys
 * `src/lib/auth.ts`'s session callback reads (`token.id || token.sub`).
 *
 * Case 2: the real `getServerSession(authOptions)` decode reaches a route's auth guard.
 * `getServerSession` takes the RSC path when called with one argument and lazily does
 * `require("next/headers")` from inside the *externalized* `next-auth` CJS package
 * (node_modules/next-auth/next/index.js:100-127). Vitest's `vi.mock('next/headers', ...)` cannot
 * intercept that native `require`, so this test supplies the request context the way Next itself
 * would - by priming Node's shared `require.cache` entry for `next/headers`. Everything downstream
 * of the cookie is real: the real decode, the real `authOptions` callbacks, the real route guard.
 * Nothing in the auth guard is weakened or bypassed.
 *
 * Honest limits: this proves the route-level auth boundary and session decode. It does NOT prove
 * that Google's OAuth round trip works, that the adapter persisted an `Account` row, or that the
 * live callback wrote the CloudIntegration row.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import Module, { createRequire } from 'node:module'
import { NextRequest } from 'next/server'
import { decode } from 'next-auth/jwt'
import { mintSessionToken, sessionCookieName } from '@/__tests__/utils/session'

const SECRET = 't044-session-oracle-test-secret'

// The route graph reaches Prisma through @/lib/auth; mock the db handle so no database is opened.
// The jwt/session callbacks and the token decode remain the real ones.
vi.mock('@/lib/db', () => ({ db: { cloudIntegration: { findFirst: vi.fn() } } }))
vi.mock('googleapis', () => ({ google: { auth: { OAuth2: vi.fn() } } }))

const nodeRequire = createRequire(import.meta.url)

let GET: (request: NextRequest) => Promise<Response>

/**
 * Install a fake `next/headers` into Node's shared require cache, so the externalized `next-auth`
 * package's lazy `require("next/headers")` returns it. Returns a restore handle.
 */
function installRequestContext(cookie?: string): () => void {
  const id = nodeRequire.resolve('next/headers')
  const previous = nodeRequire.cache[id]
  const fake = new Module(id)
  fake.loaded = true
  fake.exports = {
    headers: async () => new Headers(cookie ? { cookie } : {}),
    cookies: async () => ({
      getAll: () => {
        if (!cookie) return []
        const separator = cookie.indexOf('=')
        return [{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1) }]
      },
    }),
  }
  nodeRequire.cache[id] = fake
  return () => {
    if (previous === undefined) delete nodeRequire.cache[id]
    else nodeRequire.cache[id] = previous
  }
}

describe('smoke: minted-session oracle (T044)', () => {
  describe('case 1: mintSessionToken round-trips through next-auth/jwt decode', () => {
    it('carries id and sub - the keys the session callback reads', async () => {
      const token = await mintSessionToken({ id: 'u1', email: 'u1@example.com' }, SECRET)

      const payload = await decode({ token, secret: SECRET })

      expect(payload).not.toBeNull()
      expect(payload?.id).toBe('u1')
      expect(payload?.sub).toBe('u1')
      expect(payload?.email).toBe('u1@example.com')
    })

    it('refuses a token decoded with a different secret', async () => {
      const token = await mintSessionToken({ id: 'u1', email: 'u1@example.com' }, SECRET)

      await expect(decode({ token, secret: 'a-different-secret' })).rejects.toThrow(
        /decryption operation failed/i
      )
    })

    it('sessionCookieName matches the mint script default and the __Secure- prefix', () => {
      expect(sessionCookieName()).toBe('next-auth.session-token')
      expect(sessionCookieName(true)).toBe('__Secure-next-auth.session-token')
    })
  })

  describe('case 2: the real getServerSession decode reaches the route auth guard', () => {
    let restoreCache: (() => void) | undefined
    let errorSpy: ReturnType<typeof vi.spyOn>

    beforeAll(async () => {
      // Set the secret before the route (and therefore the real authOptions) is imported.
      process.env.NEXTAUTH_SECRET = SECRET
      process.env.NEXTAUTH_URL = 'http://localhost:3000'
      const route = await import('@/app/api/drive/auth/route')
      GET = route.GET
    })

    beforeEach(() => {
      vi.clearAllMocks()
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      restoreCache?.()
      restoreCache = undefined
      errorSpy.mockRestore()
      vi.unstubAllEnvs()
    })

    it('accepts a minted cookie and reaches the handler body (not the 401)', async () => {
      const token = await mintSessionToken({ id: 'user-1', email: 'demo@vault.com' }, SECRET)
      restoreCache = installRequestContext(`${sessionCookieName()}=${token}`)
      vi.stubEnv('GOOGLE_CLIENT_ID', '')
      vi.stubEnv('GOOGLE_CLIENT_SECRET', '')

      const response = await GET(new NextRequest('http://localhost/api/drive/auth'))

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: 'Google Drive integration not configured',
      })
    })

    it('rejects a request with no cookie with the uniform 401', async () => {
      restoreCache = installRequestContext()

      const response = await GET(new NextRequest('http://localhost/api/drive/auth'))

      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    })
  })
})
