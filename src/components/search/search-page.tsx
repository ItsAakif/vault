'use client'

import { useState, useEffect, useMemo } from 'react'
import { ContentItem, Category, Tag, Project, JobOpportunity, CalendarEvent, ContentType, Priority } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { 
  Search, 
  Filter, 
  X, 
  Calendar, 
  Clock, 
  MapPin, 
  Users, 
  Briefcase, 
  FileText, 
  Lightbulb, 
  BookOpen, 
  Star,
  Tag as TagIcon,
  ChevronRight,
  ExternalLink,
  Building
} from 'lucide-react'
import { useAppStore } from '@/store'
import { useToast } from '@/hooks/use-toast'
import { DriveRequiredNotice } from '@/components/drive/drive-required-notice'
import { readCollection } from '@/lib/api-collection'
import { parseDriveFailure, type DriveFailure } from '@/lib/drive-client'

interface SearchPageProps {
  className?: string
}

/**
 * T093: every collection this page reads goes through the shared reader, so a wrong body is an
 * empty list rather than a crash in `filteredResults`.
 *
 * `/api/projects` answers with an envelope (`{ success: true, data: [...] }`) while `/api/content`,
 * `/api/jobs` and `/api/calendar` answer with bare arrays; `readCollection` accepts both.
 */
function isProjectRecord(value: unknown): value is Project {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { id?: unknown; title?: unknown; status?: unknown; priority?: unknown }
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.priority === 'string'
  )
}

// The fields `filteredResults` and the cards read before any `??` fallback: a null or a primitive
// in the array would throw here, and a record without a title renders an empty card.
function isContentRecord(value: unknown): value is ContentItem {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { id?: unknown; title?: unknown; type?: unknown }
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.type === 'string'
  )
}

function isJobRecord(value: unknown): value is JobOpportunity {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { id?: unknown; title?: unknown }
  return typeof candidate.id === 'string' && typeof candidate.title === 'string'
}

function isCalendarEventRecord(value: unknown): value is CalendarEvent {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { id?: unknown; title?: unknown }
  return typeof candidate.id === 'string' && typeof candidate.title === 'string'
}

