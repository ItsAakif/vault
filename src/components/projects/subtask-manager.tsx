'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { animations } from '@/lib/animations'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/form-components'
import { Textarea } from '@/components/ui/form-components'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useTaskManagement, SubTask } from '@/hooks/use-task-management'
import { toastError } from '@/lib/toast'
import {
  Plus,
  ChevronRight,
  ChevronDown,
  Edit,
  Trash2,
  Clock,
  User,
  Calendar,
  CheckCircle,
  Circle,
  AlertCircle,
  Flag
} from 'lucide-react'

interface SubtaskManagerProps {
  parentTaskId: string
  parentTaskTitle: string
  projectMembers?: Array<{
    id: string
    name?: string
    email: string
    avatar?: string
  }>
  className?: string
}

export function SubtaskManager({
  parentTaskId,
  parentTaskTitle,
  projectMembers = [],
  className
}: SubtaskManagerProps) {
  const {
    loading,
    getSubtasks,
    createSubtask,
    updateSubtask,
    deleteSubtask
  } = useTaskManagement()

  const [subtasks, setSubtasks] = useState<SubTask[]>([])
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingSubtask, setEditingSubtask] = useState<SubTask | null>(null)
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<string>>(new Set())

  // New subtask form state
  const [newSubtask, setNewSubtask] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM' as SubTask['priority'],
    dueDate: '',
    estimatedHours: '',
    assigneeId: ''
  })

  // Load subtasks
  const loadSubtasks = useCallback(async () => {
    try {
      const data = await getSubtasks(parentTaskId)
      setSubtasks(data)
    } catch (error) {
      console.error('Error loading subtasks:', error)
    }
  }, [parentTaskId, getSubtasks])

  useEffect(() => {
    loadSubtasks()
  }, [loadSubtasks])

  // Priority colors
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'LOW': return 'bg-green-100 text-green-800'
      case 'MEDIUM': return 'bg-blue-100 text-blue-800'
      case 'HIGH': return 'bg-orange-100 text-orange-800'
      case 'CRITICAL': return 'bg-red-100 text-red-800'
      default: return 'bg-neutral-100 text-neutral-800'
    }
  }

  // Status colors
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'TODO': return 'text-neutral-600'
      case 'IN_PROGRESS': return 'text-blue-600'
      case 'REVIEW': return 'text-yellow-600'
      case 'COMPLETED': return 'text-green-600'
      case 'CANCELLED': return 'text-red-600'
      default: return 'text-neutral-600'
    }
  }

  // Status icons
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED': return <CheckCircle className="h-4 w-4" />
      case 'IN_PROGRESS': return <AlertCircle className="h-4 w-4" />
      default: return <Circle className="h-4 w-4" />
    }
  }

  // Calculate completion percentage
  const completionPercentage = subtasks.length > 0 
    ? Math.round((subtasks.filter(s => s.status === 'COMPLETED').length / subtasks.length) * 100)
    : 0

  // Handle create subtask
  const handleCreateSubtask = async () => {
    if (!newSubtask.title.trim()) {
      toastError('Subtask title is required')
      return
    }

    try {
      const subtaskData = {
        title: newSubtask.title,
        description: newSubtask.description || undefined,
        priority: newSubtask.priority,
        dueDate: newSubtask.dueDate ? new Date(newSubtask.dueDate) : undefined,
        estimatedHours: newSubtask.estimatedHours ? parseInt(newSubtask.estimatedHours) : undefined,
        assigneeId: newSubtask.assigneeId || undefined
      }

      await createSubtask(parentTaskId, subtaskData)
      await loadSubtasks()
      
      setShowAddDialog(false)
      setNewSubtask({
        title: '',
        description: '',
        priority: 'MEDIUM',
        dueDate: '',
        estimatedHours: '',
        assigneeId: ''
      })
    } catch (error) {
      console.error('Error creating subtask:', error)
    }
  }

  // Handle update subtask
  const handleUpdateSubtask = async (subtaskId: string, updates: Partial<SubTask>) => {
    try {
      await updateSubtask(subtaskId, updates)
      await loadSubtasks()
    } catch (error) {
      console.error('Error updating subtask:', error)
    }
  }

  // Handle delete subtask
  const handleDeleteSubtask = async (subtaskId: string) => {
    if (!confirm('Are you sure you want to delete this subtask?')) return

    try {
      await deleteSubtask(subtaskId)
      await loadSubtasks()
    } catch (error) {
      console.error('Error deleting subtask:', error)
    }
  }

  // Toggle subtask status
  const toggleSubtaskStatus = async (subtask: SubTask) => {
    const newStatus = subtask.status === 'COMPLETED' ? 'TODO' : 'COMPLETED'
    const updates: Partial<SubTask> = {
      status: newStatus
    }

    if (newStatus === 'COMPLETED') {
      updates.completedAt = new Date()
    }

    await handleUpdateSubtask(subtask.id, updates)
  }

  // Toggle expanded state
  const toggleExpanded = (subtaskId: string) => {
    const newExpanded = new Set(expandedSubtasks)
    if (newExpanded.has(subtaskId)) {
      newExpanded.delete(subtaskId)
    } else {
      newExpanded.add(subtaskId)
    }
    setExpandedSubtasks(newExpanded)
  }

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center space-x-2">
            <div className="flex items-center space-x-2">
              <span>Subtasks</span>
              {subtasks.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {subtasks.filter(s => s.status === 'COMPLETED').length}/{subtasks.length}
                </Badge>
              )}
            </div>
          </CardTitle>

          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Subtask
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Subtask</DialogTitle>
                <p className="text-sm text-neutral-600">
                  Adding subtask to: {parentTaskTitle}
                </p>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Title *</label>
                  <Input
                    value={newSubtask.title}
                    onChange={(e) => setNewSubtask(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter subtask title"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Description</label>
                  <Textarea
                    value={newSubtask.description}
                    onChange={(e) => setNewSubtask(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Optional description"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Priority</label>
                    <Select
                      value={newSubtask.priority}
                      onValueChange={(value: SubTask['priority']) => 
                        setNewSubtask(prev => ({ ...prev, priority: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LOW">Low</SelectItem>
                        <SelectItem value="MEDIUM">Medium</SelectItem>
                        <SelectItem value="HIGH">High</SelectItem>
                        <SelectItem value="CRITICAL">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Estimated Hours</label>
                    <Input
                      type="number"
                      value={newSubtask.estimatedHours}
                      onChange={(e) => setNewSubtask(prev => ({ ...prev, estimatedHours: e.target.value }))}
                      placeholder="0"
                      min="0"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Due Date</label>
                    <Input
                      type="date"
                      value={newSubtask.dueDate}
                      onChange={(e) => setNewSubtask(prev => ({ ...prev, dueDate: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Assignee</label>
                    <Select
                      value={newSubtask.assigneeId}
                      onValueChange={(value) => setNewSubtask(prev => ({ ...prev, assigneeId: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Unassigned</SelectItem>
                        {projectMembers.map(member => (
                          <SelectItem key={member.id} value={member.id}>
                            <div className="flex items-center space-x-2">
                              <Avatar className="h-5 w-5">
                                <AvatarImage src={member.avatar} />
                                <AvatarFallback className="text-xs">
                                  {member.name?.charAt(0) || member.email.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              <span>{member.name || member.email}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateSubtask} disabled={loading}>
                    Add Subtask
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress Bar */}
        {subtasks.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-600">Progress</span>
              <span className="font-medium">{completionPercentage}%</span>
            </div>
            <div className="w-full bg-neutral-200 rounded-full h-2">
              <motion.div
                className="bg-green-500 h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${completionPercentage}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        )}

        {/* Subtasks List */}
        {subtasks.length > 0 ? (
          <ScrollArea className="max-h-96">
            <div className="space-y-2">
              {subtasks
                .sort((a, b) => a.position - b.position)
                .map((subtask, index) => {
                  const isExpanded = expandedSubtasks.has(subtask.id)
                  const assignee = projectMembers.find(m => m.id === subtask.assigneeId)
                  const isOverdue = subtask.dueDate && 
                    new Date(subtask.dueDate) < new Date() && 
                    subtask.status !== 'COMPLETED'

                  return (
                    <motion.div
                      key={subtask.id}
                      className={cn(
                        'border rounded-lg bg-white',
                        isOverdue && 'border-red-200 bg-red-50'
                      )}
                      {...animations.staggerItem}
                      transition={{ delay: index * 0.05 }}
                    >
                      <div className="p-3">
                        <div className="flex items-start space-x-3">
                          {/* Status Checkbox */}
                          <button
                            onClick={() => toggleSubtaskStatus(subtask)}
                            className={cn(
                              'mt-0.5 transition-colors',
                              getStatusColor(subtask.status)
                            )}
                          >
                            {getStatusIcon(subtask.status)}
                          </button>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h4 className={cn(
                                'font-medium text-sm',
                                subtask.status === 'COMPLETED' && 'line-through text-neutral-500'
                              )}>
                                {subtask.title}
                              </h4>

                              <div className="flex items-center space-x-1">
                                {subtask.description && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => toggleExpanded(subtask.id)}
                                    className="h-6 w-6 p-0"
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="h-3 w-3" />
                                    ) : (
                                      <ChevronRight className="h-3 w-3" />
                                    )}
                                  </Button>
                                )}

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditingSubtask(subtask)}
                                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteSubtask(subtask.id)}
                                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-red-600"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>

                            {/* Metadata */}
                            <div className="flex items-center space-x-4 mt-1 text-xs text-neutral-500">
                              <Badge className={getPriorityColor(subtask.priority)}>
                                {subtask.priority}
                              </Badge>

                              {subtask.dueDate && (
                                <div className={cn(
                                  'flex items-center space-x-1',
                                  isOverdue && 'text-red-600'
                                )}>
                                  <Calendar className="h-3 w-3" />
                                  <span>
                                    {new Date(subtask.dueDate).toLocaleDateString()}
                                  </span>
                                </div>
                              )}

                              {subtask.estimatedHours && (
                                <div className="flex items-center space-x-1">
                                  <Clock className="h-3 w-3" />
                                  <span>{subtask.estimatedHours}h</span>
                                </div>
                              )}

                              {assignee && (
                                <div className="flex items-center space-x-1">
                                  <Avatar className="h-3 w-3">
                                    <AvatarImage src={assignee.avatar} />
                                    <AvatarFallback className="text-xs">
                                      {assignee.name?.charAt(0) || assignee.email.charAt(0)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="truncate max-w-20">
                                    {assignee.name || assignee.email}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Expanded Description */}
                            <AnimatePresence>
                              {isExpanded && subtask.description && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="mt-2 text-sm text-neutral-600"
                                >
                                  {subtask.description}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
            </div>
          </ScrollArea>
        ) : (
          <div className="text-center py-6">
            <CheckCircle className="h-8 w-8 text-neutral-400 mx-auto mb-2" />
            <p className="text-sm text-neutral-600 mb-2">No subtasks yet</p>
            <p className="text-xs text-neutral-500">
              Break down this task into smaller, manageable pieces
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
