import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db as prisma } from '@/lib/db'
import { z } from 'zod'

const createCommentSchema = z.object({
  content: z.string().min(1, 'Comment content is required'),
  entityType: z.string().default('project'),
  entityId: z.string(),
  parentId: z.string().optional()
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const entityType = searchParams.get('entityType') || 'project'
    const entityId = searchParams.get('entityId') || projectId

    // Verify access to project
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { userId: session.user.id },
          {
            collaborators: {
              some: {
                userId: session.user.id
              }
            }
          }
        ]
      }
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 })
    }

    // Get comments with nested replies
    const comments = await prisma.comment.findMany({
      where: {
        entityType,
        entityId,
        parentId: null // Only top-level comments
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        },
        replies: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: [
        { createdAt: 'desc' }
      ]
    })

    // Add like status and count (simplified - in real app you'd have a likes table)
    const commentsWithLikes = comments.map(comment => ({
      ...comment,
      likes: 0, // Placeholder
      isLiked: false, // Placeholder
      isPinned: false, // Placeholder
      replies: comment.replies.map(reply => ({
        ...reply,
        likes: 0,
        isLiked: false,
        isPinned: false
      }))
    }))

    return NextResponse.json(commentsWithLikes)
  } catch (error) {
    console.error('Get comments error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = createCommentSchema.parse({
      ...body,
      entityId: body.entityId || projectId
    })

    // Verify access to project
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { userId: session.user.id },
          {
            collaborators: {
              some: {
                userId: session.user.id,
                role: { in: ['OWNER', 'EDITOR', 'COMMENTER'] }
              }
            }
          }
        ]
      }
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 })
    }

    // Create comment
    const comment = await prisma.comment.create({
      data: {
        content: validatedData.content,
        entityType: validatedData.entityType,
        entityId: validatedData.entityId,
        parentId: validatedData.parentId,
        authorId: session.user.id
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        }
      }
    })

    // Create activity record
    await prisma.activity.create({
      data: {
        userId: session.user.id,
        type: 'COMMENT',
        action: 'commented',
        entityType: validatedData.entityType,
        entityId: validatedData.entityId,
        metadata: {
          projectId,
          commentId: comment.id,
          isReply: !!validatedData.parentId
        }
      }
    })

    // Notify other collaborators (except the author)
    const collaborators = await prisma.projectCollaborator.findMany({
      where: {
        projectId,
        userId: { not: session.user.id }
      },
      include: {
        user: true
      }
    })

    const notifications = collaborators.map(collab => ({
      userId: collab.userId,
      type: 'PROJECT_UPDATE' as const,
      title: 'New Comment',
      message: `${session.user.name} commented on "${project.title}"`,
      data: JSON.stringify({
        projectId,
        commentId: comment.id,
        entityType: validatedData.entityType,
        entityId: validatedData.entityId
      })
    }))

    if (notifications.length > 0) {
      await prisma.notification.createMany({
        data: notifications
      })
    }

    return NextResponse.json({
      ...comment,
      likes: 0,
      isLiked: false,
      isPinned: false,
      replies: []
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Create comment error:', error)
    return NextResponse.json(
      { error: 'Failed to create comment' },
      { status: 500 }
    )
  }
}