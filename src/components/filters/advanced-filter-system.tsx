'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { animations } from '@/lib/animations'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/form-components'
import { DateTimeInput } from '@/components/ui/form-components'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Filter,
  X,
  ChevronDown,
  ChevronRight,
  Calendar,
  Tag,
  User,
  Folder,
  Star,
  Clock,
  AlertTriangle,
  Search,
  RotateCcw,
  Save,
  BookOpen,
  FileText,
  Target,
  Briefcase
} from 'lucide-react'

export interface FilterOption {
  value: string
  label: string
  count?: number
  color?: string
  icon?: React.ComponentType<{ className?: string }>
}

export interface FilterGroup {
  id: string
  label: string
  type: 'checkbox' | 'select' | 'date-range' | 'search' | 'slider'
  options?: FilterOption[]
  value?: any
  placeholder?: string
  min?: number
  max?: number
  step?: number
  collapsible?: boolean
  defaultExpanded?: boolean
}

export interface FilterState {
  [key: string]: any
}

export interface SavedFilter {
  id: string
  name: string
  filters: FilterState
  isDefault?: boolean
  createdAt: Date
}

interface AdvancedFilterSystemProps {
  filterGroups: FilterGroup[]
  initialFilters?: FilterState
  onFiltersChange: (filters: FilterState) => void
  onSaveFilter?: (name: string, filters: FilterState) => void
  savedFilters?: SavedFilter[]
  onLoadFilter?: (filter: SavedFilter) => void
  onDeleteFilter?: (filterId: string) => void
  showSavedFilters?: boolean
  showFilterCount?: boolean
  className?: string
}

