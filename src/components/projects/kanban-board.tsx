'use client'

import { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  closestCorners
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy
} from '@dnd-kit/sortable'
import { cn } from '@/lib/utils'
import { animations } from '@/lib/animations'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { KanbanColumn } from './kanban-column'
import { KanbanCard } from './kanban-card'
import { success, toastError } from '@/lib/toast'
import {
  Plus,
  Settings,
  Filter,
  MoreHorizontal,
  Users,
  Calendar,
  Target,
  BarChart3
} from 'lucide-react'

export interface Task {
  id: string
  title: string
  description?: string
  status: TaskStatus
  priority: Priority
  dueDate?: Date
  estimatedHours?: number
  actualHours?: number
  position: number
  tags: string[]
  assigneeId?: string
  assignee?: {
    id: string
    name?: string
    email: string
    avatar?: string
  }
  createdAt: Date
  updatedAt: Date
}

export interface Column {
  id: TaskStatus
  title: string
  color: string
  limit?: number
  tasks: Task[]
}

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED' | 'CANCELLED'
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

interface KanbanBoardProps {
  projectId: string
  tasks: Task[]
  onTaskUpdate: (taskId: string, updates: Partial<Task>) => Promise<void>
  onTaskCreate: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  onTaskDelete: (taskId: string) => Promise<void>
  onColumnUpdate?: (columnId: TaskStatus, updates: { title?: string; limit?: number }) => Promise<void>
  className?: string
  readOnly?: boolean
}

const defaultColumns: Omit<Column, 'tasks'>[] = [
  { id: 'TODO', title: 'To Do', color: 'bg-neutral-100 border-neutral-300' },
  { id: 'IN_PROGRESS', title: 'In Progress', color: 'bg-blue-50 border-blue-200', limit: 3 },
  { id: 'REVIEW', title: 'Review', color: 'bg-yellow-50 border-yellow-200' },
  { id: 'COMPLETED', title: 'Completed', color: 'bg-green-50 border-green-200' },
  { id: 'CANCELLED', title: 'Cancelled', color: 'bg-red-50 border-red-200' }
]

