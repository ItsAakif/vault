'use client'

import { useState, useEffect, useCallback } from 'react'
import { Tag } from '@/lib/db'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { 
  X, 
  Plus, 
  Hash, 
  Tag as TagIcon, 
  Palette,
  ChevronDown,
  Search
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { parseDriveFailure } from '@/lib/drive-client'

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  allowCreate?: boolean
  maxTags?: number
}

interface TagSuggestion {
  id: string
  name: string
  color: string
  count?: number
}

export function TagInput({
  value,
  onChange,
  placeholder = 'Add tags...',
  disabled = false,
  className = '',
  allowCreate = true,
  maxTags
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  // ADR-008 D5 asymmetry (recorded in .planning/progress/T056.md): this popover has no room for
  // the Drive notice and the editor already surfaces save failures (T054), so a Drive-code create
  // failure withdraws the inline "create this tag" affordance instead of adding a banner here.
  const [driveCreateBlocked, setDriveCreateBlocked] = useState(false)
  const [newTag, setNewTag] = useState({
    name: '',
    color: '#10B981',
    description: ''
  })
  
  const { toast } = useToast()

  // Fetch tag suggestions
  const fetchSuggestions = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSuggestions([])
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/tags?includeUsage=true&search=${encodeURIComponent(query)}`)
      if (response.ok) {
        const tags: (Tag & { _count?: { contentItems: number } })[] = await response.json()
        const tagSuggestions = tags.map(tag => ({
          id: tag.id,
          name: tag.name,
          color: tag.color,
          count: tag._count?.contentItems || 0
        }))
        setSuggestions(tagSuggestions)
      }
    } catch (error) {
      console.error('Error fetching tag suggestions:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (inputValue.trim()) {
        fetchSuggestions(inputValue)
      } else {
        setSuggestions([])
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [inputValue, fetchSuggestions])

  const handleAddTag = (tagName: string) => {
    const trimmedTag = tagName.trim()
    if (!trimmedTag) return

    if (value.includes(trimmedTag)) {
      toast({
        title: 'Duplicate Tag',
        description: 'This tag has already been added',
        variant: 'destructive'
      })
      return
    }

    if (maxTags && value.length >= maxTags) {
      toast({
        title: 'Maximum Tags Reached',
        description: `You can only add up to ${maxTags} tags`,
        variant: 'destructive'
      })
      return
    }

    onChange([...value, trimmedTag])
    setInputValue('')
    setSuggestions([])
  }

  const handleRemoveTag = (tagName: string) => {
    onChange(value.filter(tag => tag !== tagName))
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
        setDriveCreateBlocked(false)
        handleAddTag(newTag.name)
        setShowCreateDialog(false)
        setNewTag({
          name: '',
          color: '#10B981',
          description: ''
        })
        
        toast({
          title: 'Success',
          description: 'Tag created successfully'
        })
      } else {
        const error = await response.json().catch(() => null)
        // Withdraw the inline create affordance when Drive is the reason the create failed. The
        // toast keeps its existing message and variant.
        setDriveCreateBlocked(parseDriveFailure(error) !== null)
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      
      if (suggestions.length > 0) {
        // Add first suggestion
        handleAddTag(suggestions[0].name)
      } else if (allowCreate && !driveCreateBlocked && inputValue.trim()) {
        // Create new tag
        setNewTag(prev => ({
          ...prev,
          name: inputValue.trim()
        }))
        setShowCreateDialog(true)
      }
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      // Remove last tag
      handleRemoveTag(value[value.length - 1])
    }
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Selected Tags */}
      <div className="flex flex-wrap gap-2">
        {value.map((tagName, index) => (
          <Badge
            key={index}
            variant="secondary"
            className="flex items-center gap-1 px-2 py-1"
          >
            <Hash className="h-3 w-3" />
            {tagName}
            {!disabled && (
              <button
                type="button"
                onClick={() => handleRemoveTag(tagName)}
                className="ml-1 rounded-full hover:bg-destructive hover:text-destructive-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
        
        {(!maxTags || value.length < maxTags) && (
          <Popover open={suggestions.length > 0} onOpenChange={(open) => !open && setSuggestions([])}>
            <PopoverTrigger asChild>
              <div className="relative">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  disabled={disabled}
                  className="pr-8"
                />
                <Hash className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search tags..." className="border-0" />
                <CommandList>
                  {loading ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      Loading...
                    </div>
                  ) : suggestions.length === 0 ? (
                    <CommandEmpty>
                      {allowCreate && !driveCreateBlocked ? (
                        <div className="py-4 text-center">
                          <p className="text-sm text-muted-foreground mb-2">
                            No tags found
                          </p>
                          <Button
                            size="sm"
                            onClick={() => {
                              setNewTag(prev => ({
                                ...prev,
                                name: inputValue.trim()
                              }))
                              setShowCreateDialog(true)
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Create "{inputValue.trim()}"
                          </Button>
                        </div>
                      ) : (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                          No tags found
                        </div>
                      )}
                    </CommandEmpty>
                  ) : (
                    <CommandGroup>
                      {suggestions.map((suggestion) => (
                        <CommandItem
                          key={suggestion.id}
                          onSelect={() => handleAddTag(suggestion.name)}
                          className="flex items-center gap-2"
                        >
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: suggestion.color }}
                          />
                          <span className="flex-1">{suggestion.name}</span>
                          {suggestion.count !== undefined && (
                            <span className="text-xs text-muted-foreground">
                              {suggestion.count}
                            </span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Create Tag Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="tagName">Tag Name</Label>
              <Input
                id="tagName"
                value={newTag.name}
                onChange={(e) => setNewTag(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter tag name"
              />
            </div>
            
            <div>
              <Label htmlFor="tagColor">Color</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="tagColor"
                  type="color"
                  value={newTag.color}
                  onChange={(e) => setNewTag(prev => ({ ...prev, color: e.target.value }))}
                  className="w-16 h-10"
                />
                <div
                  className="h-10 px-4 rounded border flex items-center"
                  style={{ backgroundColor: newTag.color + '20', borderColor: newTag.color }}
                >
                  <span className="text-sm" style={{ color: newTag.color }}>
                    {newTag.color}
                  </span>
                </div>
              </div>
            </div>
            
            <div>
              <Label htmlFor="tagDescription">Description (Optional)</Label>
              <Input
                id="tagDescription"
                value={newTag.description}
                onChange={(e) => setNewTag(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter tag description"
              />
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateTag} disabled={!newTag.name.trim()}>
                Create Tag
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}