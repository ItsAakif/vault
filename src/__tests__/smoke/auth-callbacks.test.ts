// @vitest-environment node
/**
 * Smoke test (T041 / ADR-007 D1, D3, D8): the auth configuration is Google-only, the `signIn`
 * gate refuses any Google profile whose email the provider did not verify, and the first `jwt`
 * invocation of a sign-in persists the canonical `CloudIntegration` row - without ever being
 * able to fail the sign-in.
 *
 * `@/lib/db` is mocked, so no Prisma client and no database are touched. `@/lib/cloud-storage/
 * google-signin` is deliberately left real: AC-6/AC-7/AC-8/AC-9 must exercise the actual scope
 * gate and the actual upsert payload rather than a stub.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }))

vi.mock('@/lib/db', () => ({
  db: {
    // The delegates the module graph touches. `user` and `userPreferences` are only referenced
    // by the adapter's createUser, which this file never invokes.
    user: {},
    cloudIntegration: { upsert },
    userPreferences: {},
  },
}))

import { authOptions } from '@/lib/auth'

const GOOGLE = 'google'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'
const EXPIRES_AT = 1999999999
const USER_ID = 'u1'

interface GoogleAccountFixture {
  provider: string
  access_token?: string
  refresh_token?: string
  expires_at?: number
  scope?: string
}

/**
 * `auth.ts` declares both callbacks with `any` parameters so they can be driven directly here.
 * `NextAuthOptions` re-declares them with the strict callback signatures (a required
 * `user`/`account`, a fully-populated `Account` - it requires `providerAccountId` and `type` -
 * and the four fields of `Profile`). The invocations below are deliberately partial, because what
 * is under test is *which* fields the implementation actually reads. This local view mirrors the
 * runtime function; production typing is unchanged and the code under test is not relaxed by it.
 */
interface CallbackInvoker {
  signIn: (params: { profile?: unknown }) => Promise<string | boolean>
  jwt: (params: {
    token: Record<string, unknown>
    user?: { id?: string }
    account?: GoogleAccountFixture | null
    profile?: unknown
  }) => Promise<Record<string, unknown>>
}

const callbacks = authOptions.callbacks as unknown as CallbackInvoker

function driveAccount(overrides: Partial<GoogleAccountFixture> = {}): GoogleAccountFixture {
  return {
    provider: GOOGLE,
    access_token: 'at',
    refresh_token: 'rt',
    expires_at: EXPIRES_AT,
    scope: `openid email ${DRIVE_SCOPE}`,
    ...overrides,
  }
}

describe('smoke: Google-only auth configuration (T041)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    upsert.mockResolvedValue({})
    // The jwt callback logs the two contained failure modes; keep the output readable.
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })

  describe('provider surface (AC-2, AC-3, AC-14)', () => {
    it('exposes exactly one provider, and it is Google', () => {
      expect(authOptions.providers).toHaveLength(1)
      expect(authOptions.providers[0].id).toBe(GOOGLE)
    })

    it('keeps the jwt session strategy', () => {
      expect(authOptions.session?.strategy).toBe('jwt')
    })

    it('sets allowDangerousEmailAccountLinking on the Google provider', () => {
      const google = authOptions.providers[0]
      expect(google.type).toBe('oauth')
      if (google.type !== 'oauth') throw new Error('the Google provider must be an OAuth provider')

      // next-auth 4.24.11's `providers/google.js` returns `{ ...defaults, options: userConfig }`:
      // the config passed to `GoogleProvider({...})` is nested under `.options`, NOT spread onto
      // the returned object. `core/lib/providers.js` deep-merges `.options` over the defaults
      // before `core/lib/callback-handler.js:155` reads
      // `provider.allowDangerousEmailAccountLinking`, so `.options` is where the effective flag
      // lives. Documented discrepancy with AC-14, which assumed the flat shape.
      expect(google.options?.allowDangerousEmailAccountLinking).toBe(true)
    })
  })

  describe('signIn gate (AC-13, ADR-007 D8)', () => {
    it('refuses a Google profile whose email Google did not verify', async () => {
      await expect(callbacks.signIn({ profile: { email_verified: false } })).resolves.toBe(false)
    })

    it('refuses a profile with no email_verified claim at all', async () => {
      await expect(callbacks.signIn({ profile: {} })).resolves.toBe(false)
    })

    it('refuses a missing profile', async () => {
      await expect(callbacks.signIn({})).resolves.toBe(false)
    })

    it('accepts a profile whose email Google verified', async () => {
      await expect(callbacks.signIn({ profile: { email_verified: true } })).resolves.toBe(true)
    })
  })

  describe('jwt callback persists the Drive grant (AC-6, AC-12)', () => {
    it('upserts the canonical row keyed on userId_provider and still returns the JWT fallback', async () => {
      const token = await callbacks.jwt({
        token: {},
        user: { id: USER_ID },
        account: driveAccount(),
        profile: {},
      })

      expect(upsert).toHaveBeenCalledTimes(1)
      const arg = upsert.mock.calls[0][0] as {
        where: Record<string, unknown>
        update: Record<string, unknown>
      }
      expect(arg.where).toEqual({ userId_provider: { userId: USER_ID, provider: GOOGLE } })
      expect(arg.update.accessToken).toBe('at')
      expect(arg.update.refreshToken).toBe('rt')
      expect(arg.update.isActive).toBe(true)
      expect(arg.update.expiresAt).toEqual(new Date(EXPIRES_AT * 1000))

      // AC-12: the JWT fallback the 14 domain routes depend on is untouched by the Drive write.
      expect(token.id).toBe(USER_ID)
      expect(token.accessToken).toBe('at')
      expect(token.expiresAt).toBe(EXPIRES_AT * 1000)
    })

    it('does not fail sign-in when the Drive write rejects (AC-9)', async () => {
      upsert.mockRejectedValue(new Error('database unavailable'))

      const token = await callbacks.jwt({
        token: {},
        user: { id: USER_ID },
        account: driveAccount(),
        profile: {},
      })

      expect(upsert).toHaveBeenCalledTimes(1)
      expect(token.id).toBe(USER_ID)
      expect(token.error).toBeUndefined()
      expect(errorSpy).toHaveBeenCalled()
    })

    it('writes nothing on a later callback invocation with no user and no account (AC-10)', async () => {
      const token = await callbacks.jwt({ token: {}, user: undefined, account: undefined })

      expect(upsert).not.toHaveBeenCalled()
      expect(token.error).toBeUndefined()
    })

    it('writes nothing and warns when the granted scope omits Drive (AC-7)', async () => {
      const token = await callbacks.jwt({
        token: {},
        user: { id: USER_ID },
        account: driveAccount({ scope: `openid email ${DRIVE_SCOPE}.file` }),
        profile: {},
      })

      expect(upsert).not.toHaveBeenCalled()
      expect(token.error).toBeUndefined()
      expect(warnSpy).toHaveBeenCalled()
    })

    it('writes nothing when the account carries no scope at all (AC-8)', async () => {
      const account = driveAccount()
      delete account.scope

      const token = await callbacks.jwt({
        token: {},
        user: { id: USER_ID },
        account,
        profile: {},
      })

      expect(upsert).not.toHaveBeenCalled()
      expect(token.error).toBeUndefined()
      expect(warnSpy).toHaveBeenCalled()
    })

    it('does not enter the Drive path without a database user id', async () => {
      await callbacks.jwt({ token: {}, user: undefined, account: driveAccount(), profile: {} })

      expect(upsert).not.toHaveBeenCalled()
    })
  })
})
