'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Trash2,
  Settings,
  X,
  Calendar,
  Users,
  FileText,
  AlertCircle,
  Info,
  CheckCircle,
  Clock,
  Filter
} from 'lucide-react'
import { useNotifications } from '@/hooks/use-notifications'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface NotificationCenterProps {
  className?: string
}

export function NotificationCenter({ className }: NotificationCenterProps) {
  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll
  } = useNotifications()

  const [filter, setFilter] = React.useState<'all' | 'unread' | 'read'>('all')
  const [selectedType, setSelectedType] = React.useState<string>('all')

  const filteredNotifications = React.useMemo(() => {
    let filtered = notifications

    // Filter by read status
    if (filter === 'unread') {
      filtered = filtered.filter(n => !n.readAt)
    } else if (filter === 'read') {
      filtered = filtered.filter(n => n.readAt)
    }

    // Filter by type
    if (selectedType !== 'all') {
      filtered = filtered.filter(n => n.type === selectedType)
    }

    return filtered
  }, [notifications, filter, selectedType])

  const notificationTypes = React.useMemo(() => {
    const types = new Set(notifications.map(n => n.type))
    return Array.from(types)
  }, [notifications])

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'task_due':
      case 'task_assigned':
        return CheckCircle
      case 'project_update':
        return FileText
      case 'calendar_reminder':
        return Calendar
      case 'collaboration_invite':
        return Users
      case 'system':
        return Info
      default:
        return Bell
    }
  }

  const getNotificationColor = (type: string, priority: string) => {
    if (priority === 'urgent') return 'text-red-600 bg-red-50'
    if (priority === 'high') return 'text-orange-600 bg-orange-50'
    
    switch (type) {
      case 'task_due':
        return 'text-blue-600 bg-blue-50'
      case 'project_update':
        return 'text-green-600 bg-green-50'
      case 'calendar_reminder':
        return 'text-purple-600 bg-purple-50'
      case 'collaboration_invite':
        return 'text-indigo-600 bg-indigo-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={cn('relative', className)}>
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-96 p-0" align="end">
        <Card className="border-0 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Notifications</CardTitle>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={markAllAsRead}
                    className="h-7 px-2"
                  >
                    <CheckCheck className="h-3 w-3 mr-1" />
                    Mark all read
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="h-7 px-2">
                  <Settings className="h-3 w-3" />
                </Button>
              </div>
            </div>
            
            {unreadCount > 0 && (
              <CardDescription>
                You have {unreadCount} unread notification{unreadCount > 1 ? 's' : ''}
              </CardDescription>
            )}
          </CardHeader>
          
          <Separator />
          
          {/* Filters */}
          <div className="p-3 border-b">
            <Tabs value={filter} onValueChange={(value: any) => setFilter(value)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                <TabsTrigger value="unread" className="text-xs">
                  Unread {unreadCount > 0 && `(${unreadCount})`}
                </TabsTrigger>
                <TabsTrigger value="read" className="text-xs">Read</TabsTrigger>
              </TabsList>
            </Tabs>
            
            {notificationTypes.length > 1 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                <Button
                  variant={selectedType === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedType('all')}
                  className="h-6 text-xs"
                >
                  All
                </Button>
                {notificationTypes.map((type) => (
                  <Button
                    key={type}
                    variant={selectedType === type ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedType(type)}
                    className="h-6 text-xs"
                  >
                    {type.replace('_', ' ')}
                  </Button>
                ))}
              </div>
            )}
          </div>
          
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <BellOff className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  {filter === 'unread' ? 'No unread notifications' : 'No notifications'}
                </p>
              </div>
            ) : (
              <ScrollArea className="h-96">
                <div className="space-y-1 p-1">
                  {filteredNotifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onMarkAsRead={() => markAsRead(notification.id)}
                      onDelete={() => deleteNotification(notification.id)}
                      getIcon={getNotificationIcon}
                      getColor={getNotificationColor}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
            
            {notifications.length > 0 && (
              <>
                <Separator />
                <div className="p-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAll}
                    className="w-full text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3 mr-2" />
                    Clear all notifications
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  )
}

// Individual Notification Item
interface NotificationItemProps {
  notification: any
  onMarkAsRead: () => void
  onDelete: () => void
  getIcon: (type: string) => React.ComponentType<any>
  getColor: (type: string, priority: string) => string
}

function NotificationItem({ 
  notification, 
  onMarkAsRead, 
  onDelete, 
  getIcon, 
  getColor 
}: NotificationItemProps) {
  const [isHovered, setIsHovered] = React.useState(false)
  const Icon = getIcon(notification.type)
  const colorClass = getColor(notification.type, notification.priority)

  const handleClick = () => {
    if (!notification.readAt) {
      onMarkAsRead()
    }
    
    // Handle notification action (navigate, etc.)
    if (notification.data?.url) {
      window.location.href = notification.data.url
    }
  }

  return (
    <div
      className={cn(
        'p-3 rounded-lg cursor-pointer transition-colors relative group',
        !notification.readAt && 'bg-blue-50/50',
        isHovered && 'bg-muted/50'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      <div className="flex items-start gap-3">
        <div className={cn('p-1.5 rounded-full', colorClass)}>
          <Icon className="h-3 w-3" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h4 className={cn(
                'text-sm font-medium truncate',
                !notification.readAt && 'font-semibold'
              )}>
                {notification.title}
              </h4>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {notification.message}
              </p>
            </div>
            
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {!notification.readAt && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMarkAsRead()
                  }}
                  className="h-6 w-6 p-0"
                >
                  <Check className="h-3 w-3" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
          
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              {notification.priority === 'urgent' && (
                <Badge variant="destructive" className="text-xs">
                  Urgent
                </Badge>
              )}
              {notification.priority === 'high' && (
                <Badge variant="secondary" className="text-xs">
                  High
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(notification.createdAt))} ago
              </span>
            </div>
            
            {!notification.readAt && (
              <div className="w-2 h-2 bg-blue-500 rounded-full" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Notification Bell Icon with Badge
interface NotificationBellProps {
  className?: string
  showBadge?: boolean
}

export function NotificationBell({ className, showBadge = true }: NotificationBellProps) {
  const { unreadCount } = useNotifications()

  return (
    <div className={cn('relative', className)}>
      <Bell className="h-5 w-5" />
      {showBadge && unreadCount > 0 && (
        <Badge 
          variant="destructive" 
          className="absolute -top-2 -right-2 h-4 w-4 flex items-center justify-center p-0 text-xs"
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </Badge>
      )}
    </div>
  )
}

// Toast Notification Component
interface ToastNotificationProps {
  notification: any
  onDismiss: () => void
  onAction?: () => void
}

export function ToastNotification({ notification, onDismiss, onAction }: ToastNotificationProps) {
  const Icon = getNotificationIcon(notification.type)

  React.useEffect(() => {
    const timer = setTimeout(onDismiss, 5000) // Auto-dismiss after 5 seconds
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <Card className="w-80 shadow-lg border-l-4 border-l-blue-500">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-1.5 bg-blue-100 rounded-full">
            <Icon className="h-4 w-4 text-blue-600" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm">{notification.title}</h4>
            <p className="text-xs text-muted-foreground mt-1">
              {notification.message}
            </p>
            
            {onAction && (
              <Button
                variant="outline"
                size="sm"
                onClick={onAction}
                className="mt-2 h-7"
              >
                View
              </Button>
            )}
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="h-6 w-6 p-0"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function getNotificationIcon(type: string) {
  switch (type) {
    case 'task_due':
    case 'task_assigned':
      return CheckCircle
    case 'project_update':
      return FileText
    case 'calendar_reminder':
      return Calendar
    case 'collaboration_invite':
      return Users
    case 'system':
      return Info
    default:
      return Bell
  }
}