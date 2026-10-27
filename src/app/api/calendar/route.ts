import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireDriveAccess, driveErrorResponse } from '@/lib/cloud-storage/drive-availability'
import { GoogleDriveCalendarAdapter } from '@/lib/google-drive-calendar-adapter'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ADR-008 D2: the canonical CloudIntegration row is the only Drive gate.
    const drive = await requireDriveAccess(session.user.id)
    if (!drive.ok) {
      return NextResponse.json(drive.body, { status: drive.status })
    }
    const oauth2Client = drive.client

    const adapter = new GoogleDriveCalendarAdapter(oauth2Client, session.user.id)
    await adapter.initialize()

    const events = await adapter.listEvents()

    return NextResponse.json(events)
  } catch (error) {
    console.error('Error fetching calendar events:', error)
    return driveErrorResponse(error, 'Internal server error')
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ADR-008 D2: the canonical CloudIntegration row is the only Drive gate.
    const drive = await requireDriveAccess(session.user.id)
    if (!drive.ok) {
      return NextResponse.json(drive.body, { status: drive.status })
    }
    const oauth2Client = drive.client

    const body = await request.json()
    const { title, description, startTime, endTime, location, allDay, attendees, reminders, recurrence, color } = body

    if (!title || !startTime || !endTime) {
      return NextResponse.json({ error: 'Title, start time, and end time are required' }, { status: 400 })
    }

    const adapter = new GoogleDriveCalendarAdapter(oauth2Client, session.user.id)
    await adapter.initialize()

    const event = await adapter.createEvent(
      title,
      new Date(startTime),
      new Date(endTime),
      description,
      location,
      attendees,
      reminders,
      allDay || false,
      recurrence,
      color
    )

    return NextResponse.json(event)
  } catch (error) {
    console.error('Error creating calendar event:', error)
    return driveErrorResponse(error, 'Internal server error')
  }
}