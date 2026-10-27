'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Clock,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Users,
  Zap,
  Brain,
  TrendingUp,
  MapPin,
  RefreshCw
} from 'lucide-react'
import { 
  format, 
  addMinutes, 
  addHours, 
  addDays, 
  isWithinInterval, 
  startOfDay, 
  endOfDay,
  parseISO,
  differenceInMinutes,
  isSameDay
} from 'date-fns'
import { cn } from '@/lib/utils'

interface CalendarEvent {
  id: string
  title: string
  startTime: Date
  endTime: Date
  attendees?: string[]
  location?: string
  priority?: 'low' | 'medium' | 'high'
  category?: string
}

interface SchedulingConflict {
  type: 'overlap' | 'back_to_back' | 'travel_time' | 'availability'
  severity: 'low' | 'medium' | 'high'
  message: string
  conflictingEvents: CalendarEvent[]
  suggestions: SchedulingSuggestion[]
}

interface SchedulingSuggestion {
  id: string
  type: 'reschedule' | 'shorten' | 'relocate' | 'split'
  description: string
  newStartTime?: Date
  newEndTime?: Date
  newLocation?: string
  confidence: number
  impact: 'low' | 'medium' | 'high'
}

interface SmartSchedulingProps {
  events: CalendarEvent[]
  newEvent: Partial<CalendarEvent>
  onEventUpdate: (eventId: string, updates: Partial<CalendarEvent>) => void
  onSuggestionApply: (suggestion: SchedulingSuggestion) => void
  className?: string
}

