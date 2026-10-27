'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { animations } from '@/lib/animations'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { Task } from './kanban-board'
import {
  Calendar,
  Clock,
  User,
  Tag,
  MoreHorizontal,
  Edit,
  Trash2,
  AlertTriangle,
  Flag,
  MessageSquare,
  Paperclip
} from 'lucide-react'

interface KanbanCardProps {
  task: Task
  onUpdate?: (taskId: string, updates: Partial<Task>) => Promise<void>
  onDelete?: (taskId: string) => Promise<void>
  isDragging?: boolean
  readOnly?: boolean
}

export function KanbanCard({
  task,
  onUpdate,
  onDelete,
  isDragging = false,
  readOnly = false
}: KanbanCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [showActions, setShowActions] = useState(false)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging
  } = useSortable({
    id: task.id,
    disabled: readOnly || isEditing
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  // Priority colors
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'LOW':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'MEDIUM':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'HIGH':
        return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'CRITICAL':
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-neutral-100 text-neutral-800 border-neutral-200'
    }
  }

  // Priority icons
  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'HIGH':
      case 'CRITICAL':
        return <Flag className="h-3 w-3" />
      default:
        return null
    }
  }

  // Check if task is overdue
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED'

  // Format due date
  const formatDueDate = (date: Date) => {
    const now = new Date()
    const diffTime = date.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Tomorrow'
    if (diffDays === -1) return 'Yesterday'
    if (diffDays < 0) return `${Math.abs(diffDays)} days ago`
    if (diffDays <= 7) return `${diffDays} days`
    
    return date.toLocaleDateString()
  }

  // Handle quick edit
  const handleQuickEdit = async (field: keyof Task, value: any) => {
    if (!onUpdate) return
    
    try {
      await onUpdate(task.id, { [field]: value })
    } catch (error) {
      console.error('Error updating task:', error)
    }
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'group cursor-pointer transition-all duration-200 hover:shadow-md',
        isSortableDragging && 'opacity-50 rotate-3 shadow-lg',
        isDragging && 'shadow-xl',
        isOverdue && 'border-red-300 bg-red-50',
        readOnly && 'cursor-default'
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      {...attributes}
      {...listeners}
    >
      <CardContent className="p-3">
        {/* Task Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm text-neutral-900 line-clamp-2 mb-1">
              {task.title}
            </h4>
            
            {task.description && (
              <p className="text-xs text-neutral-600 line-clamp-2">
                {task.description}
              </p>
            )}
          </div>

          {/* Actions Menu */}
          {!readOnly && showActions && (
            <motion.div
              className="flex items-center space-x-1 ml-2"
              {...animations.fadeIn}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsEditing(true)
                }}
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
              >
                <Edit className="h-3 w-3" />
              </Button>
              
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(task.id)
                  }}
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </motion.div>
          )}
        </div>

        {/* Task Metadata */}
        <div className="space-y-2">
          {/* Priority and Status */}
          <div className="flex items-center space-x-2">
            <Badge
              variant="outline"
              className={cn('text-xs border', getPriorityColor(task.priority))}
            >
              {getPriorityIcon(task.priority)}
              <span className={getPriorityIcon(task.priority) ? 'ml-1' : ''}>
                {task.priority}
              </span>
            </Badge>

            {isOverdue && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Overdue
              </Badge>
            )}
          </div>

          {/* Due Date */}
          {task.dueDate && (
            <div className={cn(
              'flex items-center space-x-1 text-xs',
              isOverdue ? 'text-red-600' : 'text-neutral-600'
            )}>
              <Calendar className="h-3 w-3" />
              <span>{formatDueDate(new Date(task.dueDate))}</span>
            </div>
          )}

          {/* Time Estimates */}
          {(task.estimatedHours || task.actualHours) && (
            <div className="flex items-center space-x-1 text-xs text-neutral-600">
              <Clock className="h-3 w-3" />
              <span>
                {task.actualHours && `${task.actualHours}h`}
                {task.actualHours && task.estimatedHours && ' / '}
                {task.estimatedHours && `${task.estimatedHours}h est`}
              </span>
            </div>
          )}

          {/* Tags */}
          {(task.tags?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1">
              {task.tags.slice(0, 3).map(tag => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  <Tag className="h-2 w-2 mr-1" />
                  {tag}
                </Badge>
              ))}
              {(task.tags?.length ?? 0) > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{(task.tags?.length ?? 0) - 3}
                </Badge>
              )}
            </div>
          )}

          {/* Assignee */}
          {task.assignee && (
            <div className="flex items-center space-x-2">
              <Avatar className="h-5 w-5">
                <AvatarImage src={task.assignee.avatar} />
                <AvatarFallback className="text-xs">
                  {task.assignee.name?.charAt(0) || task.assignee.email.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-neutral-600 truncate">
                {task.assignee.name || task.assignee.email}
              </span>
            </div>
          )}

          {/* Task Footer */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center space-x-2">
              {/* Comments indicator (mock) */}
              <div className="flex items-center space-x-1 text-xs text-neutral-500">
                <MessageSquare className="h-3 w-3" />
                <span>0</span>
              </div>

              {/* Attachments indicator (mock) */}
              <div className="flex items-center space-x-1 text-xs text-neutral-500">
                <Paperclip className="h-3 w-3" />
                <span>0</span>
              </div>
            </div>

            {/* Task ID */}
            <span className="text-xs text-neutral-400 font-mono">
              #{task.id.slice(-6)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}