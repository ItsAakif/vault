'use client'

import { useState, useEffect } from 'react'
import { Category as PrismaCategory } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Category extends PrismaCategory {
  children: Category[]
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
import { 
  Plus, 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  Folder, 
  FolderOpen,
  ChevronRight,
  Hash,
  FileText,
  Lightbulb,
  BookOpen,
  Briefcase,
  Calendar,
  Archive,
  Users,
  Star
} from 'lucide-react'
import { useAppStore } from '@/store'
import { useToast } from '@/hooks/use-toast'
import { DriveRequiredNotice } from '@/components/drive/drive-required-notice'
import { readCollection } from '@/lib/api-collection'
import { parseDriveFailure, type DriveFailure } from '@/lib/drive-client'
import { cn } from '@/lib/utils'

// T093: `GET /api/categories` answers with a bare array. A non-array body used to reach
// `setCategories` and throw on `data.filter(...)` two lines later; `readCollection` makes it `[]`
// and the list renders its empty state. Only the fields every row reads are required - `children`
// is normalised separately (T062), so a payload without it still reaches the renderer.
function isCategoryRecord(value: unknown): value is Category {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { id?: unknown; name?: unknown }
  return typeof candidate.id === 'string' && typeof candidate.name === 'string'
}

interface CategoryListProps {
  selectedCategory?: string | null
  onCategorySelect?: (category: Category | null) => void
  className?: string
  /**
   * T086: the navigation rail's Categories disclosure renders this list inside the
   * navigation, where a second bordered card and a second "Categories" title would
   * duplicate the disclosure header. `compact` drops the surface and the title and
   * gives the add control a visible label.
   *
   * PRESENTATION ONLY. Every handler, dialog, validation rule and server call below is
   * shared with the card presentation, so the app still has exactly one implementation
   * of "what deleting a category does".
   */
  compact?: boolean
}

const categoryIcons: Record<string, React.ReactNode> = {
  'Ideas': <Lightbulb className="h-4 w-4" />,
  'Poetry': <BookOpen className="h-4 w-4" />,
  'Notes': <FileText className="h-4 w-4" />,
  'Resources': <Star className="h-4 w-4" />,
  'Projects': <Briefcase className="h-4 w-4" />,
  'Jobs': <Users className="h-4 w-4" />,
  'Daily': <Calendar className="h-4 w-4" />,
  'Archive': <Archive className="h-4 w-4" />
}

// T086: one surface, two densities. The card presentation is unchanged; the compact
// presentation is the rail's: no nested card, no duplicated "Categories" title. The
// component's behaviour is identical in both, including the Drive notice and the guards.
function CategorySurface({
  compact,
  className,
  children
}: {
  compact: boolean
  className?: string
  children: React.ReactNode
}) {
  if (compact) {
    return <div className={cn('space-y-1', className)}>{children}</div>
  }
  return <Card className={className}>{children}</Card>
}

export function CategoryList({ 
  selectedCategory, 
  onCategorySelect, 
  className = '',
  compact = false
}: CategoryListProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [selectedCategoryForEdit, setSelectedCategoryForEdit] = useState<Category | null>(null)
  // ADR-008 D5: set only for the two Drive codes, so a generic failure keeps the existing
  // behaviour and the notice never lies about Drive being disconnected.
  const [driveFailure, setDriveFailure] = useState<DriveFailure | null>(null)
  const [newCategory, setNewCategory] = useState({
    name: '',
    description: '',
    color: '#3B82F6',
    icon: '',
    parentId: ''
  })
  const [editCategory, setEditCategory] = useState({
    name: '',
    description: '',
    color: '#3B82F6',
    icon: ''
  })
  
  const { setCategories: setStoreCategories } = useAppStore()
  const { toast } = useToast()

  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/categories')
      if (response.ok) {
        setDriveFailure(null)
        const data: unknown = await response.json()
        const fetchedCategories = readCollection(data, isCategoryRecord)
        setCategories(fetchedCategories)
        setStoreCategories(fetchedCategories)

        // Expand root level categories by default
        const rootCategories = fetchedCategories.filter((cat) => !cat.parentId)
        setExpandedCategories(new Set(rootCategories.map((cat) => cat.id)))
        return
      }
      const body = await response.json().catch(() => null)
      setDriveFailure(parseDriveFailure(body))
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load categories',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleEditCategory = async () => {
    if (!selectedCategoryForEdit) return

    try {
      const response = await fetch(`/api/categories/${selectedCategoryForEdit.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(editCategory)
      })

      if (response.ok) {
        await fetchCategories()
        setShowEditDialog(false)
        setSelectedCategoryForEdit(null)
        
        toast({
          title: 'Success',
          description: 'Category updated successfully'
        })
      } else {
        const error = await response.json()
        const failure = parseDriveFailure(error)
        if (failure) setDriveFailure(failure)
        toast({
          title: 'Error',
          description: error.error || 'Failed to update category',
          variant: 'destructive'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update category',
        variant: 'destructive'
      })
    }
  }

  const handleCreateCategory = async () => {
    try {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newCategory)
      })

      if (response.ok) {
        await fetchCategories()
        setShowCreateDialog(false)
        setNewCategory({
          name: '',
          description: '',
          color: '#3B82F6',
          icon: '',
          parentId: ''
        })
        
        toast({
          title: 'Success',
          description: 'Category created successfully'
        })
      } else {
        const error = await response.json()
        const failure = parseDriveFailure(error)
        if (failure) setDriveFailure(failure)
        toast({
          title: 'Error',
          description: error.error || 'Failed to create category',
          variant: 'destructive'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create category',
        variant: 'destructive'
      })
    }
  }

  const handleDeleteCategory = async (categoryId: string) => {
    try {
      const response = await fetch(`/api/categories/${categoryId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await fetchCategories()
        
        if (selectedCategory === categoryId) {
          onCategorySelect?.(null)
        }
        
        toast({
          title: 'Success',
          description: 'Category deleted successfully'
        })
      } else {
        const error = await response.json()
        toast({
          title: 'Error',
          description: error.error || 'Failed to delete category',
          variant: 'destructive'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete category',
        variant: 'destructive'
      })
    }
  }

  const toggleExpanded = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId)
    } else {
      newExpanded.add(categoryId)
    }
    setExpandedCategories(newExpanded)
  }

  const renderCategory = (category: Category, level: number = 0) => {
    // ADR-009 D2: a client component cannot rely on the shape of a payload it did not construct
    // (a cached body, an older server deploy, a third construction path). The declared type says
    // `children` is required; the runtime tolerates its absence rather than white-screening.
    const hasChildren = (category.children?.length ?? 0) > 0

    // T085 (density): the row is 32px instead of ~40px. `min-h-8` is the hit target and the
    // floor, `py-1` contributes 8px of it, and the 24px chevron button now sits INSIDE the row
    // instead of setting its height (24 + 8 lands exactly on 32). `min-h` rather than `h` so a
    // long name can still wrap instead of being clipped.
    const isExpanded = expandedCategories.has(category.id)
    const isSelected = selectedCategory === category.id

    return (
      <div key={category.id}>
        <div
          className={`flex min-h-8 items-center justify-between rounded-lg px-2 py-1 cursor-pointer transition-colors ${
            isSelected 
              ? 'bg-primary text-primary-foreground' 
              : 'hover:bg-accent hover:text-accent-foreground'
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => onCategorySelect?.(category)}
        >
          <div className="flex items-center gap-1.5 flex-1">
            {hasChildren && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleExpanded(category.id)
                }}
              >
                <ChevronRight 
                  className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
                />
              </Button>
            )}
            
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: category.color }}
            />
            
            {category.icon ? (
              <span className="text-sm">{category.icon}</span>
            ) : (
              categoryIcons[category.name] || <Folder className="h-4 w-4" />
            )}
            
            <span className="text-sm font-medium flex-1">
              {category.name}
            </span>
            
            {(category._count?.contentItems ?? 0) > 0 && (
              <Badge variant="secondary" className="text-xs">
                {category._count?.contentItems}
              </Badge>
            )}
          </div>
          
          {!category.isSystem && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {/* T086: edit/delete used to be `opacity-0 group-hover:opacity-100` on a row
                    that was not a `group`, i.e. invisible in practice. The menu button is now
                    always visible - the user asked for category management they can find. The
                    menu still decides what may be deleted (`isSystem` rows render no menu). */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  aria-label={`Actions for ${category.name}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedCategoryForEdit(category)
                    setEditCategory({
                      name: category.name,
                      description: category.description || '',
                      color: category.color,
                      icon: category.icon || ''
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
                    handleDeleteCategory(category.id)
                  }}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        
        {hasChildren && isExpanded && (
          <div>
            {(category.children ?? []).map((child) => 
              renderCategory(child, level + 1)
            )}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <CategorySurface compact={compact} className={className}>
        <CardHeader className={compact ? 'p-0 pb-1' : undefined}>
          {compact ? null : <CardTitle className="text-sm">Categories</CardTitle>}
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 bg-muted rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </CategorySurface>
    )
  }

  return (
    <CategorySurface compact={compact} className={className}>
      <CardHeader className="pb-1">
        <div className={cn('flex items-center', compact ? 'justify-end' : 'justify-between')}>
          {compact ? null : <CardTitle className="text-sm">Categories</CardTitle>}
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              {/* T086: the "+" the card header always had. In the rail it carries a visible
                  label, because a bare icon inside a disclosure reads as decoration; the
                  dialog it opens is the same one, with the same handler and validation. */}
              <Button
                variant="ghost"
                size="sm"
                className={compact ? 'h-7 gap-1 px-2 text-xs' : undefined}
              >
                <Plus className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                {compact ? 'New category' : null}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Category</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={newCategory.name}
                    onChange={(e) => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Category name"
                  />
                </div>
                
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={newCategory.description}
                    onChange={(e) => setNewCategory(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Category description"
                  />
                </div>
                
                <div>
                  <Label htmlFor="color">Color</Label>
                  <Input
                    id="color"
                    type="color"
                    value={newCategory.color}
                    onChange={(e) => setNewCategory(prev => ({ ...prev, color: e.target.value }))}
                    className="h-10"
                  />
                </div>
                
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateCategory}>
                    Create
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {driveFailure ? (
          // The create dialog and its trigger (above) stay mounted; the notice is the primary
          // explanation when the list could not be read.
          //
          // T088: the rail renders this list with `compact`, and the rail is 224px wide, so a
          // failure inside it gets the notice's narrow form (inline link, text-xs, 8px padding).
          // Every wide caller keeps the default card, because `compact` defaults to false.
          <DriveRequiredNotice message={driveFailure.message} compact={compact} />
        ) : (
          <div className="space-y-1">
            {/* All Items */}
            <div
              className={`flex min-h-8 items-center justify-between rounded-lg px-2 py-1 cursor-pointer transition-colors ${
                !selectedCategory 
                  ? 'bg-primary text-primary-foreground' 
                  : 'hover:bg-accent hover:text-accent-foreground'
              }`}
              onClick={() => onCategorySelect?.(null)}
            >
              <div className="flex items-center gap-1.5 flex-1">
                <Hash className="h-4 w-4" />
                <span className="text-sm font-medium">All Items</span>
              </div>
            </div>
            
            {/* Categories */}
            {categories
              .filter(cat => !cat.parentId)
              .map(category => renderCategory(category))}
          </div>
        )}
      </CardContent>

      {/* Edit Category Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="editName">Name</Label>
              <Input
                id="editName"
                value={editCategory.name}
                onChange={(e) => setEditCategory(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Category name"
              />
            </div>
            
            <div>
              <Label htmlFor="editDescription">Description</Label>
              <Input
                id="editDescription"
                value={editCategory.description}
                onChange={(e) => setEditCategory(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Category description"
              />
            </div>
            
            <div>
              <Label htmlFor="editColor">Color</Label>
              <Input
                id="editColor"
                type="color"
                value={editCategory.color}
                onChange={(e) => setEditCategory(prev => ({ ...prev, color: e.target.value }))}
                className="h-10"
              />
            </div>
            
            <div>
              <Label htmlFor="editIcon">Icon (optional emoji)</Label>
              <Input
                id="editIcon"
                value={editCategory.icon}
                onChange={(e) => setEditCategory(prev => ({ ...prev, icon: e.target.value }))}
                placeholder="📁"
                maxLength={2}
              />
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleEditCategory}>
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </CategorySurface>
  )
}
