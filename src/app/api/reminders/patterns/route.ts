import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { smartReminderSystem } from '@/lib/smart-reminders'

// GET /api/reminders/patterns - Get user's notification patterns
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

    const patterns = await smartReminderSystem.analyzeUserPatterns(user.id)

    return NextResponse.json(patterns)
  } catch (error) {
    console.error('Error fetching user patterns:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user patterns' },
      { status: 500 }
    )
  }
}