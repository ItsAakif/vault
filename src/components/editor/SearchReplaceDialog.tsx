'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  Search,
  Replace,
  ChevronUp,
  ChevronDown,
  X,
  RotateCcw
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchResult {
  index: number
  start: number
  end: number
  text: string
  line: number
  column: number
}

interface SearchReplaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  content: string
  onReplace?: (searchTerm: string, replaceTerm: string, replaceAll: boolean) => void
  onHighlight?: (results: SearchResult[], currentIndex: number) => void
}

export function SearchReplaceDialog({
  open,
  onOpenChange,
  content,
  onReplace,
  onHighlight
}: SearchReplaceDialogProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [replaceTerm, setReplaceTerm] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [wholeWords, setWholeWords] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [currentResultIndex, setCurrentResultIndex] = useState(0)
  const [showReplace, setShowReplace] = useState(false)

  // Perform search
  const performSearch = useCallback(() => {
    if (!searchTerm.trim()) {
      setSearchResults([])
      return
    }

    try {
      let pattern = searchTerm
      let flags = 'g'

      if (!caseSensitive) {
        flags += 'i'
      }

      if (!useRegex) {
        // Escape special regex characters
        pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      }

      if (wholeWords) {
        pattern = `\\b${pattern}\\b`
      }

      const regex = new RegExp(pattern, flags)
      const results: SearchResult[] = []
      const lines = content.split('\n')
      let globalIndex = 0

      lines.forEach((line, lineIndex) => {
        let match
        while ((match = regex.exec(line)) !== null) {
          const start = globalIndex + match.index
          const end = start + match[0].length
          
          results.push({
            index: results.length,
            start,
            end,
            text: match[0],
            line: lineIndex + 1,
            column: match.index + 1
          })

          // Prevent infinite loop with zero-width matches
          if (match.index === regex.lastIndex) {
            regex.lastIndex++
          }
        }
        globalIndex += line.length + 1 // +1 for newline character
      })

      setSearchResults(results)
      setCurrentResultIndex(0)

      if (onHighlight) {
        onHighlight(results, 0)
      }
    } catch (error) {
      // Invalid regex
      setSearchResults([])
    }
  }, [searchTerm, caseSensitive, useRegex, wholeWords, content, onHighlight])

  // Navigate to next result
  const nextResult = () => {
    if (searchResults.length === 0) return
    const newIndex = (currentResultIndex + 1) % searchResults.length
    setCurrentResultIndex(newIndex)
    if (onHighlight) {
      onHighlight(searchResults, newIndex)
    }
  }

  // Navigate to previous result
  const previousResult = () => {
    if (searchResults.length === 0) return
    const newIndex = currentResultIndex === 0 ? searchResults.length - 1 : currentResultIndex - 1
    setCurrentResultIndex(newIndex)
    if (onHighlight) {
      onHighlight(searchResults, newIndex)
    }
  }

  // Replace current match
  const replaceCurrent = () => {
    if (onReplace && searchResults.length > 0) {
      onReplace(searchTerm, replaceTerm, false)
      performSearch() // Refresh results
    }
  }

  // Replace all matches
  const replaceAll = () => {
    if (onReplace && searchResults.length > 0) {
      onReplace(searchTerm, replaceTerm, true)
      performSearch() // Refresh results
    }
  }

  // Clear search
  const clearSearch = () => {
    setSearchTerm('')
    setReplaceTerm('')
    setSearchResults([])
    setCurrentResultIndex(0)
    if (onHighlight) {
      onHighlight([], 0)
    }
  }

  // Perform search when search term or options change
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      performSearch()
    }, 300)

    return () => clearTimeout(debounceTimer)
  }, [performSearch])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return

      if (e.key === 'Enter') {
        if (e.shiftKey) {
          previousResult()
        } else {
          nextResult()
        }
        e.preventDefault()
      } else if (e.key === 'Escape') {
        onOpenChange(false)
        e.preventDefault()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, nextResult, previousResult, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Find {showReplace && '& Replace'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Input */}
          <div className="space-y-2">
            <div className="relative">
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-20"
                autoFocus
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {searchResults.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {currentResultIndex + 1} of {searchResults.length}
                  </Badge>
                )}
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={previousResult}
                disabled={searchResults.length === 0}
              >
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={nextResult}
                disabled={searchResults.length === 0}
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearSearch}
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowReplace(!showReplace)}
              >
                <Replace className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Replace Input */}
          {showReplace && (
            <>
              <Separator />
              <div className="space-y-2">
                <Input
                  placeholder="Replace with..."
                  value={replaceTerm}
                  onChange={(e) => setReplaceTerm(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={replaceCurrent}
                    disabled={searchResults.length === 0}
                  >
                    Replace
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={replaceAll}
                    disabled={searchResults.length === 0}
                  >
                    Replace All
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* Search Options */}
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="case-sensitive"
                checked={caseSensitive}
                onCheckedChange={(checked) => setCaseSensitive(checked as boolean)}
              />
              <label htmlFor="case-sensitive" className="text-sm">
                Case sensitive
              </label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="whole-words"
                checked={wholeWords}
                onCheckedChange={(checked) => setWholeWords(checked as boolean)}
              />
              <label htmlFor="whole-words" className="text-sm">
                Whole words only
              </label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="regex"
                checked={useRegex}
                onCheckedChange={(checked) => setUseRegex(checked as boolean)}
              />
              <label htmlFor="regex" className="text-sm">
                Use regular expressions
              </label>
            </div>
          </div>

          {/* Results Summary */}
          {searchTerm && (
            <div className="text-sm text-muted-foreground">
              {searchResults.length === 0 ? (
                'No results found'
              ) : (
                `Found ${searchResults.length} result${searchResults.length === 1 ? '' : 's'}`
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}