import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { smartReminderSystem } from '@/lib/smart-reminders'
import { z } from 'zod'

const createReminderSchema = z.object({
  type: z.enum(['event', 'task', 'location', 'custom']),
  entityId: z.string().optional(),
  title: z.string().min(1),
  message: z.string().min(1),
  triggerTime: z.string().optional(),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    radius: z.number()
  }).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium')
})

// GET /api/reminders - Get user's reminders
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

    const reminders = await db.notification.findMany({
      where: {
        userId: user.id,
        type: {
          in: ['CALENDAR_REMINDER', 'TASK_DUE']
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    })

    return NextResponse.json(reminders)
  } catch (error) {
    console.error('Error fetching reminders:', error)
    return NextResponse.json(
      { error: 'Failed to fetch reminders' },
      { status: 500 }
    )
  }
}

// POST /api/reminders - Create new reminder
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
    const validatedData = createReminderSchema.parse(body)

    let reminder

    switch (validatedData.type) {
      case 'event':
        if (!validatedData.entityId) {
          return NextResponse.json({ error: 'Event ID required' }, { status: 400 })
        }
        await smartReminderSystem.createEventReminders(validatedData.entityId, user.id)
        reminder = { message: 'Event reminders created' }
        break

      case 'task':
        if (!validatedData.entityId) {
          return NextResponse.json({ error: 'Task ID required' }, { status: 400 })
        }
        await smartReminderSystem.createTaskReminders(validatedData.entityId, user.id)
        reminder = { message: 'Task reminders created' }
        break

      case 'location':
        if (!validatedData.location) {
          return NextResponse.json({ error: 'Location required' }, { status: 400 })
        }
        await smartReminderSystem.createLocationReminder(
          validatedData.title,
          validatedData.location,
          user.id,
          validatedData.message
        )
        reminder = { message: 'Location reminder created' }
        break

      case 'custom':
        reminder = await db.notification.create({
          data: {
            type: 'CALENDAR_REMINDER',
            title: validatedData.title,
            message: validatedData.message,
            priority: validatedData.priority.toUpperCase() as any,
            userId: user.id,
            data: JSON.stringify({
              triggerTime: validatedData.triggerTime,
              customReminder: true
            })
          }
        })
        break
    }

    return NextResponse.json(reminder, { status: 201 })
  } catch (error) {
    console.error('Error creating reminder:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to create reminder' },
      { status: 500 }
    )
  }
}