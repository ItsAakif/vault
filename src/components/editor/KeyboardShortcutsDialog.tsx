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

interface KeyboardShortcut {
  key: string
  modifiers: string[]
  action: string
  description: string
}

interface KeyboardShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shortcuts: KeyboardShortcut[]
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
  shortcuts
}: KeyboardShortcutsDialogProps) {
  const formatShortcut = (modifiers: string[], key: string) => {
    const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
    
    const modifierMap: Record<string, string> = {
      ctrl: isMac ? '⌘' : 'Ctrl',
      shift: isMac ? '⇧' : 'Shift',
      alt: isMac ? '⌥' : 'Alt',
      meta: isMac ? '⌘' : 'Win'
    }
    
    const formattedModifiers = modifiers.map(mod => modifierMap[mod] || mod)
    const formattedKey = key.toUpperCase()
    
    return [...formattedModifiers, formattedKey].join(isMac ? '' : '+')
  }

  const groupedShortcuts = shortcuts.reduce((groups, shortcut) => {
    let category = 'General'
    
    if (['bold', 'italic', 'underline', 'code'].includes(shortcut.action)) {
      category = 'Text Formatting'
    } else if (['heading1', 'heading2', 'heading3'].includes(shortcut.action)) {
      category = 'Headings'
    } else if (['bulletList', 'numberedList', 'quote'].includes(shortcut.action)) {
      category = 'Lists & Quotes'
    } else if (['link', 'table', 'horizontalRule'].includes(shortcut.action)) {
      category = 'Insert Elements'
    } else if (['save', 'undo', 'redo'].includes(shortcut.action)) {
      category = 'Document Actions'
    } else if (['find', 'replace'].includes(shortcut.action)) {
      category = 'Search & Replace'
    }
    
    if (!groups[category]) {
      groups[category] = []
    }
    groups[category].push(shortcut)
    
    return groups
  }, {} as Record<string, KeyboardShortcut[]>)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-6">
            {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
              <div key={category}>
                <h3 className="font-semibold text-lg mb-3">{category}</h3>
                <div className="space-y-2">
                  {categoryShortcuts.map((shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <span className="text-sm">{shortcut.description}</span>
                      <Badge variant="outline" className="font-mono text-xs">
                        {formatShortcut(shortcut.modifiers, shortcut.key)}
                      </Badge>
                    </div>
                  ))}
                </div>
                {Object.keys(groupedShortcuts).indexOf(category) < Object.keys(groupedShortcuts).length - 1 && (
                  <Separator className="mt-4" />
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
        
        <div className="text-xs text-muted-foreground mt-4">
          <p>
            Press <Badge variant="outline" className="font-mono text-xs mx-1">
              {typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘' : 'Ctrl'}
              +/
            </Badge> 
            to show this dialog anytime
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}