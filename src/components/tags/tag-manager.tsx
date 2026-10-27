'use client'

import { useState, useEffect } from 'react'
import { Tag as PrismaTag } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Tag extends PrismaTag {
  children: Tag[]
  _count?: {
    contentItems: number
  }
}
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { 
  Plus, 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  Hash, 
  Tag as TagIcon, 
  Palette,
  Search,
  Folder,
  FolderOpen,
  ChevronRight,
  GitMerge,
  Users
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { DriveRequiredNotice } from '@/components/drive/drive-required-notice'
import { parseDriveFailure, type DriveFailure } from '@/lib/drive-client'

interface TagManagerProps {
  onTagSelect?: (tag: Tag) => void
  selectedTags?: string[]
  className?: string
}

export function TagManager({ 
  onTagSelect, 
  selectedTags = [], 
  className = '' 
}: TagManagerProps) {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  // ADR-008 D5: set only for a Drive-code failure, so an empty tag list is explained by the
  // connect CTA instead of reading as "you have no tags".
  const [driveFailure, setDriveFailure] = useState<DriveFailure | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set())
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showMergeDialog, setShowMergeDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [selectedTagForMerge, setSelectedTagForMerge] = useState<Tag | null>(null)
  const [selectedTagForEdit, setSelectedTagForEdit] = useState<Tag | null>(null)
  const [newTag, setNewTag] = useState({
    name: '',
    description: '',
    color: '#10B981',
    parentId: ''
  })
  const [editTag, setEditTag] = useState({
    name: '',
    description: '',
    color: '#10B981'
  })
  const [mergeTarget, setMergeTarget] = useState('')
  
  const { toast } = useToast()

  useEffect(() => {
    fetchTags()
  }, [])

  const fetchTags = async () => {
    setLoading(true)
    // A refetch clears a previous Drive failure: a stale notice would claim Drive is
    // disconnected while the tag list is loading fine.
    setDriveFailure(null)
    try {
      const response = await fetch('/api/tags?includeUsage=true')
      if (response.ok) {
        const data = await response.json()
        setTags(data)
        
        // Expand root level tags by default
        const rootTags = data.filter((tag: Tag) => !tag.parentId)
        setExpandedTags(new Set(rootTags.map((tag: Tag) => tag.id)))
      } else {
        // ADR-008 D5: a Drive code explains the otherwise empty list; a generic 500 parses to
        // null and keeps the previous behaviour.
        setDriveFailure(parseDriveFailure(await response.json().catch(() => null)))
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load tags',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleEditTag = async () => {
    if (!selectedTagForEdit) return

    try {
      const response = await fetch(`/api/tags/${selectedTagForEdit.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(editTag)
      })

      if (response.ok) {
        await fetchTags()
        setShowEditDialog(false)
        setSelectedTagForEdit(null)
        
        toast({
          title: 'Success',
          description: 'Tag updated successfully'
        })
      } else {
        const error = await response.json()
        toast({
          title: 'Error',
          description: error.error || 'Failed to update tag',
          variant: 'destructive'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update tag',
        variant: 'destructive'
      })
    }
  }

  const handleCreateTag = async () => {
    try {
      const response = await fetch('/api/tags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newTag)
      })

      if (response.ok) {
        await fetchTags()
        setShowCreateDialog(false)
        setNewTag({
          name: '',
          description: '',
          color: '#10B981',
          parentId: ''
        })
        
        toast({
          title: 'Success',
          description: 'Tag created successfully'
        })
      } else {
        const error = await response.json().catch(() => null)
        // A failed create must be explained: the existing toast keeps its message, and a Drive
        // code additionally sets the notice state (ADR-008 D5).
        setDriveFailure(parseDriveFailure(error))
        toast({
          title: 'Error',
          description: error?.error || 'Failed to create tag',
          variant: 'destructive'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create tag',
        variant: 'destructive'
      })
    }
  }

  const handleDeleteTag = async (tagId: string) => {
    try {
      const response = await fetch(`/api/tags/${tagId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await fetchTags()
        
        toast({
          title: 'Success',
          description: 'Tag deleted successfully'
        })
      } else {
        const error = await response.json()
        toast({
          title: 'Error',
          description: error.error || 'Failed to delete tag',
          variant: 'destructive'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete tag',
        variant: 'destructive'
      })
    }
  }

  const handleMergeTags = async () => {
    if (!selectedTagForMerge || !mergeTarget) return

    try {
      const response = await fetch(`/api/tags/${selectedTagForMerge.id}/merge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ targetTagId: mergeTarget })
      })

      if (response.ok) {
        const result = await response.json()
        await fetchTags()
        setShowMergeDialog(false)
        setSelectedTagForMerge(null)
        setMergeTarget('')
        
        toast({
          title: 'Success',
          description: result.message || 'Tags merged successfully'
        })
      } else {
        const error = await response.json()
        toast({
          title: 'Error',
          description: error.error || 'Failed to merge tags',
          variant: 'destructive'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to merge tags',
        variant: 'destructive'
      })
    }
  }

  const toggleExpanded = (tagId: string) => {
    const newExpanded = new Set(expandedTags)
    if (newExpanded.has(tagId)) {
      newExpanded.delete(tagId)
    } else {
      newExpanded.add(tagId)
    }
    setExpandedTags(newExpanded)
  }

  const filteredTags = tags.filter(tag => 
    tag.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (tag.description && tag.description.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const renderTag = (tag: Tag, level: number = 0) => {
    const hasChildren = (tag.children?.length ?? 0) > 0
    const isExpanded = expandedTags.has(tag.id)
    const isSelected = selectedTags.includes(tag.id)

    return (
      <div key={tag.id}>
        <div
          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors group ${
            isSelected 
              ? 'bg-primary text-primary-foreground' 
              : 'hover:bg-accent hover:text-accent-foreground'
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => onTagSelect?.(tag)}
        >
          <div className="flex items-center gap-2 flex-1">
            {hasChildren && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleExpanded(tag.id)
                }}
              >
                <ChevronRight 
                  className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
                />
              </Button>
            )}
            
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: tag.color }}
            />
            
            <Hash className="h-4 w-4" />
            
            <span className="text-sm font-medium flex-1">
              {tag.name}
            </span>
            
            {(tag._count?.contentItems ?? 0) > 0 && (
              <Badge variant="secondary" className="text-xs">
                {tag._count?.contentItems}
              </Badge>
            )}
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedTagForMerge(tag)
                  setShowMergeDialog(true)
                }}
              >
                <GitMerge className="h-4 w-4 mr-2" />
                Merge Tag
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedTagForEdit(tag)
                  setEditTag({
                    name: tag.name,
                    description: tag.description || '',
                    color: tag.color
                  })
                  setShowEditDialog(true)
                }}
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteTag(tag.id)
                }}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {hasChildren && isExpanded && (
          <div>
            {(tag.children ?? []).map((child) => renderTag(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-sm">Tags</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 bg-muted rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Tags</CardTitle>
          
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-40"
              />
            </div>
            
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Tag</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="tagName">Name</Label>
                    <Input
                      id="tagName"
                      value={newTag.name}
                      onChange={(e) => setNewTag(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Tag name"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="tagDescription">Description</Label>
                    <Input
                      id="tagDescription"
                      value={newTag.description}
                      onChange={(e) => setNewTag(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Tag description"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="tagColor">Color</Label>
                    <Input
                      id="tagColor"
                      type="color"
                      value={newTag.color}
                      onChange={(e) => setNewTag(prev => ({ ...prev, color: e.target.value }))}
                      className="h-10"
                    />
                  </div>
                  
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateTag}>
                      Create
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="space-y-1">
          {/* ADR-008 D5 composed inside the shared error vocabulary (ADR-011 D3): the notice is the
              error state's content, and no retry sits beside the connect CTA. */}
          {filteredTags.length === 0 && driveFailure && (
            <ErrorState>
              <DriveRequiredNotice message={driveFailure.message} />
            </ErrorState>
          )}

          {filteredTags.length === 0 && !driveFailure && (
            tags.length === 0 ? (
              <EmptyState
                icon={Hash}
                title="No tags yet"
                description="Tags are how you group notes across categories."
                action={{ label: 'New tag', onClick: () => setShowCreateDialog(true) }}
              />
            ) : (
              <EmptyState
                icon={TagIcon}
                title="No tags match that search"
                description={`No tag matches '${searchQuery}'.`}
                action={{ label: 'Clear search', onClick: () => setSearchQuery('') }}
              />
            )
          )}

          {filteredTags.length > 0 && (
            filteredTags
              .filter(tag => !tag.parentId)
              .map(tag => renderTag(tag))
          )}
        </div>
      </CardContent>

      {/* Edit Tag Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="editTagName">Name</Label>
              <Input
                id="editTagName"
                value={editTag.name}
                onChange={(e) => setEditTag(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Tag name"
              />
            </div>
            
            <div>
              <Label htmlFor="editTagDescription">Description</Label>
              <Input
                id="editTagDescription"
                value={editTag.description}
                onChange={(e) => setEditTag(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Tag description"
              />
            </div>
            
            <div>
              <Label htmlFor="editTagColor">Color</Label>
              <Input
                id="editTagColor"
                type="color"
                value={editTag.color}
                onChange={(e) => setEditTag(prev => ({ ...prev, color: e.target.value }))}
                className="h-10"
              />
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleEditTag}>
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Merge Tag Dialog */}
      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Source Tag</Label>
              <div className="flex items-center gap-2 p-2 border rounded">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: selectedTagForMerge?.color }}
                />
                <span>{selectedTagForMerge?.name}</span>
              </div>
            </div>
            
            <div>
              <Label htmlFor="mergeTarget">Merge Into</Label>
              <select
                id="mergeTarget"
                value={mergeTarget}
                onChange={(e) => setMergeTarget(e.target.value)}
                className="w-full p-2 border rounded"
              >
                <option value="">Select a tag to merge into</option>
                {tags
                  .filter(tag => tag.id !== selectedTagForMerge?.id)
                  .map(tag => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
              </select>
            </div>
            
            <div className="bg-muted p-3 rounded-lg">
              <p className="text-sm">
                This will merge "{selectedTagForMerge?.name}" into the selected tag. 
                All content items with the source tag will also have the target tag.
              </p>
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowMergeDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleMergeTags} 
                disabled={!mergeTarget}
                className="bg-destructive hover:bg-destructive"
              >
                Merge Tags
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
