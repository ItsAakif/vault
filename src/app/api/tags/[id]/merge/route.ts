import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

interface RouteParams {
  params: Promise<{
    id: string
  }>
}

// POST /api/tags/[id]/merge - Merge a tag into another tag
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { targetTagId } = body

    if (!targetTagId) {
      return NextResponse.json(
        { error: 'Target tag ID is required' },
        { status: 400 }
      )
    }

    if (targetTagId === id) {
      return NextResponse.json(
        { error: 'Cannot merge tag into itself' },
        { status: 400 }
      )
    }

    // Check if both tags exist and belong to user
    const sourceTag = await db.tag.findFirst({
      where: {
        id: id,
        userId: session.user.id
      }
    })

    const targetTag = await db.tag.findFirst({
      where: {
        id: targetTagId,
        userId: session.user.id
      }
    })

    if (!sourceTag || !targetTag) {
      return NextResponse.json(
        { error: 'One or both tags not found' },
        { status: 404 }
      )
    }

    // Get all content items with the source tag
    const contentItems = await db.contentItem.findMany({
      where: {
        tags: {
          some: {
            id: id
          }
        }
      }
    })

    // Add target tag and remove the source tag from all affected content items
    for (const item of contentItems) {
      await db.contentItem.update({
        where: { id: item.id },
        data: {
          tags: {
            connect: { id: targetTagId },
            disconnect: { id: id }
          }
        }
      })
    }

    // Delete the source tag
    await db.tag.delete({
      where: { id: id }
    })

    return NextResponse.json({ 
      success: true,
      message: `Merged ${sourceTag.name} into ${targetTag.name}`,
      affectedItems: contentItems.length
    })
  } catch (error) {
    console.error('Error merging tags:', error)
    return NextResponse.json(
      { error: 'Failed to merge tags' },
      { status: 500 }
    )
  }
}