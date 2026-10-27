/**
 * T099 - opening a note reads its body before the editor is allowed to exist.
 *
 * T098 made a listed row cheap: it is built from the file's list properties, so its `content` is
 * `''`. The editor used to take its initial content from that row, which meant opening a note
 * showed an empty document - and saving that document replaced the real note.
 *
 * The page is rendered for real; only two children are replaced:
 *
 *   - `SimplifiedMarkdownEditor`, whose stub renders the `initialContent` it was handed and offers
 *     two saves (the body it holds, and an empty one), so the assertions land on what the page
 *     gives the editor and on what the page sends to the server;
 *   - nothing else - `ContentItemList` is the real list, which is how "the list is still there
 *     while the editor loads" is proven rather than assumed.
 *
 * Drive is a `fetch` stub, so every body the test receives is chosen by the test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

// `usePresence` reads `useSession`; the real hook demands a SessionProvider, which is unrelated to
// the editor's body-loading behaviour. No provider means no WebSocket work.
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// The editor's only job here is to show the initial content the page chose and hand content back
// on save. It never edits anything itself, so the page's wiring is the whole subject.
vi.mock('@/components/editor', () => ({
  SimplifiedMarkdownEditor: ({
    initialContent,
    initialTitle,
    onSave,
  }: {
    initialContent?: string
    initialTitle?: string
    onSave?: (content: string, title: string) => Promise<void>
  }) => (
    <div data-testid="editor">
      <p data-testid="editor-initial-content">{initialContent ?? ''}</p>
      <p data-testid="editor-initial-title">{initialTitle ?? ''}</p>
      <button
        type="button"
        onClick={() => {
          void onSave?.(initialContent ?? '', initialTitle ?? '').catch(() => {})
        }}
      >
        save loaded body
      </button>
      <button
        type="button"
        onClick={() => {
          void onSave?.('', initialTitle ?? '').catch(() => {})
        }}
      >
        save empty body
      </button>
    </div>
  ),
}))

import DashboardPage from '@/app/(app)/page'

const LISTED_NOTE = {
  id: 'note-1',
  title: 'A real note',
  // The whole bug: T098's list row never carries a body.
  content: '',
  type: 'NOTE',
  status: 'DRAFT',
  priority: 'MEDIUM',
  archived: false,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const OTHER_NOTE = {
  ...LISTED_NOTE,
  id: 'note-2',
  title: 'Another note',
}

const FETCHED_BODY = '# The body that lives in Drive\n\nWords the listed row never had.'
const OTHER_BODY = 'The second note, read from Drive.'

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: async () => body,
  } as Response
}

type BodyAnswer = { status?: number; body: unknown } | 'hang'

interface Drive {
  fetchMock: ReturnType<typeof vi.fn>
  /** Resolves a body read the handler answered with 'hang'. */
  releaseBody: (id: string, body: unknown) => void
}

/**
 * Drive as the page sees it: the list is fixed, every per-note body read is answered by `body(id)`
 * (or held until the test releases it), and a save answers with the item the request asked for.
 */
function dashboardFetch(options: {
  items: unknown[]
  body?: (id: string) => BodyAnswer
}): Drive {
  const pending: Array<{ id: string; resolve: (body: unknown) => void }> = []

  const fetchMock = vi.fn(async (input: unknown, init?: { method?: string; body?: string }) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()

    if (url.includes('/api/content?')) return jsonResponse(200, options.items)
    if (url.includes('/api/content-types')) return jsonResponse(200, [])
    if (url.includes('/api/user/preferences')) {
      return jsonResponse(200, { disabledContentTypes: [] })
    }
    if (url.includes('/api/categories')) return jsonResponse(200, [])
    if (url.includes('/api/drive/connection')) return jsonResponse(200, { connected: true })

    const contentId = /\/api\/content\/([^/?]+)/.exec(url)
    if (contentId) {
      const id = decodeURIComponent(contentId[1])

      if (method === 'GET') {
        const answer = options.body?.(id) ?? { body: null }
        if (answer === 'hang') {
          return new Promise<Response>((resolve) => {
            pending.push({
              id,
              resolve: (body: unknown) => resolve(jsonResponse(200, body)),
            })
          })
        }
        return jsonResponse(answer.status ?? 200, answer.body)
      }

      const requestBody = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : {}
      // The route's own contract: an update without `content` keeps the existing body.
      const content =
        typeof requestBody.content === 'string' ? requestBody.content : FETCHED_BODY
      return jsonResponse(200, {
        ...LISTED_NOTE,
        id,
        title: typeof requestBody.title === 'string' ? requestBody.title : LISTED_NOTE.title,
        content,
      })
    }

    if (method !== 'GET' && url.includes('/api/content')) {
      return jsonResponse(201, { ...LISTED_NOTE, id: 'created-1', content: '' })
    }

    return jsonResponse(200, [])
  })

  vi.stubGlobal('fetch', fetchMock)

  return {
    fetchMock,
    releaseBody: (id: string, body: unknown) => {
      const index = pending.findIndex((entry) => entry.id === id)
      if (index === -1) throw new Error(`no pending body read for ${id}`)
      const [entry] = pending.splice(index, 1)
      entry.resolve(body)
    },
  }
}

function writeCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([, init]) => {
    const method = (init as { method?: string } | undefined)?.method ?? 'GET'
    return method.toUpperCase() !== 'GET'
  }) as Array<[unknown, { method?: string; body?: string }]>
}

function patchCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return writeCalls(fetchMock).filter(([, init]) => init.method === 'PATCH')
}

