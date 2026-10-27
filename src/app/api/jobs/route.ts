import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireDriveAccess, driveErrorResponse } from '@/lib/cloud-storage/drive-availability'
import { GoogleDriveJobsAdapter } from '@/lib/google-drive-jobs-adapter'

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

    const adapter = new GoogleDriveJobsAdapter(oauth2Client, session.user.id)
    await adapter.initialize()

    const jobs = await adapter.listJobs()

    return NextResponse.json(jobs)
  } catch (error) {
    console.error('Error fetching job opportunities:', error)
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
    const { title, company, description, location, salary, applicationUrl, applicationDate, deadline, stage, priority, notes } = body

    if (!title || !company) {
      return NextResponse.json({ error: 'Title and company are required' }, { status: 400 })
    }

    const adapter = new GoogleDriveJobsAdapter(oauth2Client, session.user.id)
    await adapter.initialize()

    const job = await adapter.createJob(
      title,
      company,
      description,
      stage || 'applied',
      salary,
      location,
      applicationUrl,
      deadline ? new Date(deadline) : undefined,
      notes
    )

    return NextResponse.json(job)
  } catch (error) {
    console.error('Error creating job opportunity:', error)
    return driveErrorResponse(error, 'Internal server error')
  }
}