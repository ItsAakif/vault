'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Activity, 
  Plus, 
  Edit, 
  Trash2, 
  MessageSquare, 
  Users, 
  Clock, 
  CheckCircle, 
  Target,
  FileText,
  Share2,
  Calendar,
  Filter,
  RefreshCw
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'

interface ActivityItem {
  id: string
  type: 'CREATE' | 'UPDATE' | 'DELETE' | 'COMMENT' | 'SHARE' | 'COLLABORATE' | 'COMPLETE' | 'ASSIGN'
  action: string
  entityType: string
  entityId: string
  entityTitle?: string
  user: {
    id: string
    name: string
    email: string
    avatar?: string
  }
  metadata?: {
    oldValue?: any
    newValue?: any
    changes?: string[]
    assignedTo?: string
    dueDate?: Date
    priority?: string
  }
  createdAt: Date
}

interface ProjectActivityProps {
  projectId: string
  activities: ActivityItem[]
  isLoading?: boolean
  onRefresh: () => void
  onLoadMore?: () => void
  hasMore?: boolean
}

export function ProjectActivity({
  projectId,
  activities,
  isLoading = false,
  onRefresh,
  onLoadMore,
  hasMore = false
}: ProjectActivityProps) {
  const [filterType, setFilterType] = React.useState<string>('all')
  const [filterUser, setFilterUser] = React.useState<string>('all')

  // Get unique users from activities
  const users = React.useMemo(() => {
    const uniqueUsers = new Map()
    activities.forEach(activity => {
      if (!uniqueUsers.has(activity.user.id)) {
        uniqueUsers.set(activity.user.id, activity.user)
      }
    })
    return Array.from(uniqueUsers.values())
  }, [activities])

  // Filter activities
  const filteredActivities = React.useMemo(() => {
    return activities.filter(activity => {
      if (filterType !== 'all' && activity.type !== filterType) {
        return false
      }
      if (filterUser !== 'all' && activity.user.id !== filterUser) {
        return false
      }
      return true
    })
  }, [activities, filterType, filterUser])

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'CREATE':
        return <Plus className="h-4 w-4 text-green-500" />
      case 'UPDATE':
        return <Edit className="h-4 w-4 text-blue-500" />
      case 'DELETE':
        return <Trash2 className="h-4 w-4 text-red-500" />
      case 'COMMENT':
        return <MessageSquare className="h-4 w-4 text-purple-500" />
      case 'SHARE':
        return <Share2 className="h-4 w-4 text-orange-500" />
      case 'COLLABORATE':
        return <Users className="h-4 w-4 text-indigo-500" />
      case 'COMPLETE':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'ASSIGN':
        return <Target className="h-4 w-4 text-yellow-500" />
      default:
        return <Activity className="h-4 w-4 text-gray-500" />
    }
  }

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'CREATE':
        return 'bg-green-50 border-green-200'
      case 'UPDATE':
        return 'bg-blue-50 border-blue-200'
      case 'DELETE':
        return 'bg-red-50 border-red-200'
      case 'COMMENT':
        return 'bg-purple-50 border-purple-200'
      case 'SHARE':
        return 'bg-orange-50 border-orange-200'
      case 'COLLABORATE':
        return 'bg-indigo-50 border-indigo-200'
      case 'COMPLETE':
        return 'bg-green-50 border-green-200'
      case 'ASSIGN':
        return 'bg-yellow-50 border-yellow-200'
      default:
        return 'bg-gray-50 border-gray-200'
    }
  }

  const formatActivityMessage = (activity: ActivityItem) => {
    const { type, action, entityType, entityTitle, metadata } = activity
    
    switch (type) {
      case 'CREATE':
        return `created ${entityType.toLowerCase()} "${entityTitle}"`
      case 'UPDATE':
        if (metadata?.changes && metadata.changes.length > 0) {
          return `updated ${entityType.toLowerCase()} "${entityTitle}" (${metadata.changes.join(', ')})`
        }
        return `updated ${entityType.toLowerCase()} "${entityTitle}"`
      case 'DELETE':
        return `deleted ${entityType.toLowerCase()} "${entityTitle}"`
      case 'COMMENT':
        return `commented on ${entityType.toLowerCase()} "${entityTitle}"`
      case 'SHARE':
        return `shared ${entityType.toLowerCase()} "${entityTitle}"`
      case 'COLLABORATE':
        return `joined as collaborator`
      case 'COMPLETE':
        return `completed ${entityType.toLowerCase()} "${entityTitle}"`
      case 'ASSIGN':
        return `assigned ${entityType.toLowerCase()} "${entityTitle}"${metadata?.assignedTo ? ` to ${metadata.assignedTo}` : ''}`
      default:
        return action
    }
  }

  const groupActivitiesByDate = (activities: ActivityItem[]) => {
    const groups: { [key: string]: ActivityItem[] } = {}
    
    activities.forEach(activity => {
      const date = format(new Date(activity.createdAt), 'yyyy-MM-dd')
      if (!groups[date]) {
        groups[date] = []
      }
      groups[date].push(activity)
    })
    
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
  }

  const groupedActivities = groupActivitiesByDate(filteredActivities)

  return (
    <div className="space-y-6">
      {/* Header with Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          <h3 className="text-lg font-semibold">
            Project Activity ({filteredActivities.length})
          </h3>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="CREATE">Created</SelectItem>
              <SelectItem value="UPDATE">Updated</SelectItem>
              <SelectItem value="DELETE">Deleted</SelectItem>
              <SelectItem value="COMMENT">Comments</SelectItem>
              <SelectItem value="SHARE">Shared</SelectItem>
              <SelectItem value="COMPLETE">Completed</SelectItem>
              <SelectItem value="ASSIGN">Assigned</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={filterUser} onValueChange={setFilterUser}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {users.map(user => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="space-y-6">
        {groupedActivities.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8">
              <Activity className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Activity Yet</h3>
              <p className="text-muted-foreground text-center">
                Project activity will appear here as team members work on tasks and collaborate
              </p>
            </CardContent>
          </Card>
        ) : (
          groupedActivities.map(([date, dayActivities]) => (
            <div key={date} className="space-y-4">
              {/* Date Header */}
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium text-sm text-muted-foreground">
                  {format(new Date(date), 'EEEE, MMMM d, yyyy')}
                </h4>
                <div className="flex-1 h-px bg-border" />
              </div>
              
              {/* Activities for this date */}
              <div className="space-y-3">
                {dayActivities.map((activity, index) => (
                  <Card key={activity.id} className={`${getActivityColor(activity.type)} transition-all hover:shadow-sm`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-1">
                          {getActivityIcon(activity.type)}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={activity.user.avatar} />
                              <AvatarFallback className="text-xs">
                                {activity.user.name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-sm">{activity.user.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {activity.type}
                            </Badge>
                          </div>
                          
                          <p className="text-sm text-foreground mb-2">
                            {formatActivityMessage(activity)}
                          </p>
                          
                          {/* Additional metadata */}
                          {activity.metadata && (
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              {activity.metadata.priority && (
                                <span>Priority: {activity.metadata.priority}</span>
                              )}
                              {activity.metadata.dueDate && (
                                <span>Due: {format(new Date(activity.metadata.dueDate), 'MMM d')}</span>
                              )}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex-shrink-0 text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={onLoadMore}>
            Load More Activity
          </Button>
        </div>
      )}
    </div>
  )
}