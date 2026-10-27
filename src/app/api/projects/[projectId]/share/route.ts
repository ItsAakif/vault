import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db as prisma } from '@/lib/db'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import bcrypt from 'bcryptjs'

const createShareLinkSchema = z.object({
  permission: z.enum(['VIEW', 'COMMENT', 'EDIT']),
  expiresAt: z.string().datetime().optional(),
  password: z.string().optional(),
  maxViews: z.number().positive().optional(),
  message: z.string().optional()
})

const inviteUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['VIEWER', 'COMMENTER', 'EDITOR']),
  message: z.string().optional()
})

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
    const { action } = body

    // Verify project ownership or editor access
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { userId: session.user.id },
          {
            collaborators: {
              some: {
                userId: session.user.id,
                role: { in: ['OWNER', 'EDITOR'] }
              }
            }
          }
        ]
      }
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 })
    }

    if (action === 'create_link') {
      const validatedData = createShareLinkSchema.parse(body)
      
      const shareData: any = {
        entityType: 'project',
        entityId: projectId,
        shareType: 'LINK',
        permission: validatedData.permission,
        token: nanoid(32),
        sharedById: session.user.id,
        expiresAt: validatedData.expiresAt ? new Date(validatedData.expiresAt) : null,
        maxViews: validatedData.maxViews,
        message: validatedData.message
      }

      if (validatedData.password) {
        shareData.password = await bcrypt.hash(validatedData.password, 10)
      }

      const shareLink = await prisma.share.create({
        data: shareData
      })

      return NextResponse.json({
        id: shareLink.id,
        token: shareLink.token,
        permission: shareLink.permission,
        expiresAt: shareLink.expiresAt,
        maxViews: shareLink.maxViews,
        viewCount: shareLink.viewCount,
        isActive: true
      }, { status: 201 })
    }

    if (action === 'invite_user') {
      const validatedData = inviteUserSchema.parse(body)
      
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: validatedData.email }
      })

      if (existingUser) {
        // Check if already a collaborator
        const existingCollaborator = await prisma.projectCollaborator.findUnique({
          where: {
            projectId_userId: {
              projectId,
              userId: existingUser.id
            }
          }
        })

        if (existingCollaborator) {
          return NextResponse.json({ error: 'User is already a collaborator' }, { status: 400 })
        }

        // Add as collaborator
        const collaborator = await prisma.projectCollaborator.create({
          data: {
            projectId,
            userId: existingUser.id,
            role: validatedData.role,
            permissions: JSON.stringify({
              canEdit: validatedData.role === 'EDITOR',
              canComment: ['EDITOR', 'COMMENTER'].includes(validatedData.role),
              canShare: validatedData.role === 'EDITOR',
              canManageMembers: false
            })
          },
          include: {
            user: true
          }
        })

        // Create notification
        await prisma.notification.create({
          data: {
            userId: existingUser.id,
            type: 'COLLABORATION_INVITE',
            title: 'Project Collaboration Invite',
            message: `You've been invited to collaborate on "${project.title}"`,
            data: JSON.stringify({
              projectId,
              projectTitle: project.title,
              invitedBy: session.user.name,
              role: validatedData.role,
              message: validatedData.message
            })
          }
        })

        return NextResponse.json({
          id: collaborator.id,
          userId: collaborator.userId,
          user: collaborator.user,
          role: collaborator.role,
          joinedAt: collaborator.joinedAt,
          permissions: collaborator.permissions
        }, { status: 201 })
      } else {
        // Create invitation for non-existing user
        // In a real app, you'd send an email invitation
        return NextResponse.json({ 
          message: 'Invitation sent to email address',
          email: validatedData.email 
        }, { status: 201 })
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Share error:', error)
    return NextResponse.json(
      { error: 'Failed to process sharing request' },
      { status: 500 }
    )
  }
}

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


    // Verify access
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

    // Get collaborators
    const collaborators = await prisma.projectCollaborator.findMany({
      where: { projectId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        }
      },
      orderBy: { joinedAt: 'asc' }
    })

    // Get share links
    const shareLinks = await prisma.share.findMany({
      where: {
        entityType: 'project',
        entityId: projectId
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({
      collaborators: collaborators.map(collab => ({
        id: collab.id,
        userId: collab.userId,
        user: collab.user,
        role: collab.role,
        joinedAt: collab.joinedAt,
        permissions: collab.permissions
      })),
      shareLinks: shareLinks.map(link => ({
        id: link.id,
        token: link.token,
        permission: link.permission,
        expiresAt: link.expiresAt,
        password: !!link.password,
        maxViews: link.maxViews,
        viewCount: link.viewCount,
        isActive: !link.expiresAt || new Date() < link.expiresAt
      }))
    })
  } catch (error) {
    console.error('Get sharing data error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sharing data' },
      { status: 500 }
    )
  }
}