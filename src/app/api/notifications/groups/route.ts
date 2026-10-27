import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/notifications/groups - Get grouped notifications
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

    // Get notifications grouped by groupId
    const groupedNotifications = await db.notification.findMany({
      where: {
        userId: user.id,
        groupId: { not: null },
        data: { not: { contains: '"hidden":true' } }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    })

    // Group notifications by groupId
    const groups = groupedNotifications.reduce((acc, notification) => {
      const groupId = notification.groupId!
      if (!acc[groupId]) {
        acc[groupId] = []
      }
      acc[groupId].push(notification)
      return acc
    }, {} as Record<string, any[]>)

    // Format groups
    const formattedGroups = Object.entries(groups).map(([groupId, notifications]) => ({
      id: groupId,
      category: notifications[0].category,
      title: notifications[0].title,
      count: notifications.length,
      latestNotification: notifications[0],
      notifications: notifications,
      createdAt: notifications[0].createdAt,
      priority: notifications[0].priority
    }))

    return NextResponse.json(formattedGroups)
  } catch (error) {
    console.error('Error fetching grouped notifications:', error)
    return NextResponse.json(
      { error: 'Failed to fetch grouped notifications' },
      { status: 500 }
    )
  }
}

// POST /api/notifications/groups/[groupId]/mark-read - Mark all notifications in group as read
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params
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


    // Mark all notifications in group as read
    const result = await db.notification.updateMany({
      where: {
        userId: user.id,
        groupId: groupId
      },
      data: {
        read: true,
        readAt: new Date()
      }
    })

    return NextResponse.json({
      message: `Marked ${result.count} notifications as read`,
      updatedCount: result.count
    })
  } catch (error) {
    console.error('Error marking group as read:', error)
    return NextResponse.json(
      { error: 'Failed to mark group as read' },
      { status: 500 }
    )
  }
}