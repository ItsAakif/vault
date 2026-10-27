import { createApiRoute, apiResponse } from '@/lib/api-middleware'
import { db } from '@/lib/db'
import { z } from 'zod'

const suggestionsSchema = z.object({
  query: z.string().min(1).max(200),
  includeContent: z.boolean().optional().default(false),
  includeRecent: z.boolean().optional().default(false),
  limit: z.number().min(1).max(20).optional().default(10)
})

export const POST = createApiRoute.protected(
  async (request, context) => {
    const body = await request.json()
    const { query, includeContent, includeRecent, limit } = suggestionsSchema.parse(body)

    try {
      const suggestions: any = {
        queries: [],
        content: [],
        tags: [],
        categories: [],
        users: []
      }

      // Query suggestions (based on common searches)
      const queryWords = query.toLowerCase().split(/\s+/)
      const commonQueries = [
        'project planning',
        'meeting notes',
        'quarterly review',
        'team collaboration',
        'task management',
        'deadline tracking',
        'progress update',
        'client feedback',
        'budget planning',
        'performance review'
      ]

      suggestions.queries = commonQueries
        .filter(q => queryWords.some(word => q.includes(word)))
        .slice(0, Math.floor(limit / 2))

      // Content suggestions
      if (includeContent) {
        const contentItems = await db.contentItem.findMany({
          where: {
            userId: context.user!.id,
            OR: [
              { title: { contains: query } },
              { content: { contains: query } }
            ]
          },
          select: {
            id: true,
            title: true,
            content: true,
            type: true,
            category: { select: { name: true } },
            user: { select: { name: true, email: true } },
            updatedAt: true
          },
          orderBy: { updatedAt: 'desc' },
          take: Math.floor(limit / 3)
        })

        suggestions.content = contentItems.map(item => ({
          id: item.id,
          title: item.title,
          excerpt: item.content.substring(0, 100) + (item.content.length > 100 ? '...' : ''),
          type: item.type.toLowerCase(),
          category: item.category?.name,
          author: item.user.name || item.user.email,
          updatedAt: item.updatedAt
        }))

        // Also search projects
        const projects = await db.project.findMany({
          where: {
            userId: context.user!.id,
            OR: [
              { title: { contains: query } },
              { description: { contains: query } }
            ]
          },
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            user: { select: { name: true, email: true } },
            updatedAt: true
          },
          orderBy: { updatedAt: 'desc' },
          take: Math.floor(limit / 4)
        })

        suggestions.content.push(...projects.map(project => ({
          id: project.id,
          title: project.title,
          excerpt: project.description?.substring(0, 100) + (project.description && project.description.length > 100 ? '...' : '') || '',
          type: 'project',
          status: project.status,
          author: project.user.name || project.user.email,
          updatedAt: project.updatedAt
        })))
      }

      // Tag suggestions
      const tags = await db.tag.findMany({
        where: {
          userId: context.user!.id,
          name: { contains: query }
        },
        select: {
          id: true,
          name: true,
          color: true,
          _count: { select: { contentItems: true } }
        },
        orderBy: { name: 'asc' },
        take: Math.floor(limit / 4)
      })

      suggestions.tags = tags.map(tag => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        count: tag._count.contentItems
      }))

      // Category suggestions
      const categories = await db.category.findMany({
        where: {
          userId: context.user!.id,
          name: { contains: query }
        },
        select: {
          id: true,
          name: true,
          color: true,
          _count: { select: { contentItems: true } }
        },
        orderBy: { name: 'asc' },
        take: Math.floor(limit / 4)
      })

      suggestions.categories = categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        color: cat.color,
        count: cat._count.contentItems
      }))

      // User suggestions (for collaboration)
      if (query.includes('@') || query.includes('user') || query.includes('author')) {
        const users = await db.user.findMany({
          where: {
            OR: [
              { name: { contains: query.replace('@', '') } },
              { email: { contains: query.replace('@', '') } }
            ]
          },
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            _count: {
              select: {
                contentItems: true,
                projects: true
              }
            }
          },
          take: Math.floor(limit / 4)
        })

        suggestions.users = users.map(user => ({
          id: user.id,
          name: user.name || user.email,
          email: user.email,
          avatar: user.avatar,
          contentCount: user._count.contentItems + user._count.projects
        }))
      }

      // Recent searches (mock implementation)
      if (includeRecent) {
        // In a real implementation, you'd store and retrieve recent searches
        suggestions.recent = [
          { query: 'project planning', timestamp: new Date(Date.now() - 1000 * 60 * 30) },
          { query: 'meeting notes', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2) },
          { query: 'quarterly review', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24) }
        ].filter(item => item.query.includes(query.toLowerCase()))
      }

      // Trending searches (mock implementation)
      suggestions.trending = [
        { query: 'quarterly review', count: 12 },
        { query: 'team collaboration', count: 8 },
        { query: 'project deadlines', count: 6 }
      ].filter(item => item.query.includes(query.toLowerCase()))

      return apiResponse.success(suggestions)

    } catch (error) {
      console.error('Error generating suggestions:', error)
      throw error
    }
  },
  {
    rateLimit: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 60 // 60 requests per minute (more lenient for suggestions)
    }
  }
)