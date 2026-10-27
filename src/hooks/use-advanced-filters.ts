'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useDebounce } from '@reactuses/core'
import { FilterCriteria, FilterPreset } from '@/types/filters'
import { useToast } from './use-feedback'

interface UseAdvancedFiltersOptions {
  initialCriteria?: Partial<FilterCriteria>
  onFilterChange?: (criteria: FilterCriteria, activeCount: number) => void
  persistKey?: string // For localStorage persistence
  debounceMs?: number
}

interface FilterStats {
  totalItems: number
  filteredItems: number
  activeFilterCount: number
  filterEfficiency: number // percentage of items filtered out
}

export function useAdvancedFilters({
  initialCriteria = {},
  onFilterChange,
  persistKey,
  debounceMs = 300
}: UseAdvancedFiltersOptions = {}) {
  const { success, error: toastError } = useToast()

  // Default criteria
  const defaultCriteria: FilterCriteria = {
    contentTypes: [],
    categories: [],
    tags: [],
    status: [],
    priority: [],
    authors: [],
    assignees: [],
    dateRange: {
      start: null,
      end: null,
      preset: null
    },
    hasAttachments: null,
    isArchived: null,
    isPinned: null,
    isShared: null,
    titleContains: '',
    contentContains: '',
    progressMin: null,
    progressMax: null,
    customFields: {}
  }

  // Load initial criteria from localStorage if persistKey is provided
  const getInitialCriteria = useCallback(() => {
    if (persistKey && typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(`filters_${persistKey}`)
        if (saved) {
          const parsed = JSON.parse(saved)
          // Convert date strings back to Date objects
          if (parsed.dateRange) {
            if (parsed.dateRange.start) {
              parsed.dateRange.start = new Date(parsed.dateRange.start)
            }
            if (parsed.dateRange.end) {
              parsed.dateRange.end = new Date(parsed.dateRange.end)
            }
          }
          return { ...defaultCriteria, ...parsed, ...initialCriteria }
        }
      } catch (error) {
        console.warn('Failed to load saved filters:', error)
      }
    }
    return { ...defaultCriteria, ...initialCriteria }
  }, [persistKey, initialCriteria])

  const [criteria, setCriteria] = useState<FilterCriteria>(getInitialCriteria)
  const [presets, setPresets] = useState<FilterPreset[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Debounced criteria for performance
  const debouncedCriteria = useDebounce(criteria, debounceMs)

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0
    
    count += criteria.contentTypes.length
    count += criteria.categories.length
    count += criteria.tags.length
    count += criteria.status.length
    count += criteria.priority.length
    count += criteria.authors.length
    count += criteria.assignees.length
    
    if (criteria.dateRange.start || criteria.dateRange.end) count++
    if (criteria.hasAttachments !== null) count++
    if (criteria.isArchived !== null) count++
    if (criteria.isPinned !== null) count++
    if (criteria.isShared !== null) count++
    if (criteria.titleContains.trim()) count++
    if (criteria.contentContains.trim()) count++
    if (criteria.progressMin !== null || criteria.progressMax !== null) count++
    
    return count
  }, [criteria])

  // Check if filters are active
  const hasActiveFilters = useMemo(() => activeFilterCount > 0, [activeFilterCount])

  // Persist criteria to localStorage
  useEffect(() => {
    if (persistKey && typeof window !== 'undefined') {
      try {
        localStorage.setItem(`filters_${persistKey}`, JSON.stringify(criteria))
      } catch (error) {
        console.warn('Failed to save filters:', error)
      }
    }
  }, [criteria, persistKey])

  // Notify parent of changes
  useEffect(() => {
    onFilterChange?.(debouncedCriteria, activeFilterCount)
  }, [debouncedCriteria, activeFilterCount, onFilterChange])

  // Load presets from localStorage
  useEffect(() => {
    if (persistKey && typeof window !== 'undefined') {
      try {
        const savedPresets = localStorage.getItem(`filter_presets_${persistKey}`)
        if (savedPresets) {
          const parsed = JSON.parse(savedPresets)
          setPresets(parsed.map((preset: any) => ({
            ...preset,
            createdAt: new Date(preset.createdAt),
            updatedAt: new Date(preset.updatedAt)
          })))
        }
      } catch (error) {
        console.warn('Failed to load filter presets:', error)
      }
    }
  }, [persistKey])

  // Update criteria
  const updateCriteria = useCallback((updates: Partial<FilterCriteria>) => {
    setCriteria(prev => ({ ...prev, ...updates }))
  }, [])

  // Toggle array value
  const toggleArrayValue = useCallback((
    field: keyof FilterCriteria,
    value: string
  ) => {
    setCriteria(prev => {
      const currentArray = prev[field] as string[]
      const newArray = currentArray.includes(value)
        ? currentArray.filter(v => v !== value)
        : [...currentArray, value]
      
      return { ...prev, [field]: newArray }
    })
  }, [])

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setCriteria(defaultCriteria)
  }, [])

  // Reset to initial state
  const resetFilters = useCallback(() => {
    setCriteria(getInitialCriteria())
  }, [getInitialCriteria])

  // Apply preset
  const applyPreset = useCallback((preset: FilterPreset) => {
    setCriteria(preset.criteria)
    success(`Applied filter preset: ${preset.name}`)
  }, [success, toastError])

  // Save preset
  const savePreset = useCallback(async (name: string, description?: string) => {
    const newPreset: FilterPreset = {
      id: `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      criteria: { ...criteria },
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const updatedPresets = [...presets, newPreset]
    setPresets(updatedPresets)

    // Save to localStorage
    if (persistKey && typeof window !== 'undefined') {
      try {
        localStorage.setItem(`filter_presets_${persistKey}`, JSON.stringify(updatedPresets))
        success(`Filter preset "${name}" saved successfully`)
      } catch (error) {
        console.error('Failed to save preset:', error)
        toastError('Failed to save filter preset')
      }
    }

    return newPreset
  }, [criteria, presets, persistKey, success, toastError])

  // Delete preset
  const deletePreset = useCallback(async (presetId: string) => {
    const preset = presets.find(p => p.id === presetId)
    if (!preset) return

    if (preset.isSystem) {
      toastError('Cannot delete system presets')
      return
    }

    const updatedPresets = presets.filter(p => p.id !== presetId)
    setPresets(updatedPresets)

    // Save to localStorage
    if (persistKey && typeof window !== 'undefined') {
      try {
        localStorage.setItem(`filter_presets_${persistKey}`, JSON.stringify(updatedPresets))
        success(`Filter preset "${preset.name}" deleted`)
      } catch (error) {
        console.error('Failed to delete preset:', error)
        toastError('Failed to delete filter preset')
      }
    }
  }, [presets, persistKey, success, toastError])

  // Update preset
  const updatePreset = useCallback(async (presetId: string, updates: Partial<FilterPreset>) => {
    const updatedPresets = presets.map(preset =>
      preset.id === presetId
        ? { ...preset, ...updates, updatedAt: new Date() }
        : preset
    )
    
    setPresets(updatedPresets)

    // Save to localStorage
    if (persistKey && typeof window !== 'undefined') {
      try {
        localStorage.setItem(`filter_presets_${persistKey}`, JSON.stringify(updatedPresets))
        success('Filter preset updated')
      } catch (error) {
        console.error('Failed to update preset:', error)
        toastError('Failed to update filter preset')
      }
    }
  }, [presets, persistKey, success, toastError])

  // Generate filter summary
  const getFilterSummary = useCallback(() => {
    const summary: string[] = []

    if (criteria.contentTypes.length > 0) {
      summary.push(`${criteria.contentTypes.length} content type${criteria.contentTypes.length > 1 ? 's' : ''}`)
    }

    if (criteria.categories.length > 0) {
      summary.push(`${criteria.categories.length} categor${criteria.categories.length > 1 ? 'ies' : 'y'}`)
    }

    if (criteria.tags.length > 0) {
      summary.push(`${criteria.tags.length} tag${criteria.tags.length > 1 ? 's' : ''}`)
    }

    if (criteria.status.length > 0) {
      summary.push(`${criteria.status.length} status${criteria.status.length > 1 ? 'es' : ''}`)
    }

    if (criteria.priority.length > 0) {
      summary.push(`${criteria.priority.length} priorit${criteria.priority.length > 1 ? 'ies' : 'y'}`)
    }

    if (criteria.dateRange.start || criteria.dateRange.end) {
      summary.push('date range')
    }

    if (criteria.titleContains.trim()) {
      summary.push('title search')
    }

    if (criteria.contentContains.trim()) {
      summary.push('content search')
    }

    const booleanFilters = [
      criteria.hasAttachments && 'has attachments',
      criteria.isPinned && 'pinned',
      criteria.isShared && 'shared',
      criteria.isArchived && 'archived'
    ].filter(Boolean)

    summary.push(...booleanFilters as string[])

    return summary
  }, [criteria])

  // Convert criteria to URL search params
  const toURLSearchParams = useCallback(() => {
    const params = new URLSearchParams()

    if (criteria.contentTypes.length > 0) {
      params.set('types', criteria.contentTypes.join(','))
    }

    if (criteria.categories.length > 0) {
      params.set('categories', criteria.categories.join(','))
    }

    if (criteria.tags.length > 0) {
      params.set('tags', criteria.tags.join(','))
    }

    if (criteria.status.length > 0) {
      params.set('status', criteria.status.join(','))
    }

    if (criteria.priority.length > 0) {
      params.set('priority', criteria.priority.join(','))
    }

    if (criteria.dateRange.start) {
      params.set('dateFrom', criteria.dateRange.start.toISOString())
    }

    if (criteria.dateRange.end) {
      params.set('dateTo', criteria.dateRange.end.toISOString())
    }

    if (criteria.titleContains.trim()) {
      params.set('titleContains', criteria.titleContains.trim())
    }

    if (criteria.contentContains.trim()) {
      params.set('contentContains', criteria.contentContains.trim())
    }

    if (criteria.hasAttachments !== null) {
      params.set('hasAttachments', criteria.hasAttachments.toString())
    }

    if (criteria.isPinned !== null) {
      params.set('isPinned', criteria.isPinned.toString())
    }

    if (criteria.isShared !== null) {
      params.set('isShared', criteria.isShared.toString())
    }

    if (criteria.isArchived !== null) {
      params.set('isArchived', criteria.isArchived.toString())
    }

    return params
  }, [criteria])

  // Load criteria from URL search params
  const fromURLSearchParams = useCallback((params: URLSearchParams) => {
    const newCriteria: Partial<FilterCriteria> = {}

    const types = params.get('types')
    if (types) newCriteria.contentTypes = types.split(',')

    const categories = params.get('categories')
    if (categories) newCriteria.categories = categories.split(',')

    const tags = params.get('tags')
    if (tags) newCriteria.tags = tags.split(',')

    const status = params.get('status')
    if (status) newCriteria.status = status.split(',')

    const priority = params.get('priority')
    if (priority) newCriteria.priority = priority.split(',')

    const dateFrom = params.get('dateFrom')
    const dateTo = params.get('dateTo')
    if (dateFrom || dateTo) {
      newCriteria.dateRange = {
        start: dateFrom ? new Date(dateFrom) : null,
        end: dateTo ? new Date(dateTo) : null,
        preset: null
      }
    }

    const titleContains = params.get('titleContains')
    if (titleContains) newCriteria.titleContains = titleContains

    const contentContains = params.get('contentContains')
    if (contentContains) newCriteria.contentContains = contentContains

    const hasAttachments = params.get('hasAttachments')
    if (hasAttachments) newCriteria.hasAttachments = hasAttachments === 'true'

    const isPinned = params.get('isPinned')
    if (isPinned) newCriteria.isPinned = isPinned === 'true'

    const isShared = params.get('isShared')
    if (isShared) newCriteria.isShared = isShared === 'true'

    const isArchived = params.get('isArchived')
    if (isArchived) newCriteria.isArchived = isArchived === 'true'

    setCriteria(prev => ({ ...prev, ...newCriteria }))
  }, [])

  return {
    // State
    criteria,
    debouncedCriteria,
    presets,
    isLoading,
    activeFilterCount,
    hasActiveFilters,

    // Actions
    updateCriteria,
    toggleArrayValue,
    clearAllFilters,
    resetFilters,
    applyPreset,
    savePreset,
    deletePreset,
    updatePreset,

    // Utilities
    getFilterSummary,
    toURLSearchParams,
    fromURLSearchParams,

    // Direct setters for convenience
    setCriteria,
    setIsLoading
  }
}

// Hook for managing filter options (facets)
export function useFilterOptions() {
  const [options, setOptions] = useState({
    contentTypes: [] as Array<{ value: string; label: string; count?: number }>,
    categories: [] as Array<{ value: string; label: string; count?: number }>,
    tags: [] as Array<{ value: string; label: string; count?: number }>,
    authors: [] as Array<{ value: string; label: string; count?: number }>,
    status: [] as Array<{ value: string; label: string; count?: number }>,
    priority: [] as Array<{ value: string; label: string; count?: number }>
  })

  const [isLoading, setIsLoading] = useState(false)

  // Load filter options from API
  const loadOptions = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/filters/options')
      if (response.ok) {
        const data = await response.json()
        setOptions(data.data)
      }
    } catch (error) {
      console.error('Failed to load filter options:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Update option counts based on current results
  const updateOptionCounts = useCallback((facets: Record<string, Record<string, number>>) => {
    setOptions(prev => ({
      contentTypes: prev.contentTypes.map(option => ({
        ...option,
        count: facets.types?.[option.value] || 0
      })),
      categories: prev.categories.map(option => ({
        ...option,
        count: facets.categories?.[option.value] || 0
      })),
      tags: prev.tags.map(option => ({
        ...option,
        count: facets.tags?.[option.value] || 0
      })),
      authors: prev.authors.map(option => ({
        ...option,
        count: facets.authors?.[option.value] || 0
      })),
      status: prev.status.map(option => ({
        ...option,
        count: facets.status?.[option.value] || 0
      })),
      priority: prev.priority.map(option => ({
        ...option,
        count: facets.priority?.[option.value] || 0
      }))
    }))
  }, [])

  return {
    options,
    isLoading,
    loadOptions,
    updateOptionCounts,
    setOptions
  }
}
