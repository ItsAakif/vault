import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const updateIntegrationSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  calendarIds: z.array(z.string()).optional(),
  syncDirection: z.enum(['import', 'export', 'bidirectional']).optional(),
  config: z.object({}).passthrough().optional(),
  credentials: z.object({}).passthrough().optional()
})

// GET /api/calendar/integrations/[integrationId] - Get specific integration
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> }
) {
  try {
    const { integrationId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const integration = await db.integration.findFirst({
      where: {
        id: integrationId,
        userId: user.id
      },
      select: {
        id: true,
        type: true,
        name: true,
        config: true,
        isActive: true,
        lastSync: true,
        syncStatus: true,
        syncDirection: true,
        calendarIds: true,
        errorLog: true,
        createdAt: true,
        updatedAt: true
      }
    })

    if (!integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
    }

    return NextResponse.json(integration)
  } catch (error) {
    console.error('Error fetching calendar integration:', error)
    return NextResponse.json(
      { error: 'Failed to fetch integration' },
      { status: 500 }
    )
  }
}

// PUT /api/calendar/integrations/[integrationId] - Update integration
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> }
) {
  try {
    const { integrationId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const validatedData = updateIntegrationSchema.parse(body)

    const integration = await db.integration.findFirst({
      where: {
        id: integrationId,
        userId: user.id
      }
    })

    if (!integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
    }

    const updatedIntegration = await db.integration.update({
      where: { id: integrationId },
      data: validatedData
    })

    return NextResponse.json(updatedIntegration)
  } catch (error) {
    console.error('Error updating calendar integration:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to update integration' },
      { status: 500 }
    )
  }
}

// DELETE /api/calendar/integrations/[integrationId] - Delete integration
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> }
) {
  try {
    const { integrationId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const integration = await db.integration.findFirst({
      where: {
        id: integrationId,
        userId: user.id
      }
    })

    if (!integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
    }

    await db.integration.delete({
      where: { id: integrationId }
    })

    return NextResponse.json({ message: 'Integration deleted successfully' })
  } catch (error) {
    console.error('Error deleting calendar integration:', error)
    return NextResponse.json(
      { error: 'Failed to delete integration' },
      { status: 500 }
    )
  }
}