import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db as prisma } from '@/lib/db'

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
    
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const type = searchParams.get('type')
    const userId = searchParams.get('userId')
    
    const skip = (page - 1) * limit

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

    // Build where clause
    const whereClause: any = {
      OR: [
        { entityId: projectId },
        {
          metadata: {
            path: ['projectId'],
            equals: projectId
          }
        }
      ]
    }

    if (type) {
      whereClause.type = type
    }

    if (userId) {
      whereClause.userId = userId
    }

    // Get activities
    const activities = await prisma.activity.findMany({
      where: whereClause,
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
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    })

    // Get total count for pagination
    const totalCount = await prisma.activity.count({
      where: whereClause
    })

    // Enrich activities with entity titles
    const enrichedActivities = await Promise.all(
      activities.map(async (activity) => {
        let entityTitle = 'Unknown'
        
        try {
          switch (activity.entityType) {
            case 'project':
              const project = await prisma.project.findUnique({
                where: { id: activity.entityId },
                select: { title: true }
              })
              entityTitle = project?.title || 'Unknown Project'
              break
              
            case 'task':
              const task = await prisma.task.findUnique({
                where: { id: activity.entityId },
                select: { title: true }
              })
              entityTitle = task?.title || 'Unknown Task'
              break
              
            case 'content':
              const content = await prisma.contentItem.findUnique({
                where: { id: activity.entityId },
                select: { title: true }
              })
              entityTitle = content?.title || 'Unknown Content'
              break
              
            default:
              entityTitle = activity.entityType
          }
        } catch (error) {
          console.error('Error enriching activity:', error)
        }

        return {
          id: activity.id,
          type: activity.type,
          action: activity.action,
          entityType: activity.entityType,
          entityId: activity.entityId,
          entityTitle,
          user: activity.user,
          metadata: activity.metadata,
          createdAt: activity.createdAt
        }
      })
    )

    return NextResponse.json({
      activities: enrichedActivities,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
        hasMore: skip + limit < totalCount
      }
    })
  } catch (error) {
    console.error('Get activity error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch activity' },
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
    const { type, action, entityType, entityId, metadata } = body

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

    // Create activity record
    const activity = await prisma.activity.create({
      data: {
        userId: session.user.id,
        type,
        action,
        entityType,
        entityId,
        metadata: {
          ...metadata,
          projectId
        }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        }
      }
    })

    return NextResponse.json(activity, { status: 201 })
  } catch (error) {
    console.error('Create activity error:', error)
    return NextResponse.json(
      { error: 'Failed to create activity' },
      { status: 500 }
    )
  }
}