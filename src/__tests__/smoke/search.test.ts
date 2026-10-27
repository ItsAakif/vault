/**
 * Smoke test: search route module resolves and exports its handlers.
 * A cheap "no module-resolution regression" guard for /api/search.
 * `@/lib/db` is mocked so no Prisma connection is opened.
 */
import { describe, it, expect, vi } from 'vitest'
import * as searchRoute from '@/app/api/search/route'

vi.mock('@/lib/db', () => ({ db: {} }))

describe('smoke: search route module', () => {
  it('exports GET and POST handlers as functions', () => {
    expect(typeof searchRoute.GET).toBe('function')
    expect(typeof searchRoute.POST).toBe('function')
  })
})
