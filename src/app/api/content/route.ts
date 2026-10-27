import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireDriveAccess, driveErrorResponse } from '@/lib/cloud-storage/drive-availability'
import { db } from '@/lib/db'
import { ContentType, ContentStatus, Priority } from '@/lib/db'
import { GoogleDriveContentAdapter } from '@/lib/google-drive-content-adapter'

// GET /api/content - Get all content items from Google Drive
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
    const categoryId = searchParams.get('categoryId')
    const type = searchParams.get('type') as ContentType | null
    const archived = searchParams.get('archived') === 'true'

    try {
      // Create adapter and initialize
      const adapter = new GoogleDriveContentAdapter(oauth2Client, session.user.id)
      await adapter.initialize()

      // T094: `categoryId` is a category *id* as the page sends it (`selectedCategory?.id`). Both
      // adapter calls below resolve id -> name before any folder lookup, so a valid selection is
      // scoped to its folder and a stale one falls back instead of inventing a folder.
      let items: any[] = []

      if (categoryId) {
        // Get content from specific category
        items = await adapter.listCategoryContent(categoryId)
      } else {
        // T094: the default view is "all content". '*' means the whole vault, which the adapter
        // enumerates across the category folders - the old `name contains '*'` matched no file name,
        // so this view was empty even when notes existed one level down.
        items = await adapter.searchContent('*')
      }

      // Filter by type if provided
      if (type) {
        items = items.filter(item => item.type === type)
      }

      // Filter by archived status
      if (archived) {
        items = items.filter(item => item.archived === archived)
      }

      // Sort by updatedAt descending
      items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

      return NextResponse.json(items)
    } catch (driveError: any) {
      console.error('Google Drive error:', driveError)
      return driveErrorResponse(driveError, 'Failed to retrieve content from Google Drive')
    }
  } catch (error) {
    console.error('Error fetching content items:', error)
    return NextResponse.json(
      { error: 'Failed to fetch content items' },
      { status: 500 }
    )
  }
}

// POST /api/content - Create a new content item in Google Drive

/** The fields `POST /api/content` reads from the request body. */
interface CreateContentRequestBody {
  title?: string
  content?: string
  type?: string
  categoryId?: string | null
  categoryName?: string | null
  customTypeId?: string | null
  tags?: string[]
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // A body the client cannot even serialise is the client's mistake. `request.json()` throws on
    // malformed JSON, and that used to escape to the outer catch and answer 500 "Failed to create
    // content item" - a server fault reported for a broken request. Answer 400 here instead, before
    // anything is read from Drive, so a malformed body can never create a note.
    let body: CreateContentRequestBody
    try {
      const parsed: unknown = await request.json()
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return NextResponse.json(
          { error: 'Request body must be a JSON object' },
          { status: 400 }
        )
      }
      body = parsed as CreateContentRequestBody
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    const { title, content, type, categoryId, categoryName, customTypeId, tags = [] } = body

    if (!title || !content || !type) {
      return NextResponse.json(
        { error: 'Title, content, and type are required' },
        { status: 400 }
      )
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

      // T094/T103: resolve the category BEFORE the write. The page posts a category id; the backend
      // addresses folders by name, so an unresolved id would create a folder named after the id and
      // hide the note. Unknown/stale ids fall back to the default category here.
      //
      // Resolution order (stated once, in `adapter.resolveCategory`): an explicit `categoryId`, then
      // an explicit `categoryName`, then the vault folder matching the content TYPE (`IDEA` ->
      // `Ideas`), then the default. Only a value that is actually a non-empty string counts as
      // "explicit" - the page sends `null` when nothing was picked, and `null` must not shadow the
      // type.
      const explicitCategory =
        [categoryId, categoryName].find(
          (value): value is string => typeof value === 'string' && value.trim() !== ''
        ) ?? null

      const resolvedCategory = await adapter.resolveCategory(explicitCategory, type)

      // Create content in Google Drive
      const fileId = await adapter.createContent(resolvedCategory, {
        title,
        content,
        type,
        // `null` and "absent" mean the same thing to the writer (the frontmatter omits an empty
        // category id), so the request's null is normalised to the optional field the metadata type
        // declares. Behaviour is unchanged: nothing is written for either.
        categoryId: categoryId ?? undefined,
        tags,
        status: 'DRAFT',
        priority: 'MEDIUM'
      })

      // Return result with generated ID
      const result = await adapter.getContent(fileId, resolvedCategory)
      return NextResponse.json(result, { status: 201 })
    } catch (driveError: any) {
      console.error('Google Drive error:', driveError)
      return driveErrorResponse(driveError, 'Failed to create content in Google Drive')
    }
  } catch (error) {
    console.error('Error creating content item:', error)
    return NextResponse.json(
      { error: 'Failed to create content item' },
      { status: 500 }
    )
  }
}