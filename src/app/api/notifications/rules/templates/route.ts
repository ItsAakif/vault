import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { notificationAutomationEngine } from '@/lib/notification-automation'

// GET /api/notifications/rules/templates - Get rule templates
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const templates = notificationAutomationEngine.getRuleTemplates()

    return NextResponse.json(templates)
  } catch (error) {
    console.error('Error fetching rule templates:', error)
    return NextResponse.json(
      { error: 'Failed to fetch rule templates' },
      { status: 500 }
    )
  }
}