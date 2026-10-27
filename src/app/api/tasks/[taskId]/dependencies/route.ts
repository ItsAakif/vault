import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db as prisma } from '@/lib/db'
import { z } from 'zod'
import { handleApiError } from '@/lib/error-handling'
import { logger } from '@/lib/logger'

const createDependencySchema = z.object({
  dependsOnTaskId: z.string().cuid(),
  type: z.enum(['FINISH_TO_START', 'START_TO_START', 'FINISH_TO_FINISH', 'START_TO_FINISH']).default('FINISH_TO_START'),
  lag: z.number().int().min(0).optional()
})

// GET /api/tasks/[taskId]/dependencies - Get task dependencies
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

    // Get dependencies for this task
    const dependencies = await prisma.taskDependency.findMany({
      where: {
        dependentTaskId: taskId
      },
      include: {
        dependsOnTask: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
            completedAt: true
          }
        }
      }
    })

    // Get tasks that depend on this task
    const dependents = await prisma.taskDependency.findMany({
      where: {
        dependsOnTaskId: taskId
      },
      include: {
        dependentTask: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
            completedAt: true
          }
        }
      }
    })

    logger.info('Retrieved task dependencies', {
      taskId,
      userId: session.user.id,
      dependenciesCount: dependencies.length,
      dependentsCount: dependents.length
    })

    return NextResponse.json({
      dependencies,
      dependents
    })

  } catch (error) {
    return handleApiError(error, { path: '/api/tasks/[taskId]/dependencies', method: 'GET' })
  }
}

// POST /api/tasks/[taskId]/dependencies - Add task dependency
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
    const validatedData = createDependencySchema.parse(body)

    // Verify both tasks exist and user has access
    const [dependentTask, dependsOnTask] = await Promise.all([
      prisma.task.findFirst({
        where: {
          id: taskId,
          project: {
            userId: session.user.id
          }
        }
      }),
      prisma.task.findFirst({
        where: {
          id: validatedData.dependsOnTaskId,
          project: {
            userId: session.user.id
          }
        }
      })
    ])

    if (!dependentTask || !dependsOnTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Check if dependency already exists
    const existingDependency = await prisma.taskDependency.findUnique({
      where: {
        dependentTaskId_dependsOnTaskId: {
          dependentTaskId: taskId,
          dependsOnTaskId: validatedData.dependsOnTaskId
        }
      }
    })

    if (existingDependency) {
      return NextResponse.json({ error: 'Dependency already exists' }, { status: 400 })
    }

    // Check for circular dependencies
    const wouldCreateCircle = await checkCircularDependency(taskId, validatedData.dependsOnTaskId)
    if (wouldCreateCircle) {
      return NextResponse.json({ error: 'Would create circular dependency' }, { status: 400 })
    }

    // Create dependency
    const dependency = await prisma.taskDependency.create({
      data: {
        dependentTaskId: taskId,
        dependsOnTaskId: validatedData.dependsOnTaskId,
        type: validatedData.type,
        lag: validatedData.lag
      },
      include: {
        dependsOnTask: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
            completedAt: true
          }
        }
      }
    })

    logger.info('Created task dependency', {
      dependencyId: dependency.id,
      dependentTaskId: taskId,
      dependsOnTaskId: validatedData.dependsOnTaskId,
      userId: session.user.id
    })

    return NextResponse.json(dependency, { status: 201 })

  } catch (error) {
    return handleApiError(error, { path: '/api/tasks/[taskId]/dependencies', method: 'POST' })
  }
}

// Helper function to check for circular dependencies
async function checkCircularDependency(
  dependentTaskId: string,
  dependsOnTaskId: string,
  visited: Set<string> = new Set()
): Promise<boolean> {
  if (visited.has(dependsOnTaskId)) {
    return true // Circular dependency detected
  }

  if (dependsOnTaskId === dependentTaskId) {
    return true // Self-dependency
  }

  visited.add(dependsOnTaskId)

  // Get all tasks that the dependsOnTask depends on
  const dependencies = await prisma.taskDependency.findMany({
    where: {
      dependentTaskId: dependsOnTaskId
    },
    select: {
      dependsOnTaskId: true
    }
  })

  // Recursively check each dependency
  for (const dep of dependencies) {
    if (await checkCircularDependency(dependentTaskId, dep.dependsOnTaskId, new Set(visited))) {
      return true
    }
  }

  return false
}