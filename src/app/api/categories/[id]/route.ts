import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireDriveAccess, driveErrorResponse } from '@/lib/cloud-storage/drive-availability'
import { GoogleDriveCategoriesAdapter } from '@/lib/google-drive-categories-adapter'

interface RouteParams {
  params: Promise<{
    id: string
  }>
}

// PUT /api/categories/[id] - Update a category
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
    const { name, description, color, icon } = body

    const adapter = new GoogleDriveCategoriesAdapter(oauth2Client, session.user.id)
    await adapter.initialize()

    const updatedCategory = await adapter.updateCategory(id, {
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(color && { color }),
      ...(icon !== undefined && { icon })
    })

    return NextResponse.json(updatedCategory)
  } catch (error) {
    console.error('Error updating category:', error)
    if (error instanceof Error) {
      if (error.message.includes('system')) {
        return NextResponse.json(
          { error: error.message },
          { status: 403 }
        )
      }
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: error.message },
          { status: 404 }
        )
      }
    }
    return driveErrorResponse(error, 'Failed to update category')
  }
}

// DELETE /api/categories/[id] - Delete a category
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

    const adapter = new GoogleDriveCategoriesAdapter(oauth2Client, session.user.id)
    await adapter.initialize()

    await adapter.deleteCategory(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting category:', error)
    if (error instanceof Error) {
      if (error.message.includes('system')) {
        return NextResponse.json(
          { error: error.message },
          { status: 403 }
        )
      }
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: error.message },
          { status: 404 }
        )
      }
      if (error.message.includes('subcategories')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        )
      }
    }
    return driveErrorResponse(error, 'Failed to delete category')
  }
}