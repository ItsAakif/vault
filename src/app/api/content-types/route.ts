import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { customContentTypeSchema } from '@/lib/validation-schemas'
import { z } from 'zod'

// GET /api/content-types - Get user's custom content types
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const customTypes = await db.customContentType.findMany({
      where: {
        userId: session.user.id,
        isActive: true
      },
      orderBy: [
        { sortOrder: 'asc' },
        { createdAt: 'asc' }
      ]
    })

    return NextResponse.json(customTypes)
  } catch (error) {
    console.error('Error fetching custom content types:', error)
    return NextResponse.json(
      { error: 'Failed to fetch custom content types' },
      { status: 500 }
    )
  }
}

// POST /api/content-types - Create new custom content type
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = customContentTypeSchema.parse(body)

    // Check if key already exists for this user
    const existingType = await db.customContentType.findFirst({
      where: {
        userId: session.user.id,
        key: validatedData.key
      }
    })

    if (existingType) {
      return NextResponse.json(
        { error: 'A content type with this key already exists' },
        { status: 409 }
      )
    }

    const customType = await db.customContentType.create({
      data: {
        ...validatedData,
        userId: session.user.id,
        isSystem: false
      }
    })

    return NextResponse.json(customType, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Error creating custom content type:', error)
    return NextResponse.json(
      { error: 'Failed to create custom content type' },
      { status: 500 }
    )
  }
}

// PUT /api/content-types - Update content type order
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { types } = z.object({
      types: z.array(z.object({
        id: z.string(),
        sortOrder: z.number()
      }))
    }).parse(body)

    // Update sort orders in a transaction
    await db.$transaction(
      types.map(({ id, sortOrder }) =>
        db.customContentType.update({
          where: {
            id,
            userId: session.user.id
          },
          data: { sortOrder }
        })
      )
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Error updating content type order:', error)
    return NextResponse.json(
      { error: 'Failed to update content type order' },
      { status: 500 }
    )
  }
}