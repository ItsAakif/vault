import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireDriveAccess, driveErrorResponse } from '@/lib/cloud-storage/drive-availability'
import { GoogleDriveJobsAdapter } from '@/lib/google-drive-jobs-adapter'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const adapter = new GoogleDriveJobsAdapter(oauth2Client, session.user.id)
    await adapter.initialize()

    const job = await adapter.getJob(id)

    if (!job) {
      return NextResponse.json({ error: 'Job opportunity not found' }, { status: 404 })
    }

    return NextResponse.json(job)
  } catch (error) {
    console.error('Error fetching job opportunity:', error)
    return driveErrorResponse(error, 'Internal server error')
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { title, company, description, location, salary, applicationUrl, applicationDate, deadline, stage, priority, notes } = body

    const adapter = new GoogleDriveJobsAdapter(oauth2Client, session.user.id)
    await adapter.initialize()

    const updatedJob = await adapter.updateJob(id, {
      ...(title && { title }),
      ...(company && { company }),
      ...(description !== undefined && { description }),
      ...(location !== undefined && { location }),
      ...(salary !== undefined && { salary }),
      ...(applicationUrl !== undefined && { applicationUrl: applicationUrl }),
      ...(applicationDate && { dateApplied: new Date(applicationDate) }),
      ...(deadline !== undefined && { dateDeadline: deadline ? new Date(deadline) : undefined }),
      ...(stage && { status: stage as any }),
      ...(notes !== undefined && { notes })
    })

    return NextResponse.json(updatedJob)
  } catch (error) {
    console.error('Error updating job opportunity:', error)
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    return driveErrorResponse(error, 'Internal server error')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const adapter = new GoogleDriveJobsAdapter(oauth2Client, session.user.id)
    await adapter.initialize()

    await adapter.deleteJob(id)

    return NextResponse.json({ message: 'Job opportunity deleted successfully' })
  } catch (error) {
    console.error('Error deleting job opportunity:', error)
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    return driveErrorResponse(error, 'Internal server error')
  }
}