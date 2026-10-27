import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db as prisma } from '@/lib/db'
import { z } from 'zod'
import { handleApiError } from '@/lib/error-handling'
import { logger } from '@/lib/logger'

const createSubtaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  dueDate: z.string().datetime().optional(),
  estimatedHours: z.number().int().min(0).optional(),
  assigneeId: z.string().cuid().optional()
})

// GET /api/tasks/[taskId]/subtasks - Get subtasks for a task
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


    // Verify parent task exists and user has access
    const parentTask = await prisma.task.findFirst({
      where: {
        id: taskId,
        project: {
          userId: session.user.id
        }
      }
    })

    if (!parentTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Get subtasks
    const subtasks = await prisma.task.findMany({
      where: {
        parentId: taskId
      },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        }
      },
      orderBy: {
        position: 'asc'
      }
    })

    logger.info('Retrieved subtasks', {
      parentTaskId: taskId,
      userId: session.user.id,
      subtasksCount: subtasks.length
    })

    return NextResponse.json(subtasks)

  } catch (error) {
    return handleApiError(error, { path: '/api/tasks/[taskId]/subtasks', method: 'GET' })
  }
}

// POST /api/tasks/[taskId]/subtasks - Create a new subtask
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
    const validatedData = createSubtaskSchema.parse(body)

    // Verify parent task exists and user has access
    const parentTask = await prisma.task.findFirst({
      where: {
        id: taskId,
        project: {
          userId: session.user.id
        }
      },
      include: {
        project: true
      }
    })

    if (!parentTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // If assignee is specified, verify they have access to the project
    if (validatedData.assigneeId) {
      const assignee = await prisma.user.findUnique({
        where: { id: validatedData.assigneeId }
      })

      if (!assignee) {
        return NextResponse.json({ error: 'Assignee not found' }, { status: 400 })
      }

      // For now, we'll allow any user to be assigned
      // In a real app, you'd check project membership
    }

    // Get the next position for ordering
    const lastSubtask = await prisma.task.findFirst({
      where: {
        parentId: taskId
      },
      orderBy: {
        position: 'desc'
      }
    })

    const nextPosition = (lastSubtask?.position || 0) + 1

    // Create subtask
    const subtask = await prisma.task.create({
      data: {
        title: validatedData.title,
        description: validatedData.description,
        priority: validatedData.priority,
        dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : null,
        estimatedHours: validatedData.estimatedHours,
        assigneeId: validatedData.assigneeId,
        parentId: taskId,
        projectId: parentTask.projectId,
        position: nextPosition
      },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        }
      }
    })

    logger.info('Created subtask', {
      subtaskId: subtask.id,
      parentTaskId: taskId,
      userId: session.user.id,
      title: subtask.title
    })

    return NextResponse.json(subtask, { status: 201 })

  } catch (error) {
    return handleApiError(error, { path: '/api/tasks/[taskId]/subtasks', method: 'POST' })
  }
}