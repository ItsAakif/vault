'use client'

import { useState, useEffect } from 'react'
import { ContentItem, Category, Tag, ContentType } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  Archive,
  Pin,
  PinOff,
  Clock,
  FileText,
  Lightbulb,
  BookOpen,
  Briefcase,
  Calendar,
  Archive as ArchiveIcon,
  Users,
  Star,
  Hash,
  FolderKanban
} from 'lucide-react'
import { useAppStore } from '@/store'
import { useToast } from '@/hooks/use-toast'

type ContentItemRow = ContentItem & {
  category?: { name: string; color: string } | null
  tags?: { id: string; name: string }[]
}

interface ContentItemListProps {
  items?: ContentItemRow[]
  loading?: boolean
  onItemSelect?: (item: ContentItemRow) => void
  onCreateItem?: (type: ContentType) => void
  onEditItem?: (item: ContentItemRow) => void
  onDeleteItem?: (id: string) => void
  onUpdateItem?: (id: string, updates: Partial<ContentItem>) => void
  className?: string
}

const contentIcons: Record<ContentType, React.ReactNode> = {
  IDEA: <Lightbulb className="h-4 w-4" />,
  POETRY: <BookOpen className="h-4 w-4" />,
  NOTE: <FileText className="h-4 w-4" />,
  RESOURCE: <Star className="h-4 w-4" />,
  ARCHIVE: <ArchiveIcon className="h-4 w-4" />,
  PROJECT: <FolderKanban className="h-4 w-4" />,
  JOB: <Briefcase className="h-4 w-4" />,
  DAILY: <Calendar className="h-4 w-4" />,
  CUSTOM: <Hash className="h-4 w-4" />
}

const contentLabels: Record<ContentType, string> = {
  IDEA: 'Idea',
  POETRY: 'Poetry',
  NOTE: 'Note',
  RESOURCE: 'Resource',
  ARCHIVE: 'Archive',
  PROJECT: 'Project',
  JOB: 'Job',
  DAILY: 'Daily',
  CUSTOM: 'Custom'
}

