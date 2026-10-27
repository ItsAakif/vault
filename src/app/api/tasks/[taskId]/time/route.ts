import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db as prisma } from '@/lib/db'
import { z } from 'zod'
import { handleApiError } from '@/lib/error-handling'
import { logger } from '@/lib/logger'

const startTimerSchema = z.object({
  description: z.string().optional(),
  startTime: z.string().datetime()
})

// GET /api/tasks/[taskId]/time - Get time entries for a task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }


    // Verify task exists and user has access
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        project: {
          userId: session.user.id
        }
      }
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Get time entries
    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        taskId: taskId,
        userId: session.user.id
      },
      orderBy: {
        startTime: 'desc'
      }
    })

    logger.info('Retrieved time entries', {
      taskId,
      userId: session.user.id,
      entriesCount: timeEntries.length
    })

    return NextResponse.json(timeEntries)

  } catch (error) {
    return handleApiError(error, { path: '/api/tasks/[taskId]/time', method: 'GET' })
  }
}

// POST /api/tasks/[taskId]/time - Start timer or create time entry
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = startTimerSchema.parse(body)

    // Verify task exists and user has access
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        project: {
          userId: session.user.id
        }
      }
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Check if user already has an active timer
    const activeTimer = await prisma.timeEntry.findFirst({
      where: {
        userId: session.user.id,
        endTime: null
      }
    })

    if (activeTimer) {
      return NextResponse.json({ 
        error: 'You already have an active timer running' 
      }, { status: 400 })
    }

    // Create time entry
    const timeEntry = await prisma.timeEntry.create({
      data: {
        description: validatedData.description,
        startTime: new Date(validatedData.startTime),
        taskId: taskId,
        projectId: task.projectId,
        userId: session.user.id
      }
    })

    logger.info('Started timer', {
      timeEntryId: timeEntry.id,
      taskId,
      userId: session.user.id
    })

    return NextResponse.json(timeEntry, { status: 201 })

  } catch (error) {
    return handleApiError(error, { path: '/api/tasks/[taskId]/time', method: 'POST' })
  }
}