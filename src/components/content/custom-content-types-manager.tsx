'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { 
  Plus, 
  Edit, 
  Trash2, 
  MoreHorizontal, 
  Palette, 
  Type,
  Hash,
  Save,
  X,
  FileText,
  Lightbulb,
  BookOpen,
  Star,
  Archive,
  GripVertical,
  Eye,
  EyeOff,
  Calendar,
  Briefcase,
  StickyNote
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { isRecord, readCollection, readStringCollection } from '@/lib/api-collection'
import { cn } from '@/lib/utils'

// T093: both collections this page reads come straight from a response body. A non-array used to
// reach `setTypes` and break the `.map`/`.filter` below; the readers turn it into `[]`/`string[]`.
function isCustomContentTypeRecord(value: unknown): value is CustomContentType {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string'
}

interface CustomContentType {
  id: string
  name: string
  key: string
  description?: string
  icon?: string
  color: string
  template?: string
  fields?: string
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
  _count?: {
    contentItems: number
  }
}

interface PredefinedContentType {
  key: string
  name: string
  description: string
  icon: string
  color: string
  isSystem: true
  _count?: {
    contentItems: number
  }
}

type ContentType = CustomContentType | PredefinedContentType

interface CustomContentTypesManagerProps {
  className?: string
}

