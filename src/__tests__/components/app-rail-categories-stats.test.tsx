import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'

// T086: the rail's two new sections.
//
// What this file is allowed to prove, stated honestly:
//   1. the Categories disclosure is collapsed on mount and the rail issues NO /api/categories
//      request until it is opened - the request is a consequence of `CategoryList` mounting,
//      and `CategoryList` is not in the tree before the first open;
//   2. it is fetched exactly once, and collapsing/re-opening does not refetch (the list stays
//      mounted, hidden with the `hidden` attribute);
//   3. add / edit / delete are reachable and the per-row menu is not hover-gated;
//   4. Quick Stats shows the published figures and an em dash - never a false zero - when no
//      page has published any.
// The guards and the Drive notice themselves are covered by T062's and T055's suites; this file
// only proves the rail did not drop them by re-implementing the list (it composes `CategoryList`).
const mocks = vi.hoisted(() => ({
  pathname: { value: '/' },
  searchParams: { value: new URLSearchParams() },
}))

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname.value,
  useSearchParams: () => mocks.searchParams.value,
}))

// `CategoryList` toasts only on unexpected failures; the real hook renders nothing without a
// <Toaster />. Same stub T055/T062 use.
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}))

import { AppRail } from '@/components/shell/app-rail'
import { useAppStore, useUIStore } from '@/store'
import { useStatsStore } from '@/store/stats-store'

const CATEGORY = {
  id: 'c-reading',
  name: 'Reading',
  description: null,
  color: '#3B82F6',
  icon: null,
  parentId: null,
  isSystem: false,
  level: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  children: [],
  _count: { contentItems: 2 },
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

let fetchMock: ReturnType<typeof vi.fn>

function categoriesCalls(): unknown[][] {
  return fetchMock.mock.calls.filter(([url]) => String(url) === '/api/categories')
}

beforeEach(() => {
  mocks.pathname.value = '/settings'
  mocks.searchParams.value = new URLSearchParams()
  // The mobile rail is a Sheet driven by the same field; keeping it closed makes the desktop
  // rail the single mounted copy (same arrangement as app-shell.test.tsx).
  useUIStore.setState({ sidebarOpen: false })
  useAppStore.setState({ contentItems: [], categories: [] })
  useStatsStore.setState({ stats: null })

  fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input)
    if (url === '/api/content-types') return jsonResponse(200, [])
    if (url === '/api/categories') return jsonResponse(200, [CATEGORY])
    return jsonResponse(404, { error: `unexpected request: ${url}` })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  // Explicit rather than relying on Testing Library's global auto-cleanup: the next test writes
  // to `useStatsStore` before it renders, and a still-mounted RailStats would make that store
  // write an out-of-act update.
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  useStatsStore.setState({ stats: null })
})

describe('rail Categories disclosure (T086)', () => {
  it('starts collapsed and issues no /api/categories request before it is opened', async () => {
    render(<AppRail />)

    const disclosure = screen.getByRole('button', { name: 'Categories' })
    expect(disclosure).toHaveAttribute('aria-expanded', 'false')

    // The rail's own navigation request does fire; the categories one must not.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/content-types'))
    expect(categoriesCalls()).toHaveLength(0)

    // Nothing from the list is mounted: no rows, no add/edit/delete affordances.
    expect(screen.queryByText('Reading')).toBeNull()
    expect(screen.queryByRole('button', { name: 'New category' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Actions for Reading' })).toBeNull()
  })

  it('fetches once on first open, exposes add/edit/delete, and does not refetch when collapsed', async () => {
    render(<AppRail />)

    const disclosure = screen.getByRole('button', { name: 'Categories' })
    fireEvent.click(disclosure)

    expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByText('Reading')).toBeInTheDocument()
    expect(categoriesCalls()).toHaveLength(1)

    // Add: the visible, labelled control in the compact header.
    expect(screen.getByRole('button', { name: 'New category' })).toBeInTheDocument()

    // Edit/delete: an always-present per-row menu. `opacity-0` was the hover-only bug.
    const actions = screen.getByRole('button', { name: 'Actions for Reading' })
    expect(actions).toBeVisible()
    expect(actions.className).not.toContain('opacity-0')

    fireEvent.pointerDown(actions, { button: 0, ctrlKey: false })
    expect(await screen.findByRole('menuitem', { name: /Edit/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Delete/ })).toBeInTheDocument()

    // Collapse: the list is hidden, not unmounted, and no second request is issued.
    fireEvent.click(disclosure)
    expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Reading')).not.toBeVisible()

    fireEvent.click(disclosure)
    expect(screen.getByText('Reading')).toBeVisible()
    expect(categoriesCalls()).toHaveLength(1)
  })
})

describe('rail Quick Stats (T086)', () => {
  function statValues(): string[] {
    return Array.from(document.querySelectorAll('dd')).map((node) => node.textContent ?? '')
  }

  it('renders the figures the dashboard published', async () => {
    useStatsStore.setState({ stats: { total: 12, pinned: 3, archived: 5 } })

    render(<AppRail />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/content-types'))

    expect(screen.getByText('Quick Stats')).toBeInTheDocument()
    expect(statValues()).toEqual(['12', '3', '5'])
    expect(screen.queryByText('—')).toBeNull()
  })

  it('renders a muted placeholder - never a false zero - on a page that published nothing', async () => {
    render(<AppRail />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/content-types'))

    expect(screen.getByText('Quick Stats')).toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(3)
    expect(statValues()).toEqual(['—', '—', '—'])
    // The failure being prevented: a page that knows nothing claiming "0 pinned".
    expect(screen.queryByText('0')).toBeNull()
    expect(screen.getByText(/Counts appear on the dashboard/i)).toBeInTheDocument()
  })
})
