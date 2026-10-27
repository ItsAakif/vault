import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db as prisma } from '@/lib/db'
import { handleApiError } from '@/lib/error-handling'
import { logger } from '@/lib/logger'

// DELETE /api/tasks/dependencies/[dependencyId] - Remove task dependency
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ dependencyId: string }> }
) {
  try {
    const { dependencyId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }


    // Verify dependency exists and user has access
    const dependency = await prisma.taskDependency.findFirst({
      where: {
        id: dependencyId,
        dependentTask: {
          project: {
            userId: session.user.id
          }
        }
      }
    })

    if (!dependency) {
      return NextResponse.json({ error: 'Dependency not found' }, { status: 404 })
    }

    // Delete dependency
    await prisma.taskDependency.delete({
      where: {
        id: dependencyId
      }
    })

    logger.info('Deleted task dependency', {
      dependencyId,
      userId: session.user.id
    })

    return NextResponse.json({ success: true })

  } catch (error) {
    return handleApiError(error, { path: '/api/tasks/dependencies/[dependencyId]', method: 'DELETE' })
  }
}