import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db as prisma } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entityType: string; entityId: string }> }
) {
  try {
    const { entityType, entityId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const field = searchParams.get('field')

    // Find the active lock
    const lock = await prisma.documentLock.findFirst({
      where: {
        entityType,
        entityId,
        field: field || null,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      include: {
        lockedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })

    if (!lock) {
      return NextResponse.json({ error: 'No active lock found' }, { status: 404 })
    }

    // Don't allow requesting unlock of own lock
    if (lock.lockedById === session.user.id) {
      return NextResponse.json({ error: 'Cannot request unlock of your own lock' }, { status: 400 })
    }

    // Create notification for lock owner
    await prisma.notification.create({
      data: {
        type: 'COLLABORATION_INVITE',
        title: 'Unlock Request',
        message: `${session.user.name || session.user.email} has requested to unlock a document you have locked.`,
        data: JSON.stringify({
          requesterId: session.user.id,
          requesterName: session.user.name || session.user.email,
          entityType,
          entityId,
          field,
          lockId: lock.id
        }),
        userId: lock.lockedById
      }
    })

    // Log the unlock request
    await prisma.activity.create({
      data: {
        type: 'UPDATE',
        action: 'request_unlock',
        entityType,
        entityId,
        userId: session.user.id,
        metadata: {
          lockId: lock.id,
          lockOwnerId: lock.lockedById,
          field
        }
      }
    })

    // In a real-time system, you would also emit a socket event to the lock owner
    // socketManager.emitToUser(lock.lockedById, 'unlock-request', {
    //   requesterId: session.user.id,
    //   requesterName: session.user.name || session.user.email,
    //   entityType,
    //   entityId,
    //   field,
    //   lockId: lock.id
    // })

    return NextResponse.json({ 
      success: true,
      message: 'Unlock request sent to document owner'
    })
  } catch (error) {
    console.error('Request unlock error:', error)
    return NextResponse.json(
      { error: 'Failed to request unlock' },
      { status: 500 }
    )
  }
}