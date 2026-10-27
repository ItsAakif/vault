'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

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

interface CreateTemplateData {
  name: string
  description: string
  category: string
  isPublic: boolean
  tags: string[]
  structure: {
    tasks: any[]
    milestones: any[]
    goals: any[]
  }
}

interface UseTemplateData {
  templateId: string
  projectData: {
    title: string
    description?: string
    startDate?: string
    endDate?: string
  }
}

export function useProjectTemplates() {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState({
    category: 'all',
    search: '',
    public: false,
    starred: false
  })

  // Fetch templates
  const {
    data: templates = [],
    isLoading,
    error
  } = useQuery({
    queryKey: ['project-templates', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      
      if (filters.category !== 'all') {
        params.append('category', filters.category)
      }
      if (filters.search) {
        params.append('search', filters.search)
      }
      if (filters.public) {
        params.append('public', 'true')
      }
      if (filters.starred) {
        params.append('starred', 'true')
      }

      const response = await fetch(`/api/projects/templates?${params}`)
      if (!response.ok) {
        throw new Error('Failed to fetch templates')
      }
      
      const data = await response.json()
      return data.map((template: any) => ({
        ...template,
        createdAt: new Date(template.createdAt),
        updatedAt: new Date(template.updatedAt)
      })) as ProjectTemplate[]
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (templateData: CreateTemplateData) => {
      const response = await fetch('/api/projects/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create',
          ...templateData
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create template')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-templates'] })
    }
  })

  // Use template mutation
  const useTemplateMutation = useMutation({
    mutationFn: async (data: UseTemplateData) => {
      const response = await fetch('/api/projects/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'use',
          ...data
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to use template')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    }
  })

  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: async ({ templateId, updates }: { templateId: string; updates: Partial<CreateTemplateData> }) => {
      const response = await fetch(`/api/projects/templates/${templateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update template')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-templates'] })
    }
  })

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await fetch(`/api/projects/templates/${templateId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete template')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-templates'] })
    }
  })

  // Star template mutation
  const starTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await fetch(`/api/projects/templates/${templateId}/star`, {
        method: 'POST'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to star template')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-templates'] })
    }
  })

  // Share template mutation
  const shareTemplateMutation = useMutation({
    mutationFn: async ({ templateId, shareData }: { templateId: string; shareData: any }) => {
      const response = await fetch(`/api/projects/templates/${templateId}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(shareData)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to share template')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-templates'] })
    }
  })

  // Helper functions
  const createTemplate = (templateData: CreateTemplateData) => {
    return createTemplateMutation.mutateAsync(templateData)
  }

  const useTemplate = (templateId: string, projectData: UseTemplateData['projectData']) => {
    return useTemplateMutation.mutateAsync({ templateId, projectData })
  }

  const updateTemplate = (templateId: string, updates: Partial<CreateTemplateData>) => {
    return updateTemplateMutation.mutateAsync({ templateId, updates })
  }

  const deleteTemplate = (templateId: string) => {
    return deleteTemplateMutation.mutateAsync(templateId)
  }

  const starTemplate = (templateId: string) => {
    return starTemplateMutation.mutateAsync(templateId)
  }

  const shareTemplate = (templateId: string, shareData: any) => {
    return shareTemplateMutation.mutateAsync({ templateId, shareData })
  }

  // Filter functions
  const updateFilters = (newFilters: Partial<typeof filters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }))
  }

  const resetFilters = () => {
    setFilters({
      category: 'all',
      search: '',
      public: false,
      starred: false
    })
  }

  // Get categories from templates
  const categories = Array.from(new Set(templates.map(t => t.category)))

  // Get popular templates
  const popularTemplates = templates
    .filter(t => t.usageCount > 0)
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 5)

  // Get recent templates
  const recentTemplates = templates
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5)

  return {
    // Data
    templates,
    categories,
    popularTemplates,
    recentTemplates,
    filters,
    
    // Loading states
    isLoading,
    error,
    
    // Actions
    createTemplate,
    useTemplate,
    updateTemplate,
    deleteTemplate,
    starTemplate,
    shareTemplate,
    
    // Filter actions
    updateFilters,
    resetFilters,
    
    // Mutation states
    isCreating: createTemplateMutation.isPending,
    isUsing: useTemplateMutation.isPending,
    isUpdating: updateTemplateMutation.isPending,
    isDeleting: deleteTemplateMutation.isPending,
    isStarring: starTemplateMutation.isPending,
    isSharing: shareTemplateMutation.isPending
  }
}