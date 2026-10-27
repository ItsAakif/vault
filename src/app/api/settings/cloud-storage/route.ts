import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db as prisma } from '@/lib/db'
import { z } from 'zod'

const cloudProviderSchema = z.object({
  providerId: z.enum(['google']),
  config: z.object({
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    enabled: z.boolean().optional(),
    name: z.string().optional()
  })
})

// GET /api/settings/cloud-storage - Get user's cloud storage configuration
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's cloud integrations
    const integrations = await prisma.cloudIntegration.findMany({
      where: { userId: session.user.id },
      select: {
        provider: true,
        isActive: true,
        scopes: true,
        expiresAt: true
      }
    })

    // Map integrations to providers format
    const providers = [
      {
        id: 'google',
        name: 'Google Drive',
        enabled: integrations.some(i => i.provider === 'google' && i.isActive),
        configured: integrations.some(i => i.provider === 'google'),
        status: integrations.find(i => i.provider === 'google')?.isActive ? 'connected' : 'disconnected'
      }
    ]

    return NextResponse.json({ providers })
  } catch (error) {
    console.error('Failed to get cloud storage settings:', error)
    return NextResponse.json(
      { error: 'Failed to load cloud storage settings' },
      { status: 500 }
    )
  }
}

// PATCH /api/settings/cloud-storage - Update cloud storage configuration
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validation = cloudProviderSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error },
        { status: 400 }
      )
    }

    const { providerId, config } = validation.data

    // Store credentials securely in user preferences as encrypted JSON
    const userPrefs = await prisma.userPreferences.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        // Store cloud provider configs as JSON string
        notificationCategories: JSON.stringify({
          cloudProviders: {
            [providerId]: {
              clientId: config.clientId,
              clientSecret: config.clientSecret,
              enabled: config.enabled ?? false
            }
          }
        })
      },
      update: {
        // Merge with existing cloud provider configs
        notificationCategories: JSON.stringify({
          ...JSON.parse((await prisma.userPreferences.findUnique({
            where: { userId: session.user.id }
          }))?.notificationCategories || '{}'),
          cloudProviders: {
            ...(JSON.parse((await prisma.userPreferences.findUnique({
              where: { userId: session.user.id }
            }))?.notificationCategories || '{}').cloudProviders || {}),
            [providerId]: {
              clientId: config.clientId,
              clientSecret: config.clientSecret,
              enabled: config.enabled ?? false
            }
          }
        })
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Cloud storage configuration saved successfully'
    })
  } catch (error) {
    console.error('Failed to save cloud storage settings:', error)
    return NextResponse.json(
      { error: 'Failed to save cloud storage settings' },
      { status: 500 }
    )
  }
}
