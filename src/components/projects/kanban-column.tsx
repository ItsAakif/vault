'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { cn } from '@/lib/utils'
import { animations } from '@/lib/animations'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { KanbanCard } from './kanban-card'
import { Column, Task, TaskStatus } from './kanban-board'
import {
  Plus,
  MoreHorizontal,
  Settings,
  AlertTriangle,
  CheckCircle
} from 'lucide-react'

interface KanbanColumnProps {
  column: Column
  onTaskCreate?: () => void
  onTaskUpdate?: (taskId: string, updates: Partial<Task>) => Promise<void>
  onTaskDelete?: (taskId: string) => Promise<void>
  onColumnUpdate?: (columnId: TaskStatus, updates: { title?: string; limit?: number }) => Promise<void>
  readOnly?: boolean
}

export function KanbanColumn({
  column,
  onTaskCreate,
  onTaskUpdate,
  onTaskDelete,
  onColumnUpdate,
  readOnly = false
}: KanbanColumnProps) {
  const [isHovered, setIsHovered] = useState(false)
  
  const { setNodeRef, isOver } = useDroppable({
    id: column.id
  })

  // Check if column is at capacity
  const isAtCapacity = Boolean(column.limit) && column.tasks.length >= (column.limit ?? 0)
  const capacityPercentage = column.limit 
    ? Math.round((column.tasks.length / column.limit) * 100)
    : 0

  // Get column status icon
  const getColumnIcon = () => {
    switch (column.id) {
      case 'TODO':
        return null
      case 'IN_PROGRESS':
        return <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
      case 'REVIEW':
        return <AlertTriangle className="h-3 w-3 text-yellow-500" />
      case 'COMPLETED':
        return <CheckCircle className="h-3 w-3 text-green-500" />
      case 'CANCELLED':
        return <div className="w-2 h-2 bg-red-500 rounded-full" />
      default:
        return null
    }
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col w-80 h-full bg-white rounded-lg border-2 transition-all duration-200',
        column.color,
        isOver && 'ring-2 ring-primary-500 ring-opacity-50',
        isAtCapacity && 'border-red-300 bg-red-50'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center space-x-2">
          {getColumnIcon()}
          <h3 className="font-medium text-sm">{column.title}</h3>
          <Badge variant="secondary" className="text-xs">
            {column.tasks.length}
            {column.limit && `/${column.limit}`}
          </Badge>
        </div>

        <div className="flex items-center space-x-1">
          {!readOnly && onTaskCreate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onTaskCreate}
              disabled={isAtCapacity}
              className={cn(
                'h-6 w-6 p-0 opacity-0 transition-opacity',
                (isHovered || column.tasks.length === 0) && 'opacity-100'
              )}
            >
              <Plus className="h-3 w-3" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <MoreHorizontal className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Capacity Warning */}
      {column.limit && capacityPercentage >= 80 && (
        <motion.div
          className={cn(
            'px-4 py-2 text-xs border-b',
            capacityPercentage >= 100 
              ? 'bg-red-100 text-red-800 border-red-200'
              : 'bg-yellow-100 text-yellow-800 border-yellow-200'
          )}
          {...animations.fadeInDown}
        >
          {capacityPercentage >= 100 
            ? 'Column at capacity'
            : `${capacityPercentage}% capacity`
          }
        </motion.div>
      )}

      {/* Tasks List */}
      <ScrollArea className="flex-1 p-2">
        <SortableContext
          items={column.tasks.map(task => task.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {column.tasks.map((task, index) => (
              <motion.div
                key={task.id}
                {...animations.staggerItem}
                transition={{ delay: index * 0.05 }}
              >
                <KanbanCard
                  task={task}
                  onUpdate={onTaskUpdate}
                  onDelete={onTaskDelete}
                  readOnly={readOnly}
                />
              </motion.div>
            ))}

            {/* Empty State */}
            {column.tasks.length === 0 && (
              <motion.div
                className="flex flex-col items-center justify-center py-8 text-center"
                {...animations.fadeIn}
              >
                <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mb-3">
                  <Plus className="h-5 w-5 text-neutral-400" />
                </div>
                <p className="text-sm text-neutral-500 mb-2">No tasks yet</p>
                {!readOnly && onTaskCreate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onTaskCreate}
                    className="text-xs"
                  >
                    Add first task
                  </Button>
                )}
              </motion.div>
            )}

            {/* Drop Zone Indicator */}
            {isOver && (
              <motion.div
                className="h-2 bg-primary-200 rounded-full mx-2"
                {...animations.fadeIn}
              />
            )}
          </div>
        </SortableContext>
      </ScrollArea>

      {/* Column Footer */}
      {!readOnly && onTaskCreate && column.tasks.length > 0 && (
        <div className="p-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={onTaskCreate}
            disabled={isAtCapacity}
            className="w-full justify-start text-xs text-neutral-600 hover:text-neutral-900"
          >
            <Plus className="h-3 w-3 mr-2" />
            Add task
          </Button>
        </div>
      )}
    </div>
  )
}