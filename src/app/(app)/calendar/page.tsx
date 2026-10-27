'use client'

import { CalendarView } from '@/components/calendar'
import { DriveRequiredNotice } from '@/components/drive/drive-required-notice'
import { StatsCard, Workspace } from '@/components/shell'
import { useDriveConnection } from '@/hooks/use-drive-connection'
import { useAppStore } from '@/store'
import { selectKnownCalendarEvents } from '@/store/app-store'

// ADR-010 D1/D2/D3: the shell owns the header, the primary navigation (rail) and the auth gate.
// This page owns only its own content: the calendar view.
//
// T086: the categories column (and the page's stats card) moved into the rail's Categories
// disclosure / Quick Stats, so this is a single-pane workspace now. It stays in `Workspace`'s
// default, non-`flush` mode: the root is still `h-[calc(100vh-var(--app-header-h))]` and the
// content is `flex-1`, so removing the aside cannot collapse the page height.
//
// T088: removing the aside also removed the only place the calendar's three counts were shown -
// jobs and projects render their own stats inside their main content, the calendar had none. They
// are back in the main content, above whatever the page renders (the calendar, or the Drive
// notice), with the same rows and the same computation the aside used. The aside is NOT coming
// back: this page stays a single pane.
export default function CalendarPage() {
  // T090: the counts come from ONE field - the selector folds "the events" and "were they ever
  // loaded" into a single value, and `null` means unknown. See `selectKnownCalendarEvents`.
  const calendarEvents = useAppStore(selectKnownCalendarEvents)
  // ADR-008 D5: a page-level probe, so the page is self-explanatory before any child fetch
  // resolves. `connectRequired` is only ever true for the two DRIVE_* codes. The notice stays
  // INSIDE the Workspace content area (ADR-010 / ADR-008 compose).
  const driveConnection = useDriveConnection()

  // T090: an em dash, NOT `0`. With Drive disconnected `CalendarView` is replaced by the notice,
  // so it never mounts and never publishes; the store's default `[]` is the absence of a
  // measurement. Same mark, same reason, as the rail's Quick Stats.
  const unknown = <span className="text-ink-muted">—</span>
  const rows = calendarEvents
    ? [
        { label: 'Total events', value: calendarEvents.length },
        {
          label: 'This month',
          value: calendarEvents.filter(event => {
            const eventDate = new Date(event.startTime)
            const now = new Date()
            return (
              eventDate.getMonth() === now.getMonth() &&
              eventDate.getFullYear() === now.getFullYear()
            )
          }).length,
        },
        {
          label: 'Today',
          value: calendarEvents.filter(event => {
            const eventDate = new Date(event.startTime)
            const today = new Date()
            return eventDate.toDateString() === today.toDateString()
          }).length,
        },
      ]
    : [
        { label: 'Total events', value: unknown },
        { label: 'This month', value: unknown },
        { label: 'Today', value: unknown },
      ]

  return (
    <Workspace>
      <div className="space-y-4">
        {/* The pre-T086 aside's `StatsCard`, restored in the main content: same three rows, same
            `StatsCard`, same expressions over `calendarEvents`. `max-w-sm` keeps the reading
            measure of the 320px column it came from instead of stretching a three-row list across
            the whole page. It sits above the notice too, so a disconnected Drive does not hide
            what is already known - and says `—` when nothing is. */}
        <StatsCard className="max-w-sm" title="Calendar" rows={rows} />
        {driveConnection.connectRequired ? (
          <DriveRequiredNotice message={driveConnection.message ?? undefined} />
        ) : (
          <CalendarView />
        )}
      </div>
    </Workspace>
  )
}
