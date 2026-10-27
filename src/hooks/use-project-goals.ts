'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface ProjectGoal {
  id: string
  title: string
  description?: string
  type: 'completion' | 'time' | 'quality' | 'custom'
  targetValue: number
  currentValue: number
  unit: string
  deadline?: Date
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  status: 'ACTIVE' | 'COMPLETED' | 'PAUSED' | 'CANCELLED'
  createdAt: Date
  updatedAt: Date
}

interface CreateGoalData {
  title: string
  description?: string
  type: 'completion' | 'time' | 'quality' | 'custom'
  targetValue: number
  currentValue?: number
  unit: string
  deadline?: Date
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
}

interface UpdateGoalData {
  title?: string
  description?: string
  type?: 'completion' | 'time' | 'quality' | 'custom'
  targetValue?: number
  currentValue?: number
  unit?: string
  deadline?: Date
  priority?: 'LOW' | 'MEDIUM' | 'HIGH'
  status?: 'ACTIVE' | 'COMPLETED' | 'PAUSED' | 'CANCELLED'
}

export function useProjectGoals(projectId: string) {
  const queryClient = useQueryClient()

  // Fetch goals
  const {
    data: goals = [],
    isLoading,
    error
  } = useQuery({
    queryKey: ['project-goals', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/goals`)
      if (!response.ok) {
        throw new Error('Failed to fetch goals')
      }
      const data = await response.json()
      return data.map((goal: any) => ({
        ...goal,
        deadline: goal.deadline ? new Date(goal.deadline) : undefined,
        createdAt: new Date(goal.createdAt),
        updatedAt: new Date(goal.updatedAt)
      })) as ProjectGoal[]
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Create goal mutation
  const createGoalMutation = useMutation({
    mutationFn: async (goalData: CreateGoalData) => {
      const response = await fetch(`/api/projects/${projectId}/goals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...goalData,
          deadline: goalData.deadline?.toISOString()
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create goal')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-goals', projectId] })
    }
  })

  // Update goal mutation
  const updateGoalMutation = useMutation({
    mutationFn: async ({ goalId, updates }: { goalId: string; updates: UpdateGoalData }) => {
      const response = await fetch(`/api/projects/${projectId}/goals/${goalId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...updates,
          deadline: updates.deadline?.toISOString()
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update goal')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-goals', projectId] })
    }
  })

  // Delete goal mutation
  const deleteGoalMutation = useMutation({
    mutationFn: async (goalId: string) => {
      const response = await fetch(`/api/projects/${projectId}/goals/${goalId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete goal')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-goals', projectId] })
    }
  })

  // Helper functions
  const createGoal = (goalData: CreateGoalData) => {
    return createGoalMutation.mutateAsync(goalData)
  }

  const updateGoal = (goalId: string, updates: UpdateGoalData) => {
    return updateGoalMutation.mutateAsync({ goalId, updates })
  }

  const deleteGoal = (goalId: string) => {
    return deleteGoalMutation.mutateAsync(goalId)
  }

  // Quick update progress
  const updateProgress = (goalId: string, currentValue: number) => {
    const goal = goals.find(g => g.id === goalId)
    if (!goal) return Promise.reject(new Error('Goal not found'))

    const status = currentValue >= goal.targetValue ? 'COMPLETED' : 'ACTIVE'
    return updateGoal(goalId, { currentValue, status })
  }

  // Toggle goal status
  const toggleGoalStatus = (goalId: string) => {
    const goal = goals.find(g => g.id === goalId)
    if (!goal) return Promise.reject(new Error('Goal not found'))

    const newStatus = goal.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
    return updateGoal(goalId, { status: newStatus })
  }

  // Calculate goal statistics
  const goalStats = {
    total: goals.length,
    active: goals.filter(g => g.status === 'ACTIVE').length,
    completed: goals.filter(g => g.status === 'COMPLETED').length,
    paused: goals.filter(g => g.status === 'PAUSED').length,
    overdue: goals.filter(g => 
      g.deadline && 
      g.status === 'ACTIVE' && 
      new Date() > g.deadline
    ).length,
    completionRate: goals.length > 0 
      ? (goals.filter(g => g.status === 'COMPLETED').length / goals.length) * 100 
      : 0
  }

  return {
    goals,
    goalStats,
    isLoading,
    error,
    createGoal,
    updateGoal,
    deleteGoal,
    updateProgress,
    toggleGoalStatus,
    isCreating: createGoalMutation.isPending,
    isUpdating: updateGoalMutation.isPending,
    isDeleting: deleteGoalMutation.isPending
  }
}