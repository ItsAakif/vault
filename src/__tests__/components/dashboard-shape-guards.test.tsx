import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The dashboard's only use of the toast hook is inside failure paths.
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

// `usePresence` (the dashboard's collaborative hook) reads `useSession`; the real hook demands a
// SessionProvider, which is unrelated to response shapes. No provider means no WebSocket work.
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

import DashboardPage from '@/app/(app)/page'
import { useStatsStore } from '@/store/stats-store'

/**
 * T093 - a wrong response shape must degrade, not crash.
 *
 * The reported failure: with Drive connected, `GET /api/content` answered 200 with a body that is
 * not an array. The page stored it (`setContentItems(await response.json())`) and the Quick Stats
 * effect then called `contentItems.filter(...)`, which threw
 * `TypeError: <minified>.filter is not a function` into `PageErrorBoundary`.
 *
 * Every case below feeds a body the client did not expect to the page's own parse sites. Before the
 * fix each one threw from the effect; after it each one renders the list's empty state and publishes
 * `0/0/0` Quick Stats. There is no error boundary around this render on purpose: an unhandled throw
 * fails the test instead of being rendered as "Page Error".
 */

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: async () => body,
  } as Response
}

interface Bodies {
  content?: unknown
  contentTypes?: unknown
  preferences?: unknown
  categories?: unknown
}

// Drive is deliberately CONNECTED: that is the condition the crash was reported under, and it is
// the only one where `ContentItemList` is mounted at all (otherwise the Drive notice replaces it).
function dashboardFetch(bodies: Bodies) {
  return vi.fn(async (input: unknown) => {
    const url = String(input)
    if (url.includes('/api/content?')) return jsonResponse(200, bodies.content ?? [])
    if (url.includes('/api/content-types')) return jsonResponse(200, bodies.contentTypes ?? [])
    if (url.includes('/api/user/preferences')) {
      return jsonResponse(200, bodies.preferences ?? { disabledContentTypes: [] })
    }
    if (url.includes('/api/categories')) return jsonResponse(200, bodies.categories ?? [])
    if (url.includes('/api/drive/connection')) return jsonResponse(200, { connected: true })
    return jsonResponse(200, [])
  })
}

// Five bodies that are all "a 200 the client did not expect". `{ success: true }` is the shape the
// routes use for their envelopes, so it is the most likely wrong body in practice.
const MALFORMED_CONTENT: Array<[string, unknown]> = [
  ['an envelope with no data', { success: true }],
  ['null', null],
  ['a string', 'not a list'],
  ['a data field that is not a list', { success: true, data: 'not a list' }],
  ['an array of things that are not content items', [null, 42, {}, { id: 1 }]],
]

beforeEach(() => {
  useStatsStore.setState({ stats: null })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the dashboard tolerates a content body that is not a collection', () => {
  it.each(MALFORMED_CONTENT)('%s renders the empty state and no error', async (_label, body) => {
    vi.stubGlobal('fetch', dashboardFetch({ content: body }))

    render(<DashboardPage />)

    // The content pane's own empty state, not an error boundary.
    expect(await screen.findByText('No items found')).toBeInTheDocument()
    expect(screen.getByText('Create your first item to get started')).toBeInTheDocument()
    expect(screen.queryByText('Page Error')).not.toBeInTheDocument()

    // The exact expression that used to throw: `contentItems.filter(...)` for Quick Stats.
    await waitFor(() => {
      expect(useStatsStore.getState().stats).toEqual({ total: 0, pinned: 0, archived: 0 })
    })
  })

  it('renders a valid bare array unchanged (the guard must not drop good data)', async () => {
    vi.stubGlobal(
      'fetch',
      dashboardFetch({
        content: [
          {
            id: 'c1',
            title: 'A real note',
            content: 'body',
            type: 'NOTE',
            status: 'DRAFT',
            priority: 'MEDIUM',
            archived: false,
            pinned: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      })
    )

    render(<DashboardPage />)

    expect(await screen.findByText('A real note')).toBeInTheDocument()
    expect(screen.queryByText('No items found')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(useStatsStore.getState().stats).toEqual({ total: 1, pinned: 1, archived: 0 })
    })
  })
})

describe('the dashboard tolerates a content-types body that is not a collection', () => {
  it('opens the create dialog without throwing on `.map`', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', dashboardFetch({ contentTypes: { success: true } }))

    render(<DashboardPage />)
    // The empty state's action is the same `handleCreateItem` the FAB calls.
    await user.click(await screen.findByRole('button', { name: /Create First Item/i }))

    expect(await screen.findByText('Create New Content')).toBeInTheDocument()
    // The built-in types still render; only the custom ones are empty.
    expect(screen.getByText('General notes and thoughts')).toBeInTheDocument()
  })
})

describe('the dashboard tolerates a preferences body that is not shaped as expected', () => {
  it('treats a non-array disabledContentTypes as "nothing disabled"', async () => {
    const user = userEvent.setup()
    // `42` is the value that used to reach `.includes(...)` and throw from the dialog's render.
    vi.stubGlobal(
      'fetch',
      dashboardFetch({ preferences: { disabledContentTypes: 42 } })
    )

    render(<DashboardPage />)
    await user.click(await screen.findByRole('button', { name: /Create First Item/i }))

    expect(await screen.findByText('Create New Content')).toBeInTheDocument()
    expect(screen.getByText('General notes and thoughts')).toBeInTheDocument()
  })

  it('treats a null preferences body as "nothing disabled"', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', dashboardFetch({ preferences: null }))

    render(<DashboardPage />)
    await user.click(await screen.findByRole('button', { name: /Create First Item/i }))

    expect(await screen.findByText('Create New Content')).toBeInTheDocument()
    expect(screen.getByText('General notes and thoughts')).toBeInTheDocument()
  })
})

describe('the dashboard tolerates a categories body that is not a collection', () => {
  it('still opens the create dialog when the categories store cannot be populated', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', dashboardFetch({ categories: { success: true } }))

    render(<DashboardPage />)
    await user.click(await screen.findByRole('button', { name: /Create First Item/i }))

    expect(await screen.findByText('Create New Content')).toBeInTheDocument()
    expect(screen.getByText('No Category')).toBeInTheDocument()
  })
})
