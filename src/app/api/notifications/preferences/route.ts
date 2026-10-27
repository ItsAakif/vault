import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { intelligentNotificationManager } from '@/lib/intelligent-notifications'
import { z } from 'zod'

const preferencesSchema = z.object({
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  inAppNotifications: z.boolean().optional(),
  digestNotifications: z.boolean().optional(),
  mentionNotifications: z.boolean().optional(),
  notificationCategories: z.record(z.string(), z.object({
    enabled: z.boolean(),
    channels: z.array(z.enum(['in-app', 'email', 'push', 'sms'])),
    quietHours: z.boolean(),
    grouping: z.boolean(),
    batching: z.boolean()
  })).optional(),
  quietHours: z.object({
    enabled: z.boolean(),
    start: z.string(),
    end: z.string(),
    days: z.array(z.number().min(0).max(6)),
    exceptions: z.array(z.string())
  }).optional(),
  maxNotificationsPerHour: z.number().min(1).max(100).optional()
})

// GET /api/notifications/preferences - Get user's notification preferences
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { email: session.user.email },
      include: { preferences: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const defaultCategories = intelligentNotificationManager.getDefaultCategories()
    const userCategories = intelligentNotificationManager.getUserCategories(user.preferences)

    const preferences = {
      emailNotifications: user.preferences?.emailNotifications ?? true,
      pushNotifications: user.preferences?.pushNotifications ?? true,
      inAppNotifications: user.preferences?.inAppNotifications ?? true,
      digestNotifications: user.preferences?.digestNotifications ?? false,
      mentionNotifications: user.preferences?.mentionNotifications ?? true,
      maxNotificationsPerHour: user.preferences?.maxNotificationsPerHour ?? 10,
      categories: userCategories,
      quietHours: user.preferences?.quietHours ? JSON.parse(user.preferences.quietHours as string) : {
        enabled: false,
        start: '22:00',
        end: '08:00',
        days: [0, 1, 2, 3, 4, 5, 6],
        exceptions: ['security', 'urgent']
      }
    }

    return NextResponse.json(preferences)
  } catch (error) {
    console.error('Error fetching notification preferences:', error)
    return NextResponse.json(
      { error: 'Failed to fetch preferences' },
      { status: 500 }
    )
  }
}

// PUT /api/notifications/preferences - Update user's notification preferences
export async function PUT(request: NextRequest) {
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
    const validatedData = preferencesSchema.parse(body)

    // Prepare update data
    const updateData: any = {}

    if (validatedData.emailNotifications !== undefined) {
      updateData.emailNotifications = validatedData.emailNotifications
    }
    if (validatedData.pushNotifications !== undefined) {
      updateData.pushNotifications = validatedData.pushNotifications
    }
    if (validatedData.inAppNotifications !== undefined) {
      updateData.inAppNotifications = validatedData.inAppNotifications
    }
    if (validatedData.digestNotifications !== undefined) {
      updateData.digestNotifications = validatedData.digestNotifications
    }
    if (validatedData.mentionNotifications !== undefined) {
      updateData.mentionNotifications = validatedData.mentionNotifications
    }
    if (validatedData.maxNotificationsPerHour !== undefined) {
      updateData.maxNotificationsPerHour = validatedData.maxNotificationsPerHour
    }
    if (validatedData.notificationCategories !== undefined) {
      updateData.notificationCategories = JSON.stringify(validatedData.notificationCategories)
    }
    if (validatedData.quietHours !== undefined) {
      updateData.quietHours = JSON.stringify(validatedData.quietHours)
    }

    // Update or create preferences
    const preferences = await db.userPreferences.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        ...updateData
      },
      update: updateData
    })

    return NextResponse.json(preferences)
  } catch (error) {
    console.error('Error updating notification preferences:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    )
  }
}