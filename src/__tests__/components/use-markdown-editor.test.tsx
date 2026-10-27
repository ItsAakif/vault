import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'

// ADR-008 D6 / spec AC-15: a failed save must NOT report success.
//
// `vi.hoisted` keeps the spy available inside the hoisted `vi.mock` factory without relying on
// the factory only being invoked lazily.
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }))

import { useMarkdownEditor } from '@/hooks/use-markdown-editor'

const SAVED_TOAST = {
  title: 'Saved',
  description: 'Your document has been saved successfully.',
}

const FALLBACK_FAILURE_TOAST = {
  title: 'Error',
  description: 'Failed to save your document. Please try again.',
  variant: 'destructive',
}

// The two `toast(...)` shapes this suite cares about, read back out of the spy's call log.
function successToasts() {
  return toast.mock.calls.filter(([arg]) => arg?.title === 'Saved')
}

function failureToasts() {
  return toast.mock.calls.filter(([arg]) => arg?.title === 'Error')
}

function renderEditor(onSave?: (content: string, title: string) => Promise<void>) {
  return renderHook(() =>
    useMarkdownEditor({
      initialTitle: 'A note',
      initialContent: '',
      onSave,
      // Autosave timers would fire outside `act`; this suite drives `handleSave` by hand.
      autoSave: false,
    })
  )
}

// Seeds `isDirty` the way the editor does: typing different text from the loaded content.
function makeDirty(result: { current: { handleContentChange: (value: string) => void } }) {
  act(() => {
    result.current.handleContentChange('changed')
  })
}

beforeEach(() => {
  toast.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useMarkdownEditor handleSave - success path', () => {
  it('clears isDirty and toasts "Saved" when onSave resolves', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { result } = renderEditor(onSave)
    makeDirty(result)

    expect(result.current.isDirty).toBe(true)

    await act(async () => {
      await result.current.handleSave()
    })

    expect(onSave).toHaveBeenCalledWith('changed', 'A note')
    expect(result.current.isDirty).toBe(false)
    expect(result.current.isSaving).toBe(false)
    expect(toast).toHaveBeenCalledWith(SAVED_TOAST)
    expect(failureToasts()).toHaveLength(0)
  })

  it('treats an omitted onSave as a successful save (unchanged behaviour)', async () => {
    const { result } = renderEditor(undefined)
    makeDirty(result)

    await act(async () => {
      await result.current.handleSave()
    })

    expect(result.current.isDirty).toBe(false)
    expect(toast).toHaveBeenCalledWith(SAVED_TOAST)
  })
})

describe('useMarkdownEditor handleSave - failed save (ADR-008 D6, spec AC-15)', () => {
  it('leaves isDirty TRUE and toasts the thrown message when onSave rejects', async () => {
    // The exact copy the Drive gate returns in a 403 DRIVE_NOT_CONNECTED body.
    const message = 'Connect Google Drive from Settings > Cloud Storage to use this feature.'
    const onSave = vi.fn().mockRejectedValue(new Error(message))
    const { result } = renderEditor(onSave)
    makeDirty(result)

    await act(async () => {
      await result.current.handleSave()
    })

    // THE DATA-LOSS ASSERTION: the document must NOT be reported as saved.
    expect(result.current.isDirty).toBe(true)
    expect(result.current.isSaving).toBe(false)
    expect(toast).toHaveBeenCalledWith({
      title: 'Error',
      description: message,
      variant: 'destructive',
    })
    expect(toast).not.toHaveBeenCalledWith(SAVED_TOAST)
    expect(successToasts()).toHaveLength(0)
  })

  it('keeps isDirty TRUE and uses the fallback message when onSave rejects with a non-Error', async () => {
    const onSave = vi.fn().mockRejectedValue('boom')
    const { result } = renderEditor(onSave)
    makeDirty(result)

    await act(async () => {
      await result.current.handleSave()
    })

    expect(result.current.isDirty).toBe(true)
    expect(toast).toHaveBeenCalledWith(FALLBACK_FAILURE_TOAST)
    expect(toast).not.toHaveBeenCalledWith(SAVED_TOAST)
  })

  it('falls back to the default message for an Error with an empty message', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error(''))
    const { result } = renderEditor(onSave)
    makeDirty(result)

    await act(async () => {
      await result.current.handleSave()
    })

    expect(result.current.isDirty).toBe(true)
    expect(toast).toHaveBeenCalledWith(FALLBACK_FAILURE_TOAST)
  })

  it('toasts a repeated identical failure exactly once, but a new message again', async () => {
    // Edge case 8: the 30-second autosave must not repeat the same failure toast forever.
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error('Drive is not connected.'))
      .mockRejectedValueOnce(new Error('Drive is not connected.'))
      .mockRejectedValueOnce(new Error('The grant expired.'))
    const { result } = renderEditor(onSave)
    makeDirty(result)

    await act(async () => {
      await result.current.handleSave()
    })
    await act(async () => {
      await result.current.handleSave()
    })

    expect(onSave).toHaveBeenCalledTimes(2)
    expect(result.current.isDirty).toBe(true)
    expect(failureToasts()).toHaveLength(1)
    expect(failureToasts()[0][0]).toEqual({
      title: 'Error',
      description: 'Drive is not connected.',
      variant: 'destructive',
    })

    await act(async () => {
      await result.current.handleSave()
    })

    // A *distinct* failure message is new information, so it is surfaced.
    expect(failureToasts()).toHaveLength(2)
    expect(failureToasts()[1][0]).toEqual({
      title: 'Error',
      description: 'The grant expired.',
      variant: 'destructive',
    })
  })

  it('recovers: a failure followed by a success clears isDirty and toasts "Saved"', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error('Drive is not connected.'))
      .mockResolvedValueOnce(undefined)
    const { result } = renderEditor(onSave)
    makeDirty(result)

    await act(async () => {
      await result.current.handleSave()
    })
    expect(result.current.isDirty).toBe(true)

    await act(async () => {
      await result.current.handleSave()
    })

    expect(result.current.isDirty).toBe(false)
    expect(successToasts()).toHaveLength(1)
    expect(failureToasts()).toHaveLength(1)
  })
})

