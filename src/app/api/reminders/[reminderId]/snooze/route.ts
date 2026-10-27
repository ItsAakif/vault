import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { smartReminderSystem } from '@/lib/smart-reminders'
import { z } from 'zod'

const snoozeSchema = z.object({
  duration: z.string().optional()
})

// POST /api/reminders/[reminderId]/snooze - Snooze reminder
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reminderId: string }> }
) {
  try {
    const { reminderId } = await params
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
    const { duration } = snoozeSchema.parse(body)

    const result = await smartReminderSystem.snoozeNotification(
      reminderId,
      duration
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error snoozing reminder:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to snooze reminder' },
      { status: 500 }
    )
  }
}