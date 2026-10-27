'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useDebounce } from '@reactuses/core'
import { cn } from '@/lib/utils'
import { animations } from '@/lib/animations'
import { SearchInput } from '@/components/ui/form-components'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/loading-states'
import { toastError } from '@/lib/toast'
import {
  Search,
  Filter,
  X,
  Calendar,
  FileText,
  Target,
  Briefcase,
  Clock,
  User,
  Tag,
  Folder,
  ChevronDown,
  ChevronUp,
  Zap,
  TrendingUp
} from 'lucide-react'

interface SearchResult {
  id: string
  type: 'content' | 'project' | 'task' | 'job' | 'calendar' | 'file'
  title: string
  excerpt: string
  highlights: string[]
  score: number
  metadata: {
    createdAt: string
    updatedAt: string
    author?: string
    category?: string
    tags?: string[]
    status?: string
    priority?: string
    [key: string]: any
  }
  url: string
}

interface SearchResponse {
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
  pagination: {
    page: number
    limit: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

interface SearchFilters {
  types: string[]
  categories: string[]
  tags: string[]
  status: string[]
  priority: string[]
  dateRange?: {
    from: string
    to: string
  }
}

export function SearchInterface() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Search state
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Filter state
  const [filters, setFilters] = useState<SearchFilters>({
    types: [],
    categories: [],
    tags: [],
    status: [],
    priority: []
  })
  const [showFilters, setShowFilters] = useState(false)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [sortBy, setSortBy] = useState('relevance')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Debounced query for suggestions
  const debouncedQuery = useDebounce(query, 300)

  // Perform search
  const performSearch = useCallback(async (
    searchQuery: string,
    searchFilters: SearchFilters,
    page: number = 1
  ) => {
    if (!searchQuery.trim()) {
      setResults(null)
      return
    }

    setIsLoading(true)

    try {
      const params = new URLSearchParams({
        q: searchQuery,
        page: page.toString(),
        limit: '20',
        sortBy,
        sortOrder
      })

      // Add filters to params
      if (searchFilters.types.length) {
        params.append('types', searchFilters.types.join(','))
      }
      if (searchFilters.categories.length) {
        params.append('categories', searchFilters.categories.join(','))
      }
      if (searchFilters.tags.length) {
        params.append('tags', searchFilters.tags.join(','))
      }
      if (searchFilters.status.length) {
        params.append('status', searchFilters.status.join(','))
      }
      if (searchFilters.priority.length) {
        params.append('priority', searchFilters.priority.join(','))
      }
      if (searchFilters.dateRange) {
        params.append('dateFrom', searchFilters.dateRange.from)
        params.append('dateTo', searchFilters.dateRange.to)
      }

      const response = await fetch(`/api/search?${params}`)
      
      if (!response.ok) {
        throw new Error('Search failed')
      }

      const data = await response.json()
      setResults(data.data)
      setCurrentPage(page)

      // Update URL
      const newParams = new URLSearchParams(searchParams)
      newParams.set('q', searchQuery)
      if (page > 1) newParams.set('page', page.toString())
      else newParams.delete('page')
      
      router.replace(`/search?${newParams}`, { scroll: false })

    } catch (error) {
      toastError('Search failed. Please try again.')
      console.error('Search error:', error)
    } finally {
      setIsLoading(false)
    }
  }, [searchParams, router, toastError, sortBy, sortOrder])

  // Get search suggestions
  const getSuggestions = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setSuggestions([])
      return
    }

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, limit: 5 })
      })

      if (response.ok) {
        const data = await response.json()
        setSuggestions(data.data.suggestions)
      }
    } catch (error) {
      console.error('Suggestions error:', error)
    }
  }, [])

  // Handle search
  const handleSearch = useCallback((searchQuery?: string) => {
    const queryToSearch = searchQuery || query
    if (queryToSearch.trim()) {
      performSearch(queryToSearch, filters, 1)
      setShowSuggestions(false)
    }
  }, [query, filters, performSearch])

  // Handle filter change
  const handleFilterChange = useCallback((newFilters: Partial<SearchFilters>) => {
    const updatedFilters = { ...filters, ...newFilters }
    setFilters(updatedFilters)
    if (query.trim()) {
      performSearch(query, updatedFilters, 1)
    }
  }, [filters, query, performSearch])

  // Handle pagination
  const handlePageChange = useCallback((page: number) => {
    if (query.trim()) {
      performSearch(query, filters, page)
    }
  }, [query, filters, performSearch])

  // Effects
  useEffect(() => {
    const initialQuery = searchParams.get('q')
    const initialPage = parseInt(searchParams.get('page') || '1')
    
    if (initialQuery) {
      setQuery(initialQuery)
      performSearch(initialQuery, filters, initialPage)
    }
  }, []) // Only run on mount

  useEffect(() => {
    if (debouncedQuery && showSuggestions) {
      getSuggestions(debouncedQuery)
    }
  }, [debouncedQuery, showSuggestions, getSuggestions])

  // Render functions
  const renderTypeIcon = (type: string) => {
    const icons = {
      content: FileText,
      project: Target,
      job: Briefcase,
      calendar: Calendar,
      task: Clock,
      file: FileText
    }
    const Icon = icons[type as keyof typeof icons] || FileText
    return <Icon className="h-4 w-4" />
  }

  const renderSearchResult = (result: SearchResult, index: number) => (
    <motion.div
      key={result.id}
      {...animations.staggerItem}
      transition={{ delay: index * 0.05 }}
    >
      <Card 
        className="hover:shadow-md transition-shadow cursor-pointer"
        onClick={() => router.push(result.url)}
      >
        <CardContent className="p-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 mt-1">
              {renderTypeIcon(result.type)}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-2">
                <h3 className="font-medium text-neutral-900 truncate">
                  {result.title}
                </h3>
                <Badge variant="secondary" className="text-xs">
                  {result.type}
                </Badge>
                {result.metadata.priority && (
                  <Badge 
                    variant={result.metadata.priority === 'HIGH' ? 'destructive' : 'outline'}
                    className="text-xs"
                  >
                    {result.metadata.priority}
                  </Badge>
                )}
              </div>
              
              <p className="text-sm text-neutral-600 mb-2 line-clamp-2">
                {result.excerpt}
              </p>
              
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <div className="flex items-center space-x-3">
                  {result.metadata.author && (
                    <div className="flex items-center space-x-1">
                      <User className="h-3 w-3" />
                      <span>{result.metadata.author}</span>
                    </div>
                  )}
                  
                  {result.metadata.category && (
                    <div className="flex items-center space-x-1">
                      <Folder className="h-3 w-3" />
                      <span>{result.metadata.category}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center space-x-1">
                    <Clock className="h-3 w-3" />
                    <span>{new Date(result.metadata.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                
                <div className="flex items-center space-x-1">
                  <Zap className="h-3 w-3" />
                  <span>{Math.round(result.score)}</span>
                </div>
              </div>
              
              {result.metadata.tags && result.metadata.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {result.metadata.tags.slice(0, 3).map(tag => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                  {result.metadata.tags.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{result.metadata.tags.length - 3}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )

  const renderFilters = () => (
    <AnimatePresence>
      {showFilters && (
        <motion.div
          className="space-y-4"
          {...animations.fadeInUp}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Content Types */}
              <div>
                <label className="text-sm font-medium mb-2 block">Content Types</label>
                <div className="space-y-2">
                  {Object.entries(results?.facets.types || {}).map(([type, count]) => (
                    <div key={type} className="flex items-center space-x-2">
                      <Checkbox
                        id={`type-${type}`}
                        checked={filters.types.includes(type)}
                        onCheckedChange={(checked) => {
                          const newTypes = checked
                            ? [...filters.types, type]
                            : filters.types.filter(t => t !== type)
                          handleFilterChange({ types: newTypes })
                        }}
                      />
                      <label htmlFor={`type-${type}`} className="text-sm flex-1 flex justify-between">
                        <span className="capitalize">{type}</span>
                        <span className="text-neutral-500">({count})</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Categories */}
              {Object.keys(results?.facets.categories || {}).length > 0 && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Categories</label>
                  <div className="space-y-2">
                    {Object.entries(results?.facets.categories || {}).map(([category, count]) => (
                      <div key={category} className="flex items-center space-x-2">
                        <Checkbox
                          id={`category-${category}`}
                          checked={filters.categories.includes(category)}
                          onCheckedChange={(checked) => {
                            const newCategories = checked
                              ? [...filters.categories, category]
                              : filters.categories.filter(c => c !== category)
                            handleFilterChange({ categories: newCategories })
                          }}
                        />
                        <label htmlFor={`category-${category}`} className="text-sm flex-1 flex justify-between">
                          <span>{category}</span>
                          <span className="text-neutral-500">({count})</span>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Clear Filters */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilters({
                    types: [],
                    categories: [],
                    tags: [],
                    status: [],
                    priority: []
                  })
                  if (query.trim()) {
                    performSearch(query, {
                      types: [],
                      categories: [],
                      tags: [],
                      status: [],
                      priority: []
                    }, 1)
                  }
                }}
                className="w-full"
              >
                Clear Filters
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <div className="space-y-6">
      {/* Search Header */}
      <div className="space-y-4">
        <div className="relative">
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearch()
              } else if (e.key === 'Escape') {
                setShowSuggestions(false)
              }
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Search across all your content..."
            className="text-lg h-12"
            showClear
            onClear={() => {
              setQuery('')
              setResults(null)
              setShowSuggestions(false)
            }}
          />

          {/* Search Suggestions */}
          <AnimatePresence>
            {showSuggestions && suggestions.length > 0 && (
              <motion.div
                className="absolute top-full left-0 right-0 mt-2 bg-white border rounded-lg shadow-lg z-50"
                {...animations.fadeInUp}
              >
                {suggestions.map((suggestion, index) => (
                  <button
                    key={suggestion}
                    className="w-full px-4 py-2 text-left hover:bg-neutral-50 first:rounded-t-lg last:rounded-b-lg"
                    onClick={() => {
                      setQuery(suggestion)
                      handleSearch(suggestion)
                    }}
                  >
                    <div className="flex items-center space-x-2">
                      <Search className="h-4 w-4 text-neutral-400" />
                      <span>{suggestion}</span>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Search Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
              {showFilters ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />}
            </Button>

            {(filters.types.length > 0 || filters.categories.length > 0) && (
              <div className="flex items-center space-x-1">
                {filters.types.map(type => (
                  <Badge key={type} variant="secondary" className="text-xs">
                    {type}
                    <button
                      onClick={() => handleFilterChange({
                        types: filters.types.filter(t => t !== type)
                      })}
                      className="ml-1 hover:bg-neutral-200 rounded-full p-0.5"
                    >
                      <X className="h-2 w-2" />
                    </button>
                  </Badge>
                ))}
                {filters.categories.map(category => (
                  <Badge key={category} variant="secondary" className="text-xs">
                    {category}
                    <button
                      onClick={() => handleFilterChange({
                        categories: filters.categories.filter(c => c !== category)
                      })}
                      className="ml-1 hover:bg-neutral-200 rounded-full p-0.5"
                    >
                      <X className="h-2 w-2" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {results && (
            <div className="flex items-center space-x-4">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="relevance">Relevance</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                </SelectContent>
              </Select>

              <span className="text-sm text-neutral-600">
                {results.totalCount} results ({results.searchTime.toFixed(0)}ms)
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters Sidebar */}
        <div className="lg:col-span-1">
          {renderFilters()}
        </div>

        {/* Search Results */}
        <div className="lg:col-span-3">
          {isLoading && (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-2/3" />
                      <div className="flex space-x-2">
                        <Skeleton className="h-6 w-16" />
                        <Skeleton className="h-6 w-20" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!isLoading && results && (
            <motion.div className="space-y-4" {...animations.staggerContainer}>
              {results.results.length > 0 ? (
                <>
                  {results.results.map((result, index) => renderSearchResult(result, index))}
                  
                  {/* Pagination */}
                  {results.pagination.totalPages > 1 && (
                    <div className="flex justify-center space-x-2 pt-6">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!results.pagination.hasPrev}
                        onClick={() => handlePageChange(currentPage - 1)}
                      >
                        Previous
                      </Button>
                      
                      <div className="flex items-center space-x-1">
                        {Array.from({ length: Math.min(5, results.pagination.totalPages) }, (_, i) => {
                          const page = i + 1
                          return (
                            <Button
                              key={page}
                              variant={page === currentPage ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => handlePageChange(page)}
                            >
                              {page}
                            </Button>
                          )
                        })}
                      </div>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!results.pagination.hasNext}
                        onClick={() => handlePageChange(currentPage + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Search className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-neutral-900 mb-2">
                      No results found
                    </h3>
                    <p className="text-neutral-600 mb-4">
                      Try adjusting your search query or filters
                    </p>
                    {results.suggestions.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm text-neutral-600">Suggestions:</p>
                        <div className="flex flex-wrap justify-center gap-2">
                          {results.suggestions.map(suggestion => (
                            <Button
                              key={suggestion}
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setQuery(suggestion)
                                handleSearch(suggestion)
                              }}
                            >
                              {suggestion}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </motion.div>
          )}

          {!isLoading && !results && query && (
            <Card>
              <CardContent className="p-12 text-center">
                <TrendingUp className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-neutral-900 mb-2">
                  Ready to search
                </h3>
                <p className="text-neutral-600">
                  Press Enter or click the search button to find your content
                </p>
              </CardContent>
            </Card>
          )}

          {!query && !results && (
            <Card>
              <CardContent className="p-12 text-center">
                <Search className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-neutral-900 mb-2">
                  Search your command center
                </h3>
                <p className="text-neutral-600 mb-6">
                  Find content, projects, jobs, events, and more across your entire workspace
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-md mx-auto">
                  <div className="text-center">
                    <FileText className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                    <span className="text-sm text-neutral-600">Content</span>
                  </div>
                  <div className="text-center">
                    <Target className="h-8 w-8 text-green-600 mx-auto mb-2" />
                    <span className="text-sm text-neutral-600">Projects</span>
                  </div>
                  <div className="text-center">
                    <Briefcase className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                    <span className="text-sm text-neutral-600">Jobs</span>
                  </div>
                  <div className="text-center">
                    <Calendar className="h-8 w-8 text-orange-600 mx-auto mb-2" />
                    <span className="text-sm text-neutral-600">Events</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