describe('useMarkdownEditor handleSave - guard (unchanged)', () => {
  it('toasts the title error and never calls onSave without a title', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useMarkdownEditor({ initialTitle: '   ', initialContent: '', onSave, autoSave: false })
    )

    await act(async () => {
      await result.current.handleSave()
    })

    expect(onSave).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith({
      title: 'Error',
      description: 'Please enter a title for your document.',
      variant: 'destructive',
    })
  })

  it('does nothing when the document is not dirty', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { result } = renderEditor(onSave)

    await act(async () => {
      await result.current.handleSave()
    })

    expect(onSave).not.toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------------------------
// The dashboard half of the same injury (contract FILE 2, spec AC-15, ADR-008 D6).
//
// `handleSaveContent` used to resolve on every non-ok response, which is what let the hook above
// clear the dirty flag on a 403/500. Here the real `src/app/page.tsx` is rendered with its heavy
// children replaced by stubs, so the assertions land on the page's own code: the save must REJECT
// with the server's message, and the Drive code must put <DriveRequiredNotice> in the list panel
// without removing the editor that still holds the user's text.
// ---------------------------------------------------------------------------------------------

const dashboard = vi.hoisted(() => ({
  onSave: undefined as ((content: string, title: string) => Promise<void>) | undefined,
  // The dashboard derives its filter from the URL (ADR-010 D2), so the mocked `useSearchParams`
  // reads this. Empty means the default `all` filter.
  search: '',
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(dashboard.search),
}))

vi.mock('@/lib/realtime-sync', () => ({
  useRealtimeSync: () => ({
    syncContentUpdate: vi.fn(),
    syncProjectUpdate: vi.fn(),
    syncJobUpdate: vi.fn(),
    syncCalendarUpdate: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-websocket', () => ({ usePresence: () => ({}) }))
// T071: the pane pages are laid out by the shell primitives now. They are pass-throughs here so
// this suite keeps asserting the dashboard's own save behaviour, not the shell's layout.
vi.mock('@/components/shell', () => ({
  Workspace: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  StatsCard: () => null,
}))
vi.mock('@/components/categories', () => ({
  ContentItemList: () => <div data-testid="content-item-list" />,
}))
vi.mock('@/components/editor', () => ({
  // Captures the `onSave` the dashboard hands to the editor - i.e. the real `handleSaveContent`.
  SimplifiedMarkdownEditor: ({
    onSave,
  }: {
    onSave?: (content: string, title: string) => Promise<void>
  }) => {
    dashboard.onSave = onSave
    return <div data-testid="editor" />
  },
}))

// Imported after its children are mocked: this is the real page component.
// Path updated by T070 when the authenticated pages moved into the (app) route group.
import Dashboard from '@/app/(app)/page'

const DRIVE_MESSAGE = 'Connect Google Drive from Settings > Cloud Storage to use this feature.'

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

// Routes every request the dashboard makes on mount, plus the save, so one stub drives the whole
// page. The Drive probe answers "connected" so that a notice can only come from the failing call.
function stubDashboardFetch(options: {
  list?: { status: number; body: unknown }
  save: { status: number; body: unknown }
}) {
  const list = options.list ?? { status: 200, body: [] }
  const impl = vi.fn(async (input: unknown, init?: { method?: string }) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    if (url.startsWith('/api/drive/connection')) return jsonResponse(200, { connected: true })
    if (url.startsWith('/api/content-types')) return jsonResponse(200, [])
    if (url.startsWith('/api/user/preferences')) return jsonResponse(200, { disabledContentTypes: [] })
    if (url.startsWith('/api/content') && method !== 'GET') {
      return jsonResponse(options.save.status, options.save.body)
    }
    if (url.startsWith('/api/content')) return jsonResponse(list.status, list.body)
    return jsonResponse(404, { error: `unexpected request: ${method} ${url}` })
  })
  vi.stubGlobal('fetch', impl)
  return impl
}

// React commits state produced by the mount effects in its own macrotask. One `setTimeout(0)` was
// enough most of the time, but three notice-asserting tests in this file failed together on a
// loaded machine and passed on re-run: the timer fired before the commit landed. Flush a few
// bounded turns so the assertions below see the settled tree. This waits for the same work the
// assertions read; it does not relax them.
async function settle(turns = 5) {
  for (let turn = 0; turn < turns; turn += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

// Mounts the dashboard and lets the mount effects (Drive probe + three list fetches) settle.
async function renderDashboard() {
  render(<Dashboard />)
  await settle()
}

// Walks the page's own create flow (Ctrl+N opens the dialog; its confirm button sets
// `selectedContent`) so the editor - and with it `handleSaveContent` - is mounted.
async function mountEditorViaCreateFlow() {
  fireEvent.keyDown(window, { key: 'n', ctrlKey: true })
  fireEvent.click(await screen.findByRole('button', { name: /Create NOTE/ }))
  await settle()
  expect(dashboard.onSave).toBeTypeOf('function')
}

// Each test in these three suites mounts the whole dashboard once (Radix dialogs, the Drive probe
// and four fetches). Alone that costs ~1-3s; under `npm test` - 32 files sharing one CPU - one of
// them has exceeded the 5s default, and a timed-out test leaves React's act() queue dirty, which
// turns a single slow test into ten failures. The budget is bounded and the assertions are
// unchanged.
const DASHBOARD_TIMEOUT = { timeout: 20_000 }

describe('dashboard handleSaveContent - a failed save must reject (data-loss fix)', DASHBOARD_TIMEOUT, () => {
  beforeEach(() => {
    dashboard.onSave = undefined
  })

  it('rejects with the Drive message and renders the notice on a 403 DRIVE_NOT_CONNECTED', async () => {
    stubDashboardFetch({
      save: {
        status: 403,
        body: {
          error: 'Google Drive not configured',
          message: DRIVE_MESSAGE,
          code: 'DRIVE_NOT_CONNECTED',
          connectUrl: '/settings/cloud-storage',
        },
      },
    })
    await renderDashboard()
    await mountEditorViaCreateFlow()

    await act(async () => {
      await expect(dashboard.onSave?.('typed words', 'My note')).rejects.toThrow(DRIVE_MESSAGE)
    })

    // The reason reaches the user, with the remedy, in the content-list panel. `findBy` polls, so a
    // commit that lands a turn late cannot make this assertion flake; the assertion itself is
    // unchanged (the notice must be there).
    expect(await screen.findByText('Google Drive is not connected')).toBeInTheDocument()
    expect(screen.getByText(DRIVE_MESSAGE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect Google Drive' })).toBeInTheDocument()
    expect(screen.queryByTestId('content-item-list')).toBeNull()
    // The editor panel is NOT removed: the user's text is still on screen.
    expect(screen.getByTestId('editor')).toBeInTheDocument()
  })

  it('rejects with a DRIVE_GRANT_INVALID body too', async () => {
    stubDashboardFetch({
      save: {
        status: 403,
        body: {
          message: 'Reconnect Google Drive from Settings > Cloud Storage to continue.',
          code: 'DRIVE_GRANT_INVALID',
        },
      },
    })
    await renderDashboard()
    await mountEditorViaCreateFlow()

    await act(async () => {
      await expect(dashboard.onSave?.('typed words', 'My note')).rejects.toThrow(
        'Reconnect Google Drive from Settings > Cloud Storage to continue.'
      )
    })

    expect(screen.queryByTestId('content-item-list')).toBeNull()
  })

  it('rejects a plain 500 and does NOT render the notice (parseDriveFailure returns null)', async () => {
    stubDashboardFetch({
      save: { status: 500, body: { error: 'Failed to create content', details: 'boom' } },
    })
    await renderDashboard()
    await mountEditorViaCreateFlow()

    await act(async () => {
      await expect(dashboard.onSave?.('typed words', 'My note')).rejects.toThrow(
        'Failed to create content'
      )
    })

    // A failure re-consent cannot fix must not offer a re-consent CTA.
    expect(screen.queryByText('Google Drive is not connected')).toBeNull()
    expect(screen.getByTestId('content-item-list')).toBeInTheDocument()
  })

  it('falls back to its own message when the error body carries no usable string', async () => {
    stubDashboardFetch({ save: { status: 500, body: null } })
    await renderDashboard()
    await mountEditorViaCreateFlow()

    await act(async () => {
      await expect(dashboard.onSave?.('typed words', 'My note')).rejects.toThrow(
        'Failed to save your content. Please try again.'
      )
    })
  })

  it('resolves and keeps the list when the save succeeds (success path unchanged)', async () => {
    const saved = { id: 'item-1', title: 'My note', content: 'typed words', type: 'NOTE' }
    stubDashboardFetch({ save: { status: 200, body: saved } })
    await renderDashboard()
    await mountEditorViaCreateFlow()

    await act(async () => {
      await expect(dashboard.onSave?.('typed words', 'My note')).resolves.toBeUndefined()
    })

    expect(screen.getByTestId('content-item-list')).toBeInTheDocument()
    expect(screen.queryByText('Google Drive is not connected')).toBeNull()
  })
})

describe(
  'dashboard fetchContentItems - a failed list fetch must not render an empty shell',
  DASHBOARD_TIMEOUT,
  () => {
    it('renders the notice when GET /api/content answers 403 DRIVE_NOT_CONNECTED', async () => {
      stubDashboardFetch({
        list: {
          status: 403,
          body: { message: DRIVE_MESSAGE, code: 'DRIVE_NOT_CONNECTED' },
        },
        save: { status: 200, body: {} },
      })
      await renderDashboard()

      expect(await screen.findByText('Google Drive is not connected')).toBeInTheDocument()
      expect(screen.getByText(DRIVE_MESSAGE)).toBeInTheDocument()
      expect(screen.queryByTestId('content-item-list')).toBeNull()
    })

    it('does NOT render the notice when GET /api/content answers a plain 500', async () => {
      stubDashboardFetch({
        list: { status: 500, body: { error: 'Failed to fetch content', details: 'boom' } },
        save: { status: 200, body: {} },
      })
      await renderDashboard()

      expect(screen.queryByText('Google Drive is not connected')).toBeNull()
      expect(screen.getByTestId('content-item-list')).toBeInTheDocument()
    })
  }
)

// ADR-010 D2: the filter has an address. These two assertions are the page-level half of that
// decision - the page reads `?type=` and never erases it. (The rail is the writer; it is a shell
// component with its own tests.)
function contentListUrls(fetchMock: ReturnType<typeof stubDashboardFetch>) {
  return fetchMock.mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.startsWith('/api/content?'))
}

describe('dashboard content-type filter - the URL is the source of truth', DASHBOARD_TIMEOUT, () => {
  afterEach(() => {
    dashboard.search = ''
  })

  it('builds the list query from ?type=', async () => {
    dashboard.search = 'type=NOTE'
    const fetchMock = stubDashboardFetch({ save: { status: 200, body: {} } })
    await renderDashboard()

    expect(contentListUrls(fetchMock)).toEqual(['/api/content?type=NOTE'])
  })

  it('carries ?type=CUSTOM&customTypeId= through to the query', async () => {
    dashboard.search = 'type=CUSTOM&customTypeId=custom-1'
    const fetchMock = stubDashboardFetch({ save: { status: 200, body: {} } })
    await renderDashboard()

    expect(contentListUrls(fetchMock)).toEqual(['/api/content?type=CUSTOM&customTypeId=custom-1'])
  })

  it('ignores an unknown ?type= value and falls back to all', async () => {
    dashboard.search = 'type=NOT_A_REAL_TYPE'
    const fetchMock = stubDashboardFetch({ save: { status: 200, body: {} } })
    await renderDashboard()

    expect(contentListUrls(fetchMock)).toEqual(['/api/content?'])
  })
})
