import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'

// T090 - "unknown" and "zero" are different answers, and the calendar counts must say so.
//
// The reported bug: on /calendar with Drive disconnected the page correctly shows the "Google
// Drive is not connected" notice, and three lines above it the calendar card claimed
// `Total events 0 / This month 0 / Today 0`. Nothing had been measured - `CalendarView` never
// mounts (the notice replaces it), so it never publishes - and the store's default `[]` was being
// rendered as a measurement. The rail's Quick Stats, three lines above that, already showed `—`.
//
// The three states this file pins, end to end through the real page, the real rail and the real
// `CalendarView`:
//
//   unknown          -> card `— / — / —`, no rail badge, and NO /api/calendar request at all
//   loaded, empty    -> card `0 / 0 / 0` (a real zero is information), no rail badge (it hides 0)
//   loaded, populated-> card `3 / 2 / 1`, rail badge `3`
//
// plus T089's guarantee, re-proved through the UI: a failed load publishes nothing, so a
// previously known count is neither reset to `—` nor reset to `0`.
//
// Both consumers read ONE field - `selectKnownCalendarEvents` - which is why each test asserts
// both at once: there is no arrangement in which one can be right and the other wrong.
const driveState = vi.hoisted(() => ({ connectRequired: false, message: null as string | null }))

vi.mock('@/hooks/use-drive-connection', () => ({
  useDriveConnection: () => driveState,
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/calendar',
  useSearchParams: () => new URLSearchParams(),
}))

// `CalendarView` toasts on a thrown request; nothing renders a <Toaster /> here. Same stub the
// neighbouring calendar suites use.
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }),
}))

import CalendarPage from '@/app/(app)/calendar/page'
import { AppRail } from '@/components/shell/app-rail'
import { useAppStore, useUIStore } from '@/store'
import { selectKnownCalendarEvents } from '@/store/app-store'
import type { CalendarEvent } from '@/lib/db'

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 500 ? 'Internal Server Error' : 'OK',
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

// A 3 / 2 / 1 fixture that is stable on every calendar day of the year (same construction as the
// T088 and T089 suites): one today, one earlier this month that is not today, one last month.
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

const POPULATED = [
  event('e-today', todayAt9),
  event('e-this-month', earlierThisMonth),
  event('e-last-month', lastMonth),
]

let fetchMock: ReturnType<typeof vi.fn>

function makeFetch(calendar: () => Response) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/content-types') return jsonResponse(200, [])
    if (url === '/api/calendar') return calendar()
    return jsonResponse(404, { error: `unexpected request: ${url}` })
  })
}

function calendarCalls(): unknown[][] {
  return fetchMock.mock.calls.filter(([url]) => String(url) === '/api/calendar')
}

// The card is located by its own heading, level 2 (`CalendarView` renders an `<h1>` with the same
// text). Assertions are scoped to it, so they cannot be satisfied by any other surface.
function statsCard(): HTMLElement {
  const card = screen.getByRole('heading', { level: 2, name: 'Calendar' }).parentElement
  if (!card) throw new Error('the calendar stats card has no root element')
  return card
}

function quickStatsCard(): HTMLElement {
  const card = screen.getByRole('heading', { level: 2, name: 'Quick Stats' }).parentElement
  if (!card) throw new Error('the Quick Stats card has no root element')
  return card
}

function figures(root: HTMLElement): Array<string | null> {
  return Array.from(root.querySelectorAll('dd')).map((dd) => dd.textContent)
}

// The rail's Calendar item. Its label is the only text it carries unless a count is rendered, so
// `textContent === 'Calendar'` IS the "no badge" assertion.
function calendarNavLink(): HTMLAnchorElement {
  const nav = screen.getByRole('navigation', { name: 'Primary' })
  const link = within(nav)
    .getAllByRole('link')
    .find((candidate) => candidate.getAttribute('href') === '/calendar')
  if (!(link instanceof HTMLAnchorElement)) throw new Error('the rail has no Calendar link')
  return link
}

function calendarLinkText(): string {
  return (calendarNavLink().textContent ?? '').trim()
}

