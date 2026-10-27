'use client'

import { useState, useEffect } from 'react'
import { CalendarEvent } from '@/lib/db'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { 
  Plus, 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Edit,
  Trash2
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { readCollection } from '@/lib/api-collection'
import { log } from '@/lib/production-logger'
import { DriveRequiredNotice } from '@/components/drive/drive-required-notice'
import { parseDriveFailure, type DriveFailure } from '@/lib/drive-client'
import { useAppStore } from '@/store'

interface CalendarViewProps {
  className?: string
}

// T093: `GET /api/calendar` answers with a bare array. A 200 whose body is an object, `null` or a
// string used to land in `setEvents` and then break `events.map(...)`; the reader degrades it to
// `[]`, which this component already renders as "no events in this period".
function isCalendarEventRecord(value: unknown): value is CalendarEvent {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { id?: unknown; title?: unknown; startTime?: unknown }
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    (typeof candidate.startTime === 'string' || candidate.startTime instanceof Date)
  )
}

export function CalendarView({ className }: CalendarViewProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [currentMonth, setCurrentMonth] = useState(new Date())
  // ADR-008 D5: set only when the server answered with a Drive code, so the notice never claims
  // Drive is disconnected for a generic failure.
  const [driveFailure, setDriveFailure] = useState<DriveFailure | null>(null)

  // The event the user asked to delete. Non-null means the confirmation dialog is open: the row's
  // trash button only OPENS this dialog, so nothing destructive happens on a single click.
  const [eventPendingDelete, setEventPendingDelete] = useState<CalendarEvent | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    startTime: new Date(),
    endTime: new Date(Date.now() + 60 * 60 * 1000), // 1 hour later
    location: '',
    allDay: false
  })
  const { toast } = useToast()

  // T089: the events live in this component, so this component is the only place that can publish
  // them. The store is a MIRROR for the read-only consumers - the calendar stat card and the rail's
  // Calendar count - not a cache with its own lifecycle: nothing here fetches because the store
  // changed, and nothing reads the store back into `events`.
  const setCalendarEvents = useAppStore((state) => state.setCalendarEvents)
  // Only a 200 from GET /api/calendar makes the local list a complete statement of what Drive
  // holds. A failed load therefore publishes nothing at all: writing `[]` on an error is what turns
  // "unknown" into a confident "0 events" - the exact defect this task removes.
  const [eventsAreTruthful, setEventsAreTruthful] = useState(false)

  useEffect(() => {
    fetchEvents()
    
    // Fallback timeout to prevent infinite loading.
    //
    // T089: this branch no longer clears `events`. It used to, and because `loading` is captured
    // from the first render it is always `true`, so ten seconds after a SUCCESSFUL load the grid
    // was wiped - and once the component publishes, that wipe is an invented zero in the store
    // too. Before any event is fetched `events` is already `[]`, so dropping the clear loses
    // nothing: the timeout still stops a hang.
    const timeout = setTimeout(() => {
      if (loading) {
        log.warn('Calendar loading timeout, stopping loading state')
        setLoading(false)
      }
    }, 10000) // 10 second timeout
    
    return () => clearTimeout(timeout)
  }, [])

  // T089: the single publish site. It publishes the array this component renders from - the exact
  // `events` reference, not a derived summary - so the store cannot hold a number the calendar is
  // not showing. One site rather than a call in each handler means every mutation is covered by
  // construction: create, update and delete all change `events`, so all three publish.
  //
  // There is deliberately no unmount cleanup: clearing the mirror on navigation would write `[]`
  // on the way out, which is the same false zero. A stale-but-real list beats an invented empty.
  //
  // T090: this effect is also what makes the count KNOWN. `setCalendarEvents` marks the published
  // list as a measurement, so a 200 returning `[]` here publishes a genuine `0` - while a failed
  // load never reaches this effect at all (`eventsAreTruthful` stays false), so the store keeps
  // whatever it last knew and the card keeps its `—`. Not mounting (the Drive notice replaces this
  // component) publishes nothing for the same reason.
  useEffect(() => {
    if (!eventsAreTruthful) return
    setCalendarEvents(events)
  }, [events, eventsAreTruthful, setCalendarEvents])

  const fetchEvents = async () => {
    setLoading(true)
    try {
      log.debug('Fetching calendar events...')
      const response = await fetch('/api/calendar')
      log.api('GET', '/api/calendar', response.status)
      
      if (response.ok) {
        const data: unknown = await response.json()
        const fetchedEvents = readCollection(data, isCalendarEventRecord)
        log.info('Calendar events fetched successfully', { eventCount: fetchedEvents.length })
        setEvents(fetchedEvents)
        // T089: a 200 is the only thing that makes the list a complete statement of the truth.
        setEventsAreTruthful(true)
      } else {
        const body = await response.json().catch(() => null)
        setDriveFailure(parseDriveFailure(body))
        log.error('Calendar API error', undefined, { status: response.status, statusText: response.statusText })
        // Set empty events array to stop loading.
        // T089: the local grid still shows nothing, but this empty list is NEVER published - the
        // store keeps its last real value instead of reporting this error as zero events.
        setEvents([])
        setEventsAreTruthful(false)
      }
    } catch (error) {
      log.error('Calendar fetch error', error)
      setEvents([])
      // T089: a network/parse failure is equally unable to say "there are no events".
      setEventsAreTruthful(false)
      toast({
        title: 'Error',
        description: 'Failed to fetch calendar events',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  // Function to open create dialog with selected date
  const openCreateDialog = (date?: Date) => {
    const targetDate = date || selectedDate
    const startTime = new Date(targetDate)
    startTime.setHours(9, 0, 0, 0) // Default to 9 AM
    const endTime = new Date(startTime)
    endTime.setHours(10, 0, 0, 0) // Default to 10 AM (1 hour duration)
    
    setNewEvent({
      title: '',
      description: '',
      startTime,
      endTime,
      location: '',
      allDay: false
    })
    setShowCreateDialog(true)
  }

  const handleCreateEvent = async () => {
    try {
      const response = await fetch('/api/calendar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: newEvent.title,
          description: newEvent.description,
          startTime: newEvent.startTime,
          endTime: newEvent.endTime,
          location: newEvent.location,
          allDay: newEvent.allDay
        })
      })

      if (response.ok) {
        const createdEvent = await response.json()
        setEvents(prev => [createdEvent, ...prev])
        setShowCreateDialog(false)
        setNewEvent({
          title: '',
          description: '',
          startTime: new Date(),
          endTime: new Date(Date.now() + 60 * 60 * 1000),
          location: '',
          allDay: false
        })
        toast({
          title: 'Success',
          description: 'Event created successfully'
        })
      } else {
        // A create attempt against a disconnected Drive is explained, not silently dropped.
        const body = await response.json().catch(() => null)
        const failure = parseDriveFailure(body)
        setDriveFailure(failure)
        toast({
          title: 'Error',
          description: failure?.message ?? 'Failed to create event',
          variant: 'destructive'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create event',
        variant: 'destructive'
      })
    }
  }

  const handleEditEvent = (event: CalendarEvent) => {
    setSelectedEvent(event)
    setNewEvent({
      title: event.title,
      description: event.description || '',
      startTime: new Date(event.startTime),
      endTime: new Date(event.endTime),
      location: event.location || '',
      allDay: event.allDay
    })
    setShowEditDialog(true)
  }

  const handleUpdateEvent = async () => {
    if (!selectedEvent) return

    try {
      const response = await fetch(`/api/calendar/${selectedEvent.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: newEvent.title,
          description: newEvent.description,
          startTime: newEvent.startTime,
          endTime: newEvent.endTime,
          location: newEvent.location,
          allDay: newEvent.allDay
        })
      })

      if (response.ok) {
        const updatedEvent = await response.json()
        setEvents(prev => prev.map(event => 
          event.id === updatedEvent.id ? updatedEvent : event
        ))
        setShowEditDialog(false)
        setSelectedEvent(null)
        toast({
          title: 'Success',
          description: 'Event updated successfully'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update event',
        variant: 'destructive'
      })
    }
  }

  // The only delete path. It is called from the confirmation dialog below, never straight from a
  // row, so the user's confirmation is a precondition rather than something this function asks for
  // with a blocking `window.confirm`. Returns `true` only when the server accepted the delete; a
  // failure leaves the event in `events` and says why.
  const handleDeleteEvent = async (eventId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/calendar/${eventId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        // Nothing is removed optimistically: the row stays until the server confirms it is gone.
        const body = await response.json().catch(() => null)
        const failure = parseDriveFailure(body)
        log.error('Calendar delete failed', undefined, { status: response.status })
        toast({
          title: 'Error',
          description: failure?.message ?? 'Failed to delete event',
          variant: 'destructive'
        })
        return false
      }

      setEvents(prev => prev.filter(event => event.id !== eventId))
      toast({
        title: 'Success',
        description: 'Event deleted successfully'
      })
      return true
    } catch (error) {
      log.error('Calendar delete error', error)
      toast({
        title: 'Error',
        description: 'Failed to delete event',
        variant: 'destructive'
      })
      return false
    }
  }

  const confirmDeleteEvent = async () => {
    const target = eventPendingDelete
    if (!target) return

    setDeleting(true)
    try {
      // The dialog closes either way. On success the row is already gone; on failure the row is
      // still there and the toast explains why, so there is nothing left to keep the user in.
      await handleDeleteEvent(target.id)
    } finally {
      setDeleting(false)
      setEventPendingDelete(null)
    }
  }

  const getEventsForDate = (date: Date) => {
    return events.filter(event => {
      const eventDate = new Date(event.startTime)
      return eventDate.toDateString() === date.toDateString()
    })
  }

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newMonth = new Date(currentMonth)
    newMonth.setMonth(currentMonth.getMonth() + (direction === 'next' ? 1 : -1))
    setCurrentMonth(newMonth)
  }



  const getMonthDays = (date: Date): (Date | null)[] => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()
    
    const days: (Date | null)[] = []
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }
    
    // Add days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i))
    }
    
    return days
  }



  const renderMonthView = () => {
    const monthDays = getMonthDays(currentMonth)
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-semibold">
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h2>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm" onClick={() => navigateMonth('prev')}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>
                <CalendarDays className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigateMonth('next')}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Button onClick={() => openCreateDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            New Event
          </Button>
        </div>
        
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((day) => (
            <div key={day} className="text-center font-medium text-sm p-2">
              {day}
            </div>
          ))}
          {monthDays.map((day, index) => (
            <div
              key={index}
              className={`min-h-[100px] p-1 border rounded cursor-pointer hover:bg-muted/50 ${
                day ? '' : 'bg-muted/20'
              } ${
                day && day.toDateString() === new Date().toDateString() 
                  ? 'bg-primary/10 border-primary' 
                  : ''
              } ${
                day && day.toDateString() === selectedDate.toDateString()
                  ? 'ring-2 ring-primary ring-offset-1'
                  : ''
              }`}
              onClick={() => day && setSelectedDate(day)}
              onDoubleClick={() => day && openCreateDialog(day)}
            >
              {day && (
                <>
                  <div className="text-sm font-medium">{day.getDate()}</div>
                  <div className="space-y-1 mt-1">
                    {getEventsForDate(day).slice(0, 2).map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center gap-1 rounded bg-primary/20 hover:bg-primary/30"
                      >
                        {/* The title is the existing edit affordance: clicking it opens the edit
                            dialog. It is a real <button> so the row is keyboard reachable. */}
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate p-1 text-left text-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEditEvent(event)
                          }}
                        >
                          {event.title}
                        </button>
                        {/* Destructive, so it is one step removed: this only opens the
                            confirmation dialog. The icon alone would not be a name, hence the
                            aria-label per event. */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={`Delete event ${event.title}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setEventPendingDelete(event)
                          }}
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                    {getEventsForDate(day).length > 2 && (
                      <div className="text-xs text-muted-foreground">
                        +{getEventsForDate(day).length - 2} more
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading calendar...</p>
          <Button 
            variant="outline" 
            onClick={() => {
              setLoading(false)
              setEvents([])
            }}
          >
            Skip Loading
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Calendar</h1>
          <p className="text-muted-foreground">
            Manage your schedule and events • Click to select dates • Double-click to create events
          </p>
        </div>
      </div>

      {/* Calendar Content */}
      <div className="mt-6">
        {driveFailure ? (
          // The page chrome (header above, dialogs below) stays mounted: a Drive failure must not
          // strip the surface down to an empty month grid.
          <DriveRequiredNotice message={driveFailure.message} />
        ) : (
          renderMonthView()
        )}
      </div>

      {/* Create Event Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New Event</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="event-title">Title</Label>
              <Input
                id="event-title"
                value={newEvent.title}
                onChange={(e) => setNewEvent(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter event title"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-description">Description</Label>
              <Textarea
                id="event-description"
                value={newEvent.description}
                onChange={(e) => setNewEvent(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter event description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Start Time</Label>
                <Input
                  type="datetime-local"
                  value={newEvent.startTime.toISOString().slice(0, 16)}
                  onChange={(e) => setNewEvent(prev => ({ ...prev, startTime: new Date(e.target.value) }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>End Time</Label>
                <Input
                  type="datetime-local"
                  value={newEvent.endTime.toISOString().slice(0, 16)}
                  onChange={(e) => setNewEvent(prev => ({ ...prev, endTime: new Date(e.target.value) }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-location">Location</Label>
              <Input
                id="event-location"
                value={newEvent.location}
                onChange={(e) => setNewEvent(prev => ({ ...prev, location: e.target.value }))}
                placeholder="Enter event location"
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="all-day"
                checked={newEvent.allDay}
                onChange={(e) => setNewEvent(prev => ({ ...prev, allDay: e.target.checked }))}
              />
              <Label htmlFor="all-day">All day event</Label>
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateEvent} disabled={!newEvent.title.trim()}>
              Create Event
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Event Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Event</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-event-title">Title</Label>
              <Input
                id="edit-event-title"
                value={newEvent.title}
                onChange={(e) => setNewEvent(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter event title"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-event-description">Description</Label>
              <Textarea
                id="edit-event-description"
                value={newEvent.description}
                onChange={(e) => setNewEvent(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter event description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Start Time</Label>
                <Input
                  type="datetime-local"
                  value={newEvent.startTime.toISOString().slice(0, 16)}
                  onChange={(e) => setNewEvent(prev => ({ ...prev, startTime: new Date(e.target.value) }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>End Time</Label>
                <Input
                  type="datetime-local"
                  value={newEvent.endTime.toISOString().slice(0, 16)}
                  onChange={(e) => setNewEvent(prev => ({ ...prev, endTime: new Date(e.target.value) }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-event-location">Location</Label>
              <Input
                id="edit-event-location"
                value={newEvent.location}
                onChange={(e) => setNewEvent(prev => ({ ...prev, location: e.target.value }))}
                placeholder="Enter event location"
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="edit-all-day"
                checked={newEvent.allDay}
                onChange={(e) => setNewEvent(prev => ({ ...prev, allDay: e.target.checked }))}
              />
              <Label htmlFor="edit-all-day">All day event</Label>
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateEvent} disabled={!newEvent.title.trim()}>
              Update Event
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Event Confirmation Dialog */}
      <Dialog
        open={eventPendingDelete !== null}
        onOpenChange={(open) => {
          // Also the Escape / overlay path out. Closing never deletes: the request lives in
          // `confirmDeleteEvent`, which only the explicit button calls.
          if (!open && !deleting) setEventPendingDelete(null)
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete event?</DialogTitle>
            <DialogDescription>
              {eventPendingDelete
                ? `"${eventPendingDelete.title}" will be deleted from your calendar. This cannot be undone.`
                : 'This event will be deleted from your calendar. This cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEventPendingDelete(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteEvent} disabled={deleting}>
              Delete Event
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}