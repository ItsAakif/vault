import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react'

// T089 - the calendar's counts must be TRUE.
//
// `CalendarView` keeps the events in local state; only the search page ever wrote
// `useAppStore.calendarEvents`. So the calendar's stat card and the rail's Calendar count reported
// 0 / nothing on a cold visit while the grid was populated. T089 makes `CalendarView` publish the
// array it holds.
//
// What this file pins, in the order the acceptance list asks for it:
//   1. a successful load publishes the EXACT array the component holds (`toBe`, not `toEqual`, so
//      "actual array, not a derived summary" is a real assertion);
//   2. create / update publish the resulting array too (they all go through `setEvents`, which is
//      the single publish site, so delete rides on the same mechanism - it has no UI affordance to
//      drive here);
//   3. a failed load publishes NOTHING - the pre-existing store value survives by identity, so the
//      error cannot be converted into a confident zero;
//   4. a genuine 200 [] DOES publish, because "loaded and empty" is a different state from
//      "not loaded" and must not be conflated with it;
//   5. the stat card and the rail badge both follow the same published value (real page + real
//      rail, real `CalendarView`), including after a create.
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }),
}))

// Ambient dependencies of the real page / rail, needed only by the last describe. `CalendarView`
// itself reads neither.
const driveState = vi.hoisted(() => ({ connectRequired: false, message: null as string | null }))

vi.mock('@/hooks/use-drive-connection', () => ({
  useDriveConnection: () => driveState,
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/calendar',
  useSearchParams: () => new URLSearchParams(),
}))

import { CalendarView } from '@/components/calendar/calendar-view'
import CalendarPage from '@/app/(app)/calendar/page'
import { AppRail } from '@/components/shell/app-rail'
import { useAppStore, useUIStore } from '@/store'
import type { CalendarEvent } from '@/lib/db'

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 403 ? 'Forbidden' : status === 500 ? 'Internal Server Error' : 'OK',
    json: async () => body,
  } as Response
}

function event(id: string, startTime: Date): CalendarEvent {
  return {
    id,
    title: id,
    description: null,
    startTime,
    endTime: new Date(startTime.getTime() + 60 * 60 * 1000),
    allDay: false,
    recurring: null,
    reminders: null,
    location: null,
    color: null,
    timezone: 'UTC',
    externalId: null,
    externalSource: null,
    syncStatus: 'synced',
    lastSyncAt: null,
    uid: null,
    sequence: 0,
    createdAt: startTime,
    updatedAt: startTime,
    userId: 'user-1',
  }
}

const now = new Date()
const todayAt9 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0)
const earlierThisMonth = new Date(
  now.getFullYear(),
  now.getMonth(),
  now.getDate() === 1 ? 2 : 1,
  9,
  0,
  0
)
const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15, 9, 0, 0)

// A fetch stub that answers by method+url, so the create/update assertions can drive the real
// handlers instead of reaching into the component.
function makeFetch(routes: {
  list: () => Response
  create?: (body: Record<string, unknown>) => Response
  update?: (body: Record<string, unknown>) => Response
}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()

    if (url === '/api/content-types') return jsonResponse(200, [])
    if (url === '/api/calendar' && method === 'GET') return routes.list()
    if (url === '/api/calendar' && method === 'POST' && routes.create) {
      return routes.create(JSON.parse(String(init?.body)) as Record<string, unknown>)
    }
    if (url.startsWith('/api/calendar/') && method === 'PATCH' && routes.update) {
      return routes.update(JSON.parse(String(init?.body)) as Record<string, unknown>)
    }
    return jsonResponse(404, { error: `unexpected request: ${method} ${url}` })
  })
}

// The settled-load marker differs by outcome: the month grid exposes "New Event", the Drive notice
// does not.
async function waitForMonthGrid() {
  return screen.findByRole('button', { name: /New Event/ })
}

