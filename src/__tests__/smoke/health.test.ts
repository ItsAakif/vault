/**
 * Smoke test: GET /api/health
 * Guards the trivial liveness endpoint that the deploy/CI smoke checks rely on.
 */
import { describe, it, expect } from 'vitest'
import { GET } from '@/app/api/health/route'

describe('smoke: GET /api/health', () => {
  it('returns 200 with { message: "Good!" }', async () => {
    const response = await GET()

    expect(response).toBeInstanceOf(Response)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    await expect(response.json()).resolves.toEqual({ message: 'Good!' })
  })
})
