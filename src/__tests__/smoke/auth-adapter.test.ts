// @vitest-environment node
/**
 * Smoke test (T040 / ADR-007 D2): the wrapped adapter maps NextAuth's normalized OAuth profile
 * onto this repository's `User` schema.
 *
 * `@/lib/db` is mocked, so no Prisma instance and no database are touched. The assertion that
 * matters is the shape of the payload handed to `db.user.create`: NextAuth supplies
 * `{name, email, image, emailVerified: null}`, but this schema stores `avatar` and needs a
 * non-nullable `emailVerified`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PrismaClient } from '@prisma/client'

const { userCreate } = vi.hoisted(() => ({ userCreate: vi.fn() }))

vi.mock('@/lib/db', () => ({
  db: {
    user: {
      create: userCreate,
    },
  },
}))

import { createAuthAdapter } from '@/lib/auth-adapter'

// Compile-time proof that the generated client exposes the `account` delegate (ADR-007 D2):
// if `model Account` were missing from schema.prisma, this indexed access would not type-check.
type AccountDelegate = PrismaClient['account']
const _accountDelegateTypeCheck: AccountDelegate | undefined = undefined
void _accountDelegateTypeCheck

const CREATED_ROW = {
  id: 'u1',
  email: 'google-user@example.com',
  name: 'Google User',
  avatar: 'https://example.com/pic.png',
  emailVerified: true,
}

describe('smoke: createAuthAdapter maps the NextAuth OAuth profile (T040)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userCreate.mockResolvedValue(CREATED_ROW)
  })

  it('maps image -> avatar and emailVerified:null -> true, and returns the AdapterUser shape', async () => {
    const adapter = createAuthAdapter()

    const result = await adapter.createUser!({
      name: 'Google User',
      email: 'google-user@example.com',
      image: 'https://example.com/pic.png',
      emailVerified: null,
    })

    expect(userCreate).toHaveBeenCalledTimes(1)
    const data: Record<string, unknown> = userCreate.mock.calls[0][0].data

    expect(data).toMatchObject({
      email: 'google-user@example.com',
      name: 'Google User',
      avatar: 'https://example.com/pic.png',
      emailVerified: true,
      preferences: {
        create: { theme: 'system', language: 'en', timezone: 'UTC' },
      },
    })
    // The two schema mismatches ADR-007 D2 exists to fix.
    expect('image' in data).toBe(false)
    expect(data.emailVerified).not.toBeNull()
    expect(data.emailVerifiedAt).toBeInstanceOf(Date)

    expect(result).toEqual({
      id: 'u1',
      email: 'google-user@example.com',
      name: 'Google User',
      image: 'https://example.com/pic.png',
      emailVerified: expect.any(Date),
    })
  })

  it('omits name and avatar when the normalized profile has neither', async () => {
    userCreate.mockResolvedValue({ ...CREATED_ROW, name: null, avatar: null })
    const adapter = createAuthAdapter()

    await adapter.createUser!({
      name: null,
      email: 'google-user@example.com',
      image: null,
      emailVerified: null,
    })

    const data: Record<string, unknown> = userCreate.mock.calls[0][0].data
    expect(data.email).toBe('google-user@example.com')
    expect(data.name).toBeUndefined()
    expect(data.avatar).toBeUndefined()
  })

  it('keeps the stock adapter methods that OAuth callbacks rely on', () => {
    const adapter = createAuthAdapter()

    expect(typeof adapter.getUserByAccount).toBe('function')
    expect(typeof adapter.linkAccount).toBe('function')
    expect(typeof adapter.getUserByEmail).toBe('function')
  })
})
