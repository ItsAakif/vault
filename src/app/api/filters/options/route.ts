import { createApiRoute, apiResponse } from '@/lib/api-middleware'
import { db } from '@/lib/db'

export const GET = createApiRoute.protected(
  async (request, context) => {
    const url = new URL(request.url)
    const type = url.searchParams.get('type') // Optional content type filter

    try {
      // Build where clause for user's content
      const baseWhere = {
        userId: context.user!.id
      }

      // Get categories with counts
      const categoriesQuery = db.category.findMany({
        where: baseWhere,
        select: {
          id: true,
          name: true,
          color: true,
          _count: {
            select: {
              contentItems: true
            }
          }
        },
        orderBy: {
          name: 'asc'
        }
      })

      // Get tags with counts
      const tagsQuery = db.tag.findMany({
        where: baseWhere,
        select: {
          id: true,
          name: true,
          color: true,
          _count: {
            select: {
              contentItems: true
            }
          }
        },
        orderBy: {
          name: 'asc'
        }
      })

      // Get content type counts
      const contentTypesQuery = db.contentItem.groupBy({
        by: ['type'],
        where: baseWhere,
        _count: {
          type: true
        }
      })

      // Get project status counts
      const projectStatusQuery = db.project.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: {
          status: true
        }
      })

      // Get job application status counts
      const jobStatusQuery = db.jobOpportunity.groupBy({
        by: ['applicationStatus'],
        where: baseWhere,
        _count: {
          applicationStatus: true
        }
      })

      // Get priority counts across all content
      const priorityQuery = Promise.all([
        db.contentItem.groupBy({
          by: ['priority'],
          where: baseWhere,
          _count: { priority: true }
        }),
        db.project.groupBy({
          by: ['priority'],
          where: baseWhere,
          _count: { priority: true }
        }),
        db.jobOpportunity.groupBy({
          by: ['priority'],
          where: baseWhere,
          _count: { priority: true }
        })
      ])

      // Get authors (users who have created content)
      const authorsQuery = db.user.findMany({
        where: {
          OR: [
            { contentItems: { some: { userId: context.user!.id } } },
            { projects: { some: { userId: context.user!.id } } },
            { jobs: { some: { userId: context.user!.id } } },
            { calendarEvents: { some: { userId: context.user!.id } } }
          ]
        },
        select: {
          id: true,
          name: true,
          email: true,
          _count: {
            select: {
              contentItems: true,
              projects: true,
              jobs: true,
              calendarEvents: true
            }
          }
        },
        orderBy: {
          name: 'asc'
        }
      })

      // Execute all queries
      const [
        categories,
        tags,
        contentTypes,
        projectStatuses,
        jobStatuses,
        priorityResults,
        authors
      ] = await Promise.all([
        categoriesQuery,
        tagsQuery,
        contentTypesQuery,
        projectStatusQuery,
        jobStatusQuery,
        priorityQuery,
        authorsQuery
      ])

      // Process priority counts
      const priorityCounts: Record<string, number> = {}
      priorityResults.forEach(results => {
        results.forEach(result => {
          priorityCounts[result.priority] = (priorityCounts[result.priority] || 0) + result._count.priority
        })
      })

      // Format response
      const response = {
        categories: categories.map(cat => ({
          value: cat.id,
          label: cat.name,
          count: cat._count.contentItems,
          color: cat.color
        })),

        tags: tags.map(tag => ({
          value: tag.id,
          label: tag.name,
          count: tag._count.contentItems,
          color: tag.color
        })),

        types: [
          ...contentTypes.map(ct => ({
            value: ct.type.toLowerCase(),
            label: formatContentType(ct.type),
            count: ct._count.type
          })),
          ...projectStatuses.map(ps => ({
            value: 'project',
            label: 'Projects',
            count: ps._count.status
          })).slice(0, 1), // Only add once
          ...jobStatuses.map(js => ({
            value: 'job',
            label: 'Job Opportunities', 
            count: js._count.applicationStatus
          })).slice(0, 1) // Only add once
        ].reduce((acc, curr) => {
          const existing = acc.find(item => item.value === curr.value)
          if (existing) {
            existing.count += curr.count
          } else {
            acc.push(curr)
          }
          return acc
        }, [] as Array<{ value: string; label: string; count: number }>),

        statuses: [
          // Content statuses
          { value: 'DRAFT', label: 'Draft', count: 0, type: 'content' },
          { value: 'PUBLISHED', label: 'Published', count: 0, type: 'content' },
          { value: 'ARCHIVED', label: 'Archived', count: 0, type: 'content' },
          
          // Project statuses
          ...projectStatuses.map(ps => ({
            value: ps.status,
            label: formatStatus(ps.status),
            count: ps._count.status,
            type: 'project'
          })),
          
          // Job statuses
          ...jobStatuses.map(js => ({
            value: js.applicationStatus,
            label: formatStatus(js.applicationStatus),
            count: js._count.applicationStatus,
            type: 'job'
          }))
        ],

        priorities: Object.entries(priorityCounts).map(([priority, count]) => ({
          value: priority,
          label: formatPriority(priority),
          count
        })),

        authors: authors.map(author => ({
          value: author.id,
          label: author.name || author.email,
          count: author._count.contentItems + 
                 author._count.projects + 
                 author._count.jobs + 
                 author._count.calendarEvents
        }))
      }

      return apiResponse.success(response)

    } catch (error) {
      console.error('Error fetching filter options:', error)
      throw error
    }
  },
  {
    rateLimit: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 30 // 30 requests per minute
    }
  }
)

// Helper functions
function formatContentType(type: string): string {
  const typeMap: Record<string, string> = {
    'IDEA': 'Ideas',
    'POETRY': 'Poetry',
    'NOTE': 'Notes',
    'RESOURCE': 'Resources',
    'PROJECT': 'Projects',
    'JOB': 'Jobs',
    'DAILY': 'Daily Notes',
    'ARCHIVE': 'Archive'
  }
  return typeMap[type] || type
}

function formatStatus(status: string): string {
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function formatPriority(priority: string): string {
  const priorityMap: Record<string, string> = {
    'LOW': 'Low Priority',
    'MEDIUM': 'Medium Priority', 
    'HIGH': 'High Priority',
    'CRITICAL': 'Critical Priority'
  }
  return priorityMap[priority] || priority
}