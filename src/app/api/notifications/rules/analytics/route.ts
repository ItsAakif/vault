import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { notificationAutomationEngine } from '@/lib/notification-automation'

// GET /api/notifications/rules/analytics - Get rule performance analytics
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')

    const analytics = await notificationAutomationEngine.analyzeRulePerformance(user.id, days)

    return NextResponse.json(analytics)
  } catch (error) {
    console.error('Error fetching rule analytics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch rule analytics' },
      { status: 500 }
    )
  }
}