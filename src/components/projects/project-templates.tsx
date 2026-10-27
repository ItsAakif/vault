'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { 
  LayoutTemplate, 
  Plus, 
  Copy, 
  Edit, 
  Trash2, 
  Share2, 
  Download, 
  Upload,
  Star,
  Users,
  Calendar,
  Target,
  CheckCircle,
  Globe,
  Lock
} from 'lucide-react'
import { toast } from 'sonner'

interface ProjectTemplate {
  id: string
  name: string
  description: string
  category: string
  isPublic: boolean
  isStarred: boolean
  usageCount: number
  author: {
    id: string
    name: string
    email: string
    avatar?: string
  }
  structure: {
    tasks: Array<{
      title: string
      description?: string
      priority: string
      estimatedHours?: number
      dependencies?: string[]
    }>
    milestones: Array<{
      title: string
      description?: string
      dueDate?: string
    }>
    goals: Array<{
      title: string
      type: string
      targetValue: number
      unit: string
    }>
  }
  tags: string[]
  createdAt: Date
  updatedAt: Date
}

interface ProjectTemplatesProps {
  templates: ProjectTemplate[]
  currentUserId: string
  onCreateTemplate: (templateData: any) => Promise<void>
  onUpdateTemplate: (templateId: string, updates: any) => Promise<void>
  onDeleteTemplate: (templateId: string) => Promise<void>
  onUseTemplate: (templateId: string, projectData: any) => Promise<void>
  onStarTemplate: (templateId: string) => Promise<void>
  onShareTemplate: (templateId: string, shareData: any) => Promise<void>
}

