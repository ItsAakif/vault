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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { success, toastError } from '@/lib/toast'
import {
  Play,
  Pause,
  Square,
  Clock,
  Plus,
  Edit,
  Trash2,
  Calendar,
  BarChart3,
  Timer,
  Target
} from 'lucide-react'

export interface TimeEntry {
  id: string
  description?: string
  startTime: Date
  endTime?: Date
  duration?: number // in minutes
  billable: boolean
  tags: string[]
  taskId?: string
  projectId?: string
  userId: string
  createdAt: Date
  updatedAt: Date
}

interface TimeTrackingProps {
  taskId?: string
  projectId?: string
  timeEntries: TimeEntry[]
  onStartTimer: (description?: string) => Promise<void>
  onStopTimer: (entryId: string) => Promise<void>
  onCreateEntry: (entry: Omit<TimeEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => Promise<void>
  onUpdateEntry: (entryId: string, updates: Partial<TimeEntry>) => Promise<void>
  onDeleteEntry: (entryId: string) => Promise<void>
  className?: string
}

export function TimeTracking({
  taskId,
  projectId,
  timeEntries,
  onStartTimer,
  onStopTimer,
  onCreateEntry,
  onUpdateEntry,
  onDeleteEntry,
  className
}: TimeTrackingProps) {
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)

  // New entry form state
  const [newEntry, setNewEntry] = useState({
    description: '',
    startTime: new Date(),
    endTime: new Date(),
    billable: false,
    tags: [] as string[]
  })

  // Find active timer
  useEffect(() => {
    const active = timeEntries.find(entry => !entry.endTime)
    setActiveEntry(active || null)
  }, [timeEntries])

  // Update elapsed time for active timer
  useEffect(() => {
    if (!activeEntry) {
      setElapsedTime(0)
      return
    }

    const updateElapsed = () => {
      const now = new Date()
      const start = new Date(activeEntry.startTime)
      const elapsed = Math.floor((now.getTime() - start.getTime()) / 1000)
      setElapsedTime(elapsed)
    }

    updateElapsed()
    const interval = setInterval(updateElapsed, 1000)

    return () => clearInterval(interval)
  }, [activeEntry])

  // Format time duration
  const formatDuration = useCallback((seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }, [])

  // Format duration in minutes to readable format
  const formatMinutes = useCallback((minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60

    if (hours > 0) {
      return `${hours}h ${mins}m`
    }
    return `${mins}m`
  }, [])

  // Calculate total time
  const totalTime = timeEntries.reduce((total, entry) => {
    if (entry.duration) {
      return total + entry.duration
    }
    if (entry.endTime) {
      const duration = Math.floor((new Date(entry.endTime).getTime() - new Date(entry.startTime).getTime()) / 60000)
      return total + duration
    }
    return total
  }, 0)

  // Calculate billable time
  const billableTime = timeEntries
    .filter(entry => entry.billable)
    .reduce((total, entry) => {
      if (entry.duration) {
        return total + entry.duration
      }
      if (entry.endTime) {
        const duration = Math.floor((new Date(entry.endTime).getTime() - new Date(entry.startTime).getTime()) / 60000)
        return total + duration
      }
      return total
    }, 0)

  // Handle start timer
  const handleStartTimer = async () => {
    try {
      await onStartTimer()
      success('Timer started')
    } catch (error) {
      toastError('Failed to start timer')
      console.error('Error starting timer:', error)
    }
  }

  // Handle stop timer
  const handleStopTimer = async () => {
    if (!activeEntry) return

    try {
      await onStopTimer(activeEntry.id)
      success('Timer stopped')
    } catch (error) {
      toastError('Failed to stop timer')
      console.error('Error stopping timer:', error)
    }
  }

  // Handle create manual entry
  const handleCreateEntry = async () => {
    try {
      const duration = Math.floor((newEntry.endTime.getTime() - newEntry.startTime.getTime()) / 60000)
      
      await onCreateEntry({
        description: newEntry.description,
        startTime: newEntry.startTime,
        endTime: newEntry.endTime,
        duration,
        billable: newEntry.billable,
        tags: newEntry.tags,
        taskId,
        projectId
      })

      setShowAddDialog(false)
      setNewEntry({
        description: '',
        startTime: new Date(),
        endTime: new Date(),
        billable: false,
        tags: []
      })
      success('Time entry created')
    } catch (error) {
      toastError('Failed to create time entry')
      console.error('Error creating time entry:', error)
    }
  }

  // Handle edit entry
  const handleEditEntry = async () => {
    if (!editingEntry) return

    try {
      await onUpdateEntry(editingEntry.id, editingEntry)
      setShowEditDialog(false)
      setEditingEntry(null)
      success('Time entry updated')
    } catch (error) {
      toastError('Failed to update time entry')
      console.error('Error updating time entry:', error)
    }
  }

