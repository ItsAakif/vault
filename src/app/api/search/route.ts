import { NextRequest } from 'next/server'
import { createApiRoute, apiResponse, apiErrors, commonValidation } from '@/lib/api-middleware'
import { searchEngine, SearchQuery } from '@/lib/search-engine'
import { db } from '@/lib/db'
import { z } from 'zod'

// Search request validation schema
const searchSchema = z.object({
  q: z.string().min(1, 'Search query is required').max(200, 'Query too long'),
  types: z.array(z.enum(['content', 'project', 'job', 'calendar'])).optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  status: z.array(z.string()).optional(),
  priority: z.array(z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.string().transform(Number).pipe(z.number().min(1)).optional(),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).optional(),
  sortBy: z.enum(['relevance', 'date', 'title']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional()
})

export const GET = createApiRoute.protected(
  async (request, context) => {
    const url = new URL(request.url)
    const params: Record<string, string | string[]> = Object.fromEntries(url.searchParams.entries())

    // Parse array parameters (they arrive as comma-separated strings)
    for (const key of ['types', 'categories', 'tags', 'status', 'priority'] as const) {
      const value = params[key]
      if (typeof value === 'string') params[key] = value.split(',')
    }

    // Validate search parameters
    const validation = searchSchema.safeParse(params)
    if (!validation.success) {
      throw apiErrors.validation(
        validation.error.issues.reduce((acc, err) => {
          acc[err.path.join('.')] = err.message
          return acc
        }, {} as Record<string, string>)
      )
    }

    const {
      q: query,
      types,
      categories,
      tags,
      status,
      priority,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
      sortBy = 'relevance',
      sortOrder = 'desc'
    } = validation.data

    // Build search query
    const searchQuery: SearchQuery = {
      query,
      filters: {
        contentTypes: types,
        categories,
        tags,
        status,
        priority,
        ...(dateFrom && dateTo && {
          dateRange: {
            start: new Date(dateFrom),
            end: new Date(dateTo)
          }
        }),
        userId: context.user!.id
      },
      pagination: {
        page,
        limit
      },
      ...(sortBy !== 'relevance' && {
        sorting: {
          field: sortBy,
          order: sortOrder
        }
      })
    }

    // Perform search
    const results = await searchEngine.search(searchQuery, context.user!.id)

    return apiResponse.success({
      query,
      results: results.results,
      totalCount: results.totalCount,
      facets: results.facets,
      suggestions: results.suggestions,
      searchTime: results.searchTime,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(results.totalCount / limit),
        hasNext: page * limit < results.totalCount,
        hasPrev: page > 1
      }
    })
  },
  {
    validation: {
      query: searchSchema
    },
    rateLimit: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 30 // 30 searches per minute
    }
  }
)

// Search suggestions endpoint
export const POST = createApiRoute.protected(
  async (request, context) => {
    const body = await request.json()
    const { query, limit = 5 } = body

    if (!query || typeof query !== 'string') {
      throw apiErrors.validation({ query: 'Query is required' })
    }

    if (query.length < 2) {
      return apiResponse.success({
        suggestions: []
      })
    }

    // Get search suggestions (simplified implementation)
    const suggestions = await generateSearchSuggestions(query, context.user!.id, limit)

    return apiResponse.success({
      suggestions
    })
  },
  {
    rateLimit: {
      windowMs: 60 * 1000,
      maxRequests: 60 // More lenient for suggestions
    }
  }
)

// Helper function to generate search suggestions
async function generateSearchSuggestions(
  query: string,
  userId: string,
  limit: number
): Promise<string[]> {
  const suggestions: string[] = []

  try {
    // Get suggestions from recent content titles
    const recentContent = await db.contentItem.findMany({
      where: {
        userId,
        title: {
          contains: query
        }
      },
      select: { title: true },
      orderBy: { updatedAt: 'desc' },
      take: limit
    })

    suggestions.push(...recentContent.map(c => c.title))

    // Get suggestions from project titles
    if (suggestions.length < limit) {
      const recentProjects = await db.project.findMany({
        where: {
          userId,
          title: {
            contains: query
          }
        },
        select: { title: true },
        orderBy: { updatedAt: 'desc' },
        take: limit - suggestions.length
      })

      suggestions.push(...recentProjects.map(p => p.title))
    }

    // Get suggestions from tags
    if (suggestions.length < limit) {
      const matchingTags = await db.tag.findMany({
        where: {
          userId,
          name: {
            contains: query
          }
        },
        select: { name: true },
        take: limit - suggestions.length
      })

      suggestions.push(...matchingTags.map(t => t.name))
    }

    // Remove duplicates and return
    return [...new Set(suggestions)].slice(0, limit)

  } catch (error) {
    console.error('Error generating search suggestions:', error)
    return []
  }
}