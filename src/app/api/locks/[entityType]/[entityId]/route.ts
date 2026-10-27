import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db as prisma } from '@/lib/db'
import { z } from 'zod'

const lockRequestSchema = z.object({
  reason: z.string().optional(),
  expiresIn: z.number().optional().default(7200) // 2 hours in seconds
})

export async function GET(
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

    // Check if user has access to the entity
    const hasAccess = await verifyEntityAccess(session.user.id, entityType, entityId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Find active lock
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
            email: true,
            avatar: true
          }
        }
      }
    })

    if (!lock) {
      return NextResponse.json(null)
    }

    return NextResponse.json({
      id: lock.id,
      entityType: lock.entityType,
      entityId: lock.entityId,
      field: lock.field,
      lockedBy: lock.lockedBy,
      lockedAt: lock.createdAt,
      expiresAt: lock.expiresAt,
      reason: lock.reason,
      isActive: lock.isActive
    })
  } catch (error) {
    console.error('Get lock error:', error)
    return NextResponse.json(
      { error: 'Failed to get lock status' },
      { status: 500 }
    )
  }
}

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
    
    const body = await request.json()
    const { reason, expiresIn } = lockRequestSchema.parse(body)

    // Check if user has access to the entity
    const hasAccess = await verifyEntityAccess(session.user.id, entityType, entityId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Check if already locked
    const existingLock = await prisma.documentLock.findFirst({
      where: {
        entityType,
        entityId,
        field: field || null,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      }
    })

    if (existingLock) {
      return NextResponse.json(
        { error: 'Document is already locked' },
        { status: 409 }
      )
    }

    // Create lock
    const expiresAt = new Date(Date.now() + expiresIn * 1000)
    
    const lock = await prisma.documentLock.create({
      data: {
        entityType,
        entityId,
        field: field || null,
        lockedById: session.user.id,
        reason,
        expiresAt,
        isActive: true
      },
      include: {
        lockedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        }
      }
    })

    // Log the lock activity
    await prisma.activity.create({
      data: {
        type: 'UPDATE',
        action: 'lock',
        entityType,
        entityId,
        userId: session.user.id,
        metadata: {
          lockId: lock.id,
          field,
          reason,
          expiresAt: expiresAt.toISOString()
        }
      }
    })

    return NextResponse.json({
      id: lock.id,
      entityType: lock.entityType,
      entityId: lock.entityId,
      field: lock.field,
      lockedBy: lock.lockedBy,
      lockedAt: lock.createdAt,
      expiresAt: lock.expiresAt,
      reason: lock.reason,
      isActive: lock.isActive
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Create lock error:', error)
    return NextResponse.json(
      { error: 'Failed to create lock' },
      { status: 500 }
    )
  }
}

export async function DELETE(
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

    // Find the lock
    const lock = await prisma.documentLock.findFirst({
      where: {
        entityType,
        entityId,
        field: field || null,
        isActive: true
      }
    })

    if (!lock) {
      return NextResponse.json({ error: 'No active lock found' }, { status: 404 })
    }

    // Check if user can unlock (owner or has admin access)
    const canUnlock = lock.lockedById === session.user.id || 
                     await hasAdminAccess(session.user.id, entityType, entityId)
    
    if (!canUnlock) {
      return NextResponse.json({ error: 'Cannot unlock document' }, { status: 403 })
    }

    // Remove the lock
    await prisma.documentLock.update({
      where: { id: lock.id },
      data: { 
        isActive: false,
        unlockedAt: new Date(),
        unlockedById: session.user.id
      }
    })

    // Log the unlock activity
    await prisma.activity.create({
      data: {
        type: 'UPDATE',
        action: 'unlock',
        entityType,
        entityId,
        userId: session.user.id,
        metadata: {
          lockId: lock.id,
          field,
          originalLockOwner: lock.lockedById
        }
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete lock error:', error)
    return NextResponse.json(
      { error: 'Failed to remove lock' },
      { status: 500 }
    )
  }
}

async function verifyEntityAccess(userId: string, entityType: string, entityId: string): Promise<boolean> {
  try {
    switch (entityType) {
      case 'project':
        const project = await prisma.project.findFirst({
          where: {
            id: entityId,
            OR: [
              { userId },
              { collaborators: { some: { userId } } }
            ]
          }
        })
        return !!project

      case 'content':
        const content = await prisma.contentItem.findFirst({
          where: {
            id: entityId,
            userId
          }
        })
        return !!content

      default:
        return false
    }
  } catch (error) {
    console.error('Entity access verification failed:', error)
    return false
  }
}

async function hasAdminAccess(userId: string, entityType: string, entityId: string): Promise<boolean> {
  try {
    switch (entityType) {
      case 'project':
        const project = await prisma.project.findFirst({
          where: {
            id: entityId,
            OR: [
              { userId }, // Owner
              { 
                collaborators: { 
                  some: { 
                    userId,
                    role: 'OWNER'
                  } 
                } 
              }
            ]
          }
        })
        return !!project

      default:
        return false
    }
  } catch (error) {
    console.error('Admin access verification failed:', error)
    return false
  }
}