  // Handle delete entry
  const handleDeleteEntry = async (entryId: string) => {
    try {
      await onDeleteEntry(entryId)
      success('Time entry deleted')
    } catch (error) {
      toastError('Failed to delete time entry')
      console.error('Error deleting time entry:', error)
    }
  }

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center space-x-2">
            <Clock className="h-4 w-4" />
            <span>Time Tracking</span>
            {timeEntries.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {timeEntries.length} entries
              </Badge>
            )}
          </CardTitle>

          <div className="flex items-center space-x-2">
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Entry
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Time Entry</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Description</label>
                    <Input
                      value={newEntry.description}
                      onChange={(e) => setNewEntry(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="What did you work on?"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Start Time</label>
                      <Input
                        type="datetime-local"
                        value={newEntry.startTime.toISOString().slice(0, 16)}
                        onChange={(e) => setNewEntry(prev => ({ ...prev, startTime: new Date(e.target.value) }))}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">End Time</label>
                      <Input
                        type="datetime-local"
                        value={newEntry.endTime.toISOString().slice(0, 16)}
                        onChange={(e) => setNewEntry(prev => ({ ...prev, endTime: new Date(e.target.value) }))}
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="billable"
                      checked={newEntry.billable}
                      onChange={(e) => setNewEntry(prev => ({ ...prev, billable: e.target.checked }))}
                      className="rounded"
                    />
                    <label htmlFor="billable" className="text-sm">Billable</label>
                  </div>

                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateEntry}>
                      Add Entry
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Timer Controls */}
        <div className="p-4 bg-neutral-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-2xl font-mono font-bold">
                {formatDuration(elapsedTime)}
              </div>
              {activeEntry && (
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-sm text-neutral-600">Running</span>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2">
              {activeEntry ? (
                <Button
                  onClick={handleStopTimer}
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                >
                  <Square className="h-4 w-4 mr-2" />
                  Stop
                </Button>
              ) : (
                <Button
                  onClick={handleStartTimer}
                  variant="outline"
                  size="sm"
                  className="text-green-600 hover:text-green-700"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Time Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center space-x-2 mb-1">
              <Timer className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">Total Time</span>
            </div>
            <div className="text-lg font-bold text-blue-900">
              {formatMinutes(totalTime)}
            </div>
          </div>

          <div className="p-3 bg-green-50 rounded-lg">
            <div className="flex items-center space-x-2 mb-1">
              <Target className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-900">Billable</span>
            </div>
            <div className="text-lg font-bold text-green-900">
              {formatMinutes(billableTime)}
            </div>
          </div>
        </div>

        {/* Time Entries List */}
        {timeEntries.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-neutral-700">Recent Entries</h4>
            <ScrollArea className="max-h-64">
              <div className="space-y-2">
                {timeEntries
                  .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
                  .map((entry, index) => {
                    const duration = entry.duration || 
                      (entry.endTime ? Math.floor((new Date(entry.endTime).getTime() - new Date(entry.startTime).getTime()) / 60000) : 0)
                    
                    return (
                      <motion.div
                        key={entry.id}
                        className="flex items-center justify-between p-3 border rounded-lg bg-white"
                        {...animations.staggerItem}
                        transition={{ delay: index * 0.05 }}
                      >
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="font-medium text-sm">
                              {entry.description || 'No description'}
                            </span>
                            {entry.billable && (
                              <Badge variant="secondary" className="text-xs">
                                Billable
                              </Badge>
                            )}
                            {!entry.endTime && (
                              <Badge variant="outline" className="text-xs text-green-600">
                                Running
                              </Badge>
                            )}
                          </div>
                          
                          <div className="flex items-center space-x-4 text-xs text-neutral-500">
                            <div className="flex items-center space-x-1">
                              <Calendar className="h-3 w-3" />
                              <span>{new Date(entry.startTime).toLocaleDateString()}</span>
                            </div>
                            
                            <div className="flex items-center space-x-1">
                              <Clock className="h-3 w-3" />
                              <span>
                                {new Date(entry.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                {entry.endTime && ` - ${new Date(entry.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                              </span>
                            </div>
                            
                            <div className="font-medium">
                              {formatMinutes(duration)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingEntry(entry)
                              setShowEditDialog(true)
                            }}
                            className="h-8 w-8 p-0"
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteEntry(entry.id)}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </motion.div>
                    )
                  })}
              </div>
            </ScrollArea>
          </div>
        ) : (
          <div className="text-center py-6">
            <Clock className="h-8 w-8 text-neutral-400 mx-auto mb-2" />
            <p className="text-sm text-neutral-600 mb-2">No time entries yet</p>
            <p className="text-xs text-neutral-500">
              Start the timer or add a manual entry to begin tracking time
            </p>
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Time Entry</DialogTitle>
            </DialogHeader>
            {editingEntry && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Description</label>
                  <Input
                    value={editingEntry.description || ''}
                    onChange={(e) => setEditingEntry(prev => prev ? { ...prev, description: e.target.value } : null)}
                    placeholder="What did you work on?"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Start Time</label>
                    <Input
                      type="datetime-local"
                      value={new Date(editingEntry.startTime).toISOString().slice(0, 16)}
                      onChange={(e) => setEditingEntry(prev => prev ? { ...prev, startTime: new Date(e.target.value) } : null)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">End Time</label>
                    <Input
                      type="datetime-local"
                      value={editingEntry.endTime ? new Date(editingEntry.endTime).toISOString().slice(0, 16) : ''}
                      onChange={(e) => setEditingEntry(prev => prev ? { ...prev, endTime: new Date(e.target.value) } : null)}
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="edit-billable"
                    checked={editingEntry.billable}
                    onChange={(e) => setEditingEntry(prev => prev ? { ...prev, billable: e.target.checked } : null)}
                    className="rounded"
                  />
                  <label htmlFor="edit-billable" className="text-sm">Billable</label>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleEditEntry}>
                    Update Entry
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
