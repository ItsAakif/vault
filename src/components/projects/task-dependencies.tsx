'use client'

import { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { animations } from '@/lib/animations'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { success, toastError } from '@/lib/toast'
import {
  GitBranch,
  Plus,
  X,
  AlertTriangle,
  CheckCircle,
  Clock,
  ArrowRight,
  Link,
  Unlink,
  Info
} from 'lucide-react'

export interface TaskDependency {
  id: string
  dependentTaskId: string
  dependsOnTaskId: string
  type: 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish'
  lag?: number // in hours
  createdAt: Date
}

export interface Task {
  id: string
  title: string
  status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED' | 'CANCELLED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  estimatedHours?: number
  actualHours?: number
  startDate?: Date
  dueDate?: Date
}

interface TaskDependenciesProps {
  task: Task
  allTasks: Task[]
  dependencies: TaskDependency[]
  onAddDependency: (dependency: Omit<TaskDependency, 'id' | 'createdAt'>) => Promise<void>
  onRemoveDependency: (dependencyId: string) => Promise<void>
  className?: string
}

const dependencyTypes = [
  {
    value: 'finish_to_start',
    label: 'Finish to Start',
    description: 'Task must finish before this task can start'
  },
  {
    value: 'start_to_start',
    label: 'Start to Start', 
    description: 'Tasks must start at the same time'
  },
  {
    value: 'finish_to_finish',
    label: 'Finish to Finish',
    description: 'Tasks must finish at the same time'
  },
  {
    value: 'start_to_finish',
    label: 'Start to Finish',
    description: 'Task must start before this task can finish'
  }
]

export function TaskDependencies({
  task,
  allTasks,
  dependencies,
  onAddDependency,
  onRemoveDependency,
  className
}: TaskDependenciesProps) {
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string>('')
  const [selectedType, setSelectedType] = useState<TaskDependency['type']>('finish_to_start')
  const [lag, setLag] = useState<number>(0)

  // Get dependencies for this task
  const taskDependencies = useMemo(() => {
    return dependencies.filter(dep => dep.dependentTaskId === task.id)
  }, [dependencies, task.id])

  // Get tasks that depend on this task
  const dependentTasks = useMemo(() => {
    return dependencies.filter(dep => dep.dependsOnTaskId === task.id)
  }, [dependencies, task.id])

  // Get available tasks for dependencies (exclude self and existing dependencies)
  const availableTasks = useMemo(() => {
    const existingDependencyIds = taskDependencies.map(dep => dep.dependsOnTaskId)
    return allTasks.filter(t => 
      t.id !== task.id && 
      !existingDependencyIds.includes(t.id)
    )
  }, [allTasks, task.id, taskDependencies])

  // Check for circular dependencies
  const wouldCreateCircularDependency = useCallback((newDependsOnTaskId: string): boolean => {
    const visited = new Set<string>()
    const recursionStack = new Set<string>()

    const hasCycle = (taskId: string): boolean => {
      if (recursionStack.has(taskId)) return true
      if (visited.has(taskId)) return false

      visited.add(taskId)
      recursionStack.add(taskId)

      // Check existing dependencies
      const taskDeps = dependencies.filter(dep => dep.dependentTaskId === taskId)
      for (const dep of taskDeps) {
        if (hasCycle(dep.dependsOnTaskId)) return true
      }

      // Check the new dependency we're about to add
      if (taskId === task.id && newDependsOnTaskId === task.id) return true
      if (taskId === newDependsOnTaskId && task.id === newDependsOnTaskId) return true

      recursionStack.delete(taskId)
      return false
    }

    return hasCycle(task.id)
  }, [dependencies, task.id])

  // Get task status color
  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'TODO': return 'bg-neutral-100 text-neutral-800'
      case 'IN_PROGRESS': return 'bg-blue-100 text-blue-800'
      case 'REVIEW': return 'bg-yellow-100 text-yellow-800'
      case 'COMPLETED': return 'bg-green-100 text-green-800'
      case 'CANCELLED': return 'bg-red-100 text-red-800'
      default: return 'bg-neutral-100 text-neutral-800'
    }
  }

  // Get dependency type icon
  const getDependencyIcon = (type: TaskDependency['type']) => {
    switch (type) {
      case 'finish_to_start': return <ArrowRight className="h-3 w-3" />
      case 'start_to_start': return <GitBranch className="h-3 w-3" />
      case 'finish_to_finish': return <CheckCircle className="h-3 w-3" />
      case 'start_to_finish': return <Clock className="h-3 w-3" />
      default: return <Link className="h-3 w-3" />
    }
  }

  // Check if task can start based on dependencies
  const canTaskStart = useMemo(() => {
    return taskDependencies.every(dep => {
      const dependsOnTask = allTasks.find(t => t.id === dep.dependsOnTaskId)
      if (!dependsOnTask) return true

      switch (dep.type) {
        case 'finish_to_start':
          return dependsOnTask.status === 'COMPLETED'
        case 'start_to_start':
          return dependsOnTask.status !== 'TODO'
        case 'finish_to_finish':
          return true // Can start, but must finish together
        case 'start_to_finish':
          return dependsOnTask.status !== 'TODO'
        default:
          return true
      }
    })
  }, [taskDependencies, allTasks])

  // Get blocked dependencies
  const blockedDependencies = useMemo(() => {
    return taskDependencies.filter(dep => {
      const dependsOnTask = allTasks.find(t => t.id === dep.dependsOnTaskId)
      if (!dependsOnTask) return false

      switch (dep.type) {
        case 'finish_to_start':
          return dependsOnTask.status !== 'COMPLETED'
        case 'start_to_start':
          return dependsOnTask.status === 'TODO'
        case 'start_to_finish':
          return dependsOnTask.status === 'TODO'
        default:
          return false
      }
    })
  }, [taskDependencies, allTasks])

  // Handle add dependency
  const handleAddDependency = async () => {
    if (!selectedTaskId) return

    if (wouldCreateCircularDependency(selectedTaskId)) {
      toastError('Cannot add dependency: would create circular dependency')
      return
    }

    try {
      await onAddDependency({
        dependentTaskId: task.id,
        dependsOnTaskId: selectedTaskId,
        type: selectedType,
        lag: lag || undefined
      })

      setShowAddDialog(false)
      setSelectedTaskId('')
      setSelectedType('finish_to_start')
      setLag(0)
      success('Dependency added successfully')
    } catch (error) {
      toastError('Failed to add dependency')
      console.error('Error adding dependency:', error)
    }
  }

  // Handle remove dependency
  const handleRemoveDependency = async (dependencyId: string) => {
    try {
      await onRemoveDependency(dependencyId)
      success('Dependency removed successfully')
    } catch (error) {
      toastError('Failed to remove dependency')
      console.error('Error removing dependency:', error)
    }
  }

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center space-x-2">
            <GitBranch className="h-4 w-4" />
            <span>Dependencies</span>
            {taskDependencies.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {taskDependencies.length}
              </Badge>
            )}
          </CardTitle>

          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Dependency
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Task Dependency</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    This task depends on:
                  </label>
                  <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a task" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTasks.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          <div className="flex items-center space-x-2">
                            <Badge className={getStatusColor(t.status)}>
                              {t.status}
                            </Badge>
                            <span>{t.title}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Dependency Type:
                  </label>
                  <Select value={selectedType} onValueChange={(value: TaskDependency['type']) => setSelectedType(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dependencyTypes.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          <div>
                            <div className="font-medium">{type.label}</div>
                            <div className="text-xs text-neutral-500">{type.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleAddDependency}
                    disabled={!selectedTaskId}
                  >
                    Add Dependency
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Task Status */}
        {!canTaskStart && blockedDependencies.length > 0 && (
          <motion.div
            className="flex items-center space-x-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg"
            {...animations.fadeInUp}
          >
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-800">Task is blocked</p>
              <p className="text-xs text-yellow-600">
                {blockedDependencies.length} dependencies must be completed first
              </p>
            </div>
          </motion.div>
        )}

        {/* Dependencies List */}
        {taskDependencies.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-neutral-700">This task depends on:</h4>
            {taskDependencies.map((dependency, index) => {
              const dependsOnTask = allTasks.find(t => t.id === dependency.dependsOnTaskId)
              if (!dependsOnTask) return null

              const isBlocked = blockedDependencies.includes(dependency)
              const dependencyType = dependencyTypes.find(t => t.value === dependency.type)

              return (
                <motion.div
                  key={dependency.id}
                  className={cn(
                    'flex items-center justify-between p-3 border rounded-lg',
                    isBlocked ? 'border-red-200 bg-red-50' : 'border-neutral-200 bg-white'
                  )}
                  {...animations.staggerItem}
                  transition={{ delay: index * 0.1 }}
                >
                  <div className="flex items-center space-x-3">
                    <div className={cn(
                      'p-1 rounded',
                      isBlocked ? 'bg-red-100' : 'bg-neutral-100'
                    )}>
                      {getDependencyIcon(dependency.type)}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-sm">{dependsOnTask.title}</span>
                        <Badge className={getStatusColor(dependsOnTask.status)}>
                          {dependsOnTask.status}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-xs text-neutral-500">
                          {dependencyType?.label}
                        </span>
                        {dependency.lag && (
                          <span className="text-xs text-neutral-500">
                            • {dependency.lag}h lag
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveDependency(dependency.id)}
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </motion.div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-6">
            <GitBranch className="h-8 w-8 text-neutral-400 mx-auto mb-2" />
            <p className="text-sm text-neutral-600 mb-2">No dependencies</p>
            <p className="text-xs text-neutral-500">
              This task can be started at any time
            </p>
          </div>
        )}

        {/* Dependent Tasks */}
        {dependentTasks.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-neutral-700">Tasks that depend on this:</h4>
              <div className="space-y-1">
                {dependentTasks.map(dependency => {
                  const dependentTask = allTasks.find(t => t.id === dependency.dependentTaskId)
                  if (!dependentTask) return null

                  return (
                    <div
                      key={dependency.id}
                      className="flex items-center space-x-2 p-2 bg-neutral-50 rounded"
                    >
                      <div className="p-1 bg-neutral-100 rounded">
                        {getDependencyIcon(dependency.type)}
                      </div>
                      <span className="text-sm">{dependentTask.title}</span>
                      <Badge className={getStatusColor(dependentTask.status)}>
                        {dependentTask.status}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* Dependency Info */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start space-x-2">
            <Info className="h-4 w-4 text-blue-600 mt-0.5" />
            <div className="text-xs text-blue-700">
              <p className="font-medium mb-1">Dependency Types:</p>
              <ul className="space-y-1">
                <li><strong>Finish to Start:</strong> Previous task must complete first</li>
                <li><strong>Start to Start:</strong> Tasks start simultaneously</li>
                <li><strong>Finish to Finish:</strong> Tasks finish simultaneously</li>
                <li><strong>Start to Finish:</strong> Previous task starts before this finishes</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
