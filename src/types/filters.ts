// Shared filter criteria types used by the advanced filter UI and hooks.

export interface FilterCriteria {
  contentTypes: string[]
  categories: string[]
  tags: string[]
  status: string[]
  priority: string[]
  authors: string[]
  assignees: string[]
  dateRange: {
    start: Date | null
    end: Date | null
    preset: string | null
  }
  hasAttachments: boolean | null
  isArchived: boolean | null
  isPinned: boolean | null
  isShared: boolean | null
  titleContains: string
  contentContains: string
  progressMin: number | null
  progressMax: number | null
  customFields: Record<string, unknown>
}

export interface FilterPreset {
  id: string
  name: string
  description?: string
  criteria: FilterCriteria
  isSystem?: boolean
  createdAt: Date
  updatedAt: Date
}