export function SmartScheduling({
  events,
  newEvent,
  onEventUpdate,
  onSuggestionApply,
  className
}: SmartSchedulingProps) {
  const [conflicts, setConflicts] = React.useState<SchedulingConflict[]>([])
  const [suggestions, setSuggestions] = React.useState<SchedulingSuggestion[]>([])
  const [isAnalyzing, setIsAnalyzing] = React.useState(false)

  // Analyze conflicts when new event changes
  React.useEffect(() => {
    if (newEvent.startTime && newEvent.endTime) {
      analyzeConflicts()
    }
  }, [newEvent, events])

  const analyzeConflicts = async () => {
    setIsAnalyzing(true)
    
    try {
      const detectedConflicts = detectConflicts(newEvent as CalendarEvent, events)
      setConflicts(detectedConflicts)
      
      const smartSuggestions = await generateSmartSuggestions(
        newEvent as CalendarEvent,
        events,
        detectedConflicts
      )
      setSuggestions(smartSuggestions)
    } catch (error) {
      console.error('Failed to analyze conflicts:', error)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const getConflictSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'text-red-600 bg-red-50 border-red-200'
      case 'medium':
        return 'text-orange-600 bg-orange-50 border-orange-200'
      case 'low':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getSuggestionIcon = (type: string) => {
    switch (type) {
      case 'reschedule':
        return Clock
      case 'shorten':
        return RefreshCw
      case 'relocate':
        return MapPin
      case 'split':
        return TrendingUp
      default:
        return Zap
    }
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Analysis Status */}
      {isAnalyzing && (
        <Alert>
          <Brain className="h-4 w-4 animate-pulse" />
          <AlertDescription>
            Analyzing schedule conflicts and generating smart suggestions...
          </AlertDescription>
        </Alert>
      )}

      {/* Conflicts Overview */}
      {conflicts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Schedule Conflicts Detected
            </CardTitle>
            <CardDescription>
              {conflicts.length} potential conflicts found with your new event
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <div className="space-y-3">
              {conflicts.map((conflict, index) => (
                <div
                  key={index}
                  className={cn(
                    'p-3 rounded-lg border',
                    getConflictSeverityColor(conflict.severity)
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {conflict.type.replace('_', ' ')}
                        </Badge>
                        <Badge 
                          variant={conflict.severity === 'high' ? 'destructive' : 'secondary'}
                          className="text-xs"
                        >
                          {conflict.severity}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium">{conflict.message}</p>
                      
                      {conflict.conflictingEvents.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground mb-1">
                            Conflicting events:
                          </p>
                          {conflict.conflictingEvents.map((event) => (
                            <div key={event.id} className="text-xs bg-white/50 p-2 rounded">
                              <div className="font-medium">{event.title}</div>
                              <div className="text-muted-foreground">
                                {format(event.startTime, 'MMM dd, HH:mm')} - {format(event.endTime, 'HH:mm')}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Smart Suggestions */}
      {suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-blue-500" />
              Smart Scheduling Suggestions
            </CardTitle>
            <CardDescription>
              AI-powered recommendations to resolve conflicts
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <Tabs defaultValue="recommended" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="recommended">Recommended</TabsTrigger>
                <TabsTrigger value="alternative">Alternative</TabsTrigger>
                <TabsTrigger value="advanced">Advanced</TabsTrigger>
              </TabsList>
              
              <TabsContent value="recommended" className="space-y-3 mt-4">
                {suggestions
                  .filter(s => s.confidence > 0.7)
                  .slice(0, 3)
                  .map((suggestion) => (
                    <SuggestionCard
                      key={suggestion.id}
                      suggestion={suggestion}
                      onApply={() => onSuggestionApply(suggestion)}
                    />
                  ))}
              </TabsContent>
              
              <TabsContent value="alternative" className="space-y-3 mt-4">
                {suggestions
                  .filter(s => s.confidence >= 0.4 && s.confidence <= 0.7)
                  .map((suggestion) => (
                    <SuggestionCard
                      key={suggestion.id}
                      suggestion={suggestion}
                      onApply={() => onSuggestionApply(suggestion)}
                    />
                  ))}
              </TabsContent>
              
              <TabsContent value="advanced" className="space-y-3 mt-4">
                <AdvancedSchedulingOptions
                  events={events}
                  newEvent={newEvent}
                  onEventUpdate={onEventUpdate}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* No Conflicts */}
      {!isAnalyzing && conflicts.length === 0 && newEvent.startTime && (
        <Alert>
          <CheckCircle className="h-4 w-4 text-green-500" />
          <AlertDescription>
            No scheduling conflicts detected. Your event fits perfectly into your calendar!
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

// Individual Suggestion Card
interface SuggestionCardProps {
  suggestion: SchedulingSuggestion
  onApply: () => void
}

function SuggestionCard({ suggestion, onApply }: SuggestionCardProps) {
  const SuggestionIcon = getSuggestionIcon(suggestion.type)
  
  return (
    <div className="p-4 border rounded-lg hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          <div className="p-2 bg-blue-100 rounded-lg">
            <SuggestionIcon className="h-4 w-4 text-blue-600" />
          </div>
          
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs">
                {suggestion.type}
              </Badge>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs text-muted-foreground">
                  {Math.round(suggestion.confidence * 100)}% confidence
                </span>
              </div>
            </div>
            
            <p className="text-sm font-medium mb-2">{suggestion.description}</p>
            
            {suggestion.newStartTime && suggestion.newEndTime && (
              <div className="text-xs text-muted-foreground">
                New time: {format(suggestion.newStartTime, 'MMM dd, HH:mm')} - {format(suggestion.newEndTime, 'HH:mm')}
              </div>
            )}
            
            {suggestion.newLocation && (
              <div className="text-xs text-muted-foreground">
                New location: {suggestion.newLocation}
              </div>
            )}
          </div>
        </div>
        
        <Button size="sm" onClick={onApply}>
          Apply
        </Button>
      </div>
    </div>
  )
}

// Advanced Scheduling Options
interface AdvancedSchedulingOptionsProps {
  events: CalendarEvent[]
  newEvent: Partial<CalendarEvent>
  onEventUpdate: (eventId: string, updates: Partial<CalendarEvent>) => void
}

function AdvancedSchedulingOptions({ events, newEvent, onEventUpdate }: AdvancedSchedulingOptionsProps) {
  const [availableSlots, setAvailableSlots] = React.useState<Array<{
    start: Date
    end: Date
    duration: number
  }>>([])

  React.useEffect(() => {
    if (newEvent.startTime && newEvent.endTime) {
      const slots = findAvailableSlots(events, newEvent.startTime, newEvent.endTime)
      setAvailableSlots(slots.slice(0, 5)) // Show top 5 slots
    }
  }, [events, newEvent])

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-medium mb-3">Available Time Slots</h4>
        <div className="space-y-2">
          {availableSlots.map((slot, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30"
            >
              <div>
                <div className="font-medium text-sm">
                  {format(slot.start, 'EEEE, MMM dd')}
                </div>
                <div className="text-sm text-muted-foreground">
                  {format(slot.start, 'HH:mm')} - {format(slot.end, 'HH:mm')} ({slot.duration} min)
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (newEvent.id) {
                    onEventUpdate(newEvent.id, {
                      startTime: slot.start,
                      endTime: slot.end
                    })
                  }
                }}
              >
                Use Slot
              </Button>
            </div>
          ))}
          
          {availableSlots.length === 0 && (
            <div className="text-center py-4 text-muted-foreground">
              No available slots found for the requested duration
            </div>
          )}
        </div>
      </div>
      
      <div>
        <h4 className="font-medium mb-3">Scheduling Insights</h4>
        <SchedulingInsights events={events} />
      </div>
    </div>
  )
}

// Scheduling Insights Component
function SchedulingInsights({ events }: { events: CalendarEvent[] }) {
  const insights = React.useMemo(() => {
    const today = new Date()
    const todayEvents = events.filter(event => isSameDay(event.startTime, today))
    const weekEvents = events.filter(event => {
      const eventDate = event.startTime
      const daysDiff = Math.abs(differenceInMinutes(eventDate, today) / (24 * 60))
      return daysDiff <= 7
    })

    const busyHours = events.reduce((acc, event) => {
      const hour = event.startTime.getHours()
      acc[hour] = (acc[hour] || 0) + 1
      return acc
    }, {} as Record<number, number>)

    const busiestHour = Object.entries(busyHours).reduce((max, [hour, count]) => 
      count > max.count ? { hour: parseInt(hour), count } : max
    , { hour: 9, count: 0 })

    return {
      todayCount: todayEvents.length,
      weekCount: weekEvents.length,
      busiestHour: busiestHour.hour,
      averageEventDuration: events.length > 0 
        ? Math.round(events.reduce((sum, event) => 
            sum + differenceInMinutes(event.endTime, event.startTime), 0
          ) / events.length)
        : 0
    }
  }, [events])

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="p-3 bg-blue-50 rounded-lg">
        <div className="text-2xl font-bold text-blue-600">{insights.todayCount}</div>
        <div className="text-sm text-blue-600">Events today</div>
      </div>
      
      <div className="p-3 bg-green-50 rounded-lg">
        <div className="text-2xl font-bold text-green-600">{insights.weekCount}</div>
        <div className="text-sm text-green-600">Events this week</div>
      </div>
      
      <div className="p-3 bg-purple-50 rounded-lg">
        <div className="text-2xl font-bold text-purple-600">{insights.busiestHour}:00</div>
        <div className="text-sm text-purple-600">Busiest hour</div>
      </div>
      
      <div className="p-3 bg-orange-50 rounded-lg">
        <div className="text-2xl font-bold text-orange-600">{insights.averageEventDuration}m</div>
        <div className="text-sm text-orange-600">Avg duration</div>
      </div>
    </div>
  )
}

// Utility Functions
function detectConflicts(newEvent: CalendarEvent, existingEvents: CalendarEvent[]): SchedulingConflict[] {
  const conflicts: SchedulingConflict[] = []

  existingEvents.forEach(event => {
    // Check for direct overlap
    if (isWithinInterval(newEvent.startTime, { start: event.startTime, end: event.endTime }) ||
        isWithinInterval(newEvent.endTime, { start: event.startTime, end: event.endTime }) ||
        isWithinInterval(event.startTime, { start: newEvent.startTime, end: newEvent.endTime })) {
      
      conflicts.push({
        type: 'overlap',
        severity: 'high',
        message: `Direct overlap with "${event.title}"`,
        conflictingEvents: [event],
        suggestions: []
      })
    }
    
    // Check for back-to-back events (potential issue)
    else if (Math.abs(differenceInMinutes(newEvent.startTime, event.endTime)) < 15 ||
             Math.abs(differenceInMinutes(event.startTime, newEvent.endTime)) < 15) {
      
      conflicts.push({
        type: 'back_to_back',
        severity: 'medium',
        message: `Back-to-back with "${event.title}" - no buffer time`,
        conflictingEvents: [event],
        suggestions: []
      })
    }
    
    // Check for travel time conflicts (if locations differ)
    else if (newEvent.location && event.location && 
             newEvent.location !== event.location &&
             Math.abs(differenceInMinutes(newEvent.startTime, event.endTime)) < 30) {
      
      conflicts.push({
        type: 'travel_time',
        severity: 'medium',
        message: `Insufficient travel time between locations`,
        conflictingEvents: [event],
        suggestions: []
      })
    }
  })

  return conflicts
}

async function generateSmartSuggestions(
  newEvent: CalendarEvent,
  existingEvents: CalendarEvent[],
  conflicts: SchedulingConflict[]
): Promise<SchedulingSuggestion[]> {
  const suggestions: SchedulingSuggestion[] = []

  // Generate suggestions based on conflicts
  conflicts.forEach((conflict, index) => {
    switch (conflict.type) {
      case 'overlap':
        // Suggest rescheduling to next available slot
        const nextSlot = findNextAvailableSlot(existingEvents, newEvent.endTime, newEvent.startTime, newEvent.endTime)
        if (nextSlot) {
          suggestions.push({
            id: `reschedule_${index}`,
            type: 'reschedule',
            description: `Move to ${format(nextSlot.start, 'HH:mm')} - ${format(nextSlot.end, 'HH:mm')}`,
            newStartTime: nextSlot.start,
            newEndTime: nextSlot.end,
            confidence: 0.9,
            impact: 'low'
          })
        }
        break
        
      case 'back_to_back':
        // Suggest adding buffer time
        const bufferTime = addMinutes(conflict.conflictingEvents[0].endTime, 15)
        suggestions.push({
          id: `buffer_${index}`,
          type: 'reschedule',
          description: 'Add 15-minute buffer between events',
          newStartTime: bufferTime,
          newEndTime: addMinutes(bufferTime, differenceInMinutes(newEvent.endTime, newEvent.startTime)),
          confidence: 0.8,
          impact: 'low'
        })
        break
        
      case 'travel_time':
        // Suggest adding travel time or virtual meeting
        suggestions.push({
          id: `travel_${index}`,
          type: 'reschedule',
          description: 'Add 30 minutes for travel time',
          newStartTime: addMinutes(conflict.conflictingEvents[0].endTime, 30),
          newEndTime: addMinutes(addMinutes(conflict.conflictingEvents[0].endTime, 30), 
                                differenceInMinutes(newEvent.endTime, newEvent.startTime)),
          confidence: 0.7,
          impact: 'medium'
        })
        
        suggestions.push({
          id: `virtual_${index}`,
          type: 'relocate',
          description: 'Make this a virtual meeting to avoid travel',
          newLocation: 'Virtual Meeting',
          confidence: 0.6,
          impact: 'low'
        })
        break
    }
  })

  return suggestions
}

function findAvailableSlots(
  events: CalendarEvent[],
  preferredStart: Date,
  preferredEnd: Date
): Array<{ start: Date; end: Date; duration: number }> {
  const duration = differenceInMinutes(preferredEnd, preferredStart)
  const slots: Array<{ start: Date; end: Date; duration: number }> = []
  
  // Sort events by start time
  const sortedEvents = [...events].sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
  
  // Check slots for the next 7 days
  for (let day = 0; day < 7; day++) {
    const dayStart = startOfDay(addDays(preferredStart, day))
    const dayEnd = endOfDay(dayStart)
    
    // Working hours: 9 AM to 6 PM
    let currentTime = new Date(dayStart)
    currentTime.setHours(9, 0, 0, 0)
    const endOfWorkDay = new Date(dayStart)
    endOfWorkDay.setHours(18, 0, 0, 0)
    
    const dayEvents = sortedEvents.filter(event => 
      isSameDay(event.startTime, dayStart)
    )
    
    dayEvents.forEach(event => {
      // Check if there's a slot before this event
      if (differenceInMinutes(event.startTime, currentTime) >= duration) {
        slots.push({
          start: new Date(currentTime),
          end: addMinutes(currentTime, duration),
          duration
        })
      }
      currentTime = new Date(event.endTime)
    })
    
    // Check if there's a slot after the last event
    if (differenceInMinutes(endOfWorkDay, currentTime) >= duration) {
      slots.push({
        start: new Date(currentTime),
        end: addMinutes(currentTime, duration),
        duration
      })
    }
  }
  
  return slots
}

function findNextAvailableSlot(
  events: CalendarEvent[],
  afterTime: Date,
  originalStart: Date,
  originalEnd: Date
): { start: Date; end: Date } | null {
  const duration = differenceInMinutes(originalEnd, originalStart)
  const slots = findAvailableSlots(events, afterTime, addMinutes(afterTime, duration))
  
  return slots.length > 0 ? slots[0] : null
}

function getSuggestionIcon(type: string) {
  switch (type) {
    case 'reschedule':
      return Clock
    case 'shorten':
      return RefreshCw
    case 'relocate':
      return MapPin
    case 'split':
      return TrendingUp
    default:
      return Zap
  }
}