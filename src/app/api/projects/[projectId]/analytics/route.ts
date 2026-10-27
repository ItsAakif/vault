import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db as prisma } from '@/lib/db'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')
    
    const from = fromParam ? new Date(fromParam) : subDays(new Date(), 30)
    const to = toParam ? new Date(toParam) : new Date()

    // Fetch project with all related data
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: session.user.id
      },
      include: {
        tasks: {
          include: {
            timeEntries: {
              where: {
                createdAt: {
                  gte: startOfDay(from),
                  lte: endOfDay(to)
                }
              }
            },
            children: true,
            dependsOn: true
          }
        },
        timeEntries: {
          where: {
            createdAt: {
              gte: startOfDay(from),
              lte: endOfDay(to)
            }
          }
        },
        collaborators: {
          include: {
            user: true
          }
        },
        milestones: true
      }
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Calculate analytics
    const analytics = await calculateProjectAnalytics(project, from, to)

    return NextResponse.json(analytics)
  } catch (error) {
    console.error('Analytics error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}

async function calculateProjectAnalytics(project: any, from: Date, to: Date) {
  const totalTasks = project.tasks.length
  const completedTasks = project.tasks.filter((task: any) => task.status === 'COMPLETED').length
  const inProgressTasks = project.tasks.filter((task: any) => task.status === 'IN_PROGRESS').length
  const todoTasks = project.tasks.filter((task: any) => task.status === 'TODO').length
  
  const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0
  
  const totalEstimatedHours = project.tasks.reduce((sum: number, task: any) => 
    sum + (task.estimatedHours || 0), 0)
  const totalActualHours = project.tasks.reduce((sum: number, task: any) => 
    sum + (task.actualHours || 0), 0)
  
  const timeVariance = totalEstimatedHours > 0 
    ? ((totalActualHours - totalEstimatedHours) / totalEstimatedHours) * 100 
    : 0

  // Priority distribution
  const priorityDistribution = {
    high: project.tasks.filter((t: any) => t.priority === 'HIGH').length,
    medium: project.tasks.filter((t: any) => t.priority === 'MEDIUM').length,
    low: project.tasks.filter((t: any) => t.priority === 'LOW').length
  }

  // Time tracking by day
  const timeByDay: Record<string, number> = {}
  const daysBetween = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
  
  for (let i = 0; i < daysBetween; i++) {
    const date = new Date(from)
    date.setDate(date.getDate() + i)
    const dateKey = format(date, 'yyyy-MM-dd')
    timeByDay[dateKey] = 0
  }

  project.timeEntries.forEach((entry: any) => {
    const dateKey = format(new Date(entry.createdAt), 'yyyy-MM-dd')
    if (timeByDay.hasOwnProperty(dateKey)) {
      timeByDay[dateKey] += entry.duration || 0
    }
  })

  // Velocity calculation (tasks completed per week over last 8 weeks)
  const velocity: { week: string; completed: number }[] = []
  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - (i * 7) - 6)
    const weekEnd = new Date()
    weekEnd.setDate(weekEnd.getDate() - (i * 7))

    const completedInWeek = project.tasks.filter((task: any) => 
      task.completedAt && 
      new Date(task.completedAt) >= weekStart && 
      new Date(task.completedAt) <= weekEnd
    ).length

    velocity.push({
      week: `Week ${8 - i}`,
      completed: completedInWeek
    })
  }

  // Burndown chart data
  const burndown: { date: string; remaining: number; ideal: number }[] = []
  const totalTasksAtStart = totalTasks
  const daysInPeriod = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
  
  for (let i = 0; i < daysInPeriod; i++) {
    const date = new Date(from)
    date.setDate(date.getDate() + i)
    
    const tasksCompletedByDate = project.tasks.filter((task: any) => 
      task.completedAt && new Date(task.completedAt) <= date
    ).length
    
    const remaining = totalTasksAtStart - tasksCompletedByDate
    const ideal = totalTasksAtStart - (totalTasksAtStart * (i / daysInPeriod))
    
    burndown.push({
      date: format(date, 'MMM dd'),
      remaining,
      ideal: Math.max(0, ideal)
    })
  }

  return {
    summary: {
      totalTasks,
      completedTasks,
      inProgressTasks,
      todoTasks,
      completionRate,
      totalEstimatedHours,
      totalActualHours,
      timeVariance
    },
    priorityDistribution,
    timeByDay,
    collaboratorCount: project.collaborators.length,
    milestoneCount: project.milestones.length,
    velocity,
    burndown
  }
}