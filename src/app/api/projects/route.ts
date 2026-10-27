import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireDriveAccess, isDriveGrantError, driveGrantInvalidBody } from '@/lib/cloud-storage/drive-availability'
import { GoogleDriveProjectsAdapter } from '@/lib/google-drive-projects-adapter'

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

    const adapter = new GoogleDriveProjectsAdapter(oauth2Client)
    await adapter.initialize()

    const projects = await adapter.listProjects()

    return NextResponse.json({ success: true, data: projects })
  } catch (error) {
    console.error('Error fetching projects:', error)
    if (isDriveGrantError(error)) {
      return NextResponse.json(driveGrantInvalidBody(), { status: 403 })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
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
    const { title, description, startDate, endDate, priority } = body

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const adapter = new GoogleDriveProjectsAdapter(oauth2Client)
    await adapter.initialize()

    const project = await adapter.createProject({
      title,
      description,
      startDate,
      endDate,
      priority,
      status: 'PLANNING',
      progress: 0,
      archived: false,
    })

    return NextResponse.json({ success: true, data: project })
  } catch (error) {
    console.error('Error creating project:', error)
    if (isDriveGrantError(error)) {
      return NextResponse.json(driveGrantInvalidBody(), { status: 403 })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}