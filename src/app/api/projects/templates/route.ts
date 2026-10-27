import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db as prisma } from '@/lib/db'
import { z } from 'zod'

const createTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  description: z.string().min(1, 'Description is required'),
  category: z.string().min(1, 'Category is required'),
  isPublic: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  structure: z.object({
    tasks: z.array(z.object({
      title: z.string(),
      description: z.string().optional(),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
      estimatedHours: z.number().optional(),
      dependencies: z.array(z.string()).optional()
    })).default([]),
    milestones: z.array(z.object({
      title: z.string(),
      description: z.string().optional(),
      dueDate: z.string().optional()
    })).default([]),
    goals: z.array(z.object({
      title: z.string(),
      type: z.string(),
      targetValue: z.number(),
      unit: z.string()
    })).default([])
  })
})

const useTemplateSchema = z.object({
  templateId: z.string(),
  projectData: z.object({
    title: z.string().min(1, 'Project title is required'),
    description: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional()
  })
})

// ProjectTemplate.structure is a JSON string column; validate it on read.
const templateStructureSchema = createTemplateSchema.shape.structure

function parseTemplateStructure(raw: string): z.infer<typeof templateStructureSchema> {
  try {
    return templateStructureSchema.parse(JSON.parse(raw))
  } catch {
    return { tasks: [], milestones: [], goals: [] }
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const isPublic = searchParams.get('public')
    const search = searchParams.get('search')
    const starred = searchParams.get('starred')

    // Build where clause
    const whereClause: any = {
      OR: [
        { isPublic: true },
        { authorId: session.user.id }
      ]
    }

    if (category && category !== 'all') {
      whereClause.category = category
    }

    if (isPublic === 'true') {
      whereClause.isPublic = true
    }

    if (search) {
      whereClause.OR = [
        { name: { contains: search } },
        { description: { contains: search } }
      ]
    }

    // Get templates
    const templates = await prisma.projectTemplate.findMany({
      where: whereClause,
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
      orderBy: [
        { usageCount: 'desc' },
        { createdAt: 'desc' }
      ]
    })

    // Add starred status (simplified - in real app you'd have a user_template_stars table)
    const templatesWithStars = templates.map(template => ({
      ...template,
      isStarred: false // Placeholder
    }))

    return NextResponse.json(templatesWithStars)
  } catch (error) {
    console.error('Get templates error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action } = body

    if (action === 'create') {
      const validatedData = createTemplateSchema.parse(body)

      const template = await prisma.projectTemplate.create({
        data: {
          name: validatedData.name,
          description: validatedData.description,
          category: validatedData.category,
          isPublic: validatedData.isPublic,
          tags: JSON.stringify(validatedData.tags),
          structure: JSON.stringify(validatedData.structure),
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

      return NextResponse.json({
        ...template,
        isStarred: false
      }, { status: 201 })
    }

    if (action === 'use') {
      const validatedData = useTemplateSchema.parse(body)

      // Get template
      const template = await prisma.projectTemplate.findFirst({
        where: {
          id: validatedData.templateId,
          OR: [
            { isPublic: true },
            { authorId: session.user.id }
          ]
        }
      })

      if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      }

      // Create project from template
      const project = await prisma.project.create({
        data: {
          title: validatedData.projectData.title,
          description: validatedData.projectData.description,
          startDate: validatedData.projectData.startDate ? new Date(validatedData.projectData.startDate) : null,
          endDate: validatedData.projectData.endDate ? new Date(validatedData.projectData.endDate) : null,
          userId: session.user.id,
          status: 'PLANNING'
        }
      })

      // Create tasks/milestones/goals from the parsed template structure
      const structure = parseTemplateStructure(template.structure)

      if (structure.tasks.length > 0) {
        await prisma.task.createMany({
          data: structure.tasks.map((task) => ({
            title: task.title,
            description: task.description,
            priority: task.priority,
            estimatedHours: task.estimatedHours,
            projectId: project.id
          }))
        })
      }

      if (structure.milestones.length > 0) {
        await prisma.milestone.createMany({
          data: structure.milestones.map((milestone) => ({
            title: milestone.title,
            description: milestone.description,
            dueDate: milestone.dueDate ? new Date(milestone.dueDate) : new Date(),
            projectId: project.id
          }))
        })
      }

      if (structure.goals.length > 0) {
        await prisma.projectGoal.createMany({
          data: structure.goals.map((goal) => ({
            title: goal.title,
            type: goal.type,
            targetValue: goal.targetValue,
            unit: goal.unit,
            projectId: project.id
          }))
        })
      }

      // Increment usage count
      await prisma.projectTemplate.update({
        where: { id: template.id },
        data: { usageCount: { increment: 1 } }
      })

      // Create activity record
      await prisma.activity.create({
        data: {
          userId: session.user.id,
          type: 'CREATE',
          action: 'created project from template',
          entityType: 'project',
          entityId: project.id,
          metadata: {
            templateId: template.id,
            templateName: template.name
          }
        }
      })

      return NextResponse.json({
        project,
        message: 'Project created successfully from template'
      }, { status: 201 })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Template action error:', error)
    return NextResponse.json(
      { error: 'Failed to process template request' },
      { status: 500 }
    )
  }
}