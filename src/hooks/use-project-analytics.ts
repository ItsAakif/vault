'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

interface ProjectAnalyticsData {
  summary: {
    totalTasks: number
    completedTasks: number
    inProgressTasks: number
    todoTasks: number
    completionRate: number
    totalEstimatedHours: number
    totalActualHours: number
    timeVariance: number
  }
  priorityDistribution: {
    high: number
    medium: number
    low: number
  }
  timeByDay: Record<string, number>
  collaboratorCount: number
  milestoneCount: number
  velocity: Array<{
    week: string
    completed: number
  }>
  burndown: Array<{
    date: string
    remaining: number
    ideal: number
  }>
}

interface UseProjectAnalyticsOptions {
  projectId: string
  refreshInterval?: number
}

export function useProjectAnalytics({ 
  projectId, 
  refreshInterval = 30000 
}: UseProjectAnalyticsOptions) {
  const [dateRange, setDateRange] = useState<{
    from: Date
    to: Date
  }>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    to: new Date()
  })

  // Fetch project analytics data
  const {
    data: analytics,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['project-analytics', projectId, dateRange],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/analytics?` + new URLSearchParams({
        from: dateRange.from.toISOString(),
        to: dateRange.to.toISOString()
      }))
      
      if (!response.ok) {
        throw new Error('Failed to fetch analytics')
      }
      
      return response.json() as Promise<ProjectAnalyticsData>
    },
    refetchInterval: refreshInterval,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Calculate derived metrics
  const derivedMetrics = useMemo(() => {
    if (!analytics) return null

    const { summary } = analytics

    // Productivity score (0-100)
    const productivityScore = Math.min(100, Math.max(0, 
      (summary.completionRate * 0.4) + 
      (summary.timeVariance <= 0 ? 30 : Math.max(0, 30 - Math.abs(summary.timeVariance))) +
      (summary.totalTasks > 0 ? 30 : 0)
    ))

    // Efficiency rating
    const efficiency = summary.totalEstimatedHours > 0 
      ? (summary.totalEstimatedHours / Math.max(summary.totalActualHours, 1)) * 100
      : 100

    // Risk assessment
    const riskFactors: string[] = []
    if (summary.timeVariance > 20) riskFactors.push('Time overrun')
    if (summary.completionRate < 50) riskFactors.push('Low completion rate')
    if (analytics.priorityDistribution.high > summary.totalTasks * 0.5) {
      riskFactors.push('Too many high priority tasks')
    }

    const riskLevel = riskFactors.length === 0 ? 'Low' : 
                     riskFactors.length === 1 ? 'Medium' : 'High'

    // Estimated completion date
    const averageVelocity = analytics.velocity.length > 0 
      ? analytics.velocity.reduce((sum, week) => sum + week.completed, 0) / analytics.velocity.length
      : 0

    const remainingTasks = summary.totalTasks - summary.completedTasks
    const estimatedWeeksToComplete = averageVelocity > 0 ? Math.ceil(remainingTasks / averageVelocity) : null
    const estimatedCompletionDate = estimatedWeeksToComplete 
      ? new Date(Date.now() + estimatedWeeksToComplete * 7 * 24 * 60 * 60 * 1000)
      : null

    return {
      productivityScore,
      efficiency,
      riskLevel,
      riskFactors,
      estimatedCompletionDate,
      averageVelocity
    }
  }, [analytics])

  // Export functions
  const exportAnalytics = async (format: 'pdf' | 'csv' | 'json') => {
    try {
      const response = await fetch(`/api/projects/${projectId}/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ format })
      })

      if (!response.ok) throw new Error('Export failed')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `project-analytics.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      return true
    } catch (error) {
      console.error('Export failed:', error)
      return false
    }
  }

  // Update date range
  const updateDateRange = (from: Date, to: Date) => {
    setDateRange({ from, to })
  }

  // Get analytics for specific time period
  const getAnalyticsForPeriod = (period: 'week' | 'month' | 'quarter' | 'year') => {
    const now = new Date()
    let from: Date

    switch (period) {
      case 'week':
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case 'month':
        from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case 'quarter':
        from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        break
      case 'year':
        from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
        break
    }

    updateDateRange(from, now)
  }

  // Compare with previous period
  const compareWithPrevious = useMemo(() => {
    if (!analytics) return null

    // This would typically fetch data for the previous period
    // For now, we'll return a placeholder structure
    return {
      completionRateChange: 0, // Percentage change
      velocityChange: 0,
      timeVarianceChange: 0,
      productivityChange: 0
    }
  }, [analytics])

  return {
    analytics,
    derivedMetrics,
    compareWithPrevious,
    isLoading,
    error,
    dateRange,
    updateDateRange,
    getAnalyticsForPeriod,
    exportAnalytics,
    refetch
  }
}