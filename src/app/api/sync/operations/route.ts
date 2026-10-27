import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db as prisma } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'

const syncOperationSchema = z.object({
  id: z.string(),
  type: z.enum(['create', 'update', 'delete', 'move']),
  entity: z.string(),
  entityId: z.string(),
  field: z.string().optional(),
  data: z.any(),
  userId: z.string(),
  timestamp: z.string().datetime(),
  version: z.number(),
  dependencies: z.array(z.string()).optional()
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const operation = syncOperationSchema.parse(body)

    // Verify the operation is from the authenticated user
    if (operation.userId !== session.user.id) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 403 })
    }

    // Apply the sync operation
    await applySyncOperation(operation)

    // Log the operation
    await logSyncOperation(operation)

    logger.info(`Sync operation applied: ${operation.type} ${operation.entity}:${operation.entityId}`)

    return NextResponse.json({ 
      success: true, 
      operationId: operation.id,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid operation format', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Sync operation failed:', error)
    return NextResponse.json(
      { error: 'Failed to process sync operation' },
      { status: 500 }
    )
  }
}

async function applySyncOperation(operation: any) {
  const { type, entity, entityId, data, field } = operation

  switch (entity) {
    case 'project':
      await applySyncToProject(type, entityId, data, field)
      break
    case 'task':
      await applySyncToTask(type, entityId, data, field)
      break
    case 'content':
      await applySyncToContent(type, entityId, data, field)
      break
    case 'comment':
      await applySyncToComment(type, entityId, data, field)
      break
    default:
      throw new Error(`Unknown entity type: ${entity}`)
  }
}

async function applySyncToProject(type: string, entityId: string, data: any, field?: string) {
  switch (type) {
    case 'create':
      await prisma.project.create({
        data: { ...data, id: entityId }
      })
      break
    case 'update':
      if (field) {
        // Update specific field
        await prisma.project.update({
          where: { id: entityId },
          data: { [field]: data[field] }
        })
      } else {
        // Update entire record
        await prisma.project.update({
          where: { id: entityId },
          data
        })
      }
      break
    case 'delete':
      await prisma.project.delete({
        where: { id: entityId }
      })
      break
    default:
      throw new Error(`Unknown operation type: ${type}`)
  }
}

async function applySyncToTask(type: string, entityId: string, data: any, field?: string) {
  switch (type) {
    case 'create':
      await prisma.task.create({
        data: { ...data, id: entityId }
      })
      break
    case 'update':
      if (field) {
        await prisma.task.update({
          where: { id: entityId },
          data: { [field]: data[field] }
        })
      } else {
        await prisma.task.update({
          where: { id: entityId },
          data
        })
      }
      break
    case 'delete':
      await prisma.task.delete({
        where: { id: entityId }
      })
      break
    case 'move':
      // Handle task movement (e.g., between columns)
      await prisma.task.update({
        where: { id: entityId },
        data: {
          status: data.status,
          position: data.position
        }
      })
      break
    default:
      throw new Error(`Unknown operation type: ${type}`)
  }
}

async function applySyncToContent(type: string, entityId: string, data: any, field?: string) {
  switch (type) {
    case 'create':
      await prisma.contentItem.create({
        data: { ...data, id: entityId }
      })
      break
    case 'update':
      if (field) {
        await prisma.contentItem.update({
          where: { id: entityId },
          data: { [field]: data[field] }
        })
      } else {
        await prisma.contentItem.update({
          where: { id: entityId },
          data
        })
      }
      break
    case 'delete':
      await prisma.contentItem.delete({
        where: { id: entityId }
      })
      break
    default:
      throw new Error(`Unknown operation type: ${type}`)
  }
}

async function applySyncToComment(type: string, entityId: string, data: any, field?: string) {
  switch (type) {
    case 'create':
      await prisma.comment.create({
        data: { ...data, id: entityId }
      })
      break
    case 'update':
      if (field) {
        await prisma.comment.update({
          where: { id: entityId },
          data: { [field]: data[field] }
        })
      } else {
        await prisma.comment.update({
          where: { id: entityId },
          data
        })
      }
      break
    case 'delete':
      await prisma.comment.delete({
        where: { id: entityId }
      })
      break
    default:
      throw new Error(`Unknown operation type: ${type}`)
  }
}

async function logSyncOperation(operation: any) {
  try {
    await prisma.activity.create({
      data: {
        type: 'UPDATE',
        action: operation.type,
        entityType: operation.entity,
        entityId: operation.entityId,
        userId: operation.userId,
        metadata: {
          operationId: operation.id,
          field: operation.field,
          version: operation.version,
          timestamp: operation.timestamp
        }
      }
    })
  } catch (error) {
    logger.error('Failed to log sync operation:', error)
    // Don't throw here as logging failure shouldn't break sync
  }
}

// GET endpoint to retrieve sync operations for a user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const since = searchParams.get('since')
    const entity = searchParams.get('entity')
    const entityId = searchParams.get('entityId')

    // Get recent sync operations for the user
    const activities = await prisma.activity.findMany({
      where: {
        userId: session.user.id,
        ...(since && { createdAt: { gte: new Date(since) } }),
        ...(entity && { entityType: entity }),
        ...(entityId && { entityId })
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    })

    const operations = activities.map(activity => ({
      id: operationIdFromMetadata(activity.metadata) || activity.id,
      type: activity.action,
      entity: activity.entityType,
      entityId: activity.entityId,
      userId: activity.userId,
      timestamp: activity.createdAt,
      metadata: activity.metadata
    }))

    return NextResponse.json({ operations })
  } catch (error) {
    logger.error('Failed to get sync operations:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve sync operations' },
      { status: 500 }
    )
  }
}

function operationIdFromMetadata(metadata: unknown): string | null {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const value = (metadata as Record<string, unknown>).operationId
    if (typeof value === 'string') return value
  }
  return null
}