export function ContentItemList({
  items: propItems,
  loading = false,
  onItemSelect,
  onCreateItem,
  onEditItem,
  onDeleteItem,
  onUpdateItem,
  className = ''
}: ContentItemListProps) {
  const [items, setItems] = useState<ContentItemRow[]>(propItems || [])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<ContentType | 'all'>('all')
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'title'>('updated')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  
  const { 
    contentFilter, 
    setContentFilter, 
    categories, 
    tags 
  } = useAppStore()
  const { toast } = useToast()

  useEffect(() => {
    if (propItems) {
      setItems(propItems)
    }
  }, [propItems])

  const filteredAndSortedItems = items
    .filter(item => {
      // Search filter
      if (searchQuery && !item.title.toLowerCase().includes(searchQuery.toLowerCase()) && 
          !item.content.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }
      
      // Type filter
      if (filterType !== 'all' && item.type !== filterType) {
        return false
      }
      
      // Category filter
      if (contentFilter.category !== 'all' && item.categoryId !== contentFilter.category) {
        return false
      }
      
      // Tag filter
      if (contentFilter.tags.length > 0) {
        // This would need to be implemented with actual tag filtering logic
        // For now, we'll skip this filter
      }
      
      // Status filter
      if (contentFilter.status !== 'all') {
        if (contentFilter.status === 'archived' && !item.archived) return false
        if (contentFilter.status === 'draft' && item.status !== 'DRAFT') return false
        if (contentFilter.status === 'published' && item.status !== 'PUBLISHED') return false
      }
      
      return true
    })
    .sort((a, b) => {
      let compareValue = 0
      
      switch (sortBy) {
        case 'updated':
          compareValue = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
          break
        case 'created':
          compareValue = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
        case 'title':
          compareValue = a.title.localeCompare(b.title)
          break
      }
      
      return sortOrder === 'asc' ? compareValue : -compareValue
    })

  const handlePinItem = async (itemId: string, pinned: boolean) => {
    try {
      const response = await fetch(`/api/content/${itemId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pinned })
      })

      if (response.ok) {
        onUpdateItem?.(itemId, { pinned })
        
        toast({
          title: 'Success',
          description: `Item ${pinned ? 'pinned' : 'unpinned'} successfully`
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update item',
        variant: 'destructive'
      })
    }
  }

  const handleArchiveItem = async (itemId: string) => {
    const item = items.find(item => item.id === itemId)
    if (!item) return
    
    const isArchiving = !item.archived
    
    try {
      const response = await fetch(`/api/content/${itemId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ archived: isArchiving })
      })

      if (response.ok) {
        onUpdateItem?.(itemId, { archived: isArchiving })
        
        toast({
          title: 'Success',
          description: isArchiving ? 'Item archived successfully' : 'Item unarchived successfully'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to ${isArchiving ? 'archive' : 'unarchive'} item`,
        variant: 'destructive'
      })
    }
  }

  const formatDate = (dateValue: string | Date) => {
    const date = new Date(dateValue)
    const now = new Date()
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffInDays === 0) return 'Today'
    if (diffInDays === 1) return 'Yesterday'
    if (diffInDays < 7) return `${diffInDays} days ago`
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`
    return date.toLocaleDateString()
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Content Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="p-4 border rounded-lg">
                <div className="h-4 bg-muted rounded w-3/4 mb-2 animate-pulse" />
                <div className="h-3 bg-muted rounded w-1/2 mb-2 animate-pulse" />
                <div className="flex gap-2">
                  <div className="h-6 bg-muted rounded w-16 animate-pulse" />
                  <div className="h-6 bg-muted rounded w-20 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="space-y-3">
          <CardTitle>Content Items</CardTitle>
          
          {/* The pane is user-resizable, so this row answers to the width it is given, not to the
              viewport - a `sm:` breakpoint would describe the window and would never fire when the
              pane is dragged. The search shrinks (`min-w-0`) but starts from a readable basis, and
              the two selects are a wrapping unit, so a narrow pane stacks them instead of squeezing
              the triggers. Measured in headless Chrome with the app's own font: 240px pane -> three
              rows; 320px -> three rows (the pair needs 112 + 8 + 176 = 296 of the 284 available);
              340px -> two rows; 528px, the current default -> one inline row. */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 grow basis-40 max-w-xs">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-full"
              />
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <Select value={filterType} onValueChange={(value) => setFilterType(value as ContentType | 'all')}>
                <SelectTrigger className="w-28 shrink-0">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(contentLabels).map(([type, label]) => (
                    <SelectItem key={type} value={type}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={`${sortBy}-${sortOrder}`} onValueChange={(value) => {
                const [field, order] = value.split('-')
                setSortBy(field as 'updated' | 'created' | 'title')
                setSortOrder(order as 'asc' | 'desc')
              }}>
                {/* `w-44`, not the old `w-32`: the trigger reserves 24px of padding, an 8px gap and
                    the 16px chevron, so 128px left 80px for the value while the default label
                    ("Recently Updated") measures 117.5px in the app's own face - it was cut
                    mid-word, which is the "clipped last control" in the report. 176px leaves
                    128px, so the label the control actually shows fits with room to spare. */}
                <SelectTrigger className="w-44 shrink-0">
                  <SelectValue placeholder="Recent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updated-desc">Recently Updated</SelectItem>
                  <SelectItem value="updated-asc">Least Recently Updated</SelectItem>
                  <SelectItem value="created-desc">Recently Created</SelectItem>
                  <SelectItem value="created-asc">Least Recently Created</SelectItem>
                  <SelectItem value="title-asc">Title (A-Z)</SelectItem>
                  <SelectItem value="title-desc">Title (Z-A)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {filteredAndSortedItems.length === 0 ? (
          <div className="text-center py-8">
            <Hash className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No items found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || filterType !== 'all' || contentFilter.category !== 'all'
                ? 'Try adjusting your filters or search query'
                : 'Create your first item to get started'
              }
            </p>
            {!searchQuery && filterType === 'all' && contentFilter.category === 'all' && (
              <Button onClick={() => onCreateItem?.('NOTE')}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Item
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredAndSortedItems.map((item) => (
              <div
                key={item.id}
                className="p-4 border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors group"
                onClick={() => onItemSelect?.(item)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {contentIcons[item.type]}
                      <h3 className="font-medium">{item.title}</h3>
                      <Badge variant="outline" className="text-xs">
                        {contentLabels[item.type]}
                      </Badge>
                      {item.pinned && (
                        <Pin className="h-3 w-3 text-primary" />
                      )}
                      {item.archived && (
                        <Archive className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                    
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {item.content}
                    </p>
                    
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{formatDate(item.updatedAt)}</span>
                      </div>
                      
                      {item.category && (
                        <div className="flex items-center gap-1">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: item.category.color }}
                          />
                          <span>{item.category.name}</span>
                        </div>
                      )}
                      
                      {item.tags && item.tags.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Hash className="h-3 w-3" />
                          <span>{item.tags.length} tags</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handlePinItem(item.id, !item.pinned)
                      }}
                    >
                      {item.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        onEditItem?.(item)
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleArchiveItem(item.id)
                      }}
                      title={item.archived ? 'Unarchive this item' : 'Archive this item'}
                    >
                      {item.archived ? <Archive className="h-4 w-4 text-orange-500" /> : <Archive className="h-4 w-4" />}
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        console.log('Delete button clicked for item:', item.id)
                        onDeleteItem?.(item.id)
                      }}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      title="Delete this item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}