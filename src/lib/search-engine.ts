// Global search engine for Vault Command Center
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export interface SearchQuery {
  query: string
  filters?: {
    contentTypes?: string[]
    categories?: string[]
    tags?: string[]
    dateRange?: {
      start: Date
      end: Date
    }
    priority?: string[]
    status?: string[]
    userId?: string
  }
  pagination?: {
    page: number
    limit: number
  }
  sorting?: {
    field: string
    order: 'asc' | 'desc'
  }
}

export interface SearchResult {
  id: string
  type: 'content' | 'project' | 'task' | 'job' | 'calendar' | 'file'
  title: string
  content: string
  excerpt: string
  highlights: string[]
  score: number
  metadata: {
    createdAt: Date
    updatedAt: Date
    author?: string
    category?: string
    tags?: string[]
    status?: string
    priority?: string
    [key: string]: any
  }
  url: string
}

export interface SearchResponse {
  results: SearchResult[]
  totalCount: number
  facets: {
    types: Record<string, number>
    categories: Record<string, number>
    tags: Record<string, number>
    authors: Record<string, number>
  }
  suggestions: string[]
  searchTime: number
}

class VaultSearchEngine {
  private stopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
    'to', 'was', 'will', 'with', 'the', 'this', 'but', 'they', 'have',
    'had', 'what', 'said', 'each', 'which', 'she', 'do', 'how', 'their',
    'if', 'up', 'out', 'many', 'then', 'them', 'these', 'so', 'some',
    'her', 'would', 'make', 'like', 'into', 'him', 'time', 'two', 'more',
    'go', 'no', 'way', 'could', 'my', 'than', 'first', 'been', 'call',
    'who', 'oil', 'sit', 'now', 'find', 'down', 'day', 'did', 'get',
    'come', 'made', 'may', 'part'
  ])

  // Tokenize and clean search query
  private tokenizeQuery(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2 && !this.stopWords.has(token))
  }

  // Calculate relevance score
  private calculateScore(
    searchTerms: string[],
    title: string,
    content: string,
    metadata: any
  ): number {
    let score = 0
    const titleLower = title.toLowerCase()
    const contentLower = content.toLowerCase()

    searchTerms.forEach(term => {
      // Title matches are weighted higher
      const titleMatches = (titleLower.match(new RegExp(term, 'g')) || []).length
      score += titleMatches * 10

      // Content matches
      const contentMatches = (contentLower.match(new RegExp(term, 'g')) || []).length
      score += contentMatches * 2

      // Tag matches
      if (metadata.tags) {
        const tagMatches = metadata.tags.filter((tag: string) => 
          tag.toLowerCase().includes(term)
        ).length
        score += tagMatches * 5
      }

      // Category matches
      if (metadata.category && metadata.category.toLowerCase().includes(term)) {
        score += 3
      }
    })

    // Boost recent content
    if (metadata.updatedAt) {
      const daysSinceUpdate = (Date.now() - new Date(metadata.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
      if (daysSinceUpdate < 7) score *= 1.2
      else if (daysSinceUpdate < 30) score *= 1.1
    }

    // Boost pinned/important content
    if (metadata.pinned) score *= 1.5
    if (metadata.priority === 'HIGH' || metadata.priority === 'CRITICAL') score *= 1.3

    return score
  }

  // Generate excerpt with highlights
  private generateExcerpt(content: string, searchTerms: string[], maxLength: number = 200): {
    excerpt: string
    highlights: string[]
  } {
    const highlights: string[] = []
    let excerpt = content

    // Find the best excerpt around search terms
    let bestPosition = 0
    let bestScore = 0

    searchTerms.forEach(term => {
      const regex = new RegExp(term, 'gi')
      let match
      while ((match = regex.exec(content)) !== null) {
        const position = match.index
        const contextStart = Math.max(0, position - 100)
        const contextEnd = Math.min(content.length, position + 100)
        const context = content.slice(contextStart, contextEnd)
        
        const score = searchTerms.reduce((acc, t) => {
          return acc + (context.toLowerCase().match(new RegExp(t, 'g')) || []).length
        }, 0)

        if (score > bestScore) {
          bestScore = score
          bestPosition = contextStart
        }
      }
    })

    // Extract excerpt
    const excerptStart = bestPosition
    const excerptEnd = Math.min(content.length, excerptStart + maxLength)
    excerpt = content.slice(excerptStart, excerptEnd)

    if (excerptStart > 0) excerpt = '...' + excerpt
    if (excerptEnd < content.length) excerpt = excerpt + '...'

    // Find highlights in excerpt
    searchTerms.forEach(term => {
      const regex = new RegExp(`(${term})`, 'gi')
      const matches = excerpt.match(regex)
      if (matches) {
        highlights.push(...matches)
      }
    })

    return { excerpt, highlights: [...new Set(highlights)] }
  }

  // Search content items
  private async searchContent(
    searchTerms: string[],
    filters: SearchQuery['filters'],
    userId: string
  ): Promise<SearchResult[]> {
    const where: any = {
      userId,
      archived: false
    }

    // Apply filters
    if (filters?.contentTypes?.length) {
      where.type = { in: filters.contentTypes }
    }

    if (filters?.categories?.length) {
      where.categoryId = { in: filters.categories }
    }

    if (filters?.status?.length) {
      where.status = { in: filters.status }
    }

    if (filters?.priority?.length) {
      where.priority = { in: filters.priority }
    }

    if (filters?.dateRange) {
      where.createdAt = {
        gte: filters.dateRange.start,
        lte: filters.dateRange.end
      }
    }

    const contentItems = await db.contentItem.findMany({
      where,
      include: {
        category: true,
        tags: true,
        user: {
          select: { name: true, email: true }
        }
      }
    })

    return contentItems
      .map(item => {
        const score = this.calculateScore(
          searchTerms,
          item.title,
          item.content,
          {
            tags: item.tags.map(t => t.name),
            category: item.category?.name,
            pinned: item.pinned,
            priority: item.priority,
            updatedAt: item.updatedAt
          }
        )

        if (score === 0) return null

        const { excerpt, highlights } = this.generateExcerpt(item.content, searchTerms)

        return {
          id: item.id,
          type: 'content' as const,
          title: item.title,
          content: item.content,
          excerpt,
          highlights,
          score,
          metadata: {
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            author: item.user.name || item.user.email,
            category: item.category?.name,
            tags: item.tags.map(t => t.name),
            status: item.status,
            priority: item.priority,
            type: item.type
          },
          url: `/content/${item.id}`
        }
      })
      .filter(Boolean) as SearchResult[]
  }

  // Search projects
  private async searchProjects(
    searchTerms: string[],
    filters: SearchQuery['filters'],
    userId: string
  ): Promise<SearchResult[]> {
    const where: any = {
      userId,
      archived: false
    }

    if (filters?.status?.length) {
      where.status = { in: filters.status }
    }

    if (filters?.priority?.length) {
      where.priority = { in: filters.priority }
    }

    if (filters?.dateRange) {
      where.createdAt = {
        gte: filters.dateRange.start,
        lte: filters.dateRange.end
      }
    }

    const projects = await db.project.findMany({
      where,
      include: {
        user: {
          select: { name: true, email: true }
        },
        tasks: {
          select: { title: true, status: true }
        }
      }
    })

    return projects
      .map(project => {
        const searchableContent = `${project.title} ${project.description || ''} ${project.content || ''}`
        const score = this.calculateScore(
          searchTerms,
          project.title,
          searchableContent,
          {
            pinned: project.pinned,
            priority: project.priority,
            updatedAt: project.updatedAt
          }
        )

        if (score === 0) return null

        const { excerpt, highlights } = this.generateExcerpt(searchableContent, searchTerms)

        return {
          id: project.id,
          type: 'project' as const,
          title: project.title,
          content: searchableContent,
          excerpt,
          highlights,
          score,
          metadata: {
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
            author: project.user.name || project.user.email,
            status: project.status,
            priority: project.priority,
            progress: project.progress,
            taskCount: project.tasks.length
          },
          url: `/projects/${project.id}`
        }
      })
      .filter(Boolean) as SearchResult[]
  }

  // Search jobs
  private async searchJobs(
    searchTerms: string[],
    filters: SearchQuery['filters'],
    userId: string
  ): Promise<SearchResult[]> {
    const where: any = {
      userId,
      archived: false
    }

    if (filters?.status?.length) {
      where.applicationStatus = { in: filters.status }
    }

    if (filters?.priority?.length) {
      where.priority = { in: filters.priority }
    }

    const jobs = await db.jobOpportunity.findMany({
      where,
      include: {
        user: {
          select: { name: true, email: true }
        }
      }
    })

    return jobs
      .map(job => {
        const searchableContent = `${job.title} ${job.company} ${job.content || ''} ${job.notes || ''}`
        const score = this.calculateScore(
          searchTerms,
          job.title,
          searchableContent,
          {
            priority: job.priority,
            updatedAt: job.updatedAt
          }
        )

        if (score === 0) return null

        const { excerpt, highlights } = this.generateExcerpt(searchableContent, searchTerms)

        return {
          id: job.id,
          type: 'job' as const,
          title: `${job.title} at ${job.company}`,
          content: searchableContent,
          excerpt,
          highlights,
          score,
          metadata: {
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            author: job.user.name || job.user.email,
            company: job.company,
            status: job.applicationStatus,
            priority: job.priority,
            matchPercentage: job.matchPercentage
          },
          url: `/jobs/${job.id}`
        }
      })
      .filter(Boolean) as SearchResult[]
  }

  // Search calendar events
  private async searchCalendar(
    searchTerms: string[],
    filters: SearchQuery['filters'],
    userId: string
  ): Promise<SearchResult[]> {
    const where: any = {
      userId
    }

    if (filters?.dateRange) {
      where.startTime = {
        gte: filters.dateRange.start,
        lte: filters.dateRange.end
      }
    }

    const events = await db.calendarEvent.findMany({
      where,
      include: {
        user: {
          select: { name: true, email: true }
        }
      }
    })

    return events
      .map(event => {
        const searchableContent = `${event.title} ${event.description || ''} ${event.location || ''}`
        const score = this.calculateScore(
          searchTerms,
          event.title,
          searchableContent,
          {
            updatedAt: event.updatedAt
          }
        )

        if (score === 0) return null

        const { excerpt, highlights } = this.generateExcerpt(searchableContent, searchTerms)

        return {
          id: event.id,
          type: 'calendar' as const,
          title: event.title,
          content: searchableContent,
          excerpt,
          highlights,
          score,
          metadata: {
            createdAt: event.createdAt,
            updatedAt: event.updatedAt,
            author: event.user.name || event.user.email,
            startTime: event.startTime,
            endTime: event.endTime,
            location: event.location,
            allDay: event.allDay
          },
          url: `/calendar?event=${event.id}`
        }
      })
      .filter(Boolean) as SearchResult[]
  }

  // Generate search suggestions
  private async generateSuggestions(query: string, userId: string): Promise<string[]> {
    const suggestions: string[] = []

    // Get recent searches (would be stored in database)
    // For now, generate based on existing content
    const recentContent = await db.contentItem.findMany({
      where: { userId },
      select: { title: true },
      orderBy: { updatedAt: 'desc' },
      take: 10
    })

    const recentProjects = await db.project.findMany({
      where: { userId },
      select: { title: true },
      orderBy: { updatedAt: 'desc' },
      take: 5
    })

    // Extract keywords from titles
    const allTitles = [
      ...recentContent.map(c => c.title),
      ...recentProjects.map(p => p.title)
    ]

    const keywords = new Set<string>()
    allTitles.forEach(title => {
      const words = title.toLowerCase().split(/\s+/)
      words.forEach(word => {
        if (word.length > 3 && !this.stopWords.has(word) && word.includes(query.toLowerCase())) {
          keywords.add(word)
        }
      })
    })

    return Array.from(keywords).slice(0, 5)
  }

  // Calculate facets for filtering
  private calculateFacets(results: SearchResult[]): SearchResponse['facets'] {
    const facets = {
      types: {} as Record<string, number>,
      categories: {} as Record<string, number>,
      tags: {} as Record<string, number>,
      authors: {} as Record<string, number>
    }

    results.forEach(result => {
      // Type facets
      facets.types[result.type] = (facets.types[result.type] || 0) + 1

      // Category facets
      if (result.metadata.category) {
        facets.categories[result.metadata.category] = 
          (facets.categories[result.metadata.category] || 0) + 1
      }

      // Tag facets
      if (result.metadata.tags) {
        result.metadata.tags.forEach(tag => {
          facets.tags[tag] = (facets.tags[tag] || 0) + 1
        })
      }

      // Author facets
      if (result.metadata.author) {
        facets.authors[result.metadata.author] = 
          (facets.authors[result.metadata.author] || 0) + 1
      }
    })

    return facets
  }

  // Main search method
  async search(searchQuery: SearchQuery, userId: string): Promise<SearchResponse> {
    const startTime = performance.now()

    try {
      const searchTerms = this.tokenizeQuery(searchQuery.query)
      
      if (searchTerms.length === 0) {
        return {
          results: [],
          totalCount: 0,
          facets: { types: {}, categories: {}, tags: {}, authors: {} },
          suggestions: [],
          searchTime: 0
        }
      }

      // Search across all content types
      const [contentResults, projectResults, jobResults, calendarResults] = await Promise.all([
        this.searchContent(searchTerms, searchQuery.filters, userId),
        this.searchProjects(searchTerms, searchQuery.filters, userId),
        this.searchJobs(searchTerms, searchQuery.filters, userId),
        this.searchCalendar(searchTerms, searchQuery.filters, userId)
      ])

      // Combine and sort results
      const allResults = [
        ...contentResults,
        ...projectResults,
        ...jobResults,
        ...calendarResults
      ].sort((a, b) => b.score - a.score)

      // Apply pagination
      const page = searchQuery.pagination?.page || 1
      const limit = searchQuery.pagination?.limit || 20
      const startIndex = (page - 1) * limit
      const paginatedResults = allResults.slice(startIndex, startIndex + limit)

      // Generate suggestions
      const suggestions = await this.generateSuggestions(searchQuery.query, userId)

      // Calculate facets
      const facets = this.calculateFacets(allResults)

      const searchTime = performance.now() - startTime

      // Log search query
      logger.info('Search performed', {
        query: searchQuery.query,
        userId,
        resultCount: allResults.length,
        searchTime
      })

      return {
        results: paginatedResults,
        totalCount: allResults.length,
        facets,
        suggestions,
        searchTime
      }

    } catch (error) {
      logger.error('Search error', error, {
        query: searchQuery.query,
        userId
      })
      throw error
    }
  }

  // Index content for better search performance (future enhancement)
  async indexContent(contentId: string, type: string): Promise<void> {
    // This would update the search index
    // For now, we rely on direct database queries
    logger.debug('Content indexed', { contentId, type })
  }

  // Remove content from index
  async removeFromIndex(contentId: string, type: string): Promise<void> {
    // This would remove from search index
    logger.debug('Content removed from index', { contentId, type })
  }
}

// Export singleton instance
export const searchEngine = new VaultSearchEngine()

// Convenience functions
export const search = {
  query: (query: string, filters?: SearchQuery['filters'], userId?: string) =>
    searchEngine.search({ query, filters }, userId!),
  
  index: (contentId: string, type: string) =>
    searchEngine.indexContent(contentId, type),
    
  remove: (contentId: string, type: string) =>
    searchEngine.removeFromIndex(contentId, type)
}