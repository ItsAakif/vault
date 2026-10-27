import { db } from './db'

export interface AnalyticsData {
  productivity: {
    tasksCompleted: number
    projectsCompleted: number
    totalTimeSpent: number
    averageTaskTime: number
    productivityScore: number
  }
  timeTracking: {
    dailyHours: { date: string; hours: number }[]
    weeklyHours: { week: string; hours: number }[]
    categoryBreakdown: { category: string; hours: number }[]
  }
  goals: {
    totalGoals: number
    completedGoals: number
    inProgressGoals: number
    completionRate: number
  }
  trends: {
    productivityTrend: number
    taskCompletionTrend: number
    timeSpentTrend: number
  }
}

export class AnalyticsEngine {
  async generateUserAnalytics(userId: string, days: number = 30): Promise<AnalyticsData> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    
    const [productivity, timeTracking, goals, trends] = await Promise.all([
      this.getProductivityMetrics(userId, startDate),
      this.getTimeTrackingMetrics(userId, startDate),
      this.getGoalMetrics(userId, startDate),
      this.getTrendMetrics(userId, startDate)
    ])

    return { productivity, timeTracking, goals, trends }
  }

  private async getProductivityMetrics(userId: string, startDate: Date) {
    const tasks = await db.task.findMany({
      where: { 
        project: { userId },
        updatedAt: { gte: startDate }
      },
      include: { timeEntries: true }
    })

    const projects = await db.project.findMany({
      where: { 
        userId,
        updatedAt: { gte: startDate }
      }
    })

    const completedTasks = tasks.filter(t => t.status === 'COMPLETED')
    const completedProjects = projects.filter(p => p.status === 'COMPLETED')
    
    const totalTimeSpent = tasks.reduce((sum, task) => {
      return sum + task.timeEntries.reduce((taskSum, entry) => {
        return taskSum + (entry.duration || 0)
      }, 0)
    }, 0)

    const averageTaskTime = completedTasks.length > 0 
      ? totalTimeSpent / completedTasks.length 
      : 0

    const productivityScore = this.calculateProductivityScore(
      completedTasks.length,
      completedProjects.length,
      totalTimeSpent
    )

    return {
      tasksCompleted: completedTasks.length,
      projectsCompleted: completedProjects.length,
      totalTimeSpent: Math.round(totalTimeSpent / 60), // Convert to hours
      averageTaskTime: Math.round(averageTaskTime / 60),
      productivityScore
    }
  }

  private async getTimeTrackingMetrics(userId: string, startDate: Date) {
    const timeEntries = await db.timeEntry.findMany({
      where: {
        userId,
        startTime: { gte: startDate }
      },
      include: { project: true, task: true }
    })

    // Daily hours
    const dailyHours = this.groupByDay(timeEntries)
    
    // Weekly hours
    const weeklyHours = this.groupByWeek(timeEntries)
    
    // Category breakdown
    const categoryBreakdown = this.groupByCategory(timeEntries)

    return { dailyHours, weeklyHours, categoryBreakdown }
  }

  private async getGoalMetrics(userId: string, startDate: Date) {
    const goals = await db.projectGoal.findMany({
      where: {
        project: { userId },
        createdAt: { gte: startDate }
      }
    })

    const completedGoals = goals.filter(g => g.status === 'COMPLETED')
    const inProgressGoals = goals.filter(g => g.status === 'ACTIVE')
    const completionRate = goals.length > 0 ? (completedGoals.length / goals.length) * 100 : 0

    return {
      totalGoals: goals.length,
      completedGoals: completedGoals.length,
      inProgressGoals: inProgressGoals.length,
      completionRate: Math.round(completionRate)
    }
  }

  private async getTrendMetrics(userId: string, startDate: Date) {
    // Calculate trends by comparing current period with previous period
    const previousStartDate = new Date(startDate.getTime() - (Date.now() - startDate.getTime()))
    
    const [currentMetrics, previousMetrics] = await Promise.all([
      this.getProductivityMetrics(userId, startDate),
      this.getProductivityMetrics(userId, previousStartDate)
    ])

    const productivityTrend = this.calculateTrend(
      currentMetrics.productivityScore,
      previousMetrics.productivityScore
    )

    const taskCompletionTrend = this.calculateTrend(
      currentMetrics.tasksCompleted,
      previousMetrics.tasksCompleted
    )

    const timeSpentTrend = this.calculateTrend(
      currentMetrics.totalTimeSpent,
      previousMetrics.totalTimeSpent
    )

    return { productivityTrend, taskCompletionTrend, timeSpentTrend }
  }

  private calculateProductivityScore(tasks: number, projects: number, timeSpent: number): number {
    // Simple productivity score calculation
    const taskScore = Math.min(tasks * 10, 50)
    const projectScore = Math.min(projects * 20, 30)
    const timeScore = Math.min(timeSpent / 3600, 20) // Hours to score
    
    return Math.round(taskScore + projectScore + timeScore)
  }

  private groupByDay(timeEntries: any[]) {
    const grouped = timeEntries.reduce<Record<string, number>>((acc, entry) => {
      const date = entry.startTime.toISOString().split('T')[0]
      acc[date] = (acc[date] || 0) + (entry.duration || 0)
      return acc
    }, {})

    return Object.entries(grouped).map(([date, duration]) => ({
      date,
      hours: Math.round(duration / 60)
    }))
  }

  private groupByWeek(timeEntries: any[]) {
    const grouped = timeEntries.reduce<Record<string, number>>((acc, entry) => {
      const date = new Date(entry.startTime)
      const week = this.getWeekString(date)
      acc[week] = (acc[week] || 0) + (entry.duration || 0)
      return acc
    }, {})

    return Object.entries(grouped).map(([week, duration]) => ({
      week,
      hours: Math.round(duration / 60)
    }))
  }

  private groupByCategory(timeEntries: any[]) {
    const grouped = timeEntries.reduce<Record<string, number>>((acc, entry) => {
      const category = entry.project?.title || entry.task?.title || 'Uncategorized'
      acc[category] = (acc[category] || 0) + (entry.duration || 0)
      return acc
    }, {})

    return Object.entries(grouped).map(([category, duration]) => ({
      category,
      hours: Math.round(duration / 60)
    }))
  }

  private getWeekString(date: Date): string {
    const year = date.getFullYear()
    const week = Math.ceil((date.getTime() - new Date(year, 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))
    return `${year}-W${week.toString().padStart(2, '0')}`
  }

  private calculateTrend(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0
    return Math.round(((current - previous) / previous) * 100)
  }
}

export const analyticsEngine = new AnalyticsEngine()