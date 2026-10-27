import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { CalendarSyncService } from '@/lib/calendar-integrations'

// POST /api/calendar/integrations/[integrationId]/sync - Trigger sync
export async function POST(
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

    if (!integration.isActive) {
      return NextResponse.json({ error: 'Integration is not active' }, { status: 400 })
    }

    // Trigger sync
    const syncResult = await CalendarSyncService.syncIntegration(integrationId)

    return NextResponse.json({
      message: 'Sync completed',
      result: syncResult
    })
  } catch (error) {
    console.error('Error syncing calendar integration:', error)
    return NextResponse.json(
      { 
        error: 'Failed to sync integration',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}