export function ProjectTemplates({
  templates,
  currentUserId,
  onCreateTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onUseTemplate,
  onStarTemplate,
  onShareTemplate
}: ProjectTemplatesProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false)
  const [isUseDialogOpen, setIsUseDialogOpen] = React.useState(false)
  const [selectedTemplate, setSelectedTemplate] = React.useState<ProjectTemplate | null>(null)
  const [filterCategory, setFilterCategory] = React.useState<string>('all')
  const [searchQuery, setSearchQuery] = React.useState('')
  
  const [newTemplate, setNewTemplate] = React.useState({
    name: '',
    description: '',
    category: 'general',
    isPublic: false,
    tags: [] as string[],
    structure: {
      tasks: [] as any[],
      milestones: [] as any[],
      goals: [] as any[]
    }
  })

  const [newProject, setNewProject] = React.useState({
    title: '',
    description: '',
    startDate: '',
    endDate: ''
  })

  // Get unique categories
  const categories = React.useMemo(() => {
    const cats = new Set(templates.map(t => t.category))
    return Array.from(cats)
  }, [templates])

  // Filter templates
  const filteredTemplates = React.useMemo(() => {
    return templates.filter(template => {
      if (filterCategory !== 'all' && template.category !== filterCategory) {
        return false
      }
      if (searchQuery && !template.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !template.description.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }
      return true
    })
  }, [templates, filterCategory, searchQuery])

  const handleCreateTemplate = async () => {
    if (!newTemplate.name.trim()) {
      toast.error('Template name is required')
      return
    }

    try {
      await onCreateTemplate(newTemplate)
      setNewTemplate({
        name: '',
        description: '',
        category: 'general',
        isPublic: false,
        tags: [],
        structure: {
          tasks: [],
          milestones: [],
          goals: []
        }
      })
      setIsCreateDialogOpen(false)
      toast.success('Template created successfully')
    } catch (error) {
      toast.error('Failed to create template')
    }
  }

  const handleUseTemplate = async () => {
    if (!selectedTemplate || !newProject.title.trim()) {
      toast.error('Project title is required')
      return
    }

    try {
      await onUseTemplate(selectedTemplate.id, newProject)
      setNewProject({
        title: '',
        description: '',
        startDate: '',
        endDate: ''
      })
      setSelectedTemplate(null)
      setIsUseDialogOpen(false)
      toast.success('Project created from template')
    } catch (error) {
      toast.error('Failed to create project from template')
    }
  }

  const handleStarTemplate = async (templateId: string) => {
    try {
      await onStarTemplate(templateId)
    } catch (error) {
      toast.error('Failed to star template')
    }
  }

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      await onDeleteTemplate(templateId)
      toast.success('Template deleted successfully')
    } catch (error) {
      toast.error('Failed to delete template')
    }
  }

  const TemplateCard = ({ template }: { template: ProjectTemplate }) => {
    const isOwner = template.author.id === currentUserId
    const taskCount = template.structure.tasks.length
    const milestoneCount = template.structure.milestones.length
    const goalCount = template.structure.goals.length

    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-lg flex items-center gap-2">
                {template.name}
                {template.isStarred && (
                  <Star className="h-4 w-4 text-yellow-500 fill-current" />
                )}
                {template.isPublic ? (
                  <Globe className="h-4 w-4 text-green-500" />
                ) : (
                  <Lock className="h-4 w-4 text-gray-500" />
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                {template.description}
              </CardDescription>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleStarTemplate(template.id)}
              className={template.isStarred ? 'text-yellow-500' : ''}
            >
              <Star className={`h-4 w-4 ${template.isStarred ? 'fill-current' : ''}`} />
            </Button>
          </div>
          
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline">{template.category}</Badge>
            <span className="text-xs text-muted-foreground">
              Used {template.usageCount} times
            </span>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="space-y-4">
            {/* Template Stats */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-lg font-semibold">{taskCount}</div>
                <div className="text-xs text-muted-foreground">Tasks</div>
              </div>
              <div>
                <div className="text-lg font-semibold">{milestoneCount}</div>
                <div className="text-xs text-muted-foreground">Milestones</div>
              </div>
              <div>
                <div className="text-lg font-semibold">{goalCount}</div>
                <div className="text-xs text-muted-foreground">Goals</div>
              </div>
            </div>
            
            {/* Tags */}
            {(template.tags?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1">
                {(template.tags ?? []).map((tag, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            
            {/* Author */}
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={template.author.avatar} />
                <AvatarFallback className="text-xs">
                  {template.author.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-muted-foreground">
                by {template.author.name}
              </span>
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-2 pt-2 border-t">
              <Button
                size="sm"
                onClick={() => {
                  setSelectedTemplate(template)
                  setIsUseDialogOpen(true)
                }}
              >
                <Plus className="h-3 w-3 mr-1" />
                Use Template
              </Button>
              
              <Button variant="outline" size="sm">
                <Copy className="h-3 w-3 mr-1" />
                Duplicate
              </Button>
              
              {isOwner && (
                <>
                  <Button variant="outline" size="sm">
                    <Edit className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteTemplate(template.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <LayoutTemplate className="h-6 w-6" />
            Project Templates
          </h2>
          <p className="text-muted-foreground">
            Create projects faster with pre-built templates
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Project Template</DialogTitle>
                <DialogDescription>
                  Create a reusable template for future projects
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Template Name</Label>
                    <Input
                      id="name"
                      value={newTemplate.name}
                      onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                      placeholder="e.g., Website Redesign"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Select 
                      value={newTemplate.category} 
                      onValueChange={(value) => setNewTemplate({ ...newTemplate, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="software">Software Development</SelectItem>
                        <SelectItem value="marketing">Marketing</SelectItem>
                        <SelectItem value="design">Design</SelectItem>
                        <SelectItem value="research">Research</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={newTemplate.description}
                    onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                    placeholder="Describe what this template is for..."
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="isPublic"
                    checked={newTemplate.isPublic}
                    onCheckedChange={(checked) => 
                      setNewTemplate({ ...newTemplate, isPublic: checked })
                    }
                  />
                  <Label htmlFor="isPublic">Make template public</Label>
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateTemplate}>
                  Create Template
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <Input
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
        
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(category => (
              <SelectItem key={category} value={category}>
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Templates Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredTemplates.length === 0 ? (
          <div className="col-span-full">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <LayoutTemplate className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Templates Found</h3>
                <p className="text-muted-foreground text-center mb-4">
                  {searchQuery || filterCategory !== 'all' 
                    ? 'Try adjusting your search or filters'
                    : 'Create your first template to get started'
                  }
                </p>
                {!searchQuery && filterCategory === 'all' && (
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Template
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          filteredTemplates.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))
        )}
      </div>

      {/* Use Template Dialog */}
      <Dialog open={isUseDialogOpen} onOpenChange={setIsUseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Project from Template</DialogTitle>
            <DialogDescription>
              {selectedTemplate && `Using template: ${selectedTemplate.name}`}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="projectTitle">Project Title</Label>
              <Input
                id="projectTitle"
                value={newProject.title}
                onChange={(e) => setNewProject({ ...newProject, title: e.target.value })}
                placeholder="Enter project title"
              />
            </div>
            
            <div>
              <Label htmlFor="projectDescription">Description (Optional)</Label>
              <Textarea
                id="projectDescription"
                value={newProject.description}
                onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                placeholder="Describe your project..."
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startDate">Start Date (Optional)</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={newProject.startDate}
                  onChange={(e) => setNewProject({ ...newProject, startDate: e.target.value })}
                />
              </div>
              
              <div>
                <Label htmlFor="endDate">End Date (Optional)</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={newProject.endDate}
                  onChange={(e) => setNewProject({ ...newProject, endDate: e.target.value })}
                />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUseDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUseTemplate}>
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}