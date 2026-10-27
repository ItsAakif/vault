/**
 * Smoke test: @/lib/security `rateLimit` guard.
 * Distinct x-forwarded-for values per test avoid cross-test bucket contamination
 * in the module-level in-memory store.
 */
import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { rateLimit } from '@/lib/security'

function requestFrom(ip: string): NextRequest {
  return new NextRequest('http://localhost/', {
    headers: { 'x-forwarded-for': ip },
  })
}

describe('smoke: rateLimit guard', () => {
  it('allows requests while under the budget', async () => {
    const limiter = rateLimit({ windowMs: 60_000, maxRequests: 5 })
    const ip = '203.0.113.10'

    for (let i = 0; i < 4; i++) {
      await expect(limiter(requestFrom(ip))).resolves.toBeNull()
    }
  })

  it('returns a 429 NextResponse once maxRequests is exceeded', async () => {
    const limiter = rateLimit({ windowMs: 60_000, maxRequests: 2, message: 'Too many requests' })
    const ip = '203.0.113.11'

    await expect(limiter(requestFrom(ip))).resolves.toBeNull() // 1
    await expect(limiter(requestFrom(ip))).resolves.toBeNull() // 2

    const blocked = await limiter(requestFrom(ip)) // 3 -> over budget
    expect(blocked).not.toBeNull()
    expect(blocked!.status).toBe(429)
    await expect(blocked!.json()).resolves.toMatchObject({ error: 'Too many requests' })
  })
})
