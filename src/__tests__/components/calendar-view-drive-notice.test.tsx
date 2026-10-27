import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// T055: the Drive notice must appear on the calendar surface, and ONLY for a Drive failure.
//
// `useToast` is mocked so the assertions are about the rendered surface, not about a toast that
// nothing mounts in jsdom (the real hook renders nothing without a <Toaster />). `vi.hoisted` keeps
// the spy outside the mock factory's temporal dead zone.
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }),
}))

import { CalendarView } from '@/components/calendar/calendar-view'
import { CategoryList } from '@/components/categories/category-list'

// Minimal stand-in for the subset of Response the component reads (status/ok/statusText/json).
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 403 ? 'Forbidden' : status === 500 ? 'Internal Server Error' : 'OK',
    json: async () => body,
  } as Response
}

// The exact body ADR-008 D3 defines for a Drive-less session.
const DRIVE_NOT_CONNECTED_BODY = {
  error: 'Google Drive not configured',
  message: 'Connect Google Drive from Settings > Cloud Storage to use this feature.',
  code: 'DRIVE_NOT_CONNECTED',
  connectUrl: '/settings/cloud-storage',
}

const NOTICE_TITLE = 'Google Drive is not connected'
const NOTICE_MESSAGE = 'Connect Google Drive from Settings > Cloud Storage to use this feature.'

// The month grid's own affordance: present whenever the calendar content (not the notice) renders.
const NEW_EVENT = /New Event/

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  toastSpy.mockClear()
})

describe('CalendarView - Drive-disconnected degradation (T055)', () => {
  it('renders the Drive notice, not an empty month grid, when GET /api/calendar answers 403 DRIVE_NOT_CONNECTED', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(403, DRIVE_NOT_CONNECTED_BODY))
    vi.stubGlobal('fetch', fetchMock)

    render(<CalendarView />)

    // The notice, with the server's own copy and the one-click remedy.
    expect(await screen.findByText(NOTICE_TITLE)).toBeInTheDocument()
    expect(screen.getByText(NOTICE_MESSAGE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect Google Drive' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cloud Storage settings' })).toHaveAttribute(
      'href',
      '/settings/cloud-storage'
    )

    // The page chrome is NOT stripped (that was the reported symptom).
    expect(screen.getByRole('heading', { level: 1, name: 'Calendar' })).toBeInTheDocument()
    expect(screen.queryByText('Loading calendar...')).toBeNull()

    // The empty event list renders without crashing, and an empty month grid is not passed off
    // as "you have no events": the grid is replaced by the notice.
    expect(screen.queryByRole('button', { name: NEW_EVENT })).toBeNull()

    expect(fetchMock).toHaveBeenCalledWith('/api/calendar')
    // A non-ok response is logged, not toasted (the pre-existing fetch behaviour).
    expect(toastSpy).not.toHaveBeenCalled()
  })

  it('does NOT render the Drive notice when GET /api/calendar answers a generic 500', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { error: 'Internal server error' }))
    vi.stubGlobal('fetch', fetchMock)

    render(<CalendarView />)

    // Existing behaviour preserved: the month grid renders over the (now empty) event list.
    expect(await screen.findByRole('button', { name: NEW_EVENT })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Calendar' })).toBeInTheDocument()

    // And it does not claim Drive is disconnected for a failure re-consent cannot fix.
    expect(screen.queryByText(NOTICE_TITLE)).toBeNull()
    expect(screen.queryByText(NOTICE_MESSAGE)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Connect Google Drive' })).toBeNull()

    expect(fetchMock).toHaveBeenCalledWith('/api/calendar')
  })

  it('renders the month grid and no notice when GET /api/calendar answers 200 with an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, [])))

    render(<CalendarView />)

    expect(await screen.findByRole('button', { name: NEW_EVENT })).toBeInTheDocument()
    expect(screen.queryByText(NOTICE_TITLE)).toBeNull()
  })

  it('still renders fetched events (the success path is unchanged)', async () => {
    const now = new Date()
    const event = {
      id: 'e1',
      title: 'Team sync',
      description: null,
      startTime: now.toISOString(),
      endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      location: null,
      allDay: false,
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, [event])))

    render(<CalendarView />)

    expect(await screen.findByText('Team sync')).toBeInTheDocument()
    expect(screen.queryByText(NOTICE_TITLE)).toBeNull()
  })
})

// The category list is shared by the dashboard sidebar and the calendar page, so the same two
// outcomes are pinned here. `children: []` is supplied so the fixture describes the shape T060
// guarantees; the unguarded read that T062 owns is deliberately not exercised here.
describe('CategoryList - Drive-disconnected degradation (T055)', () => {
  const CATEGORY = {
    id: 'c1',
    name: 'Notes',
    description: null,
    color: '#3B82F6',
    icon: null,
    parentId: null,
    isSystem: false,
    level: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    children: [],
    _count: { contentItems: 0 },
  }

  it('renders the Drive notice instead of the list when GET /api/categories answers 403 DRIVE_NOT_CONNECTED', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(403, DRIVE_NOT_CONNECTED_BODY))
    vi.stubGlobal('fetch', fetchMock)

    render(<CategoryList />)

    expect(await screen.findByText(NOTICE_TITLE)).toBeInTheDocument()
    expect(screen.getByText(NOTICE_MESSAGE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect Google Drive' })).toBeInTheDocument()
    // The empty list is not passed off as "you have no categories".
    expect(screen.queryByText('All Items')).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith('/api/categories')
    expect(toastSpy).not.toHaveBeenCalled()
  })

  it('does NOT render the Drive notice when GET /api/categories answers a generic 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { error: 'Internal server error' })))

    render(<CategoryList />)

    // Existing behaviour preserved: the (empty) list renders, no connect CTA is invented.
    expect(await screen.findByText('All Items')).toBeInTheDocument()
    expect(screen.queryByText(NOTICE_TITLE)).toBeNull()
    expect(screen.queryByText(NOTICE_MESSAGE)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Connect Google Drive' })).toBeNull()
  })

  it('renders the categories when GET /api/categories answers 200 (success path unchanged)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, [CATEGORY])))

    render(<CategoryList />)

    expect(await screen.findByText('Notes')).toBeInTheDocument()
    expect(screen.queryByText(NOTICE_TITLE)).toBeNull()
  })
})
