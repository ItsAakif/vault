import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'

// Deleting a calendar event used to be impossible from the UI: `handleDeleteEvent` and the `Trash2`
// import existed, but nothing ever rendered them - and the handler asked for confirmation with a
// blocking `window.confirm`. What this file pins:
//   1. the control is reachable (a labelled button per event) and opens a real dialog, and the
//      DELETE request is only sent after the user confirms, for THAT event id;
//   2. a failed DELETE leaves the event in place - no optimistic removal - and surfaces the error;
//   3. cancel does nothing at all: no request, event still rendered.
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }),
}))

import { CalendarView } from '@/components/calendar/calendar-view'
import { useAppStore } from '@/store'
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

const now = new Date()
const todayAt9 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0)
const todayAt11 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 0, 0)

type DeleteCall = { url: string; method: string }

// Records every request so "nothing was sent before the confirmation" is assertable by identity.
function makeFetch(options: { list: () => Response; onDelete: (url: string) => Response }) {
  const deletes: DeleteCall[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()

    if (url === '/api/calendar' && method === 'GET') return options.list()
    if (url.startsWith('/api/calendar/') && method === 'DELETE') {
      deletes.push({ url, method })
      return options.onDelete(url)
    }
    return jsonResponse(404, { error: `unexpected request: ${method} ${url}` })
  })

  return { fetchMock, deletes }
}

beforeEach(() => {
  useAppStore.setState({ calendarEvents: [], contentItems: [] })
  toastSpy.mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('CalendarView - deleting an event', () => {
  it('opens a confirmation from a labelled control and deletes THAT event only on confirm', async () => {
    const { fetchMock, deletes } = makeFetch({
      list: () => jsonResponse(200, [event('e-today', todayAt9), event('e-other', todayAt11)]),
      onDelete: () => jsonResponse(200, { success: true }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CalendarView />)
    expect(await screen.findByText('e-today')).toBeInTheDocument()

    // The icon has a name: the screen reader hears which event this deletes.
    const deleteButton = screen.getByRole('button', { name: 'Delete event e-today' })
    fireEvent.click(deleteButton)

    // A real dialog, naming the event, is the confirmation step...
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(
      screen.getByText(/"e-today" will be deleted from your calendar\./)
    ).toBeInTheDocument()
    // ...and opening it sends nothing: a click alone is not a delete.
    expect(deletes).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Delete Event' }))

    await waitFor(() => {
      expect(deletes).toEqual([{ url: '/api/calendar/e-today', method: 'DELETE' }])
    })

    // The row disappears from the grid, the sibling survives, and the change is published from the
    // new local state rather than from a refetch.
    await waitFor(() => expect(screen.queryByText('e-today')).not.toBeInTheDocument())
    expect(screen.getByText('e-other')).toBeInTheDocument()
    await waitFor(() =>
      expect(useAppStore.getState().calendarEvents.map((item) => item.id)).toEqual(['e-other'])
    )
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/api/calendar')).toHaveLength(1)
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Event deleted successfully' })
    )
  })

  it('leaves the event in place and reports the failure when DELETE answers non-ok', async () => {
    const { fetchMock, deletes } = makeFetch({
      list: () => jsonResponse(200, [event('e-today', todayAt9), event('e-other', todayAt11)]),
      onDelete: () => jsonResponse(500, { error: 'Internal server error' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CalendarView />)
    expect(await screen.findByText('e-today')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete event e-today' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Event' }))

    await waitFor(() => expect(deletes).toHaveLength(1))

    // Nothing was removed optimistically: the row is still here after the failed request.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('e-today')).toBeInTheDocument()
    expect(useAppStore.getState().calendarEvents.map((item) => item.id)).toEqual([
      'e-today',
      'e-other',
    ])

    // And the failure is stated, destructive, not swallowed.
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Failed to delete event', variant: 'destructive' })
    )
    expect(toastSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Event deleted successfully' })
    )
  })

  it('does nothing when the confirmation is cancelled', async () => {
    const { fetchMock, deletes } = makeFetch({
      list: () => jsonResponse(200, [event('e-today', todayAt9)]),
      onDelete: () => jsonResponse(200, { success: true }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CalendarView />)
    expect(await screen.findByText('e-today')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete event e-today' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(deletes).toEqual([])
    expect(screen.getByText('e-today')).toBeInTheDocument()
    expect(useAppStore.getState().calendarEvents.map((item) => item.id)).toEqual(['e-today'])
  })
})
