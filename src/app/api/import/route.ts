import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { data, options = {} } = body
    
    if (!data || !data.metadata) {
      return NextResponse.json(
        { error: 'Invalid import data' },
        { status: 400 }
      )
    }

    const results = {
      contentItems: 0,
      projects: 0,
      jobs: 0,
      calendarEvents: 0,
      categories: 0,
      tags: 0,
      errors: [] as string[]
    }

    // Import categories first (they're referenced by content)
    if (data.categories && Array.isArray(data.categories)) {
      for (const category of data.categories) {
        try {
          await db.category.upsert({
            where: { id: category.id },
            update: {
              name: category.name,
              description: category.description,
              color: category.color,
              icon: category.icon,
              parentId: category.parentId,
              userId: session.user.id
            },
            create: {
              ...category,
              userId: session.user.id,
              createdAt: new Date(category.createdAt),
              updatedAt: new Date(category.updatedAt)
            }
          })
          results.categories++
        } catch (error) {
          results.errors.push(`Failed to import category ${category.name}: ${error}`)
        }
      }
    }

    // Import tags
    if (data.tags && Array.isArray(data.tags)) {
      for (const tag of data.tags) {
        try {
          await db.tag.upsert({
            where: { id: tag.id },
            update: {
              name: tag.name,
              description: tag.description,
              color: tag.color,
              parentId: tag.parentId,
              userId: session.user.id
            },
            create: {
              ...tag,
              userId: session.user.id,
              createdAt: new Date(tag.createdAt),
              updatedAt: new Date(tag.updatedAt)
            }
          })
          results.tags++
        } catch (error) {
          results.errors.push(`Failed to import tag ${tag.name}: ${error}`)
        }
      }
    }

    // Import content items
    if (data.contentItems && Array.isArray(data.contentItems)) {
      for (const item of data.contentItems) {
        try {
          await db.contentItem.upsert({
            where: { id: item.id },
            update: {
              title: item.title,
              content: item.content,
              type: item.type,
              status: item.status,
              categoryId: item.categoryId,
              userId: session.user.id
            },
            create: {
              ...item,
              userId: session.user.id,
              createdAt: new Date(item.createdAt),
              updatedAt: new Date(item.updatedAt)
            }
          })
          results.contentItems++
        } catch (error) {
          results.errors.push(`Failed to import content ${item.title}: ${error}`)
        }
      }
    }

    // Import projects
    if (data.projects && Array.isArray(data.projects)) {
      for (const project of data.projects) {
        try {
          const { tasks, milestones, ...projectData } = project
          
          await db.project.upsert({
            where: { id: project.id },
            update: {
              title: projectData.title,
              description: projectData.description,
              status: projectData.status,
              priority: projectData.priority,
              userId: session.user.id
            },
            create: {
              ...projectData,
              userId: session.user.id,
              createdAt: new Date(projectData.createdAt),
              updatedAt: new Date(projectData.updatedAt)
            }
          })
          
          // Import tasks
          if (tasks && Array.isArray(tasks)) {
            for (const task of tasks) {
              try {
                await db.task.upsert({
                  where: { id: task.id },
                  update: {
                    title: task.title,
                    description: task.description,
                    status: task.status,
                    priority: task.priority,
                    projectId: project.id
                  },
                  create: {
                    ...task,
                    projectId: project.id,
                    createdAt: new Date(task.createdAt),
                    updatedAt: new Date(task.updatedAt)
                  }
                })
              } catch (error) {
                results.errors.push(`Failed to import task ${task.title}: ${error}`)
              }
            }
          }
          
          results.projects++
        } catch (error) {
          results.errors.push(`Failed to import project ${project.title}: ${error}`)
        }
      }
    }

    // Import jobs
    if (data.jobs && Array.isArray(data.jobs)) {
      for (const job of data.jobs) {
        try {
          await db.jobOpportunity.upsert({
            where: { id: job.id },
            update: {
              title: job.title,
              company: job.company,
              location: job.location,
              salary: job.salary,
              userId: session.user.id
            },
            create: {
              ...job,
              userId: session.user.id,
              createdAt: new Date(job.createdAt),
              updatedAt: new Date(job.updatedAt)
            }
          })
          results.jobs++
        } catch (error) {
          results.errors.push(`Failed to import job ${job.title}: ${error}`)
        }
      }
    }

    // Import calendar events
    if (data.calendarEvents && Array.isArray(data.calendarEvents)) {
      for (const event of data.calendarEvents) {
        try {
          await db.calendarEvent.upsert({
            where: { id: event.id },
            update: {
              title: event.title,
              description: event.description,
              startTime: new Date(event.startTime),
              endTime: new Date(event.endTime),
              location: event.location,
              userId: session.user.id
            },
            create: {
              ...event,
              startTime: new Date(event.startTime),
              endTime: new Date(event.endTime),
              userId: session.user.id,
              createdAt: new Date(event.createdAt),
              updatedAt: new Date(event.updatedAt)
            }
          })
          results.calendarEvents++
        } catch (error) {
          results.errors.push(`Failed to import event ${event.title}: ${error}`)
        }
      }
    }

    return NextResponse.json({
      success: results.errors.length === 0,
      imported: results,
      message: `Successfully imported data. ${results.errors.length > 0 ? `${results.errors.length} errors occurred.` : ''}`
    })
  } catch (error) {
    console.error('Import error:', error)
    return NextResponse.json(
      { error: 'Import failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
