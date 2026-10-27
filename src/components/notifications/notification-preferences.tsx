'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { 
  Bell, 
  Mail, 
  Smartphone, 
  MessageSquare,
  Clock,
  Volume2,
  VolumeX,
  Settings,
  BarChart3,
  Archive,
  Users
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface NotificationCategory {
  id: string
  name: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  enabled: boolean
  channels: ('in-app' | 'email' | 'push' | 'sms')[]
  quietHours: boolean
  grouping: boolean
  batching: boolean
}

interface QuietHours {
  enabled: boolean
  start: string
  end: string
  days: number[]
  exceptions: string[]
}

interface NotificationHistoryStats {
  total: number
  read: number
  unread: number
  responseTime: number
  byCategory: Record<string, number>
  byPriority: Record<string, number>
}

interface NotificationHistory {
  stats: NotificationHistoryStats
}

interface NotificationPreferences {
  emailNotifications: boolean
  pushNotifications: boolean
  inAppNotifications: boolean
  digestNotifications: boolean
  mentionNotifications: boolean
  maxNotificationsPerHour: number
  categories: NotificationCategory[]
  quietHours: QuietHours
}

export function NotificationPreferences() {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState<NotificationHistory | null>(null)
  const { toast } = useToast()

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  useEffect(() => {
    fetchPreferences()
    fetchHistory()
  }, [])

  const fetchPreferences = async () => {
    try {
      const response = await fetch('/api/notifications/preferences')
      if (response.ok) {
        const data = await response.json()
        setPreferences(data)
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch notification preferences',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchHistory = async () => {
    try {
      const response = await fetch('/api/notifications/history?days=7')
      if (response.ok) {
        const data = await response.json()
        setHistory(data)
      }
    } catch (error) {
      console.error('Failed to fetch notification history:', error)
    }
  }

  const savePreferences = async () => {
    if (!preferences) return

    setSaving(true)
    try {
      const response = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailNotifications: preferences.emailNotifications,
          pushNotifications: preferences.pushNotifications,
          inAppNotifications: preferences.inAppNotifications,
          digestNotifications: preferences.digestNotifications,
          mentionNotifications: preferences.mentionNotifications,
          maxNotificationsPerHour: preferences.maxNotificationsPerHour,
          notificationCategories: preferences.categories.reduce((acc, category) => {
            acc[category.id] = {
              enabled: category.enabled,
              channels: category.channels,
              quietHours: category.quietHours,
              grouping: category.grouping,
              batching: category.batching
            }
            return acc
          }, {} as any),
          quietHours: preferences.quietHours
        })
      })

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Notification preferences saved successfully'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save preferences',
        variant: 'destructive'
      })
    } finally {
      setSaving(false)
    }
  }

  const archiveOldNotifications = async () => {
    try {
      const response = await fetch('/api/notifications/history?olderThanDays=30', {
        method: 'DELETE'
      })

      if (response.ok) {
        const { archivedCount } = await response.json()
        toast({
          title: 'Success',
          description: `Archived ${archivedCount} old notifications`
        })
        fetchHistory() // Refresh history
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to archive notifications',
        variant: 'destructive'
      })
    }
  }

  const updateCategory = (categoryId: string, updates: Partial<NotificationCategory>) => {
    if (!preferences) return

    setPreferences({
      ...preferences,
      categories: preferences.categories.map(category =>
        category.id === categoryId ? { ...category, ...updates } : category
      )
    })
  }

  const updateQuietHours = (updates: Partial<QuietHours>) => {
    if (!preferences) return

    setPreferences({
      ...preferences,
      quietHours: { ...preferences.quietHours, ...updates }
    })
  }

  const toggleQuietHoursDay = (day: number) => {
    if (!preferences) return

    const days = preferences.quietHours.days.includes(day)
      ? preferences.quietHours.days.filter(d => d !== day)
      : [...preferences.quietHours.days, day]

    updateQuietHours({ days })
  }

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'in-app': return <Bell className="h-4 w-4" />
      case 'email': return <Mail className="h-4 w-4" />
      case 'push': return <Smartphone className="h-4 w-4" />
      case 'sms': return <MessageSquare className="h-4 w-4" />
      default: return <Bell className="h-4 w-4" />
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'bg-green-100 text-green-800'
      case 'medium': return 'bg-yellow-100 text-yellow-800'
      case 'high': return 'bg-orange-100 text-orange-800'
      case 'urgent': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!preferences) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load notification preferences</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Notification Preferences</h2>
          <p className="text-muted-foreground">
            Manage how and when you receive notifications
          </p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={archiveOldNotifications}>
            <Archive className="h-4 w-4 mr-2" />
            Archive Old
          </Button>
          <Button onClick={savePreferences} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="quiet-hours">Quiet Hours</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          {/* Global Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Global Notification Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>In-App Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Show notifications within the application
                  </p>
                </div>
                <Switch
                  checked={preferences.inAppNotifications}
                  onCheckedChange={(checked) => 
                    setPreferences({ ...preferences, inAppNotifications: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications via email
                  </p>
                </div>
                <Switch
                  checked={preferences.emailNotifications}
                  onCheckedChange={(checked) => 
                    setPreferences({ ...preferences, emailNotifications: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Push Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive browser push notifications
                  </p>
                </div>
                <Switch
                  checked={preferences.pushNotifications}
                  onCheckedChange={(checked) => 
                    setPreferences({ ...preferences, pushNotifications: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Daily Digest</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive a daily summary of notifications
                  </p>
                </div>
                <Switch
                  checked={preferences.digestNotifications}
                  onCheckedChange={(checked) => 
                    setPreferences({ ...preferences, digestNotifications: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Mention Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when someone mentions you
                  </p>
                </div>
                <Switch
                  checked={preferences.mentionNotifications}
                  onCheckedChange={(checked) => 
                    setPreferences({ ...preferences, mentionNotifications: checked })
                  }
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Maximum Notifications Per Hour</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={preferences.maxNotificationsPerHour}
                    onChange={(e) => 
                      setPreferences({ 
                        ...preferences, 
                        maxNotificationsPerHour: parseInt(e.target.value) || 10 
                      })
                    }
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">
                    notifications per hour
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Excess notifications will be batched to prevent spam
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="space-y-6">
          {/* Category Settings */}
          <div className="space-y-4">
            {preferences.categories.map((category) => (
              <Card key={category.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center space-x-2">
                        <span>{category.name}</span>
                        <Badge className={getPriorityColor(category.priority)}>
                          {category.priority}
                        </Badge>
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {category.description}
                      </p>
                    </div>
                    <Switch
                      checked={category.enabled}
                      onCheckedChange={(checked) => 
                        updateCategory(category.id, { enabled: checked })
                      }
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium">Delivery Channels</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {['in-app', 'email', 'push', 'sms'].map((channel) => (
                        <Button
                          key={channel}
                          variant={category.channels.includes(channel as any) ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            const channels = category.channels.includes(channel as any)
                              ? category.channels.filter(c => c !== channel)
                              : [...category.channels, channel as any]
                            updateCategory(category.id, { channels })
                          }}
                          className="flex items-center space-x-1"
                        >
                          {getChannelIcon(channel)}
                          <span className="capitalize">{channel}</span>
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Respect Quiet Hours</Label>
                      <Switch
                        checked={category.quietHours}
                        onCheckedChange={(checked) => 
                          updateCategory(category.id, { quietHours: checked })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Group Similar</Label>
                      <Switch
                        checked={category.grouping}
                        onCheckedChange={(checked) => 
                          updateCategory(category.id, { grouping: checked })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Batch Delivery</Label>
                      <Switch
                        checked={category.batching}
                        onCheckedChange={(checked) => 
                          updateCategory(category.id, { batching: checked })
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="quiet-hours" className="space-y-6">
          {/* Quiet Hours */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                {preferences.quietHours.enabled ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
                <span>Quiet Hours</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Quiet Hours</Label>
                  <p className="text-sm text-muted-foreground">
                    Suppress non-urgent notifications during specified hours
                  </p>
                </div>
                <Switch
                  checked={preferences.quietHours.enabled}
                  onCheckedChange={(checked) => updateQuietHours({ enabled: checked })}
                />
              </div>

              {preferences.quietHours.enabled && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Time</Label>
                      <Input
                        type="time"
                        value={preferences.quietHours.start}
                        onChange={(e) => updateQuietHours({ start: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Time</Label>
                      <Input
                        type="time"
                        value={preferences.quietHours.end}
                        onChange={(e) => updateQuietHours({ end: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Active Days</Label>
                    <div className="flex flex-wrap gap-2">
                      {dayNames.map((day, index) => (
                        <Button
                          key={day}
                          variant={preferences.quietHours.days.includes(index) ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => toggleQuietHoursDay(index)}
                        >
                          {day.slice(0, 3)}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Exceptions</Label>
                    <p className="text-sm text-muted-foreground">
                      These notification types will bypass quiet hours:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {preferences.quietHours.exceptions.map((exception) => (
                        <Badge key={exception} variant="secondary">
                          {exception}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          {/* Analytics */}
          {history && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total</p>
                      <p className="text-2xl font-bold">{history.stats.total}</p>
                    </div>
                    <Bell className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Read</p>
                      <p className="text-2xl font-bold">{history.stats.read}</p>
                    </div>
                    <BarChart3 className="h-8 w-8 text-green-500" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Unread</p>
                      <p className="text-2xl font-bold">{history.stats.unread}</p>
                    </div>
                    <Clock className="h-8 w-8 text-orange-500" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Avg Response</p>
                      <p className="text-2xl font-bold">{history.stats.responseTime}m</p>
                    </div>
                    <Clock className="h-8 w-8 text-blue-500" />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {history && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>By Category</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(history.stats.byCategory).map(([category, count]) => (
                      <div key={category} className="flex justify-between">
                        <span className="capitalize">{category}</span>
                        <span>{count}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>By Priority</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(history.stats.byPriority).map(([priority, count]) => (
                      <div key={priority} className="flex justify-between">
                        <span className="capitalize">{priority}</span>
                        <span>{count}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}