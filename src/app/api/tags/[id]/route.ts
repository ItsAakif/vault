import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireDriveAccess, driveErrorResponse } from '@/lib/cloud-storage/drive-availability'
import { GoogleDriveTagsAdapter } from '@/lib/google-drive-tags-adapter'

interface RouteParams {
  params: Promise<{
    id: string
  }>
}

// PUT /api/tags/[id] - Update a tag
export async function PUT(request: NextRequest, { params }: RouteParams) {
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
    const { name, description, color, parentId } = body

    const adapter = new GoogleDriveTagsAdapter(oauth2Client, session.user.id)
    await adapter.initialize()

    const updatedTag = await adapter.updateTag(id, {
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(color && { color }),
      ...(parentId !== undefined && { parentId })
    })

    return NextResponse.json(updatedTag)
  } catch (error) {
    console.error('Error updating tag:', error)
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: error.message },
          { status: 404 }
        )
      }
      if (error.message.includes('Circular') || error.message.includes('own parent')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        )
      }
    }
    return driveErrorResponse(error, 'Failed to update tag')
  }
}

// DELETE /api/tags/[id] - Delete a tag
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

    const adapter = new GoogleDriveTagsAdapter(oauth2Client, session.user.id)
    await adapter.initialize()

    await adapter.deleteTag(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting tag:', error)
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: error.message },
          { status: 404 }
        )
      }
      if (error.message.includes('child tags')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        )
      }
    }
    return driveErrorResponse(error, 'Failed to delete tag')
  }
}

// POST /api/tags/[id]/merge - Merge a tag into another tag
export async function POST(request: NextRequest, { params }: RouteParams) {
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
    const { targetTagId } = body

    if (!targetTagId) {
      return NextResponse.json(
        { error: 'Target tag ID is required' },
        { status: 400 }
      )
    }

    const adapter = new GoogleDriveTagsAdapter(oauth2Client, session.user.id)
    await adapter.initialize()

    const result = await adapter.mergeTags(id, targetTagId)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error merging tags:', error)
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: error.message },
        { status: 404 }
      )
    }
    return driveErrorResponse(error, 'Failed to merge tags')
  }
}

// POST /api/tags/[id]/merge - Merge a tag into another tag (handled above)
