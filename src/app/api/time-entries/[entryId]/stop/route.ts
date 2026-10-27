import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db as prisma } from '@/lib/db'
import { handleApiError } from '@/lib/error-handling'
import { logger } from '@/lib/logger'

// PATCH /api/time-entries/[entryId]/stop - Stop a running timer
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    const { entryId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }


    // Verify time entry exists and belongs to user
    const timeEntry = await prisma.timeEntry.findFirst({
      where: {
        id: entryId,
        userId: session.user.id,
        endTime: null // Only allow stopping active timers
      }
    })

    if (!timeEntry) {
      return NextResponse.json({ 
        error: 'Active time entry not found' 
      }, { status: 404 })
    }

    const endTime = new Date()
    const duration = Math.floor((endTime.getTime() - timeEntry.startTime.getTime()) / 60000) // in minutes

    // Update time entry
    const updatedEntry = await prisma.timeEntry.update({
      where: {
        id: entryId
      },
      data: {
        endTime,
        duration
      }
    })

    // Update task actual hours
    if (timeEntry.taskId) {
      const task = await prisma.task.findUnique({
        where: { id: timeEntry.taskId }
      })

      if (task) {
        await prisma.task.update({
          where: { id: timeEntry.taskId },
          data: {
            actualHours: (task.actualHours || 0) + Math.ceil(duration / 60)
          }
        })
      }
    }

    logger.info('Stopped timer', {
      timeEntryId: entryId,
      userId: session.user.id,
      duration: duration
    })

    return NextResponse.json(updatedEntry)

  } catch (error) {
    return handleApiError(error, { path: '/api/time-entries/[entryId]/stop', method: 'POST' })
  }
}