beforeEach(() => {
  driveState.connectRequired = false
  driveState.message = null
  useUIStore.setState({ sidebarOpen: false })
  // Cold store: `[]` and `calendarEventsLoaded: false` = the app's starting point, i.e. UNKNOWN.
  // Nothing in this file seeds a count except by letting a component publish one.
  useAppStore.setState({ calendarEvents: [], calendarEventsLoaded: false, contentItems: [] })
  toastSpy.mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('calendar counts are tri-state (T090)', () => {
  it('unknown: Drive disconnected, so CalendarView never mounts - the card shows an em dash, and no badge', async () => {
    driveState.connectRequired = true
    driveState.message = 'Connect Google Drive from Settings > Cloud Storage to use this feature.'
    fetchMock = makeFetch(() => jsonResponse(200, POPULATED))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <>
        <CalendarPage />
        <AppRail />
      </>
    )

    // The notice replaced the calendar view: this is why nothing could have been measured.
    expect(screen.getByText('Google Drive is not connected')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /New Event/ })).toBeNull()
    // Not even the request happened, which is the mechanical reason the count is unknown.
    expect(calendarCalls()).toHaveLength(0)

    // The defect: `['0', '0', '0']` here means "measured, and Drive holds nothing".
    expect(figures(statsCard())).toEqual(['—', '—', '—'])
    expect(within(statsCard()).queryByText('0')).toBeNull()

    // The rail: no badge (`textContent` is the label alone), not a `0` badge.
    expect(calendarLinkText()).toBe('Calendar')

    // ... and the same em dash the rail's Quick Stats shows on the same screen. Two adjacent
    // blocks now agree.
    expect(figures(quickStatsCard())).toEqual(['—', '—', '—'])

    // The store itself is still "nothing has loaded", not "loaded and empty".
    expect(useAppStore.getState().calendarEventsLoaded).toBe(false)
    expect(selectKnownCalendarEvents(useAppStore.getState())).toBeNull()
  })

  it('unknown: a failed load on a cold store leaves the card at an em dash, not at zero', async () => {
    fetchMock = makeFetch(() => jsonResponse(500, { error: 'Internal server error' }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <>
        <CalendarPage />
        <AppRail />
      </>
    )

    // The grid settles (a 500 renders the month grid, no Drive notice) but publishes nothing.
    expect(await screen.findByRole('button', { name: /New Event/ })).toBeInTheDocument()
    expect(calendarCalls()).toHaveLength(1)

    expect(figures(statsCard())).toEqual(['—', '—', '—'])
    expect(calendarLinkText()).toBe('Calendar')
    expect(selectKnownCalendarEvents(useAppStore.getState())).toBeNull()
  })

  it('loaded and empty: a 200 with [] is a genuine zero - 0 / 0 / 0 and still no badge', async () => {
    fetchMock = makeFetch(() => jsonResponse(200, []))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <>
        <CalendarPage />
        <AppRail />
      </>
    )

    expect(await screen.findByRole('button', { name: /New Event/ })).toBeInTheDocument()

    // A real zero, and it must be printed as one: an em dash here would be the opposite lie.
    await waitFor(() => expect(figures(statsCard())).toEqual(['0', '0', '0']))
    expect(within(statsCard()).queryByText('—')).toBeNull()

    // The store now KNOWS the calendar is empty.
    expect(useAppStore.getState().calendarEventsLoaded).toBe(true)
    expect(selectKnownCalendarEvents(useAppStore.getState())).toEqual([])

    // A zero badge would be noise; it was already hidden at zero before this task, and stays so.
    expect(calendarLinkText()).toBe('Calendar')
  })

  it('loaded and populated: real figures in the card and a real badge in the rail, from one field', async () => {
    fetchMock = makeFetch(() => jsonResponse(200, POPULATED))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <>
        <CalendarPage />
        <AppRail />
      </>
    )

    await waitFor(() => expect(figures(statsCard())).toEqual(['3', '2', '1']))
    await waitFor(() => expect(calendarLinkText()).toBe('Calendar3'))

    // One field: the same array the card derived its three figures from is the one the rail
    // counted, so no assertion here can be satisfied by two different sources.
    const published = useAppStore.getState().calendarEvents
    expect(selectKnownCalendarEvents(useAppStore.getState())).toBe(published)
    expect(published).toHaveLength(3)
  })

  it('a failed load leaves a previously known count intact - neither reset to an em dash nor to zero', async () => {
    // 1. Load successfully: the count becomes known through the component's own publish site.
    fetchMock = makeFetch(() => jsonResponse(200, POPULATED))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <>
        <CalendarPage />
        <AppRail />
      </>
    )

    await waitFor(() => expect(figures(statsCard())).toEqual(['3', '2', '1']))
    await waitFor(() => expect(calendarLinkText()).toBe('Calendar3'))

    const known = useAppStore.getState().calendarEvents
    expect(known).toHaveLength(3)

    // 2. Leave the page and come back to a server that now fails. The previous visit's knowledge
    //    is the only honest thing the page can say.
    cleanup()
    fetchMock = makeFetch(() => jsonResponse(500, { error: 'Internal server error' }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <>
        <CalendarPage />
        <AppRail />
      </>
    )

    // Settled failure: the grid is up, and the fetch really did happen (and did not succeed).
    expect(await screen.findByRole('button', { name: /New Event/ })).toBeInTheDocument()
    expect(calendarCalls()).toHaveLength(1)

    // The three failure claims, in order of severity:
    // - not `—` (the value is still known),
    // - not `0` (a failure is not an empty calendar),
    // - and the store was not written at all - identity, so not even a fresh `[]`.
    expect(figures(statsCard())).toEqual(['3', '2', '1'])
    expect(calendarLinkText()).toBe('Calendar3')
    expect(useAppStore.getState().calendarEvents).toBe(known)
    expect(selectKnownCalendarEvents(useAppStore.getState())).toBe(known)
  })
})
