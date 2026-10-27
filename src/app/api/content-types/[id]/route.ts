import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { customContentTypeSchema } from '@/lib/validation-schemas'
import { z } from 'zod'

// GET /api/content-types/[id] - Get specific custom content type
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

    const customType = await db.customContentType.findFirst({
      where: {
        id: id,
        userId: session.user.id
      },
      include: {
        _count: {
          select: {
            contentItems: true
          }
        }
      }
    })

    if (!customType) {
      return NextResponse.json(
        { error: 'Custom content type not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(customType)
  } catch (error) {
    console.error('Error fetching custom content type:', error)
    return NextResponse.json(
      { error: 'Failed to fetch custom content type' },
      { status: 500 }
    )
  }
}

// PATCH /api/content-types/[id] - Update custom content type
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

    const body = await request.json()
    const validatedData = customContentTypeSchema.partial().parse(body)

    // Check if user owns this custom type
    const existingType = await db.customContentType.findFirst({
      where: {
        id: id,
        userId: session.user.id
      }
    })

    if (!existingType) {
      return NextResponse.json(
        { error: 'Custom content type not found' },
        { status: 404 }
      )
    }

    // If updating key, check for conflicts
    if (validatedData.key && validatedData.key !== existingType.key) {
      const conflictingType = await db.customContentType.findFirst({
        where: {
          userId: session.user.id,
          key: validatedData.key,
          id: { not: id }
        }
      })

      if (conflictingType) {
        return NextResponse.json(
          { error: 'A content type with this key already exists' },
          { status: 409 }
        )
      }
    }

    const updatedType = await db.customContentType.update({
      where: {
        id: id,
        userId: session.user.id
      },
      data: validatedData
    })

    return NextResponse.json(updatedType)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Error updating custom content type:', error)
    return NextResponse.json(
      { error: 'Failed to update custom content type' },
      { status: 500 }
    )
  }
}

// DELETE /api/content-types/[id] - Delete custom content type
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

    // Check if user owns this custom type
    const existingType = await db.customContentType.findFirst({
      where: {
        id: id,
        userId: session.user.id
      },
      include: {
        _count: {
          select: {
            contentItems: true
          }
        }
      }
    })

    if (!existingType) {
      return NextResponse.json(
        { error: 'Custom content type not found' },
        { status: 404 }
      )
    }

    // Check if there are content items using this type
    if (existingType._count.contentItems > 0) {
      return NextResponse.json(
        { 
          error: 'Cannot delete content type that has associated content items',
          details: `${existingType._count.contentItems} item(s) are using this content type`
        },
        { status: 409 }
      )
    }

    await db.customContentType.delete({
      where: {
        id: id,
        userId: session.user.id
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting custom content type:', error)
    return NextResponse.json(
      { error: 'Failed to delete custom content type' },
      { status: 500 }
    )
  }
}