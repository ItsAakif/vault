import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { smartReminderSystem } from '@/lib/smart-reminders'
import { z } from 'zod'

const locationUpdateSchema = z.object({
  latitude: z.number(),
  longitude: z.number()
})

// POST /api/reminders/location - Update user location and trigger location-based reminders
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
    const { latitude, longitude } = locationUpdateSchema.parse(body)

    // Process location-based triggers
    await smartReminderSystem.processLocationTriggers(user.id, {
      latitude,
      longitude
    })

    // Update user's last known location (if you want to store it)
    await db.user.update({
      where: { id: user.id },
      data: {
        lastActive: new Date()
      }
    })

    return NextResponse.json({ message: 'Location updated successfully' })
  } catch (error) {
    console.error('Error updating location:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to update location' },
      { status: 500 }
    )
  }
}