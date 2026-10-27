'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  Calendar,
  Repeat,
  Clock,
  Users,
  MapPin,
  Bell,
  X,
  Plus,
  AlertCircle,
  CheckCircle
} from 'lucide-react'
import { format, addDays, addWeeks, addMonths, addYears, startOfDay } from 'date-fns'
import { cn } from '@/lib/utils'

interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  daysOfWeek?: number[] // 0 = Sunday, 1 = Monday, etc.
  dayOfMonth?: number
  weekOfMonth?: number // 1st, 2nd, 3rd, 4th, last
  monthOfYear?: number
  endDate?: Date
  occurrences?: number
  exceptions?: Date[] // Dates to skip
}

interface RecurringEvent {
  id: string
  title: string
  description?: string
  startTime: Date
  endTime: Date
  allDay: boolean
  location?: string
  attendees?: string[]
  recurrence?: RecurrenceRule
  color?: string
  category?: string
  priority?: 'low' | 'medium' | 'high'
  reminders?: number[] // Minutes before event
}

interface RecurringEventFormProps {
  event?: RecurringEvent
  onSave: (event: Omit<RecurringEvent, 'id'>) => void
  onCancel: () => void
  className?: string
}

export function RecurringEventForm({ event, onSave, onCancel, className }: RecurringEventFormProps) {
  const [formData, setFormData] = React.useState<Omit<RecurringEvent, 'id'>>({
    title: event?.title || '',
    description: event?.description || '',
    startTime: event?.startTime || new Date(),
    endTime: event?.endTime || new Date(Date.now() + 60 * 60 * 1000), // 1 hour later
    allDay: event?.allDay || false,
    location: event?.location || '',
    attendees: event?.attendees || [],
    recurrence: event?.recurrence || undefined,
    color: event?.color || '#3b82f6',
    category: event?.category || '',
    priority: event?.priority || 'medium',
    reminders: event?.reminders || [15] // 15 minutes before
  })

  const [showRecurrence, setShowRecurrence] = React.useState(!!event?.recurrence)
  const [newAttendee, setNewAttendee] = React.useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
  }

  const updateRecurrence = (updates: Partial<RecurrenceRule>) => {
    setFormData(prev => ({
      ...prev,
      recurrence: prev.recurrence ? { ...prev.recurrence, ...updates } : {
        frequency: 'weekly',
        interval: 1,
        ...updates
      }
    }))
  }

  const addAttendee = () => {
    if (newAttendee.trim() && !formData.attendees?.includes(newAttendee.trim())) {
      setFormData(prev => ({
        ...prev,
        attendees: [...(prev.attendees || []), newAttendee.trim()]
      }))
      setNewAttendee('')
    }
  }

  const removeAttendee = (attendee: string) => {
    setFormData(prev => ({
      ...prev,
      attendees: prev.attendees?.filter(a => a !== attendee) || []
    }))
  }

  const addReminder = (minutes: number) => {
    if (!formData.reminders?.includes(minutes)) {
      setFormData(prev => ({
        ...prev,
        reminders: [...(prev.reminders || []), minutes].sort((a, b) => b - a)
      }))
    }
  }

  const removeReminder = (minutes: number) => {
    setFormData(prev => ({
      ...prev,
      reminders: prev.reminders?.filter(r => r !== minutes) || []
    }))
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          {event ? 'Edit Event' : 'Create Event'}
        </CardTitle>
        <CardDescription>
          {showRecurrence ? 'Configure recurring event details' : 'Set up your event'}
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Event Details */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Event Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter event title"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Add event description..."
                className="w-full p-2 border rounded-md resize-none"
                rows={3}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category">Category</Label>
                <Select 
                  value={formData.category} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="work">Work</SelectItem>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="appointment">Appointment</SelectItem>
                    <SelectItem value="reminder">Reminder</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select 
                  value={formData.priority} 
                  onValueChange={(value: any) => setFormData(prev => ({ ...prev, priority: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          {/* Date and Time */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="allDay"
                checked={formData.allDay}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, allDay: !!checked }))}
              />
              <Label htmlFor="allDay">All day event</Label>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={format(formData.startTime, 'yyyy-MM-dd')}
                  onChange={(e) => {
                    const newDate = new Date(e.target.value)
                    newDate.setHours(formData.startTime.getHours())
                    newDate.setMinutes(formData.startTime.getMinutes())
                    setFormData(prev => ({ ...prev, startTime: newDate }))
                  }}
                />
              </div>
              
              {!formData.allDay && (
                <div>
                  <Label htmlFor="startTime">Start Time</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={format(formData.startTime, 'HH:mm')}
                    onChange={(e) => {
                      const [hours, minutes] = e.target.value.split(':')
                      const newDate = new Date(formData.startTime)
                      newDate.setHours(parseInt(hours), parseInt(minutes))
                      setFormData(prev => ({ ...prev, startTime: newDate }))
                    }}
                  />
                </div>
              )}
            </div>
            
            {!formData.allDay && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={format(formData.endTime, 'yyyy-MM-dd')}
                    onChange={(e) => {
                      const newDate = new Date(e.target.value)
                      newDate.setHours(formData.endTime.getHours())
                      newDate.setMinutes(formData.endTime.getMinutes())
                      setFormData(prev => ({ ...prev, endTime: newDate }))
                    }}
                  />
                </div>
                
                <div>
                  <Label htmlFor="endTime">End Time</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={format(formData.endTime, 'HH:mm')}
                    onChange={(e) => {
                      const [hours, minutes] = e.target.value.split(':')
                      const newDate = new Date(formData.endTime)
                      newDate.setHours(parseInt(hours), parseInt(minutes))
                      setFormData(prev => ({ ...prev, endTime: newDate }))
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Recurrence */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="recurring"
                  checked={showRecurrence}
                  onCheckedChange={(checked) => {
                    setShowRecurrence(!!checked)
                    if (!checked) {
                      setFormData(prev => ({ ...prev, recurrence: undefined }))
                    }
                  }}
                />
                <Label htmlFor="recurring" className="flex items-center gap-2">
                  <Repeat className="h-4 w-4" />
                  Recurring event
                </Label>
              </div>
            </div>
            
            {showRecurrence && (
              <RecurrenceSettings
                recurrence={formData.recurrence}
                onChange={updateRecurrence}
              />
            )}
          </div>

          <Separator />

          {/* Location and Attendees */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="location" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Location
              </Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                placeholder="Add location"
              />
            </div>
            
            <div>
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Attendees
              </Label>
              <div className="flex gap-2 mt-2">
                <Input
                  value={newAttendee}
                  onChange={(e) => setNewAttendee(e.target.value)}
                  placeholder="Add attendee email"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addAttendee())}
                />
                <Button type="button" onClick={addAttendee}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              
              {formData.attendees && formData.attendees.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.attendees.map((attendee) => (
                    <Badge key={attendee} variant="secondary" className="flex items-center gap-1">
                      {attendee}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAttendee(attendee)}
                        className="h-4 w-4 p-0 hover:bg-transparent"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Reminders */}
          <div className="space-y-4">
            <Label className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Reminders
            </Label>
            
            <div className="flex flex-wrap gap-2">
              {[5, 15, 30, 60, 1440].map((minutes) => (
                <Button
                  key={minutes}
                  type="button"
                  variant={formData.reminders?.includes(minutes) ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    if (formData.reminders?.includes(minutes)) {
                      removeReminder(minutes)
                    } else {
                      addReminder(minutes)
                    }
                  }}
                >
                  {minutes < 60 ? `${minutes}m` : minutes === 1440 ? '1 day' : `${minutes / 60}h`}
                </Button>
              ))}
            </div>
            
            {formData.reminders && formData.reminders.length > 0 && (
              <div className="text-sm text-muted-foreground">
                You'll be reminded: {formData.reminders.map(m => 
                  m < 60 ? `${m} minutes` : m === 1440 ? '1 day' : `${m / 60} hours`
                ).join(', ')} before the event
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex gap-2 pt-4">
            <Button type="submit" className="flex-1">
              {event ? 'Update Event' : 'Create Event'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// Recurrence Settings Component
interface RecurrenceSettingsProps {
  recurrence?: RecurrenceRule
  onChange: (recurrence: Partial<RecurrenceRule>) => void
}

function RecurrenceSettings({ recurrence, onChange }: RecurrenceSettingsProps) {
  const frequency = recurrence?.frequency || 'weekly'
  const interval = recurrence?.interval || 1

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="frequency">Repeat</Label>
          <Select 
            value={frequency} 
            onValueChange={(value: any) => onChange({ frequency: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <Label htmlFor="interval">Every</Label>
          <div className="flex items-center gap-2">
            <Input
              id="interval"
              type="number"
              min="1"
              max="99"
              value={interval}
              onChange={(e) => onChange({ interval: parseInt(e.target.value) || 1 })}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">
              {frequency === 'daily' && (interval === 1 ? 'day' : 'days')}
              {frequency === 'weekly' && (interval === 1 ? 'week' : 'weeks')}
              {frequency === 'monthly' && (interval === 1 ? 'month' : 'months')}
              {frequency === 'yearly' && (interval === 1 ? 'year' : 'years')}
            </span>
          </div>
        </div>
      </div>
      
      {frequency === 'weekly' && (
        <div>
          <Label>Repeat on</Label>
          <div className="flex gap-2 mt-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
              <Button
                key={day}
                type="button"
                variant={recurrence?.daysOfWeek?.includes(index) ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  const currentDays = recurrence?.daysOfWeek || []
                  const newDays = currentDays.includes(index)
                    ? currentDays.filter(d => d !== index)
                    : [...currentDays, index].sort()
                  onChange({ daysOfWeek: newDays })
                }}
                className="w-12"
              >
                {day}
              </Button>
            ))}
          </div>
        </div>
      )}
      
      {frequency === 'monthly' && (
        <div>
          <Label>Repeat by</Label>
          <div className="flex gap-2 mt-2">
            <Button
              type="button"
              variant={!recurrence?.weekOfMonth ? "default" : "outline"}
              size="sm"
              onClick={() => onChange({ weekOfMonth: undefined, dayOfMonth: new Date().getDate() })}
            >
              Day of month
            </Button>
            <Button
              type="button"
              variant={recurrence?.weekOfMonth ? "default" : "outline"}
              size="sm"
              onClick={() => onChange({ dayOfMonth: undefined, weekOfMonth: 1 })}
            >
              Day of week
            </Button>
          </div>
        </div>
      )}
      
      <div>
        <Label>End</Label>
        <div className="flex gap-2 mt-2">
          <Button
            type="button"
            variant={!recurrence?.endDate && !recurrence?.occurrences ? "default" : "outline"}
            size="sm"
            onClick={() => onChange({ endDate: undefined, occurrences: undefined })}
          >
            Never
          </Button>
          <Button
            type="button"
            variant={recurrence?.endDate ? "default" : "outline"}
            size="sm"
            onClick={() => onChange({ 
              endDate: addMonths(new Date(), 1), 
              occurrences: undefined 
            })}
          >
            On date
          </Button>
          <Button
            type="button"
            variant={recurrence?.occurrences ? "default" : "outline"}
            size="sm"
            onClick={() => onChange({ 
              endDate: undefined, 
              occurrences: 10 
            })}
          >
            After
          </Button>
        </div>
        
        {recurrence?.endDate && (
          <Input
            type="date"
            value={format(recurrence.endDate, 'yyyy-MM-dd')}
            onChange={(e) => onChange({ endDate: new Date(e.target.value) })}
            className="mt-2"
          />
        )}
        
        {recurrence?.occurrences && (
          <div className="flex items-center gap-2 mt-2">
            <Input
              type="number"
              min="1"
              max="999"
              value={recurrence.occurrences}
              onChange={(e) => onChange({ occurrences: parseInt(e.target.value) || 1 })}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">occurrences</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Utility function to generate recurring event instances
export function generateRecurringInstances(
  baseEvent: RecurringEvent,
  startDate: Date,
  endDate: Date
): RecurringEvent[] {
  if (!baseEvent.recurrence) {
    return [baseEvent]
  }

  const instances: RecurringEvent[] = []
  const { frequency, interval, daysOfWeek, endDate: recurrenceEnd, occurrences, exceptions } = baseEvent.recurrence
  
  let currentDate = new Date(baseEvent.startTime)
  let count = 0
  const maxOccurrences = occurrences || 1000 // Reasonable limit
  
  while (currentDate <= endDate && count < maxOccurrences) {
    // Check if this date should be included
    if (currentDate >= startDate) {
      const isException = exceptions?.some(exception => 
        startOfDay(exception).getTime() === startOfDay(currentDate).getTime()
      )
      
      if (!isException) {
        // Check day of week for weekly recurrence
        if (frequency === 'weekly' && daysOfWeek && daysOfWeek.length > 0) {
          if (daysOfWeek.includes(currentDate.getDay())) {
            instances.push(createEventInstance(baseEvent, currentDate))
          }
        } else {
          instances.push(createEventInstance(baseEvent, currentDate))
        }
      }
    }
    
    // Move to next occurrence
    switch (frequency) {
      case 'daily':
        currentDate = addDays(currentDate, interval)
        break
      case 'weekly':
        if (daysOfWeek && daysOfWeek.length > 0) {
          // Find next day of week
          const nextDay = findNextDayOfWeek(currentDate, daysOfWeek)
          currentDate = nextDay
        } else {
          currentDate = addWeeks(currentDate, interval)
        }
        break
      case 'monthly':
        currentDate = addMonths(currentDate, interval)
        break
      case 'yearly':
        currentDate = addYears(currentDate, interval)
        break
    }
    
    count++
    
    // Check end conditions
    if (recurrenceEnd && currentDate > recurrenceEnd) {
      break
    }
  }
  
  return instances
}

function createEventInstance(baseEvent: RecurringEvent, date: Date): RecurringEvent {
  const duration = baseEvent.endTime.getTime() - baseEvent.startTime.getTime()
  const newStartTime = new Date(date)
  newStartTime.setHours(baseEvent.startTime.getHours())
  newStartTime.setMinutes(baseEvent.startTime.getMinutes())
  
  return {
    ...baseEvent,
    id: `${baseEvent.id}_${format(date, 'yyyy-MM-dd')}`,
    startTime: newStartTime,
    endTime: new Date(newStartTime.getTime() + duration)
  }
}

function findNextDayOfWeek(currentDate: Date, daysOfWeek: number[]): Date {
  const currentDay = currentDate.getDay()
  const sortedDays = [...daysOfWeek].sort()
  
  // Find next day in the same week
  const nextDay = sortedDays.find(day => day > currentDay)
  
  if (nextDay !== undefined) {
    const daysToAdd = nextDay - currentDay
    return addDays(currentDate, daysToAdd)
  } else {
    // Move to first day of next week
    const daysToAdd = 7 - currentDay + sortedDays[0]
    return addDays(currentDate, daysToAdd)
  }
}