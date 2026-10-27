import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db as prisma } from '@/lib/db'
import { z } from 'zod'

const updateGoalSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  type: z.enum(['completion', 'time', 'quality', 'custom']).optional(),
  targetValue: z.number().positive().optional(),
  currentValue: z.number().min(0).optional(),
  unit: z.string().min(1).optional(),
  deadline: z.string().datetime().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'PAUSED', 'CANCELLED']).optional()
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; goalId: string }> }
) {
  try {
    const { projectId, goalId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = updateGoalSchema.parse(body)

    // Verify project ownership and goal existence
    const goal = await prisma.projectGoal.findFirst({
      where: {
        id: goalId,
        projectId,
        project: {
          userId: session.user.id
        }
      }
    })

    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    // Auto-complete goal if current value reaches target
    let status = validatedData.status
    if (validatedData.currentValue !== undefined && validatedData.currentValue >= (validatedData.targetValue || goal.targetValue)) {
      status = 'COMPLETED'
    }

    const updatedGoal = await prisma.projectGoal.update({
      where: { id: goalId },
      data: {
        ...validatedData,
        status,
        deadline: validatedData.deadline ? new Date(validatedData.deadline) : undefined,
        updatedAt: new Date()
      }
    })

    return NextResponse.json(updatedGoal)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Update goal error:', error)
    return NextResponse.json(
      { error: 'Failed to update goal' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; goalId: string }> }
) {
  try {
    const { projectId, goalId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }


    // Verify project ownership and goal existence
    const goal = await prisma.projectGoal.findFirst({
      where: {
        id: goalId,
        projectId,
        project: {
          userId: session.user.id
        }
      }
    })

    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    await prisma.projectGoal.delete({
      where: { id: goalId }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete goal error:', error)
    return NextResponse.json(
      { error: 'Failed to delete goal' },
      { status: 500 }
    )
  }
}