/**
 * Smoke test: `POST /api/auth/mobile/login` is CLOSED by default (T080).
 *
 * The endpoint verifies an email + password against stored hashes. The application is Google-only
 * and the mobile client is out of scope, so the route must be unreachable unless a future mobile
 * client opts in with the server-side flag `MOBILE_PASSWORD_LOGIN_ENABLED="true"`.
 *
 * Two failure modes this file is written to catch:
 *   1. a gate that defaults to *open* -- so the closed state is asserted with the variable unset,
 *      and with several values that a careless edit might treat as "on" ("1", "TRUE", "").
 *   2. a response that distinguishes "disabled" from "does not exist" -- so the closed state is
 *      asserted to be Next's own 404 fallback (the same one an unwritten route produces), thrown
 *      before the body is read, before the rate limiter runs and before AuthService/Prisma is
 *      reached. No 403, no 410, no message naming the feature.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
// The exact module the App Router's route-handler wrapper uses to decide which HTTP status a
// thrown fallback error becomes, so the assertion is Next's own classification rather than a
// string this test happens to agree with.
import {
  getAccessFallbackHTTPStatus,
  isHTTPAccessFallbackError,
} from 'next/dist/client/components/http-access-fallback/http-access-fallback'
import type { HTTPAccessFallbackError } from 'next/dist/client/components/http-access-fallback/http-access-fallback'

// `vi.hoisted` because the route module calls `rateLimit()` while it is being imported, so the
// mocks must exist before the module graph is evaluated.
const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  limiter: vi.fn(),
}))

vi.mock('@/lib/auth/multi-client-auth', () => ({
  AuthService: { login: mocks.login },
}))

vi.mock('@/lib/security', () => ({
  rateLimit: () => mocks.limiter,
}))

import { POST } from '@/app/api/auth/mobile/login/route'

const FLAG = 'MOBILE_PASSWORD_LOGIN_ENABLED'

// The digest `notFound()` throws (next/dist/client/components/not-found.js), and the code the
// App Router's route-handler module maps to `new Response(null, { status: 404 })`
// (next/dist/server/route-modules/app-route/module.js).
const NOT_FOUND_DIGEST = 'NEXT_HTTP_ERROR_FALLBACK;404'

function loginRequest(ip = '198.51.100.7'): NextRequest {
  return new NextRequest('http://localhost/api/auth/mobile/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ email: 'someone@example.com', password: 'wrong-password' }),
  })
}

beforeEach(() => {
  mocks.login.mockReset()
  mocks.limiter.mockReset()
  mocks.limiter.mockResolvedValue(null)
  delete process.env[FLAG]
})

afterEach(() => {
  delete process.env[FLAG]
})

describe('POST /api/auth/mobile/login - closed by default', () => {
  it('is closed when the flag is unset, at the deploy default', async () => {
    expect(process.env[FLAG]).toBeUndefined()

    const thrown: unknown = await POST(loginRequest()).catch((error: unknown) => error)

    // Next's 404 fallback, not a JSON body, and not a status naming the feature.
    expect(thrown).toBeInstanceOf(Error)
    // Typed from Next's own exported error type, so this file does not restate the digest format.
    const notFoundError = thrown as HTTPAccessFallbackError
    expect(isHTTPAccessFallbackError(notFoundError)).toBe(true)
    expect(getAccessFallbackHTTPStatus(notFoundError)).toBe(404)
    expect(notFoundError.digest).toBe(NOT_FOUND_DIGEST)
    expect(notFoundError.digest.split(';')[1]).toBe('404')

    // The thrown payload is the bare digest: nothing about passwords, mobile clients or a
    // disabled feature leaks through it.
    expect(notFoundError.message).toBe(NOT_FOUND_DIGEST)
    expect(notFoundError.message).not.toMatch(/disabl|password|mobile|login/i)
  })

  it('does no work before answering: no body parse, no rate limit, no credential check', async () => {
    const request = loginRequest()
    const bodySpy = vi.spyOn(request, 'json')

    await POST(request).catch(() => undefined)

    expect(bodySpy).not.toHaveBeenCalled()
    expect(mocks.limiter).not.toHaveBeenCalled()
    expect(mocks.login).not.toHaveBeenCalled()
  })

  it.each(['false', '0', '1', 'TRUE', 'True', '', 'yes'])(
    'stays closed when the flag is the string %j',
    async (value) => {
      process.env[FLAG] = value

      const thrown: unknown = await POST(loginRequest()).catch((error: unknown) => error)

      expect((thrown as { digest?: string }).digest).toBe(NOT_FOUND_DIGEST)
      expect(mocks.login).not.toHaveBeenCalled()
      expect(mocks.limiter).not.toHaveBeenCalled()
    }
  )
})

describe('POST /api/auth/mobile/login - original behaviour behind the opt-in', () => {
  beforeEach(() => {
    process.env[FLAG] = 'true'
  })

  it('answers a bad password with the same 401 body as before', async () => {
    mocks.login.mockResolvedValue(null)

    const response = await POST(loginRequest())

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Invalid email or password',
    })
    expect(mocks.limiter).toHaveBeenCalledTimes(1)
    expect(mocks.login).toHaveBeenCalledTimes(1)
  })

  it('still validates input with the same 400 body', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/auth/mobile/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.8' },
        body: JSON.stringify({ email: 'someone@example.com' }),
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Email and password are required',
    })
  })

  it('still returns the issued tokens on success', async () => {
    const tokens = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date('2026-01-01T00:00:00.000Z'),
      user: { id: 'user-1', email: 'someone@example.com', name: null, avatar: null },
    }
    mocks.login.mockResolvedValue(tokens)

    const response = await POST(loginRequest())

    expect(response.status).toBe(200)
    // JSON-serialised, so `expiresAt` arrives as its ISO string.
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { ...tokens, expiresAt: '2026-01-01T00:00:00.000Z' },
    })
  })

  it('still applies the rate limiter before touching credentials', async () => {
    const { NextResponse } = await import('next/server')
    mocks.limiter.mockResolvedValue(
      NextResponse.json({ error: 'Too many login attempts' }, { status: 429 })
    )

    const response = await POST(loginRequest())

    expect(response.status).toBe(429)
    expect(mocks.login).not.toHaveBeenCalled()
  })
})
