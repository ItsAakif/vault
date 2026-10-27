'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { 
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Filter,
  Download,
  Settings,
  Grid3X3,
  List,
  Clock,
  MapPin,
  Users,
  MoreHorizontal
} from 'lucide-react'
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  addDays, 
  addMonths, 
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO,
  addWeeks,
  subWeeks,
  startOfDay,
  endOfDay
} from 'date-fns'
import { cn } from '@/lib/utils'

interface CalendarEvent {
  id: string
  title: string
  description?: string
  startTime: Date
  endTime: Date
  allDay: boolean
  color?: string
  location?: string
  attendees?: string[]
  recurring?: string
  category?: string
  priority?: 'low' | 'medium' | 'high'
}

interface EnhancedCalendarProps {
  events: CalendarEvent[]
  onEventClick?: (event: CalendarEvent) => void
  onEventCreate?: (date: Date, time?: string) => void
  onEventUpdate?: (eventId: string, updates: Partial<CalendarEvent>) => void
  onEventDelete?: (eventId: string) => void
  onDateChange?: (date: Date) => void
  className?: string
}

type CalendarView = 'month' | 'week' | 'day' | 'agenda'

export function EnhancedCalendar({
  events,
  onEventClick,
  onEventCreate,
  onEventUpdate,
  onEventDelete,
  onDateChange,
  className
}: EnhancedCalendarProps) {
  const [currentDate, setCurrentDate] = React.useState(new Date())
  const [view, setView] = React.useState<CalendarView>('month')
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(null)
  const [draggedEvent, setDraggedEvent] = React.useState<CalendarEvent | null>(null)
  const [showFilters, setShowFilters] = React.useState(false)
  const [filters, setFilters] = React.useState({
    categories: [] as string[],
    priorities: [] as string[]
  })

  // Navigation functions
  const navigatePrevious = () => {
    const newDate = view === 'month' 
      ? subMonths(currentDate, 1)
      : view === 'week'
      ? subWeeks(currentDate, 1)
      : addDays(currentDate, -1)
    
    setCurrentDate(newDate)
    onDateChange?.(newDate)
  }

  const navigateNext = () => {
    const newDate = view === 'month'
      ? addMonths(currentDate, 1)
      : view === 'week'
      ? addWeeks(currentDate, 1)
      : addDays(currentDate, 1)
    
    setCurrentDate(newDate)
    onDateChange?.(newDate)
  }

  const navigateToday = () => {
    const today = new Date()
    setCurrentDate(today)
    onDateChange?.(today)
  }

  // Filter events based on current filters
  const filteredEvents = React.useMemo(() => {
    return events.filter(event => {
      if (filters.categories.length > 0 && !filters.categories.includes(event.category || '')) {
        return false
      }
      if (filters.priorities.length > 0 && !filters.priorities.includes(event.priority || '')) {
        return false
      }
      return true
    })
  }, [events, filters])

  // Get events for a specific date
  const getEventsForDate = (date: Date) => {
    return filteredEvents.filter(event => {
      if (event.allDay) {
        return isSameDay(new Date(event.startTime), date)
      }
      const eventStart = startOfDay(new Date(event.startTime))
      const eventEnd = endOfDay(new Date(event.endTime))
      const targetDay = startOfDay(date)
      
      return targetDay >= eventStart && targetDay <= eventEnd
    })
  }

  // Handle drag and drop
  const handleDragStart = (event: CalendarEvent, e: React.DragEvent) => {
    setDraggedEvent(event)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (date: Date, e: React.DragEvent) => {
    e.preventDefault()
    if (draggedEvent && onEventUpdate) {
      const timeDiff = new Date(draggedEvent.endTime).getTime() - new Date(draggedEvent.startTime).getTime()
      const newStartTime = new Date(date)
      newStartTime.setHours(new Date(draggedEvent.startTime).getHours())
      newStartTime.setMinutes(new Date(draggedEvent.startTime).getMinutes())
      
      const newEndTime = new Date(newStartTime.getTime() + timeDiff)
      
      onEventUpdate(draggedEvent.id, {
        startTime: newStartTime,
        endTime: newEndTime
      })
    }
    setDraggedEvent(null)
  }

  // Handle date click
  const handleDateClick = (date: Date) => {
    setSelectedDate(date)
    if (onEventCreate) {
      onEventCreate(date)
    }
  }

  // Get calendar title based on view
  const getCalendarTitle = () => {
    switch (view) {
      case 'month':
        return format(currentDate, 'MMMM yyyy')
      case 'week':
        const weekStart = startOfWeek(currentDate)
        const weekEnd = endOfWeek(currentDate)
        return `${format(weekStart, 'MMM dd')} - ${format(weekEnd, 'MMM dd, yyyy')}`
      case 'day':
        return format(currentDate, 'EEEE, MMMM dd, yyyy')
      case 'agenda':
        return 'Agenda View'
      default:
        return format(currentDate, 'MMMM yyyy')
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <CardTitle className="text-xl">{getCalendarTitle()}</CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={navigatePrevious}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={navigateToday}
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={navigateNext}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Select value={view} onValueChange={(value: CalendarView) => setView(value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Month</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="agenda">Agenda</SelectItem>
              </SelectContent>
            </Select>
            
            <Popover open={showFilters} onOpenChange={setShowFilters}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="h-4 w-4 mr-2" />
                  Filters
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <CalendarFilters
                  events={events}
                  filters={filters}
                  onFiltersChange={setFilters}
                />
              </PopoverContent>
            </Popover>
            
            <Button
              size="sm"
              onClick={() => onEventCreate?.(currentDate)}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Event
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        {view === 'month' && (
          <MonthView
            currentDate={currentDate}
            events={filteredEvents}
            onEventClick={onEventClick}
            onDateClick={handleDateClick}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            getEventsForDate={getEventsForDate}
          />
        )}
        
        {view === 'week' && (
          <WeekView
            currentDate={currentDate}
            events={filteredEvents}
            onEventClick={onEventClick}
            onDateClick={handleDateClick}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            getEventsForDate={getEventsForDate}
          />
        )}
        
        {view === 'day' && (
          <DayView
            currentDate={currentDate}
            events={filteredEvents}
            onEventClick={onEventClick}
            onEventCreate={onEventCreate}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            getEventsForDate={getEventsForDate}
          />
        )}
        
        {view === 'agenda' && (
          <AgendaView
            currentDate={currentDate}
            events={filteredEvents}
            onEventClick={onEventClick}
          />
        )}
      </CardContent>
    </Card>
  )
}

// Month View Component
interface MonthViewProps {
  currentDate: Date
  events: CalendarEvent[]
  onEventClick?: (event: CalendarEvent) => void
  onDateClick?: (date: Date) => void
  onDragStart?: (event: CalendarEvent, e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (date: Date, e: React.DragEvent) => void
  getEventsForDate: (date: Date) => CalendarEvent[]
}

function MonthView({
  currentDate,
  events,
  onEventClick,
  onDateClick,
  onDragStart,
  onDragOver,
  onDrop,
  getEventsForDate
}: MonthViewProps) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(monthStart)
  const startDate = startOfWeek(monthStart)
  const endDate = endOfWeek(monthEnd)

  const days: Date[] = []
  let day = startDate

  while (day <= endDate) {
    days.push(day)
    day = addDays(day, 1)
  }

  const weeks: Date[][] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }

  return (
    <div className="border-t">
      {/* Week header */}
      <div className="grid grid-cols-7 border-b">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground border-r last:border-r-0">
            {day}
          </div>
        ))}
      </div>
      
      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {days.map((day, index) => {
          const dayEvents = getEventsForDate(day)
          const isCurrentMonth = isSameMonth(day, currentDate)
          const isCurrentDay = isToday(day)
          
          return (
            <div
              key={day.toISOString()}
              className={cn(
                'min-h-[120px] p-2 border-r border-b last:border-r-0',
                !isCurrentMonth && 'bg-muted/30 text-muted-foreground',
                isCurrentDay && 'bg-primary/5'
              )}
              onDragOver={onDragOver}
              onDrop={(e) => onDrop?.(day, e)}
              onClick={() => onDateClick?.(day)}
            >
              <div className={cn(
                'text-sm font-medium mb-1',
                isCurrentDay && 'text-primary font-bold'
              )}>
                {format(day, 'd')}
              </div>
              
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    draggable
                    onDragStart={(e) => onDragStart?.(event, e)}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEventClick?.(event)
                    }}
                    className={cn(
                      'text-xs p-1 rounded cursor-pointer truncate',
                      event.color ? `bg-${event.color}-100 text-${event.color}-800` : 'bg-blue-100 text-blue-800'
                    )}
                    style={{
                      backgroundColor: event.color ? `${event.color}20` : undefined,
                      borderLeft: event.color ? `3px solid ${event.color}` : '3px solid #3b82f6'
                    }}
                  >
                    {event.allDay ? event.title : `${format(new Date(event.startTime), 'HH:mm')} ${event.title}`}
                  </div>
                ))}
                
                {dayEvents.length > 3 && (
                  <div className="text-xs text-muted-foreground">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Week View Component
function WeekView({
  currentDate,
  events,
  onEventClick,
  onDateClick,
  onDragStart,
  onDragOver,
  onDrop,
  getEventsForDate
}: MonthViewProps) {
  const weekStart = startOfWeek(currentDate)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const hours = Array.from({ length: 24 }, (_, i) => i)

  return (
    <div className="border-t">
      {/* Week header */}
      <div className="grid grid-cols-8 border-b">
        <div className="p-2 border-r"></div>
        {weekDays.map((day) => (
          <div key={day.toISOString()} className="p-2 text-center border-r last:border-r-0">
            <div className="text-sm font-medium">{format(day, 'EEE')}</div>
            <div className={cn(
              'text-lg font-bold',
              isToday(day) && 'text-primary'
            )}>
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>
      
      {/* Time grid */}
      <div className="max-h-[600px] overflow-y-auto">
        {hours.map((hour) => (
          <div key={hour} className="grid grid-cols-8 border-b">
            <div className="p-2 text-xs text-muted-foreground border-r">
              {format(new Date().setHours(hour, 0, 0, 0), 'HH:mm')}
            </div>
            {weekDays.map((day) => {
              const dayHour = new Date(day)
              dayHour.setHours(hour, 0, 0, 0)
              const hourEvents = getEventsForDate(day).filter(event => 
                !event.allDay && new Date(event.startTime).getHours() === hour
              )
              
              return (
                <div
                  key={`${day.toISOString()}-${hour}`}
                  className="min-h-[60px] p-1 border-r last:border-r-0 relative"
                  onDragOver={onDragOver}
                  onDrop={(e) => onDrop?.(dayHour, e)}
                  onClick={() => onDateClick?.(dayHour)}
                >
                  {hourEvents.map((event) => (
                    <div
                      key={event.id}
                      draggable
                      onDragStart={(e) => onDragStart?.(event, e)}
                      onClick={(e) => {
                        e.stopPropagation()
                        onEventClick?.(event)
                      }}
                      className="absolute inset-x-1 text-xs p-1 rounded cursor-pointer truncate bg-blue-100 text-blue-800"
                      style={{
                        backgroundColor: event.color ? `${event.color}20` : undefined,
                        borderLeft: event.color ? `3px solid ${event.color}` : '3px solid #3b82f6'
                      }}
                    >
                      {event.title}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// Day View Component
function DayView({
  currentDate,
  events,
  onEventClick,
  onEventCreate,
  onDragStart,
  onDragOver,
  onDrop,
  getEventsForDate
}: MonthViewProps & { onEventCreate?: (date: Date, time?: string) => void }) {
  const dayEvents = getEventsForDate(currentDate)
  const hours = Array.from({ length: 24 }, (_, i) => i)

  return (
    <div className="border-t">
      {/* Day header */}
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold">{format(currentDate, 'EEEE, MMMM dd')}</h3>
        <p className="text-sm text-muted-foreground">{dayEvents.length} events</p>
      </div>
      
      {/* All-day events */}
      {dayEvents.filter(e => e.allDay).length > 0 && (
        <div className="p-4 border-b bg-muted/30">
          <h4 className="text-sm font-medium mb-2">All Day</h4>
          <div className="space-y-1">
            {dayEvents.filter(e => e.allDay).map((event) => (
              <div
                key={event.id}
                draggable
                onDragStart={(e) => onDragStart?.(event, e)}
                onClick={() => onEventClick?.(event)}
                className="p-2 rounded cursor-pointer bg-blue-100 text-blue-800"
                style={{
                  backgroundColor: event.color ? `${event.color}20` : undefined,
                  borderLeft: event.color ? `3px solid ${event.color}` : '3px solid #3b82f6'
                }}
              >
                {event.title}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Hourly schedule */}
      <div className="max-h-[600px] overflow-y-auto">
        {hours.map((hour) => {
          const hourStart = new Date(currentDate)
          hourStart.setHours(hour, 0, 0, 0)
          const hourEvents = dayEvents.filter(event => 
            !event.allDay && new Date(event.startTime).getHours() === hour
          )
          
          return (
            <div key={hour} className="flex border-b">
              <div className="w-20 p-2 text-xs text-muted-foreground border-r">
                {format(hourStart, 'HH:mm')}
              </div>
              <div
                className="flex-1 min-h-[60px] p-2 relative"
                onDragOver={onDragOver}
                onDrop={(e) => onDrop?.(hourStart, e)}
                onClick={() => onEventCreate?.(currentDate, format(hourStart, 'HH:mm'))}
              >
                {hourEvents.map((event) => (
                  <div
                    key={event.id}
                    draggable
                    onDragStart={(e) => onDragStart?.(event, e)}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEventClick?.(event)
                    }}
                    className="p-2 rounded cursor-pointer mb-1 bg-blue-100 text-blue-800"
                    style={{
                      backgroundColor: event.color ? `${event.color}20` : undefined,
                      borderLeft: event.color ? `3px solid ${event.color}` : '3px solid #3b82f6'
                    }}
                  >
                    <div className="font-medium">{event.title}</div>
                    <div className="text-xs">
                      {format(new Date(event.startTime), 'HH:mm')} - {format(new Date(event.endTime), 'HH:mm')}
                    </div>
                    {event.location && (
                      <div className="text-xs flex items-center gap-1 mt-1">
                        <MapPin className="h-3 w-3" />
                        {event.location}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Agenda View Component
function AgendaView({
  currentDate,
  events,
  onEventClick
}: {
  currentDate: Date
  events: CalendarEvent[]
  onEventClick?: (event: CalendarEvent) => void
}) {
  // Group events by date for the next 30 days
  const agendaEvents = React.useMemo(() => {
    const grouped: Record<string, CalendarEvent[]> = {}
    const startDate = startOfDay(currentDate)
    
    for (let i = 0; i < 30; i++) {
      const date = addDays(startDate, i)
      const dateKey = format(date, 'yyyy-MM-dd')
      grouped[dateKey] = events.filter(event => {
        if (event.allDay) {
          return isSameDay(new Date(event.startTime), date)
        }
        return isSameDay(new Date(event.startTime), date)
      }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    }
    
    return Object.entries(grouped).filter(([_, events]) => events.length > 0)
  }, [currentDate, events])

  return (
    <div className="p-4">
      <div className="space-y-6">
        {agendaEvents.map(([dateKey, dayEvents]) => {
          const date = parseISO(dateKey)
          
          return (
            <div key={dateKey}>
              <div className="flex items-center gap-3 mb-3">
                <div className="text-lg font-semibold">
                  {format(date, 'EEEE, MMMM dd')}
                </div>
                <Badge variant="secondary">
                  {dayEvents.length} events
                </Badge>
              </div>
              
              <div className="space-y-2 ml-4">
                {dayEvents.map((event) => (
                  <div
                    key={event.id}
                    onClick={() => onEventClick?.(event)}
                    className="p-3 rounded-lg border cursor-pointer hover:bg-muted/50"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium">{event.title}</h4>
                        {event.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {event.description}
                          </p>
                        )}
                        
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {event.allDay ? 'All day' : (
                              `${format(new Date(event.startTime), 'HH:mm')} - ${format(new Date(event.endTime), 'HH:mm')}`
                            )}
                          </div>
                          
                          {event.location && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {event.location}
                            </div>
                          )}
                          
                          {event.attendees && event.attendees.length > 0 && (
                            <div className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {event.attendees.length} attendees
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {event.priority && (
                          <Badge variant={
                            event.priority === 'high' ? 'destructive' :
                            event.priority === 'medium' ? 'secondary' : 'outline'
                          }>
                            {event.priority}
                          </Badge>
                        )}
                        
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        
        {agendaEvents.length === 0 && (
          <div className="text-center py-8">
            <CalendarIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No upcoming events</h3>
            <p className="text-muted-foreground">
              Your calendar is clear for the next 30 days
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// Calendar Filters Component
interface CalendarFiltersProps {
  events: CalendarEvent[]
  filters: {
    categories: string[]
    priorities: string[]
  }
  onFiltersChange: (filters: { categories: string[]; priorities: string[] }) => void
}

function CalendarFilters({ events, filters, onFiltersChange }: CalendarFiltersProps) {
  const categories = Array.from(new Set(events.map(e => e.category).filter((c): c is NonNullable<typeof c> => Boolean(c))))
  const priorities = Array.from(new Set(events.map(e => e.priority).filter((p): p is NonNullable<typeof p> => Boolean(p))))

  const toggleCategory = (category: string) => {
    const newCategories = filters.categories.includes(category)
      ? filters.categories.filter(c => c !== category)
      : [...filters.categories, category]
    
    onFiltersChange({ ...filters, categories: newCategories })
  }

  const togglePriority = (priority: string) => {
    const newPriorities = filters.priorities.includes(priority)
      ? filters.priorities.filter(p => p !== priority)
      : [...filters.priorities, priority]
    
    onFiltersChange({ ...filters, priorities: newPriorities })
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-medium mb-2">Categories</h4>
        <div className="space-y-2">
          {categories.map((category) => (
            <label key={category} className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={filters.categories.includes(category)}
                onChange={() => toggleCategory(category)}
                className="rounded"
              />
              <span className="text-sm">{category}</span>
            </label>
          ))}
        </div>
      </div>
      
      <div>
        <h4 className="font-medium mb-2">Priorities</h4>
        <div className="space-y-2">
          {priorities.map((priority) => (
            <label key={priority} className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={filters.priorities.includes(priority)}
                onChange={() => togglePriority(priority)}
                className="rounded"
              />
              <span className="text-sm capitalize">{priority}</span>
            </label>
          ))}
        </div>
      </div>
      
      <Button
        variant="outline"
        size="sm"
        onClick={() => onFiltersChange({ categories: [], priorities: [] })}
        className="w-full"
      >
        Clear Filters
      </Button>
    </div>
  )
}