export function SearchPage({ className }: SearchPageProps) {
  const { 
    contentItems, 
    categories, 
    tags, 
    projects, 
    jobs, 
    calendarEvents,
    setContentItems,
    setProjects,
    setJobs,
    setCalendarEvents
  } = useAppStore()
  
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilters, setActiveFilters] = useState({
    type: [] as (ContentType | 'EVENT')[],
    category: [] as string[],
    tags: [] as string[],
    priority: [] as Priority[],
    dateRange: 'all' as 'all' | 'today' | 'week' | 'month' | 'year',
    status: 'all' as 'all' | 'active' | 'completed' | 'archived'
  })
  const [showFilters, setShowFilters] = useState(false)
  const [selectedTab, setSelectedTab] = useState('all')
  // ADR-008 D5: a search across a disconnected Drive returns nothing, which is otherwise
  // indistinguishable from "no matches".
  const [driveFailure, setDriveFailure] = useState<DriveFailure | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchAllData()
  }, [])

  const fetchAllData = async () => {
    setLoading(true)
    setDriveFailure(null)
    try {
      const [contentRes, projectsRes, jobsRes, eventsRes] = await Promise.all([
        fetch('/api/content'),
        fetch('/api/projects'),
        fetch('/api/jobs'),
        fetch('/api/calendar')
      ])

      // The first non-ok response decides. `clone()` is taken before any body is read below, so
      // the original response's `.json()` still works afterwards.
      const failed = [contentRes, projectsRes, jobsRes, eventsRes].find((response) => !response.ok)
      if (failed) {
        const failure = parseDriveFailure(await failed.clone().json().catch(() => null))
        // null for a non-Drive failure (a generic 500 or a 403 for quota), which keeps the
        // existing silent behaviour and never claims Drive is disconnected (ADR-008 D3/D5).
        setDriveFailure(failure)
      }

      if (contentRes.ok) {
        const contentData: unknown = await contentRes.json()
        setContentItems(readCollection(contentData, isContentRecord))
      }

      if (projectsRes.ok) {
        const projectsData: unknown = await projectsRes.json()
        setProjects(readCollection(projectsData, isProjectRecord))
      }

      if (jobsRes.ok) {
        const jobsData: unknown = await jobsRes.json()
        setJobs(readCollection(jobsData, isJobRecord))
      }

      if (eventsRes.ok) {
        const eventsData: unknown = await eventsRes.json()
        setCalendarEvents(readCollection(eventsData, isCalendarEventRecord))
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch search data',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const filteredResults = useMemo(() => {
    const allItems = [
      ...contentItems.map(item => ({ ...item, type: 'content' as const, contentType: item.type })),
      ...projects.map(project => ({ ...project, type: 'project' as const })),
      ...jobs.map(job => ({ ...job, type: 'job' as const })),
      ...calendarEvents.map(event => ({ ...event, type: 'event' as const }))
    ]

    return allItems.filter(item => {
      // Search query filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        let searchableText = item.title
        switch (item.type) {
          case 'content':
            searchableText += ` ${item.content ?? ''}`
            break
          case 'project':
            searchableText += ` ${item.description ?? ''} ${item.content ?? ''}`
            break
          case 'job':
            searchableText += ` ${item.company ?? ''} ${item.location ?? ''} ${item.notes ?? ''}`
            break
          case 'event':
            searchableText += ` ${item.description ?? ''} ${item.location ?? ''}`
            break
        }

        if (!searchableText.toLowerCase().includes(query)) {
          return false
        }
      }

      // Type filter
      if (activeFilters.type.length > 0) {
        switch (item.type) {
          case 'content':
            if (!activeFilters.type.includes(item.contentType)) return false
            break
          case 'project':
            if (!activeFilters.type.includes('PROJECT')) return false
            break
          case 'job':
            if (!activeFilters.type.includes('JOB')) return false
            break
          case 'event':
            if (!activeFilters.type.includes('EVENT')) return false
            break
        }
      }

      // Category filter
      if (activeFilters.category.length > 0 && item.type === 'content') {
        if (!activeFilters.category.includes(item.customTypeId || '')) {
          return false
        }
      }

      // Priority filter
      if (activeFilters.priority.length > 0 && item.type !== 'event') {
        if (!activeFilters.priority.includes(item.priority)) {
          return false
        }
      }

      // Date range filter
      if (activeFilters.dateRange !== 'all') {
        const now = new Date()
        const itemDate = item.type === 'event'
          ? new Date(item.startTime)
          : new Date(item.createdAt)

        switch (activeFilters.dateRange) {
          case 'today':
            if (itemDate.toDateString() !== now.toDateString()) return false
            break
          case 'week':
            if (itemDate < new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)) return false
            break
          case 'month':
            if (itemDate < new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)) return false
            break
          case 'year':
            if (itemDate < new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)) return false
            break
        }
      }

      // Status filter
      if (activeFilters.status !== 'all') {
        if (item.type === 'content') {
          if (activeFilters.status === 'active' && item.archived) return false
          if (activeFilters.status === 'archived' && !item.archived) return false
        } else if (item.type === 'project') {
          if (activeFilters.status === 'completed' && item.status !== 'COMPLETED') return false
          if (activeFilters.status === 'active' && item.status === 'COMPLETED') return false
        }
      }

      return true
    })
  }, [contentItems, projects, jobs, calendarEvents, searchQuery, activeFilters])

  const getContentIcon = (type: ContentType) => {
    switch (type) {
      case 'IDEA': return <Lightbulb className="h-4 w-4" />
      case 'POETRY': return <BookOpen className="h-4 w-4" />
      case 'NOTE': return <FileText className="h-4 w-4" />
      case 'RESOURCE': return <Star className="h-4 w-4" />
      case 'PROJECT': return <Briefcase className="h-4 w-4" />
      case 'JOB': return <Users className="h-4 w-4" />
      default: return <FileText className="h-4 w-4" />
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'content': return <FileText className="h-4 w-4" />
      case 'project': return <Briefcase className="h-4 w-4" />
      case 'job': return <Users className="h-4 w-4" />
      case 'event': return <Calendar className="h-4 w-4" />
      default: return <FileText className="h-4 w-4" />
    }
  }

  const renderSearchResult = (item: any) => {
    const commonProps = {
      key: item.id,
      className: 'hover:shadow-md transition-shadow cursor-pointer'
    }

    switch (item.type) {
      case 'content':
        return (
          <Card {...commonProps}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-2">
                  {getContentIcon(item.contentType)}
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                </div>
                <Badge variant="outline">{item.contentType}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">
                {item.content?.substring(0, 150)}...
              </p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Updated {new Date(item.updatedAt).toLocaleDateString()}</span>
                {item.pinned && <Badge variant="secondary">Pinned</Badge>}
              </div>
            </CardContent>
          </Card>
        )

      case 'project':
        return (
          <Card {...commonProps}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-2">
                  <Briefcase className="h-4 w-4" />
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                </div>
                <Badge>{item.status}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">
                {item.description}
              </p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Progress: {item.progress}%</span>
                <Badge variant="outline">{item.priority}</Badge>
              </div>
            </CardContent>
          </Card>
        )

      case 'job':
        return (
          <Card {...commonProps}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-2">
                  <Users className="h-4 w-4" />
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                </div>
                <Badge>{item.stage}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <Building className="h-4 w-4" />
                  <span>{item.company}</span>
                  {item.location && (
                    <>
                      <MapPin className="h-4 w-4 ml-2" />
                      <span>{item.location}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Applied {new Date(item.applicationDate).toLocaleDateString()}</span>
                  <Badge variant="outline">{item.priority}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )

      case 'event':
        return (
          <Card {...commonProps}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4" />
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                </div>
                <Badge>{item.category}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>
                    {new Date(item.startDate).toLocaleDateString()} - {new Date(item.endDate).toLocaleDateString()}
                  </span>
                </div>
                {item.location && (
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{item.location}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Created {new Date(item.createdAt).toLocaleDateString()}</span>
                  <Badge variant="outline">{item.priority}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )

      default:
        return null
    }
  }

  const resultsByType = useMemo(() => {
    return {
      all: filteredResults,
      content: filteredResults.filter(item => item.type === 'content'),
      projects: filteredResults.filter(item => item.type === 'project'),
      jobs: filteredResults.filter(item => item.type === 'job'),
      events: filteredResults.filter(item => item.type === 'event')
    }
  }, [filteredResults])

  const currentResults = resultsByType[selectedTab as keyof typeof resultsByType] || resultsByType.all

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Search Bar */}
      <div className="flex space-x-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search across all content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Dialog open={showFilters} onOpenChange={setShowFilters}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Filter className="h-4 w-4 mr-2" />
              Filters
              {(activeFilters.type.length > 0 || 
                activeFilters.category.length > 0 || 
                activeFilters.tags.length > 0 || 
                activeFilters.priority.length > 0 ||
                activeFilters.dateRange !== 'all' ||
                activeFilters.status !== 'all') && (
                <Badge variant="secondary" className="ml-2">
                  {[
                    activeFilters.type.length,
                    activeFilters.category.length,
                    activeFilters.tags.length,
                    activeFilters.priority.length,
                    activeFilters.dateRange !== 'all' ? 1 : 0,
                    activeFilters.status !== 'all' ? 1 : 0
                  ].reduce((a, b) => a + b, 0)}
                </Badge>
              )}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Search Filters</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-3">
                <h4 className="font-medium">Content Type</h4>
                <div className="grid grid-cols-2 gap-2">
                  {['IDEA', 'POETRY', 'NOTE', 'RESOURCE', 'PROJECT', 'JOB', 'EVENT'].map((type) => (
                    <label key={type} className="flex items-center space-x-2">
                      <Checkbox
                        checked={activeFilters.type.includes(type as ContentType | 'EVENT')}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setActiveFilters(prev => ({
                              ...prev,
                              type: [...prev.type, type as ContentType | 'EVENT']
                            }))
                          } else {
                            setActiveFilters(prev => ({
                              ...prev,
                              type: prev.type.filter(t => t !== type)
                            }))
                          }
                        }}
                      />
                      <span className="text-sm">{type}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Priority</h4>
                <div className="flex flex-wrap gap-2">
                  {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((priority) => (
                    <label key={priority} className="flex items-center space-x-2">
                      <Checkbox
                        checked={activeFilters.priority.includes(priority as Priority)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setActiveFilters(prev => ({
                              ...prev,
                              priority: [...prev.priority, priority as Priority]
                            }))
                          } else {
                            setActiveFilters(prev => ({
                              ...prev,
                              priority: prev.priority.filter(p => p !== priority)
                            }))
                          }
                        }}
                      />
                      <span className="text-sm">{priority}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Date Range</h4>
                <Select 
                  value={activeFilters.dateRange} 
                  onValueChange={(value: any) => setActiveFilters(prev => ({ ...prev, dateRange: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="year">This Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Status</h4>
                <Select 
                  value={activeFilters.status} 
                  onValueChange={(value: any) => setActiveFilters(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-between">
              <Button 
                variant="outline" 
                onClick={() => setActiveFilters({
                  type: [],
                  category: [],
                  tags: [],
                  priority: [],
                  dateRange: 'all',
                  status: 'all'
                })}
              >
                Clear All
              </Button>
              <Button onClick={() => setShowFilters(false)}>
                Apply Filters
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Drive failure replaces the results area: "no matches" must not stand in for "we could
          not reach your data" (ADR-008 D5). It composes inside `ErrorState` so a Drive outage and a
          generic failure are one vocabulary rather than two banners (ADR-011 D3). No retry button
          sits next to the connect CTA - a reconnect is the remedy for this failure. */}
      {driveFailure && (
        <ErrorState>
          <DriveRequiredNotice message={driveFailure.message} />
        </ErrorState>
      )}

      {/* Results Tabs */}
      {!driveFailure && (
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="all">
            All ({resultsByType.all.length})
          </TabsTrigger>
          <TabsTrigger value="content">
            Content ({resultsByType.content.length})
          </TabsTrigger>
          <TabsTrigger value="projects">
            Projects ({resultsByType.projects.length})
          </TabsTrigger>
          <TabsTrigger value="jobs">
            Jobs ({resultsByType.jobs.length})
          </TabsTrigger>
          <TabsTrigger value="events">
            Events ({resultsByType.events.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={selectedTab} className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Found {currentResults.length} result{currentResults.length !== 1 ? 's' : ''}
              {searchQuery && ` for "${searchQuery}"`}
            </p>
          </div>

          <div className="grid gap-4">
            {currentResults.length > 0 ? (
              currentResults.map(renderSearchResult)
            ) : searchQuery ? (
              <EmptyState
                icon={Search}
                title="No matches"
                description={`Nothing matched '${searchQuery}'. Try fewer words.`}
              />
            ) : (
              <EmptyState
                icon={Search}
                title="Search across everything"
                description="Find notes, projects, jobs and events by their text."
              />
            )}
          </div>
        </TabsContent>
      </Tabs>
      )}
    </div>
  )
}