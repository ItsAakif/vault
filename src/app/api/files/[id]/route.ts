import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { unlink } from 'fs/promises'
import path from 'path'

interface RouteParams {
  params: Promise<{
    id: string
  }>
}

// DELETE /api/files/[id] - Delete a file
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const file = await db.file.findFirst({
      where: {
        id: id,
        userId: session.user.id
      }
    })

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Delete physical file
    try {
      const filePath = path.join(process.cwd(), 'public', file.path)
      await unlink(filePath)
    } catch (error) {
      console.error('Error deleting physical file:', error)
      // Continue with database deletion even if physical file deletion fails
    }

    // Delete thumbnail if it exists
    if (file.thumbnail) {
      try {
        const thumbnailPath = path.join(process.cwd(), 'public', file.thumbnail)
        await unlink(thumbnailPath)
      } catch (error) {
        console.error('Error deleting thumbnail:', error)
      }
    }

    // Delete file record from database
    await db.file.delete({
      where: { id: id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting file:', error)
    return NextResponse.json(
      { error: 'Failed to delete file' },
      { status: 500 }
    )
  }
}

// PATCH /api/files/[id] - Update file metadata
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { originalName, contentItemId } = body

    const file = await db.file.findFirst({
      where: {
        id: id,
        userId: session.user.id
      }
    })

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const updateData: any = {}
    if (originalName !== undefined) updateData.originalName = originalName
    if (contentItemId !== undefined) updateData.contentItemId = contentItemId

    const updatedFile = await db.file.update({
      where: { id: id },
      data: updateData
    })

    return NextResponse.json(updatedFile)
  } catch (error) {
    console.error('Error updating file:', error)
    return NextResponse.json(
      { error: 'Failed to update file' },
      { status: 500 }
    )
  }
}