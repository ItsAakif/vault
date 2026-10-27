'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { type AdvancedKeyboardShortcut } from '@/hooks/use-advanced-keyboard-shortcuts'

interface EnhancedKeyboardShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shortcuts: AdvancedKeyboardShortcut[]
  formatShortcut: (shortcut: AdvancedKeyboardShortcut) => string
}

export function EnhancedKeyboardShortcutsDialog({
  open,
  onOpenChange,
  shortcuts,
  formatShortcut
}: EnhancedKeyboardShortcutsDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')

  // Group shortcuts by category
  const groupedShortcuts = useMemo(() => {
    const groups: Record<string, AdvancedKeyboardShortcut[]> = {}
    
    shortcuts.forEach(shortcut => {
      if (!groups[shortcut.category]) {
        groups[shortcut.category] = []
      }
      groups[shortcut.category].push(shortcut)
    })

    // Sort shortcuts within each category
    Object.keys(groups).forEach(category => {
      groups[category].sort((a, b) => a.description.localeCompare(b.description))
    })

    return groups
  }, [shortcuts])

  // Filter shortcuts based on search query
  const filteredShortcuts = useMemo(() => {
    if (!searchQuery.trim()) {
      return activeCategory === 'all' ? groupedShortcuts : { [activeCategory]: groupedShortcuts[activeCategory] || [] }
    }

    const query = searchQuery.toLowerCase()
    const filtered: Record<string, AdvancedKeyboardShortcut[]> = {}

    Object.entries(groupedShortcuts).forEach(([category, categoryShortcuts]) => {
      if (activeCategory !== 'all' && category !== activeCategory) return

      const matchingShortcuts = categoryShortcuts.filter(shortcut =>
        shortcut.description.toLowerCase().includes(query) ||
        shortcut.action.toLowerCase().includes(query) ||
        formatShortcut(shortcut).toLowerCase().includes(query)
      )

      if (matchingShortcuts.length > 0) {
        filtered[category] = matchingShortcuts
      }
    })

    return filtered
  }, [groupedShortcuts, searchQuery, activeCategory, formatShortcut])

  const categories = Object.keys(groupedShortcuts).sort()
  const totalShortcuts = shortcuts.length
  const filteredCount = Object.values(filteredShortcuts).reduce((sum, shortcuts) => sum + shortcuts.length, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Keyboard Shortcuts</span>
            <Badge variant="secondary" className="text-xs">
              {searchQuery ? `${filteredCount} of ${totalShortcuts}` : `${totalShortcuts} shortcuts`}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search shortcuts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Category Tabs */}
        <Tabs value={activeCategory} onValueChange={setActiveCategory} className="flex-1 flex flex-col">
          <TabsList className="grid grid-cols-auto w-full overflow-x-auto">
            <TabsTrigger value="all" className="whitespace-nowrap">
              All ({totalShortcuts})
            </TabsTrigger>
            {categories.map(category => (
              <TabsTrigger key={category} value={category} className="whitespace-nowrap">
                {category} ({groupedShortcuts[category].length})
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeCategory} className="flex-1 mt-4">
            <ScrollArea className="h-[50vh]">
              <div className="space-y-6">
                {Object.entries(filteredShortcuts).map(([category, categoryShortcuts]) => (
                  <div key={category}>
                    <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                      {category}
                      <Badge variant="outline" className="text-xs">
                        {categoryShortcuts.length}
                      </Badge>
                    </h3>
                    <div className="grid gap-2">
                      {categoryShortcuts.map((shortcut, index) => (
                        <div
                          key={`${shortcut.action}-${index}`}
                          className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-accent/50 transition-colors group"
                        >
                          <div className="flex-1">
                            <div className="font-medium text-sm">{shortcut.description}</div>
                            <div className="text-xs text-muted-foreground">
                              Action: {shortcut.action}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {shortcut.allowInInputs && (
                              <Badge variant="outline" className="text-xs">
                                Input Safe
                              </Badge>
                            )}
                            <Badge variant="outline" className="font-mono text-xs">
                              {formatShortcut(shortcut)}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                    {Object.keys(filteredShortcuts).indexOf(category) < Object.keys(filteredShortcuts).length - 1 && (
                      <Separator className="mt-4" />
                    )}
                  </div>
                ))}

                {Object.keys(filteredShortcuts).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No shortcuts found matching "{searchQuery}"</p>
                    <p className="text-sm mt-1">Try a different search term or browse by category</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="text-xs text-muted-foreground mt-4 pt-4 border-t">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <p>
              <strong>Tip:</strong> Most shortcuts work in the editor and some work globally
            </p>
            <p>
              <strong>Platform:</strong> {typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? 'macOS' : 'Windows/Linux'}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}