export function KanbanBoard({
  projectId,
  tasks,
  onTaskUpdate,
  onTaskCreate,
  onTaskDelete,
  onColumnUpdate,
  className,
  readOnly = false
}: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [showColumnSettings, setShowColumnSettings] = useState(false)

  // Configure drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    })
  )

  // Organize tasks by status
  const columns: Column[] = useMemo(() => {
    return defaultColumns.map(col => ({
      ...col,
      tasks: tasks
        .filter(task => task.status === col.id)
        .sort((a, b) => a.position - b.position)
    }))
  }, [tasks])

  // Get task by ID
  const getTaskById = useCallback((id: string) => {
    return tasks.find(task => task.id === id)
  }, [tasks])

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = getTaskById(event.active.id as string)
    setActiveTask(task || null)
  }, [getTaskById])

  // Handle drag over (for visual feedback)
  const handleDragOver = useCallback((event: DragOverEvent) => {
    // Could add visual feedback here
  }, [])

  // Handle drag end
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)

    if (!over || active.id === over.id) return

    const taskId = active.id as string
    const task = getTaskById(taskId)
    if (!task) return

    // Determine if dropping on a column or another task
    const overId = over.id as string
    const isOverColumn = defaultColumns.some(col => col.id === overId)
    
    let newStatus: TaskStatus
    let newPosition: number

    if (isOverColumn) {
      // Dropped on a column
      newStatus = overId as TaskStatus
      const columnTasks = columns.find(col => col.id === newStatus)?.tasks || []
      newPosition = columnTasks.length
    } else {
      // Dropped on another task
      const overTask = getTaskById(overId)
      if (!overTask) return

      newStatus = overTask.status
      newPosition = overTask.position
    }

    // Check column limits
    const targetColumn = columns.find(col => col.id === newStatus)
    if (targetColumn?.limit && targetColumn.tasks.length >= targetColumn.limit && task.status !== newStatus) {
      toastError(`${targetColumn.title} column is at capacity (${targetColumn.limit} tasks)`)
      return
    }

    try {
      await onTaskUpdate(taskId, {
        status: newStatus,
        position: newPosition
      })

      success('Task moved successfully')
    } catch (error) {
      toastError('Failed to move task')
      console.error('Error moving task:', error)
    }
  }, [getTaskById, columns, onTaskUpdate, success, toastError])

  // Handle task creation
  const handleTaskCreate = useCallback(async (status: TaskStatus) => {
    const columnTasks = columns.find(col => col.id === status)?.tasks || []
    
    try {
      await onTaskCreate({
        title: 'New Task',
        status,
        priority: 'MEDIUM',
        position: columnTasks.length,
        tags: []
      })
      
      success('Task created successfully')
    } catch (error) {
      toastError('Failed to create task')
      console.error('Error creating task:', error)
    }
  }, [columns, onTaskCreate, success, toastError])

  // Calculate board statistics
  const boardStats = useMemo(() => {
    const total = tasks.length
    const completed = tasks.filter(t => t.status === 'COMPLETED').length
    const inProgress = tasks.filter(t => t.status === 'IN_PROGRESS').length
    const overdue = tasks.filter(t => 
      t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'COMPLETED'
    ).length

    return { total, completed, inProgress, overdue }
  }, [tasks])

  return (
    <div className={cn('h-full flex flex-col', className)}>
      {/* Board Header */}
      <div className="flex items-center justify-between p-4 border-b bg-white">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-semibold">Project Board</h2>
          
          {/* Board Stats */}
          <div className="flex items-center space-x-4 text-sm">
            <div className="flex items-center space-x-1">
              <Target className="h-4 w-4 text-neutral-500" />
              <span className="text-neutral-600">Total:</span>
              <Badge variant="outline">{boardStats.total}</Badge>
            </div>
            
            <div className="flex items-center space-x-1">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              <span className="text-neutral-600">In Progress:</span>
              <Badge variant="outline">{boardStats.inProgress}</Badge>
            </div>
            
            <div className="flex items-center space-x-1">
              <Calendar className="h-4 w-4 text-red-500" />
              <span className="text-neutral-600">Overdue:</span>
              <Badge variant={boardStats.overdue > 0 ? 'destructive' : 'outline'}>
                {boardStats.overdue}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
          
          <Button variant="outline" size="sm">
            <Users className="h-4 w-4 mr-2" />
            Assignees
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowColumnSettings(!showColumnSettings)}
          >
            <Settings className="h-4 w-4 mr-2" />
            Columns
          </Button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="h-full p-4">
            <div className="flex space-x-4 h-full overflow-x-auto">
              <SortableContext
                items={columns.map(col => col.id)}
                strategy={horizontalListSortingStrategy}
              >
                {columns.map(column => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    onTaskCreate={readOnly ? undefined : () => handleTaskCreate(column.id)}
                    onTaskUpdate={readOnly ? undefined : onTaskUpdate}
                    onTaskDelete={readOnly ? undefined : onTaskDelete}
                    onColumnUpdate={readOnly ? undefined : onColumnUpdate}
                    readOnly={readOnly}
                  />
                ))}
              </SortableContext>
            </div>
          </div>

          {/* Drag Overlay */}
          <DragOverlay>
            {activeTask && (
              <div className="rotate-3 opacity-90">
                <KanbanCard
                  task={activeTask}
                  isDragging
                  readOnly
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Column Settings Panel */}
      <AnimatePresence>
        {showColumnSettings && (
          <motion.div
            className="border-t bg-neutral-50 p-4"
            {...animations.fadeInUp}
          >
            <div className="space-y-4">
              <h3 className="font-medium">Column Settings</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {columns.map(column => (
                  <Card key={column.id} className="p-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{column.title}</span>
                        <Badge variant="outline" className="text-xs">
                          {column.tasks.length}
                        </Badge>
                      </div>
                      
                      {column.limit && (
                        <div className="text-xs text-neutral-600">
                          Limit: {column.limit} tasks
                        </div>
                      )}
                      
                      <div className={cn(
                        'h-2 rounded-full',
                        column.color
                      )} />
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