function bodyReads(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([input, init]) => {
    const method = (init as { method?: string } | undefined)?.method ?? 'GET'
    return method.toUpperCase() === 'GET' && /\/api\/content\/[^/?]+$/.test(String(input))
  })
}

beforeEach(() => {
  toast.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('T099 - selecting a note reads its body before the editor opens', () => {
  it('shows the fetched body, not the listed row that has content: ""', async () => {
    const user = userEvent.setup()
    const drive = dashboardFetch({
      items: [LISTED_NOTE],
      body: () => ({ body: { ...LISTED_NOTE, content: FETCHED_BODY } }),
    })

    render(<DashboardPage />)
    await user.click(await screen.findByText('A real note'))

    expect(await screen.findByTestId('editor')).toBeInTheDocument()
    expect(screen.getByTestId('editor-initial-content').textContent).toBe(FETCHED_BODY)
    expect(screen.getByTestId('editor-initial-title').textContent).toBe('A real note')

    // Exactly one read of the body, addressed to the selected note.
    expect(bodyReads(drive.fetchMock)).toHaveLength(1)
    expect(String(bodyReads(drive.fetchMock)[0][0])).toBe('/api/content/note-1')
  })

  it('shows a loading state in the editor pane - never an empty editor - while the body is in flight', async () => {
    const user = userEvent.setup()
    const drive = dashboardFetch({ items: [LISTED_NOTE], body: () => 'hang' })

    render(<DashboardPage />)
    await user.click(await screen.findByText('A real note'))

    // The loading state is announced, and it is shaped like the editor it stands in for.
    expect(await screen.findByRole('status', { name: /Opening A real note/ })).toBeInTheDocument()
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)

    // THE ASSERTION: no editor, because an editor here would be an empty document.
    expect(screen.queryByTestId('editor')).toBeNull()

    // And the list the user was reading is untouched - only the editor pane waits.
    expect(screen.getByText('A real note')).toBeInTheDocument()

    drive.releaseBody('note-1', { ...LISTED_NOTE, content: FETCHED_BODY })

    expect(await screen.findByTestId('editor')).toBeInTheDocument()
    expect(screen.getByTestId('editor-initial-content').textContent).toBe(FETCHED_BODY)
  })

  it('says so when the body cannot be read, and issues no save at all', async () => {
    const user = userEvent.setup()
    const drive = dashboardFetch({
      items: [LISTED_NOTE],
      body: () => ({ status: 404, body: { error: 'Content item not found' } }),
    })

    render(<DashboardPage />)
    await user.click(await screen.findByText('A real note'))

    expect(await screen.findByText('Could not open this note')).toBeInTheDocument()
    expect(screen.getByText('Content item not found')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()

    // No editor to type into, so no save can be issued with an empty body...
    expect(screen.queryByTestId('editor')).toBeNull()
    // ...and nothing was written to Drive.
    expect(writeCalls(drive.fetchMock)).toHaveLength(0)
  })

  it('a save after opening sends the fetched body, so the note is not blanked', async () => {
    const user = userEvent.setup()
    const drive = dashboardFetch({
      items: [LISTED_NOTE],
      body: () => ({ body: { ...LISTED_NOTE, content: FETCHED_BODY } }),
    })

    render(<DashboardPage />)
    await user.click(await screen.findByText('A real note'))
    await user.click(await screen.findByRole('button', { name: 'save loaded body' }))

    await waitFor(() => expect(patchCalls(drive.fetchMock)).toHaveLength(1))

    const [url, init] = patchCalls(drive.fetchMock)[0]
    expect(String(url)).toBe('/api/content/note-1')
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(payload.content).toBe(FETCHED_BODY)
    expect(payload.content).not.toBe('')
    expect(payload.title).toBe('A real note')
  })

  it('never sends an empty content for an existing note', async () => {
    const user = userEvent.setup()
    const drive = dashboardFetch({
      items: [LISTED_NOTE],
      body: () => ({ body: { ...LISTED_NOTE, content: FETCHED_BODY } }),
    })

    render(<DashboardPage />)
    await user.click(await screen.findByText('A real note'))
    await user.click(await screen.findByRole('button', { name: 'save empty body' }))

    await waitFor(() => expect(patchCalls(drive.fetchMock)).toHaveLength(1))

    const [, init] = patchCalls(drive.fetchMock)[0]
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>
    // The misleading empty string is not sent at all; the server keeps the body it has.
    expect(Object.prototype.hasOwnProperty.call(payload, 'content')).toBe(false)
    expect(payload.title).toBe('A real note')
  })

  it('a slow read for one note cannot land in another note\'s editor', async () => {
    const user = userEvent.setup()
    const drive = dashboardFetch({
      items: [LISTED_NOTE, OTHER_NOTE],
      body: (id) => (id === 'note-1' ? 'hang' : { body: { ...OTHER_NOTE, content: OTHER_BODY } }),
    })

    render(<DashboardPage />)
    await user.click(await screen.findByText('A real note'))
    expect(await screen.findByRole('status', { name: /Opening A real note/ })).toBeInTheDocument()

    // The user changes their mind while note-1 is still loading.
    await user.click(screen.getByText('Another note'))
    expect(await screen.findByTestId('editor')).toBeInTheDocument()
    expect(screen.getByTestId('editor-initial-content').textContent).toBe(OTHER_BODY)

    // The abandoned read resolves late: it must not replace the editor's content.
    drive.releaseBody('note-1', { ...LISTED_NOTE, content: FETCHED_BODY })
    await waitFor(() => expect(bodyReads(drive.fetchMock)).toHaveLength(2))

    expect(screen.getByTestId('editor-initial-content').textContent).toBe(OTHER_BODY)
  })
})
