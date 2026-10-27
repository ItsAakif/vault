import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const preferencesSchema = z.object({
  disabledContentTypes: z.array(z.string()).optional(),
  theme: z.string().optional(),
  language: z.string().optional(),
  timezone: z.string().optional(),
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  inAppNotifications: z.boolean().optional(),
  digestNotifications: z.boolean().optional(),
  mentionNotifications: z.boolean().optional(),
  profileVisibility: z.string().optional(),
  activityTracking: z.boolean().optional(),
  dataCollection: z.boolean().optional(),
  sidebarCollapsed: z.boolean().optional(),
  defaultView: z.string().optional(),
  itemsPerPage: z.number().optional(),
  autoSave: z.boolean().optional(),
  autoSaveInterval: z.number().optional(),
  keyboardShortcuts: z.boolean().optional()
})

// GET /api/user/preferences - Get user preferences
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!(session?.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const preferences = await db.userPreferences.findUnique({
      where: { userId: (session!.user as any).id }
    })

    if (!preferences) {
      // Return default preferences if none exist
      return NextResponse.json({
        disabledContentTypes: [],
        theme: 'system',
        language: 'en',
        timezone: 'UTC',
        emailNotifications: true,
        pushNotifications: true,
        inAppNotifications: true,
        digestNotifications: false,
        mentionNotifications: true,
        profileVisibility: 'private',
        activityTracking: true,
        dataCollection: true,
        sidebarCollapsed: false,
        defaultView: 'dashboard',
        itemsPerPage: 20,
        autoSave: true,
        autoSaveInterval: 30,
        keyboardShortcuts: true
      })
    }

    // Parse existing JSON fields and add disabledContentTypes
    let notificationCategories = {}
    let quietHours = {}
    let disabledContentTypes: string[] = []

    try {
      notificationCategories = JSON.parse(preferences.notificationCategories)
    } catch (e) {
      notificationCategories = {}
    }

    try {
      quietHours = JSON.parse(preferences.quietHours)
    } catch (e) {
      quietHours = {}
    }

    // Extract disabledContentTypes from notification categories or create new field
    try {
      const categories = JSON.parse(preferences.notificationCategories)
      disabledContentTypes = categories.disabledContentTypes || []
    } catch (e) {
      disabledContentTypes = []
    }

    return NextResponse.json({
      disabledContentTypes,
      theme: preferences.theme,
      language: preferences.language,
      timezone: preferences.timezone,
      emailNotifications: preferences.emailNotifications,
      pushNotifications: preferences.pushNotifications,
      inAppNotifications: preferences.inAppNotifications,
      digestNotifications: preferences.digestNotifications,
      mentionNotifications: preferences.mentionNotifications,
      profileVisibility: preferences.profileVisibility,
      activityTracking: preferences.activityTracking,
      dataCollection: preferences.dataCollection,
      sidebarCollapsed: preferences.sidebarCollapsed,
      defaultView: preferences.defaultView,
      itemsPerPage: preferences.itemsPerPage,
      autoSave: preferences.autoSave,
      autoSaveInterval: preferences.autoSaveInterval,
      keyboardShortcuts: preferences.keyboardShortcuts,
      notificationCategories,
      quietHours
    })
  } catch (error) {
    console.error('Error fetching user preferences:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user preferences' },
      { status: 500 }
    )
  }
}

// PATCH /api/user/preferences - Update user preferences
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!(session?.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = preferencesSchema.parse(body)

    // Get existing preferences
    const existingPreferences = await db.userPreferences.findUnique({
      where: { userId: (session!.user as any).id }
    })

    // Handle disabledContentTypes specially - store in notificationCategories JSON
    let notificationCategories = {}
    if (existingPreferences?.notificationCategories) {
      try {
        notificationCategories = JSON.parse(existingPreferences.notificationCategories)
      } catch (e) {
        notificationCategories = {}
      }
    }

    if (validatedData.disabledContentTypes !== undefined) {
      notificationCategories = {
        ...notificationCategories,
        disabledContentTypes: validatedData.disabledContentTypes
      }
    }

    // Prepare update data
    const updateData: any = {}
    
    if (validatedData.theme !== undefined) updateData.theme = validatedData.theme
    if (validatedData.language !== undefined) updateData.language = validatedData.language
    if (validatedData.timezone !== undefined) updateData.timezone = validatedData.timezone
    if (validatedData.emailNotifications !== undefined) updateData.emailNotifications = validatedData.emailNotifications
    if (validatedData.pushNotifications !== undefined) updateData.pushNotifications = validatedData.pushNotifications
    if (validatedData.inAppNotifications !== undefined) updateData.inAppNotifications = validatedData.inAppNotifications
    if (validatedData.digestNotifications !== undefined) updateData.digestNotifications = validatedData.digestNotifications
    if (validatedData.mentionNotifications !== undefined) updateData.mentionNotifications = validatedData.mentionNotifications
    if (validatedData.profileVisibility !== undefined) updateData.profileVisibility = validatedData.profileVisibility
    if (validatedData.activityTracking !== undefined) updateData.activityTracking = validatedData.activityTracking
    if (validatedData.dataCollection !== undefined) updateData.dataCollection = validatedData.dataCollection
    if (validatedData.sidebarCollapsed !== undefined) updateData.sidebarCollapsed = validatedData.sidebarCollapsed
    if (validatedData.defaultView !== undefined) updateData.defaultView = validatedData.defaultView
    if (validatedData.itemsPerPage !== undefined) updateData.itemsPerPage = validatedData.itemsPerPage
    if (validatedData.autoSave !== undefined) updateData.autoSave = validatedData.autoSave
    if (validatedData.autoSaveInterval !== undefined) updateData.autoSaveInterval = validatedData.autoSaveInterval
    if (validatedData.keyboardShortcuts !== undefined) updateData.keyboardShortcuts = validatedData.keyboardShortcuts

    // Always update notificationCategories if disabledContentTypes was provided
    if (validatedData.disabledContentTypes !== undefined) {
      updateData.notificationCategories = JSON.stringify(notificationCategories)
    }

    const updatedPreferences = await db.userPreferences.upsert({
      where: { userId: (session!.user as any).id },
      update: updateData,
      create: {
        userId: (session!.user as any).id,
        ...updateData,
        notificationCategories: JSON.stringify(notificationCategories)
      }
    })

    return NextResponse.json({ success: true, preferences: updatedPreferences })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Error updating user preferences:', error)
    return NextResponse.json(
      { error: 'Failed to update user preferences' },
      { status: 500 }
    )
  }
}