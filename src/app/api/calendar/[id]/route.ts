import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireDriveAccess, driveErrorResponse } from '@/lib/cloud-storage/drive-availability'
import { GoogleDriveCalendarAdapter } from '@/lib/google-drive-calendar-adapter'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/calendar/[id] - Get a specific calendar event
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
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

    const event = await adapter.getEvent(id)

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    return NextResponse.json(event)
  } catch (error) {
    console.error('Error fetching calendar event:', error)
    return driveErrorResponse(error, 'Internal server error')
  }
}

// PATCH /api/calendar/[id] - Update a calendar event
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
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

    const adapter = new GoogleDriveCalendarAdapter(oauth2Client, session.user.id)
    await adapter.initialize()

    const updatedEvent = await adapter.updateEvent(id, {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(startTime !== undefined && { startDate: new Date(startTime) }),
      ...(endTime !== undefined && { endDate: new Date(endTime) }),
      ...(location !== undefined && { location }),
      ...(allDay !== undefined && { isAllDay: allDay }),
      ...(attendees !== undefined && { attendees }),
      ...(reminders !== undefined && { reminders }),
      ...(recurrence !== undefined && { recurrence }),
      ...(color !== undefined && { color })
    })

    return NextResponse.json(updatedEvent)
  } catch (error) {
    console.error('Error updating calendar event:', error)
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    return driveErrorResponse(error, 'Internal server error')
  }
}

// DELETE /api/calendar/[id] - Delete a calendar event
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
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

    await adapter.deleteEvent(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting calendar event:', error)
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    return driveErrorResponse(error, 'Internal server error')
  }
}