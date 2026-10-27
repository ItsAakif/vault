/**
 * T097 - the list the user is looking at, during and after a refresh.
 *
 * Two separate reasons the notes "disappeared":
 *
 *   1. every refetch set `loading` true, which replaced the list with skeletons for the duration of
 *      a fetch that could take eleven seconds - the notes were never gone, the pane just stopped
 *      showing them;
 *   2. after a save the page prepends the new item, and the next listing - Drive is eventually
 *      consistent - can arrive without it, so `setContentItems(incoming)` dropped the item the user
 *      had just written.
 *
 * The editor is stubbed (this is about the page's refetch behaviour, not about MDXEditor), and Drive
 * is a `fetch` stub, so every listing the page receives is chosen by the test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }))

// The page renders `SimplifiedMarkdownEditor`; its only job here is to hand the page a save.
vi.mock('@/components/editor', () => ({
  SimplifiedMarkdownEditor: ({
    onSave,
  }: {
    onSave?: (content: string, title: string) => Promise<void>
  }) => (
    <button
      type="button"
      onClick={() => {
        void onSave?.('The body the user typed.', 'A brand new note')
      }}
    >
      stub save
    </button>
  ),
}))

// `?type=` is the page's filter input, so the test drives a refetch by changing it. A module-level
// value keeps the mock synchronous and lets `rerender()` see the new parameter.
let searchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

import DashboardPage from '@/app/(app)/page'
import { useStatsStore } from '@/store/stats-store'

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: async () => body,
  } as Response
}

const EXISTING_NOTE = {
  id: 'note-1',
  title: 'An existing note',
  content: 'It was already there.',
  type: 'NOTE',
  status: 'DRAFT',
  priority: 'MEDIUM',
  archived: false,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const SAVED_NOTE = {
  id: 'saved-1',
  title: 'A brand new note',
  content: 'The body the user typed.',
  type: 'NOTE',
  status: 'DRAFT',
  priority: 'MEDIUM',
  archived: false,
  pinned: false,
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

interface Harness {
  contentGets: number
  /** Resolves the pending `/api/content` GET, when the test made it hang. */
  release: (body: unknown) => void
  savedListingServed: boolean
}

/**
 * Drive as the page sees it: `listing(index)` decides the body of the Nth content GET, so a test
 * can say "the first listing has the note, the second has not caught up yet".
 */
function driveFetch(listing: (index: number) => unknown, options: { hangFrom?: number } = {}) {
  const harness: Harness = {
    contentGets: 0,
    release: () => {},
    savedListingServed: false,
  }

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: { method?: string }) => {
      const url = String(input)

      if (init?.method === 'POST' && url.includes('/api/content')) {
        return jsonResponse(201, SAVED_NOTE)
      }
      if (url.includes('/api/content?')) {
        const index = harness.contentGets
        harness.contentGets += 1
        if (options.hangFrom !== undefined && index >= options.hangFrom) {
          return new Promise<Response>((resolve) => {
            harness.release = (body: unknown) => resolve(jsonResponse(200, body))
          })
        }
        const body = listing(index)
        if (Array.isArray(body) && body.length === 0) harness.savedListingServed = true
        return jsonResponse(200, body)
      }
      if (url.includes('/api/content-types')) return jsonResponse(200, [])
      if (url.includes('/api/user/preferences')) {
        return jsonResponse(200, { disabledContentTypes: [] })
      }
      if (url.includes('/api/categories')) return jsonResponse(200, [])
      if (url.includes('/api/drive/connection')) return jsonResponse(200, { connected: true })
      return jsonResponse(200, [])
    })
  )

  return harness
}

beforeEach(() => {
  searchParams = new URLSearchParams()
  useStatsStore.setState({ stats: null })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('T097 - a refresh does not blank a populated list', () => {
  it('keeps the current items on screen while the next listing is still in flight', async () => {
    const drive = driveFetch(() => [EXISTING_NOTE], { hangFrom: 1 })

    const { rerender } = render(<DashboardPage />)
    expect(await screen.findByText('An existing note')).toBeInTheDocument()

    // A refresh starts (the filter changed, which is one of the page's refetch triggers).
    searchParams = new URLSearchParams('type=NOTE')
    rerender(<DashboardPage />)
    await waitFor(() => {
      expect(drive.contentGets).toBe(2)
    })

    // The fetch is still pending: the item is still on screen, and the pane is not skeletons.
    expect(screen.getByText('An existing note')).toBeInTheDocument()
    expect(document.querySelectorAll('.animate-pulse')).toHaveLength(0)

    // It resolves into the same body, and the list is unchanged.
    drive.release([EXISTING_NOTE])
    await waitFor(() => {
      expect(screen.getByText('An existing note')).toBeInTheDocument()
    })
    expect(document.querySelectorAll('.animate-pulse')).toHaveLength(0)
  })

  it('still shows skeletons on the FIRST load, when there is nothing to keep', async () => {
    // The first load hangs, so the only thing the pane can show is its loading state.
    driveFetch(() => [], { hangFrom: 0 })

    render(<DashboardPage />)

    await waitFor(() => {
      expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    })
  })
})

describe('T097 - a just-saved note survives a listing that has not caught up', () => {
  it('keeps the note the user just wrote when the next listing omits it', async () => {
    const user = userEvent.setup()
    // Listing 1: empty vault. Listing 2 (after the save): still empty - Drive has not caught up.
    const drive = driveFetch(() => [])

    const { rerender } = render(<DashboardPage />)
    expect(await screen.findByText('No items found')).toBeInTheDocument()

    // Create and save a note through the page's own save path.
    await user.click(screen.getByRole('button', { name: /Create First Item/i }))
    await user.click(await screen.findByRole('button', { name: /Create NOTE/i }))
    await user.click(await screen.findByRole('button', { name: /stub save/i }))

    expect(await screen.findByText('A brand new note')).toBeInTheDocument()

    // The refetch arrives WITHOUT the file that was just written.
    searchParams = new URLSearchParams('type=NOTE')
    rerender(<DashboardPage />)
    await waitFor(() => {
      expect(drive.contentGets).toBe(2)
    })
    expect(drive.savedListingServed).toBe(true)

    // The note the user just wrote is still there - and still only once.
    expect(screen.getByText('A brand new note')).toBeInTheDocument()
    expect(screen.getAllByText('A brand new note')).toHaveLength(1)
  })

  it('drops an item that was never saved in this session when the listing stops returning it', async () => {
    // Listing 1 has the note; listing 2 does not, and nothing was saved here.
    const drive = driveFetch((index) => (index === 0 ? [EXISTING_NOTE] : []))

    const { rerender } = render(<DashboardPage />)
    expect(await screen.findByText('An existing note')).toBeInTheDocument()

    searchParams = new URLSearchParams('type=NOTE')
    rerender(<DashboardPage />)
    await waitFor(() => {
      expect(drive.contentGets).toBe(2)
    })

    // The merge is not a blanket union: reality still wins for everything else.
    await waitFor(() => {
      expect(screen.queryByText('An existing note')).not.toBeInTheDocument()
    })
    expect(screen.getByText('No items found')).toBeInTheDocument()
  })
})
