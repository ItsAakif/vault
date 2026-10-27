import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireDriveAccess, driveErrorResponse } from '@/lib/cloud-storage/drive-availability'
import { GoogleDriveTagsAdapter } from '@/lib/google-drive-tags-adapter'

// GET /api/tags - Get all tags for a user
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const includeUsage = searchParams.get('includeUsage') === 'true'

    const adapter = new GoogleDriveTagsAdapter(oauth2Client, session.user.id)
    await adapter.initialize()

    const tags = await adapter.listTags(includeUsage)

    return NextResponse.json(tags)
  } catch (error) {
    console.error('Error fetching tags:', error)
    return driveErrorResponse(error, 'Failed to fetch tags')
  }
}

// POST /api/tags - Create a new tag
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
    const { name, description, color, parentId } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Tag name is required' },
        { status: 400 }
      )
    }

    // Get authenticated Drive client
    const adapter = new GoogleDriveTagsAdapter(oauth2Client, session.user.id)
    await adapter.initialize()

    const tag = await adapter.createTag(name, color, description, parentId || null)

    return NextResponse.json(tag)
  } catch (error) {
    console.error('Error creating tag:', error)
    if (error instanceof Error && error.message.includes('already exists')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }
    return driveErrorResponse(error, 'Failed to create tag')
  }
}