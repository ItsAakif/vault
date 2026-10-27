import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireDriveAccess, driveErrorResponse } from '@/lib/cloud-storage/drive-availability'
import { GoogleDriveCategoriesAdapter } from '@/lib/google-drive-categories-adapter'

// GET /api/categories - Get all categories for a user
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
    const adapter = new GoogleDriveCategoriesAdapter(oauth2Client, session.user.id)
    await adapter.initialize()

    const categories = await adapter.listCategories()

    return NextResponse.json(categories)
  } catch (error) {
    console.error('Error fetching categories:', error)
    return driveErrorResponse(error, 'Failed to fetch categories')
  }
}

// POST /api/categories - Create a new category
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
    const { name, description, color, icon, parentId } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Category name is required' },
        { status: 400 }
      )
    }

    // Get authenticated Drive client
    const adapter = new GoogleDriveCategoriesAdapter(oauth2Client, session.user.id)
    await adapter.initialize()

    const category = await adapter.createCategory(
      name,
      description,
      color,
      icon,
      parentId || null
    )

    return NextResponse.json(category)
  } catch (error) {
    console.error('Error creating category:', error)
    return driveErrorResponse(error, 'Failed to create category')
  }
}