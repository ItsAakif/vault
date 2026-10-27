'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Bell, 
  Clock, 
  MapPin, 
  Plus, 
  Settings, 
  BellOff,
  AlertCircle,
  CheckCircle,
  Calendar,
  ListTodo,
  Brain,
  TrendingUp
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface Reminder {
  id: string
  type: string
  title: string
  message: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  read: boolean
  createdAt: string
  data?: any
}

interface UserPattern {
  userId: string
  patterns: {
    activeHours: { start: string; end: string }[]
    preferredNotificationTimes: string[]
    responseRates: { [channel: string]: number }
  }
}

export function SmartReminderManager() {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [userPatterns, setUserPatterns] = useState<UserPattern | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showPatternsDialog, setShowPatternsDialog] = useState(false)
  const [newReminder, setNewReminder] = useState({
    type: 'custom',
    title: '',
    message: '',
    priority: 'medium',
    triggerTime: '',
    location: {
      latitude: 0,
      longitude: 0,
      radius: 100
    }
  })
  const { toast } = useToast()

  useEffect(() => {
    fetchReminders()
    fetchUserPatterns()
  }, [])

  const fetchReminders = async () => {
    try {
      const response = await fetch('/api/reminders')
      if (response.ok) {
        const data = await response.json()
        setReminders(data)
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch reminders',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchUserPatterns = async () => {
    try {
      const response = await fetch('/api/reminders/patterns')
      if (response.ok) {
        const data = await response.json()
        setUserPatterns(data)
      }
    } catch (error) {
      console.error('Failed to fetch user patterns:', error)
    }
  }

  const createReminder = async () => {
    try {
      const response = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newReminder)
      })

      if (response.ok) {
        const reminder = await response.json()
        setReminders(prev => [reminder, ...prev])
        setShowCreateDialog(false)
        setNewReminder({
          type: 'custom',
          title: '',
          message: '',
          priority: 'medium',
          triggerTime: '',
          location: {
            latitude: 0,
            longitude: 0,
            radius: 100
          }
        })
        toast({
          title: 'Success',
          description: 'Reminder created successfully'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create reminder',
        variant: 'destructive'
      })
    }
  }

  const snoozeReminder = async (reminderId: string, duration?: string) => {
    try {
      const response = await fetch(`/api/reminders/${reminderId}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration })
      })

      if (response.ok) {
        const { snoozeUntil, suggestedTimes } = await response.json()
        toast({
          title: 'Reminder Snoozed',
          description: `Snoozed until ${new Date(snoozeUntil).toLocaleString()}`
        })
        fetchReminders() // Refresh the list
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to snooze reminder',
        variant: 'destructive'
      })
    }
  }

  const requestLocationPermission = async () => {
    if ('geolocation' in navigator) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject)
        })

        // Update location on server
        await fetch('/api/reminders/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          })
        })

        toast({
          title: 'Location Updated',
          description: 'Location-based reminders are now active'
        })
      } catch (error) {
        toast({
          title: 'Location Error',
          description: 'Failed to get location. Please enable location services.',
          variant: 'destructive'
        })
      }
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'LOW': return 'bg-green-100 text-green-800'
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800'
      case 'HIGH': return 'bg-orange-100 text-orange-800'
      case 'URGENT': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'CALENDAR_REMINDER': return <Calendar className="h-4 w-4" />
      case 'TASK_DUE': return <ListTodo className="h-4 w-4" />
      case 'CUSTOM_REMINDER': return <Bell className="h-4 w-4" />
      default: return <Bell className="h-4 w-4" />
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Smart Reminders</h2>
          <p className="text-muted-foreground">
            Intelligent reminders that adapt to your patterns
          </p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => setShowPatternsDialog(true)}>
            <Brain className="h-4 w-4 mr-2" />
            Patterns
          </Button>
          <Button variant="outline" onClick={requestLocationPermission}>
            <MapPin className="h-4 w-4 mr-2" />
            Enable Location
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Reminder
          </Button>
        </div>
      </div>

      {/* User Patterns Summary */}
      {userPatterns && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5" />
              <span>Your Notification Patterns</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <h4 className="font-medium mb-2">Active Hours</h4>
                <div className="space-y-1">
                  {userPatterns.patterns.activeHours.map((period, index) => (
                    <Badge key={index} variant="secondary">
                      {period.start} - {period.end}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-2">Preferred Times</h4>
                <div className="space-y-1">
                  {userPatterns.patterns.preferredNotificationTimes.map((time, index) => (
                    <Badge key={index} variant="outline">
                      {time}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-2">Response Rates</h4>
                <div className="space-y-1">
                  {Object.entries(userPatterns.patterns.responseRates).map(([channel, rate]) => (
                    <div key={channel} className="flex justify-between text-sm">
                      <span className="capitalize">{channel}:</span>
                      <span>{Math.round(rate * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reminders List */}
      <div className="space-y-4">
        {reminders.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="text-center space-y-4">
                <div className="mx-auto bg-muted rounded-full p-4 w-fit">
                  <Bell className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-medium">No reminders yet</h3>
                  <p className="text-muted-foreground">
                    Create your first smart reminder
                  </p>
                </div>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Reminder
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          reminders.map((reminder) => (
            <Card key={reminder.id}>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center space-x-2">
                      {getTypeIcon(reminder.type)}
                      <h3 className="font-medium">{reminder.title}</h3>
                      <Badge className={getPriorityColor(reminder.priority)}>
                        {reminder.priority}
                      </Badge>
                      {reminder.read ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{reminder.message}</p>
                    <p className="text-xs text-muted-foreground">
                      Created: {new Date(reminder.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => snoozeReminder(reminder.id, '15m')}
                    >
                      <BellOff className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => snoozeReminder(reminder.id, '1h')}
                    >
                      1h
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create Reminder Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Smart Reminder</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="custom" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="custom">Custom</TabsTrigger>
              <TabsTrigger value="event">Event</TabsTrigger>
              <TabsTrigger value="task">Task</TabsTrigger>
              <TabsTrigger value="location">Location</TabsTrigger>
            </TabsList>
            
            <TabsContent value="custom" className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={newReminder.title}
                  onChange={(e) => setNewReminder(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Reminder title"
                />
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  value={newReminder.message}
                  onChange={(e) => setNewReminder(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="Reminder message"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select 
                    value={newReminder.priority} 
                    onValueChange={(value) => setNewReminder(prev => ({ ...prev, priority: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Trigger Time</Label>
                  <Input
                    type="datetime-local"
                    value={newReminder.triggerTime}
                    onChange={(e) => setNewReminder(prev => ({ ...prev, triggerTime: e.target.value }))}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="location" className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={newReminder.title}
                  onChange={(e) => setNewReminder(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Location reminder title"
                />
              </div>
              <div className="space-y-2">
                <Label>Action</Label>
                <Textarea
                  value={newReminder.message}
                  onChange={(e) => setNewReminder(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="What to do when you arrive"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Latitude</Label>
                  <Input
                    type="number"
                    step="any"
                    value={newReminder.location.latitude}
                    onChange={(e) => setNewReminder(prev => ({
                      ...prev,
                      location: { ...prev.location, latitude: parseFloat(e.target.value) || 0 }
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Longitude</Label>
                  <Input
                    type="number"
                    step="any"
                    value={newReminder.location.longitude}
                    onChange={(e) => setNewReminder(prev => ({
                      ...prev,
                      location: { ...prev.location, longitude: parseFloat(e.target.value) || 0 }
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Radius (m)</Label>
                  <Input
                    type="number"
                    value={newReminder.location.radius}
                    onChange={(e) => setNewReminder(prev => ({
                      ...prev,
                      location: { ...prev.location, radius: parseInt(e.target.value) || 100 }
                    }))}
                  />
                </div>
              </div>
              <Button
                variant="outline"
                onClick={async () => {
                  if ('geolocation' in navigator) {
                    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                      navigator.geolocation.getCurrentPosition(resolve, reject)
                    })
                    setNewReminder(prev => ({
                      ...prev,
                      location: {
                        ...prev.location,
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                      }
                    }))
                  }
                }}
              >
                <MapPin className="h-4 w-4 mr-2" />
                Use Current Location
              </Button>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={createReminder}>
              Create Reminder
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Patterns Dialog */}
      <Dialog open={showPatternsDialog} onOpenChange={setShowPatternsDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Your Notification Patterns</DialogTitle>
          </DialogHeader>
          {userPatterns && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium mb-4">Activity Analysis</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Most Active Hours</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {userPatterns.patterns.activeHours.map((period, index) => (
                          <div key={index} className="flex justify-between">
                            <span>{period.start} - {period.end}</span>
                            <Badge variant="secondary">Active</Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Response Rates</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {Object.entries(userPatterns.patterns.responseRates).map(([channel, rate]) => (
                          <div key={channel} className="flex justify-between">
                            <span className="capitalize">{channel}</span>
                            <span>{Math.round(rate * 100)}%</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-medium mb-4">Optimization Suggestions</h3>
                <div className="space-y-2">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm">
                      📱 You respond best to notifications during your active hours. 
                      We'll prioritize sending reminders between{' '}
                      {userPatterns.patterns.activeHours[0]?.start || '9:00'} and{' '}
                      {userPatterns.patterns.activeHours[0]?.end || '17:00'}.
                    </p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <p className="text-sm">
                      ⏰ Your preferred notification times are{' '}
                      {userPatterns.patterns.preferredNotificationTimes.join(', ')}.
                      We'll suggest these times for snoozing.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}