export function AdvancedFilterSystem({
  filterGroups,
  initialFilters = {},
  onFiltersChange,
  onSaveFilter,
  savedFilters = [],
  onLoadFilter,
  onDeleteFilter,
  showSavedFilters = true,
  showFilterCount = true,
  className
}: AdvancedFilterSystemProps) {
  const [filters, setFilters] = useState<FilterState>(initialFilters)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(filterGroups.filter(g => g.defaultExpanded !== false).map(g => g.id))
  )
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveFilterName, setSaveFilterName] = useState('')

  // Update filters when they change
  useEffect(() => {
    onFiltersChange(filters)
  }, [filters, onFiltersChange])

  // Handle filter value change
  const handleFilterChange = useCallback((groupId: string, value: any) => {
    setFilters(prev => ({
      ...prev,
      [groupId]: value
    }))
  }, [])

  // Toggle group expansion
  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(groupId)) {
        newSet.delete(groupId)
      } else {
        newSet.add(groupId)
      }
      return newSet
    })
  }, [])

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setFilters({})
  }, [])

  // Save current filter
  const saveCurrentFilter = useCallback(() => {
    if (saveFilterName.trim() && onSaveFilter) {
      onSaveFilter(saveFilterName.trim(), filters)
      setSaveFilterName('')
      setShowSaveDialog(false)
    }
  }, [saveFilterName, filters, onSaveFilter])

  // Get active filter count
  const getActiveFilterCount = useCallback(() => {
    return Object.values(filters).filter(value => {
      if (Array.isArray(value)) return value.length > 0
      if (typeof value === 'object' && value !== null) {
        return Object.values(value).some(v => v !== null && v !== undefined && v !== '')
      }
      return value !== null && value !== undefined && value !== ''
    }).length
  }, [filters])

  // Render filter group based on type
  const renderFilterGroup = (group: FilterGroup) => {
    const value = filters[group.id]
    const isExpanded = expandedGroups.has(group.id)

    const groupContent = () => {
      switch (group.type) {
        case 'checkbox':
          return (
            <div className="space-y-2">
              {group.options?.map(option => (
                <div key={option.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${group.id}-${option.value}`}
                    checked={Array.isArray(value) ? value.includes(option.value) : false}
                    onCheckedChange={(checked) => {
                      const currentValues = Array.isArray(value) ? value : []
                      const newValues = checked
                        ? [...currentValues, option.value]
                        : currentValues.filter(v => v !== option.value)
                      handleFilterChange(group.id, newValues)
                    }}
                  />
                  <label
                    htmlFor={`${group.id}-${option.value}`}
                    className="flex-1 flex items-center justify-between text-sm cursor-pointer"
                  >
                    <div className="flex items-center space-x-2">
                      {option.icon && <option.icon className="h-4 w-4" />}
                      <span>{option.label}</span>
                    </div>
                    {option.count !== undefined && (
                      <span className="text-neutral-500">({option.count})</span>
                    )}
                  </label>
                </div>
              ))}
            </div>
          )

        case 'select':
          return (
            <Select
              value={value || ''}
              onValueChange={(newValue) => handleFilterChange(group.id, newValue)}
            >
              <SelectTrigger>
                <SelectValue placeholder={group.placeholder || `Select ${group.label.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All {group.label}</SelectItem>
                {group.options?.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center space-x-2">
                      {option.icon && <option.icon className="h-4 w-4" />}
                      <span>{option.label}</span>
                      {option.count !== undefined && (
                        <span className="text-neutral-500 ml-auto">({option.count})</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )

        case 'date-range':
          return (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-neutral-600 mb-1 block">From</label>
                <DateTimeInput
                  type="date"
                  value={value?.from || ''}
                  onChange={(e) => handleFilterChange(group.id, {
                    ...value,
                    from: e.target.value
                  })}
                  showIcon={false}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-neutral-600 mb-1 block">To</label>
                <DateTimeInput
                  type="date"
                  value={value?.to || ''}
                  onChange={(e) => handleFilterChange(group.id, {
                    ...value,
                    to: e.target.value
                  })}
                  showIcon={false}
                  className="w-full"
                />
              </div>
            </div>
          )

        case 'search':
          return (
            <Input
              value={value || ''}
              onChange={(e) => handleFilterChange(group.id, e.target.value)}
              placeholder={group.placeholder || `Search ${group.label.toLowerCase()}...`}
              leftIcon={Search}
              className="w-full"
            />
          )

        case 'slider':
          return (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-neutral-600">
                <span>{group.min}</span>
                <span>{value || group.min}</span>
                <span>{group.max}</span>
              </div>
              <input
                type="range"
                min={group.min}
                max={group.max}
                step={group.step || 1}
                value={value || group.min}
                onChange={(e) => handleFilterChange(group.id, parseInt(e.target.value))}
                className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>
          )

        default:
          return null
      }
    }

    if (group.collapsible !== false) {
      return (
        <Collapsible
          key={group.id}
          open={isExpanded}
          onOpenChange={() => toggleGroup(group.id)}
        >
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-between p-0 h-auto font-medium text-sm"
            >
              <span>{group.label}</span>
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            {groupContent()}
          </CollapsibleContent>
        </Collapsible>
      )
    }

    return (
      <div key={group.id} className="space-y-3">
        <h4 className="font-medium text-sm">{group.label}</h4>
        {groupContent()}
      </div>
    )
  }

  // Render active filters
  const renderActiveFilters = () => {
    const activeFilters: Array<{ groupId: string; label: string; value: any }> = []

    Object.entries(filters).forEach(([groupId, value]) => {
      const group = filterGroups.find(g => g.id === groupId)
      if (!group || !value) return

      if (Array.isArray(value) && value.length > 0) {
        value.forEach(v => {
          const option = group.options?.find(o => o.value === v)
          if (option) {
            activeFilters.push({
              groupId,
              label: option.label,
              value: v
            })
          }
        })
      } else if (typeof value === 'object' && value.from && value.to) {
        activeFilters.push({
          groupId,
          label: `${group.label}: ${value.from} - ${value.to}`,
          value
        })
      } else if (typeof value === 'string' && value.trim()) {
        activeFilters.push({
          groupId,
          label: `${group.label}: ${value}`,
          value
        })
      } else if (typeof value === 'number') {
        activeFilters.push({
          groupId,
          label: `${group.label}: ${value}`,
          value
        })
      }
    })

    if (activeFilters.length === 0) return null

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Active Filters</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="h-auto p-1 text-xs"
          >
            Clear All
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {activeFilters.map((filter, index) => (
            <Badge
              key={`${filter.groupId}-${index}`}
              variant="secondary"
              className="text-xs"
            >
              {filter.label}
              <button
                onClick={() => {
                  const group = filterGroups.find(g => g.id === filter.groupId)
                  if (group?.type === 'checkbox') {
                    const currentValues = Array.isArray(filters[filter.groupId]) 
                      ? filters[filter.groupId] 
                      : []
                    const newValues = currentValues.filter((v: any) => v !== filter.value)
                    handleFilterChange(filter.groupId, newValues)
                  } else {
                    handleFilterChange(filter.groupId, null)
                  }
                }}
                className="ml-1 hover:bg-neutral-200 rounded-full p-0.5"
              >
                <X className="h-2 w-2" />
              </button>
            </Badge>
          ))}
        </div>
      </div>
    )
  }

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center space-x-2">
            <Filter className="h-4 w-4" />
            <span>Filters</span>
            {showFilterCount && getActiveFilterCount() > 0 && (
              <Badge variant="secondary" className="text-xs">
                {getActiveFilterCount()}
              </Badge>
            )}
          </CardTitle>
          
          <div className="flex items-center space-x-1">
            {onSaveFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSaveDialog(true)}
                disabled={getActiveFilterCount() === 0}
                className="h-auto p-1"
              >
                <Save className="h-4 w-4" />
              </Button>
            )}
            
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              disabled={getActiveFilterCount() === 0}
              className="h-auto p-1"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Active Filters */}
        {renderActiveFilters()}

        {/* Saved Filters */}
        {showSavedFilters && savedFilters.length > 0 && (
          <div className="space-y-2">
            <span className="text-sm font-medium">Saved Filters</span>
            <div className="space-y-1">
              {savedFilters.map(savedFilter => (
                <div
                  key={savedFilter.id}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-neutral-50"
                >
                  <div className="flex items-center space-x-2">
                    <BookOpen className="h-4 w-4 text-neutral-400" />
                    <span className="text-sm">{savedFilter.name}</span>
                    {savedFilter.isDefault && (
                      <Badge variant="outline" className="text-xs">Default</Badge>
                    )}
                  </div>
                  <div className="flex items-center space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onLoadFilter?.(savedFilter)}
                      className="h-auto p-1"
                    >
                      Load
                    </Button>
                    {onDeleteFilter && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeleteFilter(savedFilter.id)}
                        className="h-auto p-1 text-red-600 hover:text-red-700"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(renderActiveFilters() || (showSavedFilters && savedFilters.length > 0)) && (
          <Separator />
        )}

        {/* Filter Groups */}
        <ScrollArea className="max-h-96">
          <div className="space-y-4">
            {filterGroups.map(renderFilterGroup)}
          </div>
        </ScrollArea>
      </CardContent>

      {/* Save Filter Dialog */}
      <AnimatePresence>
        {showSaveDialog && (
          <motion.div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            {...animations.modalOverlay}
            onClick={() => setShowSaveDialog(false)}
          >
            <motion.div
              className="bg-white rounded-lg p-6 w-full max-w-md mx-4"
              {...animations.modalContent}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-medium mb-4">Save Filter</h3>
              <div className="space-y-4">
                <Input
                  value={saveFilterName}
                  onChange={(e) => setSaveFilterName(e.target.value)}
                  placeholder="Enter filter name..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      saveCurrentFilter()
                    } else if (e.key === 'Escape') {
                      setShowSaveDialog(false)
                    }
                  }}
                  autoFocus
                />
                <div className="flex justify-end space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowSaveDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={saveCurrentFilter}
                    disabled={!saveFilterName.trim()}
                  >
                    Save Filter
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

// Predefined filter groups for common use cases
export const createContentFilters = (options: {
  categories?: FilterOption[]
  tags?: FilterOption[]
  authors?: FilterOption[]
  types?: FilterOption[]
}): FilterGroup[] => [
  {
    id: 'types',
    label: 'Content Types',
    type: 'checkbox',
    options: options.types || [
      { value: 'content', label: 'Notes & Ideas', icon: FileText },
      { value: 'project', label: 'Projects', icon: Target },
      { value: 'job', label: 'Job Opportunities', icon: Briefcase },
      { value: 'calendar', label: 'Calendar Events', icon: Calendar }
    ],
    defaultExpanded: true
  },
  {
    id: 'categories',
    label: 'Categories',
    type: 'checkbox',
    options: options.categories || [],
    collapsible: true
  },
  {
    id: 'tags',
    label: 'Tags',
    type: 'checkbox',
    options: options.tags || [],
    collapsible: true
  },
  {
    id: 'priority',
    label: 'Priority',
    type: 'checkbox',
    options: [
      { value: 'LOW', label: 'Low', icon: Clock },
      { value: 'MEDIUM', label: 'Medium', icon: Clock },
      { value: 'HIGH', label: 'High', icon: AlertTriangle },
      { value: 'CRITICAL', label: 'Critical', icon: AlertTriangle }
    ]
  },
  {
    id: 'dateRange',
    label: 'Date Range',
    type: 'date-range',
    collapsible: true
  },
  {
    id: 'authors',
    label: 'Authors',
    type: 'checkbox',
    options: options.authors || [],
    collapsible: true
  }
]