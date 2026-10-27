import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireDriveAccess, driveErrorResponse } from '@/lib/cloud-storage/drive-availability'
import { db } from '@/lib/db'
import { GoogleDriveContentAdapter } from '@/lib/google-drive-content-adapter'
import type { ContentItem } from '@/lib/google-drive-content-adapter'

interface RouteParams {
  params: Promise<{
    id: string
  }>
}

/*
 * T095/T102 - a by-id request addresses a file by id, so nothing here lists a category folder to
 * find it. The item's category is still needed (an update rewrites it, and a miss has to stay a
 * 404), and it comes from the cheapest source that already knows it, through the adapter:
 *
 *   1. the row a T101 listing cached - a note the page just listed needs no extra call at all;
 *   2. the file's own `appProperties.vault-category` (T098) - one metadata get the read wants
 *      anyway, which is also where the mime type comes from;
 *   3. the file's parent folder, for a note written before T098 - one cached folder query.
 *
 * `adapter.locateContentById` returns null for anything that is not the app's own markdown (a
 * missing file, an editors file, a non-markdown file, markdown outside the vault), and every verb
 * answers that with the pre-existing 404 - a miss never becomes a 500 and never a blank note.
 */

// GET /api/content/[id] - Get a specific content item from Google Drive
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

    try {
      // Create adapter and initialize
      const adapter = new GoogleDriveContentAdapter(oauth2Client, session.user.id)
      await adapter.initialize()

      // T102: located from the file itself (or a cached listing row), never by listing a category
      // folder to find an id the request already carried. `mimeType` comes with it, so the media
      // read below is one request even for a file with no list properties.
      const located = await adapter.locateContentById(id)

      if (!located) {
        return NextResponse.json({ error: 'Content item not found' }, { status: 404 })
      }

      // T098: a listing row no longer carries the note's body - it is built from the file's own
      // list properties, which hold metadata and never content. Opening a note is therefore the
      // one place the body is read, and it is read from Drive here.
      //
      // A file that cannot be read is not served: the listing used to skip it and this endpoint
      // answered 404, so 404 (not 500) is the contract this preserves.
      let item: ContentItem
      try {
        item = await adapter.getContent(id, located.categoryName, located.mimeType)
      } catch (readError) {
        console.error(`Content file ${id} could not be read:`, readError)
        return NextResponse.json({ error: 'Content item not found' }, { status: 404 })
      }

      return NextResponse.json(item)
    } catch (driveError: any) {
      console.error('Google Drive error:', driveError)
      return driveErrorResponse(driveError, 'Failed to retrieve content from Google Drive')
    }
  } catch (error) {
    console.error('Error fetching content item:', error)
    return NextResponse.json(
      { error: 'Failed to fetch content item' },
      { status: 500 }
    )
  }
}

// PATCH /api/content/[id] - Update a content item in Google Drive
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
    const { title, content, categoryId, tags, pinned, archived, status, priority } = body

    try {
      // Create adapter and initialize
      const adapter = new GoogleDriveContentAdapter(oauth2Client, session.user.id)
      await adapter.initialize()

      // T095/T102: the item's own metadata first; `categoryId`/`categoryName` in the body are the
      // update's own fields (and may name a move target), never the item's location.
      const located = await adapter.locateContentById(id)

      if (!located) {
        return NextResponse.json({ error: 'Content item not found' }, { status: 404 })
      }
      const itemCategory = located.categoryName

      // Build update object
      const updates: any = {}
      if (title !== undefined) updates.title = title
      if (content !== undefined) updates.content = content
      if (categoryId !== undefined) updates.categoryId = categoryId
      if (tags !== undefined) updates.tags = tags
      if (pinned !== undefined) updates.pinned = pinned
      if (archived !== undefined) updates.archived = archived
      if (status !== undefined) updates.status = status
      if (priority !== undefined) updates.priority = priority

      // Update content in Google Drive
      await adapter.updateContent(id, itemCategory, updates)

      // Fetch updated content
      const updated = await adapter.getContent(id, itemCategory, located.mimeType)
      return NextResponse.json(updated)
    } catch (driveError: any) {
      console.error('Google Drive error:', driveError)
      return driveErrorResponse(driveError, 'Failed to update content in Google Drive')
    }
  } catch (error) {
    console.error('Error updating content item:', error)
    return NextResponse.json(
      { error: 'Failed to update content item' },
      { status: 500 }
    )
  }
}

// DELETE /api/content/[id] - Delete a content item
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

    try {
      // Create adapter and initialize
      const adapter = new GoogleDriveContentAdapter(oauth2Client, session.user.id)
      await adapter.initialize()

      // T095/T102: located by id, so DELETE does not list a category folder to find the file either.
      const located = await adapter.locateContentById(id)

      if (!located) {
        return NextResponse.json({ error: 'Content item not found' }, { status: 404 })
      }

      // Delete content from Google Drive
      await adapter.deleteContent(id)

      return NextResponse.json({ success: true, message: 'Content deleted successfully' })
    } catch (driveError: any) {
      console.error('Google Drive error:', driveError)
      return driveErrorResponse(driveError, 'Failed to delete content from Google Drive')
    }
  } catch (error) {
    console.error('Error deleting content item:', error)
    return NextResponse.json(
      { error: 'Failed to delete content item' },
      { status: 500 }
    )
  }
}