export function CustomContentTypesManager({ className }: CustomContentTypesManagerProps) {
  const [types, setTypes] = useState<CustomContentType[]>([])
  const [disabledPredefinedTypes, setDisabledPredefinedTypes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingType, setEditingType] = useState<CustomContentType | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    key: '',
    description: '',
    icon: '',
    color: '#3B82F6'
  })
  const { toast } = useToast()

  // Define predefined content types
  const predefinedTypes: PredefinedContentType[] = [
    {
      key: 'IDEA',
      name: 'Ideas',
      description: 'Brainstorming and creative concepts',
      icon: 'lightbulb',
      color: '#F59E0B',
      isSystem: true
    },
    {
      key: 'POETRY',
      name: 'Poetry',
      description: 'Creative writing and poems',
      icon: 'book-open',
      color: '#8B5CF6',
      isSystem: true
    },
    {
      key: 'NOTE',
      name: 'Notes',
      description: 'General notes and thoughts',
      icon: 'file-text',
      color: '#3B82F6',
      isSystem: true
    },
    {
      key: 'RESOURCE',
      name: 'Resources',
      description: 'Links, references, and useful materials',
      icon: 'star',
      color: '#10B981',
      isSystem: true
    },
    {
      key: 'PROJECT',
      name: 'Projects',
      description: 'Project documentation and planning',
      icon: 'briefcase',
      color: '#EF4444',
      isSystem: true
    },
    {
      key: 'JOB',
      name: 'Job Opportunities',
      description: 'Career opportunities and applications',
      icon: 'briefcase',
      color: '#06B6D4',
      isSystem: true
    },
    {
      key: 'DAILY',
      name: 'Daily Notes',
      description: 'Daily journaling and personal reflections',
      icon: 'calendar',
      color: '#84CC16',
      isSystem: true
    },
    {
      key: 'ARCHIVE',
      name: 'Archive',
      description: 'Archived and reference content',
      icon: 'archive',
      color: '#6B7280',
      isSystem: true
    }
  ]

  useEffect(() => {
    fetchCustomTypes()
    fetchDisabledTypes()
  }, [])

  const fetchCustomTypes = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/content-types')
      if (response.ok) {
        const data: unknown = await response.json()
        setTypes(readCollection(data, isCustomContentTypeRecord))
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load custom content types',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchDisabledTypes = async () => {
    try {
      const response = await fetch('/api/user/preferences')
      if (response.ok) {
        const preferences: unknown = await response.json()
        const disabledTypes = readStringCollection(
          isRecord(preferences) ? preferences.disabledContentTypes : null
        )
        setDisabledPredefinedTypes(disabledTypes)
      }
    } catch (error) {
      console.error('Failed to fetch disabled content types:', error)
    }
  }

  const updateDisabledTypes = async (newDisabledTypes: string[]) => {
    try {
      const response = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          disabledContentTypes: newDisabledTypes
        })
      })

      if (response.ok) {
        setDisabledPredefinedTypes(newDisabledTypes)
        toast({
          title: 'Success',
          description: 'Content type visibility updated'
        })
      } else {
        throw new Error('Failed to update preferences')
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update content type visibility',
        variant: 'destructive'
      })
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      key: '',
      description: '',
      icon: '',
      color: '#3B82F6'
    })
    setEditingType(null)
  }

  const handleCreate = () => {
    resetForm()
    setShowCreateDialog(true)
  }

  const handleEdit = (type: CustomContentType) => {
    setFormData({
      name: type.name,
      key: type.key,
      description: type.description || '',
      icon: type.icon || '',
      color: type.color
    })
    setEditingType(type)
    setShowCreateDialog(true)
  }

  const handleSave = async () => {
    try {
      // Generate key from name if not provided
      if (!formData.key && formData.name) {
        formData.key = formData.name.toLowerCase()
          .replace(/[^a-z0-9]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '')
      }

      const url = editingType 
        ? `/api/content-types/${editingType.id}`
        : '/api/content-types'
      
      const method = editingType ? 'PATCH' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        await fetchCustomTypes()
        setShowCreateDialog(false)
        resetForm()
        toast({
          title: 'Success',
          description: `Content type ${editingType ? 'updated' : 'created'} successfully`
        })
      } else {
        const error = await response.json()
        toast({
          title: 'Error',
          description: error.error || 'Failed to save content type',
          variant: 'destructive'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save content type',
        variant: 'destructive'
      })
    }
  }

  const handleDelete = async (type: CustomContentType) => {
    if (!confirm(`Are you sure you want to delete "${type.name}"? This action cannot be undone.`)) {
      return
    }

    try {
      const response = await fetch(`/api/content-types/${type.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await fetchCustomTypes()
        toast({
          title: 'Success',
          description: 'Content type deleted successfully'
        })
      } else {
        const error = await response.json()
        toast({
          title: 'Error',
          description: error.error || 'Failed to delete content type',
          variant: 'destructive'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete content type',
        variant: 'destructive'
      })
    }
  }

  const handleTogglePredefinedType = async (typeKey: string) => {
    const isCurrentlyDisabled = disabledPredefinedTypes.includes(typeKey)
    const newDisabledTypes = isCurrentlyDisabled
      ? disabledPredefinedTypes.filter(key => key !== typeKey)
      : [...disabledPredefinedTypes, typeKey]
    
    await updateDisabledTypes(newDisabledTypes)
  }

  const isCustomType = (type: ContentType): type is CustomContentType => {
    return 'id' in type
  }

  const getIconComponent = (iconName?: string) => {
    switch (iconName) {
      case 'lightbulb': return <Lightbulb className="h-4 w-4" />
      case 'book-open': return <BookOpen className="h-4 w-4" />
      case 'star': return <Star className="h-4 w-4" />
      case 'archive': return <Archive className="h-4 w-4" />
      case 'type': return <Type className="h-4 w-4" />
      case 'briefcase': return <Briefcase className="h-4 w-4" />
      case 'calendar': return <Calendar className="h-4 w-4" />
      case 'sticky-note': return <StickyNote className="h-4 w-4" />
      default: return <FileText className="h-4 w-4" />
    }
  }

  // Combine and sort all content types
  const allTypes: ContentType[] = [
    ...predefinedTypes.filter(type => !disabledPredefinedTypes.includes(type.key)),
    ...types
  ]

  const visiblePredefinedTypes = predefinedTypes.filter(type => !disabledPredefinedTypes.includes(type.key))
  const hiddenPredefinedTypes = predefinedTypes.filter(type => disabledPredefinedTypes.includes(type.key))

  const predefinedIcons = [
    { name: 'file-text', label: 'Document' },
    { name: 'lightbulb', label: 'Lightbulb' },
    { name: 'book-open', label: 'Book' },
    { name: 'star', label: 'Star' },
    { name: 'type', label: 'Text' },
    { name: 'archive', label: 'Archive' }
  ]

  const predefinedColors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
    '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'
  ]

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Custom Content Types</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={className}>
      {/* System Content Types */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>System Content Types</CardTitle>
          <p className="text-sm text-muted-foreground">
            Built-in content types. You can hide ones you don't use.
          </p>
        </CardHeader>
        <CardContent>
          {visiblePredefinedTypes.length === 0 && hiddenPredefinedTypes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No system content types available</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Visible predefined types */}
              {visiblePredefinedTypes.map((type) => (
                <div
                  key={type.key}
                  className="flex items-center justify-between p-3 border rounded-lg bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2">
                      <div 
                        className="w-8 h-8 rounded-md flex items-center justify-center text-white"
                        style={{ backgroundColor: type.color }}
                      >
                        {getIconComponent(type.icon)}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h4 className="font-medium">{type.name}</h4>
                        <Badge variant="outline" className="text-xs">
                          System
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{type.description}</p>
                      {type._count && (
                        <p className="text-xs text-muted-foreground">
                          {type._count.contentItems} item{type._count.contentItems !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleTogglePredefinedType(type.key)}>
                        <EyeOff className="h-4 w-4 mr-2" />
                        Hide
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}

              {/* Hidden predefined types section */}
              {hiddenPredefinedTypes.length > 0 && (
                <>
                  <div className="pt-4 border-t">
                    <h5 className="text-sm font-medium text-muted-foreground mb-3">Hidden Types</h5>
                    <div className="space-y-2">
                      {hiddenPredefinedTypes.map((type) => (
                        <div
                          key={type.key}
                          className="flex items-center justify-between p-2 border rounded-lg bg-muted/30 opacity-60"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="flex items-center space-x-2">
                              <div 
                                className="w-6 h-6 rounded-md flex items-center justify-center text-white text-xs"
                                style={{ backgroundColor: type.color }}
                              >
                                {getIconComponent(type.icon)}
                              </div>
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <h5 className="text-sm font-medium">{type.name}</h5>
                                <Badge variant="outline" className="text-xs">
                                  Hidden
                                </Badge>
                              </div>
                            </div>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleTogglePredefinedType(type.key)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Custom Content Types */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Custom Content Types</CardTitle>
            <p className="text-sm text-muted-foreground">
              Create your own content types to organize content exactly how you want.
            </p>
          </div>
          <Button onClick={handleCreate} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Type
          </Button>
        </CardHeader>
        <CardContent>
          {types.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No custom content types yet</p>
              <p className="text-sm">Create your own content types to organize your content better</p>
            </div>
          ) : (
            <div className="space-y-3">
              {types.map((type) => (
                <div
                  key={type.id}
                  className="flex items-center justify-between p-3 border rounded-lg bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <div 
                        className="w-8 h-8 rounded-md flex items-center justify-center text-white"
                        style={{ backgroundColor: type.color }}
                      >
                        {getIconComponent(type.icon)}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h4 className="font-medium">{type.name}</h4>
                        <Badge variant="secondary" className="text-xs">
                          {type.key}
                        </Badge>
                      </div>
                      {type.description && (
                        <p className="text-sm text-muted-foreground">{type.description}</p>
                      )}
                      {type._count && (
                        <p className="text-xs text-muted-foreground">
                          {type._count.contentItems} item{type._count.contentItems !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(type)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDelete(type)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {editingType ? 'Edit Content Type' : 'Create Content Type'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Recipe, Workout Plan"
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="key">Key *</Label>
                <Input
                  id="key"
                  value={formData.key}
                  onChange={(e) => setFormData(prev => ({ ...prev, key: e.target.value }))}
                  placeholder="e.g., recipe, workout_plan"
                  pattern="[a-z0-9_]+"
                />
                <p className="text-xs text-muted-foreground">
                  Used in API calls. Only lowercase letters, numbers, and underscores.
                </p>
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of this content type"
                  rows={2}
                />
              </div>
              
              <div className="grid gap-2">
                <Label>Icon</Label>
                <div className="grid grid-cols-6 gap-2">
                  {predefinedIcons.map((icon) => (
                    <Button
                      key={icon.name}
                      variant={formData.icon === icon.name ? 'default' : 'outline'}
                      size="sm"
                      className="h-10"
                      onClick={() => setFormData(prev => ({ ...prev, icon: icon.name }))}
                    >
                      {getIconComponent(icon.name)}
                    </Button>
                  ))}
                </div>
              </div>
              
              <div className="grid gap-2">
                <Label>Color</Label>
                <div className="grid grid-cols-8 gap-2">
                  {predefinedColors.map((color) => (
                    <Button
                      key={color}
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-8 w-8 p-0 border-2",
                        formData.color === color && "ring-2 ring-ring ring-offset-2"
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() => setFormData(prev => ({ ...prev, color }))}
                    />
                  ))}
                </div>
              </div>
              
              <div className="flex justify-end space-x-2 pt-4">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={!formData.name || !formData.key}>
                  <Save className="h-4 w-4 mr-2" />
                  {editingType ? 'Update' : 'Create'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
    </div>
  )
}