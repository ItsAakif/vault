import { useState, useCallback } from 'react'
import { useToast } from './use-feedback'

export interface TaskDependency {
  id: string
  dependentTaskId: string
  dependsOnTaskId: string
  type: 'FINISH_TO_START' | 'START_TO_START' | 'FINISH_TO_FINISH' | 'START_TO_FINISH'
  lag?: number
  createdAt: Date
  dependsOnTask?: {
    id: string
    title: string
    status: string
    priority: string
    dueDate?: Date
    completedAt?: Date
  }
}

export interface TaskDependencies {
  dependencies: TaskDependency[]
  dependents: TaskDependency[]
}

export interface SubTask {
  id: string
  title: string
  description?: string
  status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED' | 'CANCELLED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  dueDate?: Date
  estimatedHours?: number
  actualHours?: number
  assigneeId?: string
  parentId: string
  position: number
  completedAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface TimeEntry {
  id: string
  description?: string
  startTime: Date
  endTime?: Date
  duration?: number
  billable: boolean
  tags: string[]
  taskId?: string
  projectId?: string
  userId: string
  createdAt: Date
  updatedAt: Date
}

export function useTaskManagement() {
  const { toast, success, error: toastError } = useToast()
  const [loading, setLoading] = useState(false)

  // Task Dependencies
  const getDependencies = useCallback(async (taskId: string): Promise<TaskDependencies> => {
    setLoading(true)
    try {
      const response = await fetch(`/api/tasks/${taskId}/dependencies`)
      if (!response.ok) {
        throw new Error('Failed to fetch dependencies')
      }
      return await response.json()
    } catch (error) {
      console.error('Error fetching dependencies:', error)
      toastError('Failed to load task dependencies')
      throw error
    } finally {
      setLoading(false)
    }
  }, [toast])

  const addDependency = useCallback(async (
    taskId: string,
    dependency: {
      dependsOnTaskId: string
      type: TaskDependency['type']
      lag?: number
    }
  ): Promise<TaskDependency> => {
    setLoading(true)
    try {
      const response = await fetch(`/api/tasks/${taskId}/dependencies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dependency)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to add dependency')
      }

      const result = await response.json()
      success('Dependency added successfully')
      return result
    } catch (error) {
      console.error('Error adding dependency:', error)
      toastError(error instanceof Error ? error.message : 'Failed to add dependency')
      throw error
    } finally {
      setLoading(false)
    }
  }, [toast])

  const removeDependency = useCallback(async (dependencyId: string): Promise<void> => {
    setLoading(true)
    try {
      const response = await fetch(`/api/tasks/dependencies/${dependencyId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to remove dependency')
      }

      success('Dependency removed successfully')
    } catch (error) {
      console.error('Error removing dependency:', error)
      toastError('Failed to remove dependency')
      throw error
    } finally {
      setLoading(false)
    }
  }, [toast])

  // Subtask Management
  const getSubtasks = useCallback(async (parentTaskId: string): Promise<SubTask[]> => {
    setLoading(true)
    try {
      const response = await fetch(`/api/tasks/${parentTaskId}/subtasks`)
      if (!response.ok) {
        throw new Error('Failed to fetch subtasks')
      }
      return await response.json()
    } catch (error) {
      console.error('Error fetching subtasks:', error)
      toastError('Failed to load subtasks')
      throw error
    } finally {
      setLoading(false)
    }
  }, [toast])

  const createSubtask = useCallback(async (
    parentTaskId: string,
    subtask: {
      title: string
      description?: string
      priority?: SubTask['priority']
      dueDate?: Date
      estimatedHours?: number
      assigneeId?: string
    }
  ): Promise<SubTask> => {
    setLoading(true)
    try {
      const response = await fetch(`/api/tasks/${parentTaskId}/subtasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(subtask)
      })

      if (!response.ok) {
        throw new Error('Failed to create subtask')
      }

      const result = await response.json()
      success('Subtask created successfully')
      return result
    } catch (error) {
      console.error('Error creating subtask:', error)
      toastError('Failed to create subtask')
      throw error
    } finally {
      setLoading(false)
    }
  }, [toast])

  const updateSubtask = useCallback(async (
    subtaskId: string,
    updates: Partial<SubTask>
  ): Promise<SubTask> => {
    setLoading(true)
    try {
      const response = await fetch(`/api/tasks/${subtaskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      })

      if (!response.ok) {
        throw new Error('Failed to update subtask')
      }

      const result = await response.json()
      success('Subtask updated successfully')
      return result
    } catch (error) {
      console.error('Error updating subtask:', error)
      toastError('Failed to update subtask')
      throw error
    } finally {
      setLoading(false)
    }
  }, [toast])

  const deleteSubtask = useCallback(async (subtaskId: string): Promise<void> => {
    setLoading(true)
    try {
      const response = await fetch(`/api/tasks/${subtaskId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to delete subtask')
      }

      success('Subtask deleted successfully')
    } catch (error) {
      console.error('Error deleting subtask:', error)
      toastError('Failed to delete subtask')
      throw error
    } finally {
      setLoading(false)
    }
  }, [toast])

  // Time Tracking
  const startTimer = useCallback(async (
    taskId: string,
    description?: string
  ): Promise<TimeEntry> => {
    setLoading(true)
    try {
      const response = await fetch(`/api/tasks/${taskId}/time`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          description,
          startTime: new Date().toISOString()
        })
      })

      if (!response.ok) {
        throw new Error('Failed to start timer')
      }

      const result = await response.json()
      success('Timer started')
      return result
    } catch (error) {
      console.error('Error starting timer:', error)
      toastError('Failed to start timer')
      throw error
    } finally {
      setLoading(false)
    }
  }, [toast])

  const stopTimer = useCallback(async (entryId: string): Promise<TimeEntry> => {
    setLoading(true)
    try {
      const response = await fetch(`/api/time-entries/${entryId}/stop`, {
        method: 'PATCH'
      })

      if (!response.ok) {
        throw new Error('Failed to stop timer')
      }

      const result = await response.json()
      success('Timer stopped')
      return result
    } catch (error) {
      console.error('Error stopping timer:', error)
      toastError('Failed to stop timer')
      throw error
    } finally {
      setLoading(false)
    }
  }, [toast])

  const getTimeEntries = useCallback(async (taskId: string): Promise<TimeEntry[]> => {
    setLoading(true)
    try {
      const response = await fetch(`/api/tasks/${taskId}/time`)
      if (!response.ok) {
        throw new Error('Failed to fetch time entries')
      }
      return await response.json()
    } catch (error) {
      console.error('Error fetching time entries:', error)
      toastError('Failed to load time entries')
      throw error
    } finally {
      setLoading(false)
    }
  }, [toast])

  const createTimeEntry = useCallback(async (
    entry: Omit<TimeEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ): Promise<TimeEntry> => {
    setLoading(true)
    try {
      const response = await fetch('/api/time-entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(entry)
      })

      if (!response.ok) {
        throw new Error('Failed to create time entry')
      }

      const result = await response.json()
      success('Time entry created')
      return result
    } catch (error) {
      console.error('Error creating time entry:', error)
      toastError('Failed to create time entry')
      throw error
    } finally {
      setLoading(false)
    }
  }, [toast])

  const updateTimeEntry = useCallback(async (
    entryId: string,
    updates: Partial<TimeEntry>
  ): Promise<TimeEntry> => {
    setLoading(true)
    try {
      const response = await fetch(`/api/time-entries/${entryId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      })

      if (!response.ok) {
        throw new Error('Failed to update time entry')
      }

      const result = await response.json()
      success('Time entry updated')
      return result
    } catch (error) {
      console.error('Error updating time entry:', error)
      toastError('Failed to update time entry')
      throw error
    } finally {
      setLoading(false)
    }
  }, [toast])

  const deleteTimeEntry = useCallback(async (entryId: string): Promise<void> => {
    setLoading(true)
    try {
      const response = await fetch(`/api/time-entries/${entryId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to delete time entry')
      }

      success('Time entry deleted')
    } catch (error) {
      console.error('Error deleting time entry:', error)
      toastError('Failed to delete time entry')
      throw error
    } finally {
      setLoading(false)
    }
  }, [toast])

  // Task Assignment
  const assignTask = useCallback(async (
    taskId: string,
    assigneeId: string
  ): Promise<void> => {
    setLoading(true)
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ assigneeId })
      })

      if (!response.ok) {
        throw new Error('Failed to assign task')
      }

      success('Task assigned successfully')
    } catch (error) {
      console.error('Error assigning task:', error)
      toastError('Failed to assign task')
      throw error
    } finally {
      setLoading(false)
    }
  }, [toast])

  const unassignTask = useCallback(async (taskId: string): Promise<void> => {
    setLoading(true)
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ assigneeId: null })
      })

      if (!response.ok) {
        throw new Error('Failed to unassign task')
      }

      success('Task unassigned successfully')
    } catch (error) {
      console.error('Error unassigning task:', error)
      toastError('Failed to unassign task')
      throw error
    } finally {
      setLoading(false)
    }
  }, [toast])

  return {
    loading,
    
    // Dependencies
    getDependencies,
    addDependency,
    removeDependency,
    
    // Subtasks
    getSubtasks,
    createSubtask,
    updateSubtask,
    deleteSubtask,
    
    // Time tracking
    startTimer,
    stopTimer,
    getTimeEntries,
    createTimeEntry,
    updateTimeEntry,
    deleteTimeEntry,
    
    // Assignment
    assignTask,
    unassignTask
  }
}
