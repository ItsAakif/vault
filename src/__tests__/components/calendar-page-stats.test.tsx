import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

// T088 - acceptance item 3: the calendar page shows Total events / This month / Today again.
//
// T086 moved the page's stats card into the aside's `CategoryPanel` and then removed the aside, so
// the three figures disappeared. They are back in the MAIN content (above the calendar, or above
// the Drive notice when Drive is disconnected) with the same three rows and the same expressions
// over `calendarEvents`. There is no aside any more and these tests pin that too.
//
// Only the two ambient dependencies are mocked: the Drive probe (so the page can be rendered in
// both states without a fetch) and `<CalendarView />` (the month grid is another suite's subject).
// `StatsCard` and `Workspace` are the REAL shell primitives, because the point is that this page
// renders the real card again.
const driveState = vi.hoisted(() => ({
  connectRequired: false,
  message: null as string | null,
}))

vi.mock('@/hooks/use-drive-connection', () => ({
  useDriveConnection: () => driveState,
}))

vi.mock('@/components/calendar', () => ({
  CalendarView: () => <div data-testid="calendar-view" />,
}))

import CalendarPage from '@/app/(app)/calendar/page'
import { useAppStore } from '@/store'
import type { CalendarEvent } from '@/lib/db'

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

// Dates that stay unambiguous on every calendar day of the year:
// - one event today;
// - one earlier this month that is NOT today (day 1, or day 2 if today is the 1st);
// - one in the previous month.
// So the expected figures are 3 / 2 / 1 whenever this suite runs.
const now = new Date()
const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0)
const earlierThisMonth = new Date(
  now.getFullYear(),
  now.getMonth(),
  now.getDate() === 1 ? 2 : 1,
  9,
  0,
  0
)
const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15, 9, 0, 0)

function seedEvents() {
  useAppStore.setState({
    calendarEvents: [
      event('today', todayStart),
      event('earlier-this-month', earlierThisMonth),
      event('last-month', lastMonth),
    ],
  })
}

// The StatsCard is located by its heading, so the assertions are scoped to the card and cannot be
// satisfied by any other text on the page.
function statsCard(): HTMLElement {
  const heading = screen.getByRole('heading', { name: 'Calendar' })
  const card = heading.parentElement
  if (!card) throw new Error('the stats card has no root element')
  return card
}

function figures(root: HTMLElement): Array<string | null> {
  return Array.from(root.querySelectorAll('dd')).map((dd) => dd.textContent)
}

beforeEach(() => {
  driveState.connectRequired = false
  driveState.message = null
  useAppStore.setState({ calendarEvents: [] })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Calendar page - restored stats (T088)', () => {
  it('renders the three rows with the same computation, above the calendar', () => {
    seedEvents()

    const { container } = render(<CalendarPage />)

    // Same three row labels as the pre-T086 aside card.
    expect(screen.getByText('Total events')).toBeInTheDocument()
    expect(screen.getByText('This month')).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()

    // Same expressions over `calendarEvents`: length / same month+year / same toDateString.
    expect(figures(statsCard())).toEqual(['3', '2', '1'])

    // Above the calendar in the main content, and still no aside column.
    const calendar = screen.getByTestId('calendar-view')
    const card = statsCard()
    expect(card.compareDocumentPosition(calendar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container.querySelector('aside')).toBeNull()
  })

  it('keeps the stats above the notice when Drive is disconnected', () => {
    driveState.connectRequired = true
    driveState.message = 'Connect Google Drive from Settings > Cloud Storage to use this feature.'
    seedEvents()

    const { container } = render(<CalendarPage />)

    // The notice replaces the calendar view, not the numbers.
    expect(screen.getByText('Google Drive is not connected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect Google Drive' })).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-view')).toBeNull()

    expect(screen.getByText('Total events')).toBeInTheDocument()
    expect(figures(statsCard())).toEqual(['3', '2', '1'])

    const notice = screen.getByText('Google Drive is not connected')
    expect(
      statsCard().compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(container.querySelector('aside')).toBeNull()
  })

  it('counts only what the store holds (the rows are computed, not hard-coded)', () => {
    useAppStore.setState({ calendarEvents: [event('today', todayStart)] })

    render(<CalendarPage />)

    // One event today, in this month: 1 / 1 / 1. (The 3 / 2 / 1 case above shows the buckets are
    // distinguishable; this shows the card is not printing a constant.)
    expect(figures(statsCard())).toEqual(['1', '1', '1'])
  })
})
