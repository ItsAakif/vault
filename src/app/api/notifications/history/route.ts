import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { intelligentNotificationManager } from '@/lib/intelligent-notifications'

// GET /api/notifications/history - Get notification history and analytics
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

    const history = await intelligentNotificationManager.getNotificationHistory(user.id, days)

    return NextResponse.json(history)
  } catch (error) {
    console.error('Error fetching notification history:', error)
    return NextResponse.json(
      { error: 'Failed to fetch notification history' },
      { status: 500 }
    )
  }
}

// DELETE /api/notifications/history - Archive old notifications
export async function DELETE(request: NextRequest) {
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
    const olderThanDays = parseInt(searchParams.get('olderThanDays') || '30')

    const archivedCount = await intelligentNotificationManager.archiveOldNotifications(
      user.id,
      olderThanDays
    )

    return NextResponse.json({
      message: `Archived ${archivedCount} old notifications`,
      archivedCount
    })
  } catch (error) {
    console.error('Error archiving notifications:', error)
    return NextResponse.json(
      { error: 'Failed to archive notifications' },
      { status: 500 }
    )
  }
}