beforeEach(() => {
  driveState.connectRequired = false
  driveState.message = null
  useUIStore.setState({ sidebarOpen: false })
  useAppStore.setState({ calendarEvents: [], contentItems: [] })
  toastSpy.mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('CalendarView publishes its events (T089)', () => {
  it('publishes the exact array it holds after a successful load', async () => {
    const fetched = [event('e-today', todayAt9), event('e-this-month', earlierThisMonth)]
    vi.stubGlobal('fetch', makeFetch({ list: () => jsonResponse(200, fetched) }))

    render(<CalendarView />)

    // The grid really is populated (the pre-task state of this test would have found nothing).
    expect(await screen.findByText('e-today')).toBeInTheDocument()

    // `toBe`: the store holds the very array the component renders from - not a copy, not a
    // summary, not a count. A derived publish would fail this.
    await waitFor(() => expect(useAppStore.getState().calendarEvents).toBe(fetched))
    expect(useAppStore.getState().calendarEvents.map((e) => e.id)).toEqual([
      'e-today',
      'e-this-month',
    ])
  })

  it('publishes the resulting array after a create', async () => {
    const existing = event('e-existing', todayAt9)
    const created = event('e-created', new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11))
    vi.stubGlobal(
      'fetch',
      makeFetch({ list: () => jsonResponse(200, [existing]), create: () => jsonResponse(200, created) })
    )

    render(<CalendarView />)
    expect(await screen.findByText('e-existing')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /New Event/ }))
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'e-created' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Event' }))

    // The created event is at the head, exactly as the grid renders it.
    await waitFor(() =>
      expect(useAppStore.getState().calendarEvents.map((e) => e.id)).toEqual([
        'e-created',
        'e-existing',
      ])
    )
    expect(useAppStore.getState().calendarEvents[0]).toBe(created)
  })

  it('publishes the resulting array after an update', async () => {
    const existing = event('e-existing', todayAt9)
    const renamed = { ...existing, title: 'e-renamed' }
    vi.stubGlobal(
      'fetch',
      makeFetch({ list: () => jsonResponse(200, [existing]), update: () => jsonResponse(200, renamed) })
    )

    render(<CalendarView />)
    // Clicking the grid chip opens the edit dialog (`handleEditEvent`).
    fireEvent.click(await screen.findByText('e-existing'))
    fireEvent.click(await screen.findByRole('button', { name: 'Update Event' }))

    await waitFor(() => expect(useAppStore.getState().calendarEvents).toEqual([renamed]))
    expect(useAppStore.getState().calendarEvents[0]).toBe(renamed)
  })

  it('does not publish an empty array when the load fails with a non-ok response', async () => {
    // The store already holds real events (the search page published them, or a previous calendar
    // load did). A 500 must not destroy that by writing `[]`.
    const known = [event('e-known-1', todayAt9), event('e-known-2', earlierThisMonth)]
    useAppStore.setState({ calendarEvents: known })
    vi.stubGlobal(
      'fetch',
      makeFetch({ list: () => jsonResponse(500, { error: 'Internal server error' }) })
    )

    render(<CalendarView />)
    await waitForMonthGrid()

    // Identity, not equality: no write happened at all, so nothing can have been overwritten.
    expect(useAppStore.getState().calendarEvents).toBe(known)
    expect(useAppStore.getState().calendarEvents).toHaveLength(2)
  })

  it('does not publish an empty array when the request throws', async () => {
    const known = [event('e-known-1', todayAt9)]
    useAppStore.setState({ calendarEvents: known })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    render(<CalendarView />)
    await waitForMonthGrid()

    expect(useAppStore.getState().calendarEvents).toBe(known)
    // Pre-existing behaviour kept: a thrown request still explains itself.
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Failed to fetch calendar events' })
    )
  })

  it('does not publish an empty array when Drive answers 403', async () => {
    const known = [event('e-known-1', todayAt9)]
    useAppStore.setState({ calendarEvents: known })
    vi.stubGlobal(
      'fetch',
      makeFetch({
        list: () =>
          jsonResponse(403, {
            error: 'Google Drive not configured',
            message: 'Connect Google Drive from Settings > Cloud Storage to use this feature.',
            code: 'DRIVE_NOT_CONNECTED',
            connectUrl: '/settings/cloud-storage',
          }),
      })
    )

    render(<CalendarView />)
    expect(await screen.findByText('Google Drive is not connected')).toBeInTheDocument()

    expect(useAppStore.getState().calendarEvents).toBe(known)
  })

  it('does publish a genuine empty result - "loaded and empty" is a real answer', async () => {
    // The counterpart of the three cases above: when the server says the list is empty, that IS the
    // truth, so the stale value is replaced. The distinction is load outcome, not list length.
    const stale = [event('e-stale', lastMonth)]
    useAppStore.setState({ calendarEvents: stale })
    vi.stubGlobal('fetch', makeFetch({ list: () => jsonResponse(200, []) }))

    render(<CalendarView />)
    await waitForMonthGrid()

    await waitFor(() => expect(useAppStore.getState().calendarEvents).toEqual([]))
    expect(useAppStore.getState().calendarEvents).not.toBe(stale)
  })
})

describe('the stat card and the rail badge cannot disagree (T089)', () => {
  function statsCard(): HTMLElement {
    // level 2: the card's own heading (`<h2>Calendar</h2>`). `CalendarView` renders an `<h1>` with
    // the same text, so the level is what makes this locator unambiguous.
    const card = screen.getByRole('heading', { level: 2, name: 'Calendar' }).parentElement
    if (!card) throw new Error('the stats card has no root element')
    return card
  }

  function figures(root: HTMLElement): Array<string | null> {
    return Array.from(root.querySelectorAll('dd')).map((dd) => dd.textContent)
  }

  function calendarNavLink(): HTMLAnchorElement {
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const link = within(nav)
      .getAllByRole('link')
      .find((candidate) => candidate.getAttribute('href') === '/calendar')
    if (!(link instanceof HTMLAnchorElement)) throw new Error('the rail has no Calendar link')
    return link
  }

  it('reports the events the calendar published, in the card and in the rail, on a cold visit', async () => {
    // Cold: the store is empty and NOTHING seeded it. Everything below comes from CalendarView's
    // fetch, which is the whole point - this arrangement is red before T089 (card 0 / 0 / 0, no
    // rail count).
    const fetched = [
      event('e-today', todayAt9),
      event('e-this-month', earlierThisMonth),
      event('e-last-month', lastMonth),
    ]
    vi.stubGlobal(
      'fetch',
      makeFetch({
        list: () => jsonResponse(200, fetched),
        create: () =>
          jsonResponse(
            200,
            event('e-created', new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11))
          ),
      })
    )

    render(
      <>
        <CalendarPage />
        <AppRail />
      </>
    )

    // Both consumers read `useAppStore((state) => state.calendarEvents)` and derive their own
    // figure from it; the array is the only published value.
    await waitFor(() => expect(figures(statsCard())).toEqual(['3', '2', '1']))
    await waitFor(() => expect(calendarNavLink().textContent).toContain('3'))

    // A mutation moves both at once, because both re-derive from the newly published array.
    fireEvent.click(screen.getByRole('button', { name: /New Event/ }))
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'e-created' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Event' }))

    await waitFor(() => expect(figures(statsCard())).toEqual(['4', '3', '2']))
    await waitFor(() => expect(calendarNavLink().textContent).toContain('4'))
  })
})
