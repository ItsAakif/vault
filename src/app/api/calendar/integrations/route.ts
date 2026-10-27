import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { CalendarSyncService } from '@/lib/calendar-integrations'
import { z } from 'zod'

const createIntegrationSchema = z.object({
  type: z.enum(['GOOGLE_CALENDAR', 'OUTLOOK_CALENDAR']),
  name: z.string().min(1),
  config: z.object({
    clientId: z.string(),
    clientSecret: z.string(),
    redirectUri: z.string(),
    scopes: z.array(z.string())
  }),
  credentials: z.object({}).passthrough(),
  calendarIds: z.array(z.string()).optional(),
  syncDirection: z.enum(['import', 'export', 'bidirectional']).default('bidirectional')
})

// GET /api/calendar/integrations - Get user's calendar integrations
export async function GET() {
  try {
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

    const integrations = await db.integration.findMany({
      where: {
        userId: user.id,
        type: {
          in: ['GOOGLE_CALENDAR', 'OUTLOOK_CALENDAR']
        }
      },
      select: {
        id: true,
        type: true,
        name: true,
        isActive: true,
        lastSync: true,
        syncStatus: true,
        syncDirection: true,
        calendarIds: true,
        createdAt: true,
        updatedAt: true
      }
    })

    return NextResponse.json(integrations)
  } catch (error) {
    console.error('Error fetching calendar integrations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch integrations' },
      { status: 500 }
    )
  }
}

// POST /api/calendar/integrations - Create new calendar integration
export async function POST(request: NextRequest) {
  try {
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
    const validatedData = createIntegrationSchema.parse(body)

    const integration = await db.integration.create({
      data: {
        type: validatedData.type,
        name: validatedData.name,
        config: JSON.stringify(validatedData.config),
        credentials: JSON.stringify(validatedData.credentials),
        calendarIds: validatedData.calendarIds,
        syncDirection: validatedData.syncDirection,
        userId: user.id
      }
    })

    return NextResponse.json(integration, { status: 201 })
  } catch (error) {
    console.error('Error creating calendar integration:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to create integration' },
      { status: 500 }
    )
  }
}