import { useEffect, useCallback, useRef } from 'react'
import { type MDXEditorMethods } from '@mdxeditor/editor'

export interface AdvancedKeyboardShortcut {
  key: string
  modifiers: ('ctrl' | 'shift' | 'alt' | 'meta')[]
  action: string
  description: string
  category: string
  handler: (editorRef?: React.RefObject<MDXEditorMethods>) => void
  preventDefault?: boolean
  stopPropagation?: boolean
  allowInInputs?: boolean
}

interface UseAdvancedKeyboardShortcutsOptions {
  shortcuts: AdvancedKeyboardShortcut[]
  editorRef?: React.RefObject<MDXEditorMethods>
  enabled?: boolean
  context?: string
}

export function useAdvancedKeyboardShortcuts({
  shortcuts,
  editorRef,
  enabled = true,
  context = 'global'
}: UseAdvancedKeyboardShortcutsOptions) {
  const shortcutsRef = useRef(shortcuts)
  const contextRef = useRef(context)

  // Update refs when props change
  useEffect(() => {
    shortcutsRef.current = shortcuts
    contextRef.current = context
  }, [shortcuts, context])

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return

    const target = event.target as HTMLElement
    const isInputField = target.tagName === 'INPUT' || 
                        target.tagName === 'TEXTAREA' || 
                        target.contentEditable === 'true' ||
                        target.closest('[contenteditable="true"]')

    for (const shortcut of shortcutsRef.current) {
      // Check if shortcut matches current key combination
      if (!matchesShortcut(event, shortcut)) continue

      // Check if shortcut is allowed in input fields
      if (isInputField && !shortcut.allowInInputs) continue

      // Execute shortcut
      if (shortcut.preventDefault !== false) {
        event.preventDefault()
      }
      
      if (shortcut.stopPropagation !== false) {
        event.stopPropagation()
      }

      try {
        shortcut.handler(editorRef)
      } catch (error) {
        console.error(`Error executing shortcut ${shortcut.action}:`, error)
      }
      
      break // Only execute the first matching shortcut
    }
  }, [enabled, editorRef])

  // Check if event matches shortcut
  const matchesShortcut = (event: KeyboardEvent, shortcut: AdvancedKeyboardShortcut): boolean => {
    // Check key match (case insensitive)
    if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) return false

    // Check modifiers
    const requiredModifiers = {
      ctrl: shortcut.modifiers.includes('ctrl'),
      shift: shortcut.modifiers.includes('shift'),
      alt: shortcut.modifiers.includes('alt'),
      meta: shortcut.modifiers.includes('meta')
    }

    const actualModifiers = {
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
      meta: event.metaKey
    }

    // All modifiers must match exactly
    return Object.keys(requiredModifiers).every(
      mod => requiredModifiers[mod as keyof typeof requiredModifiers] === 
             actualModifiers[mod as keyof typeof actualModifiers]
    )
  }

  useEffect(() => {
    if (!enabled) return

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [handleKeyDown, enabled])

  // Get shortcuts by category
  const getShortcutsByCategory = useCallback(() => {
    const categories: Record<string, AdvancedKeyboardShortcut[]> = {}
    
    shortcuts.forEach(shortcut => {
      if (!categories[shortcut.category]) {
        categories[shortcut.category] = []
      }
      categories[shortcut.category].push(shortcut)
    })

    return categories
  }, [shortcuts])

  // Format shortcut for display
  const formatShortcut = useCallback((shortcut: AdvancedKeyboardShortcut): string => {
    const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
    
    const modifierMap: Record<string, string> = {
      ctrl: isMac ? '⌘' : 'Ctrl',
      shift: isMac ? '⇧' : 'Shift',
      alt: isMac ? '⌥' : 'Alt',
      meta: isMac ? '⌘' : 'Win'
    }
    
    const formattedModifiers = shortcut.modifiers.map(mod => modifierMap[mod] || mod)
    const formattedKey = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key
    
    return [...formattedModifiers, formattedKey].join(isMac ? '' : '+')
  }, [])

  return {
    getShortcutsByCategory,
    formatShortcut,
    shortcuts
  }
}

// Predefined comprehensive shortcuts
export const createComprehensiveShortcuts = (handlers: {
  onSave: () => void
  onUndo: () => void
  onRedo: () => void
  onBold: () => void
  onItalic: () => void
  onUnderline: () => void
  onStrikethrough: () => void
  onCode: () => void
  onLink: () => void
  onImage: () => void
  onTable: () => void
  onCodeBlock: () => void
  onQuote: () => void
  onHorizontalRule: () => void
  onBulletList: () => void
  onNumberedList: () => void
  onTaskList: () => void
  onHeading1: () => void
  onHeading2: () => void
  onHeading3: () => void
  onHeading4: () => void
  onHeading5: () => void
  onHeading6: () => void
  onIndent: () => void
  onOutdent: () => void
  onFind: () => void
  onReplace: () => void
  onHelp: () => void
  onViewEdit: () => void
  onViewPreview: () => void
  onViewSplit: () => void
  onFullscreen: () => void
  onSelectAll: () => void
  onCopy: () => void
  onCut: () => void
  onPaste: () => void
  onDuplicate: () => void
  onDelete: () => void
}): AdvancedKeyboardShortcut[] => [
  // Document Actions
  {
    key: 's',
    modifiers: ['ctrl'],
    action: 'save',
    description: 'Save document',
    category: 'Document',
    handler: () => handlers.onSave(),
    allowInInputs: true
  },
  {
    key: 'z',
    modifiers: ['ctrl'],
    action: 'undo',
    description: 'Undo last action',
    category: 'Document',
    handler: () => handlers.onUndo(),
    allowInInputs: true
  },
  {
    key: 'y',
    modifiers: ['ctrl'],
    action: 'redo',
    description: 'Redo last action',
    category: 'Document',
    handler: () => handlers.onRedo(),
    allowInInputs: true
  },
  {
    key: 'z',
    modifiers: ['ctrl', 'shift'],
    action: 'redo-alt',
    description: 'Redo last action (alternative)',
    category: 'Document',
    handler: () => handlers.onRedo(),
    allowInInputs: true
  },

  // Text Formatting
  {
    key: 'b',
    modifiers: ['ctrl'],
    action: 'bold',
    description: 'Make text bold',
    category: 'Formatting',
    handler: () => handlers.onBold(),
    allowInInputs: true
  },
  {
    key: 'i',
    modifiers: ['ctrl'],
    action: 'italic',
    description: 'Make text italic',
    category: 'Formatting',
    handler: () => handlers.onItalic(),
    allowInInputs: true
  },
  {
    key: 'u',
    modifiers: ['ctrl'],
    action: 'underline',
    description: 'Underline text',
    category: 'Formatting',
    handler: () => handlers.onUnderline(),
    allowInInputs: true
  },
  {
    key: 's',
    modifiers: ['ctrl', 'shift'],
    action: 'strikethrough',
    description: 'Strikethrough text',
    category: 'Formatting',
    handler: () => handlers.onStrikethrough(),
    allowInInputs: true
  },
  {
    key: 'e',
    modifiers: ['ctrl'],
    action: 'code',
    description: 'Format as inline code',
    category: 'Formatting',
    handler: () => handlers.onCode(),
    allowInInputs: true
  },

  // Headings
  {
    key: '1',
    modifiers: ['ctrl'],
    action: 'heading1',
    description: 'Insert heading 1',
    category: 'Headings',
    handler: () => handlers.onHeading1(),
    allowInInputs: true
  },
  {
    key: '2',
    modifiers: ['ctrl'],
    action: 'heading2',
    description: 'Insert heading 2',
    category: 'Headings',
    handler: () => handlers.onHeading2(),
    allowInInputs: true
  },
  {
    key: '3',
    modifiers: ['ctrl'],
    action: 'heading3',
    description: 'Insert heading 3',
    category: 'Headings',
    handler: () => handlers.onHeading3(),
    allowInInputs: true
  },
  {
    key: '4',
    modifiers: ['ctrl'],
    action: 'heading4',
    description: 'Insert heading 4',
    category: 'Headings',
    handler: () => handlers.onHeading4(),
    allowInInputs: true
  },
  {
    key: '5',
    modifiers: ['ctrl'],
    action: 'heading5',
    description: 'Insert heading 5',
    category: 'Headings',
    handler: () => handlers.onHeading5(),
    allowInInputs: true
  },
  {
    key: '6',
    modifiers: ['ctrl'],
    action: 'heading6',
    description: 'Insert heading 6',
    category: 'Headings',
    handler: () => handlers.onHeading6(),
    allowInInputs: true
  },

  // Lists and Structure
  {
    key: 'l',
    modifiers: ['ctrl', 'shift'],
    action: 'bulletList',
    description: 'Insert bullet list',
    category: 'Lists',
    handler: () => handlers.onBulletList(),
    allowInInputs: true
  },
  {
    key: 'o',
    modifiers: ['ctrl', 'shift'],
    action: 'numberedList',
    description: 'Insert numbered list',
    category: 'Lists',
    handler: () => handlers.onNumberedList(),
    allowInInputs: true
  },
  {
    key: 't',
    modifiers: ['ctrl', 'shift'],
    action: 'taskList',
    description: 'Insert task list',
    category: 'Lists',
    handler: () => handlers.onTaskList(),
    allowInInputs: true
  },
  {
    key: 'Tab',
    modifiers: [],
    action: 'indent',
    description: 'Indent line or list item',
    category: 'Lists',
    handler: () => handlers.onIndent(),
    allowInInputs: true
  },
  {
    key: 'Tab',
    modifiers: ['shift'],
    action: 'outdent',
    description: 'Outdent line or list item',
    category: 'Lists',
    handler: () => handlers.onOutdent(),
    allowInInputs: true
  },

  // Insert Elements
  {
    key: 'k',
    modifiers: ['ctrl'],
    action: 'link',
    description: 'Insert link',
    category: 'Insert',
    handler: () => handlers.onLink(),
    allowInInputs: true
  },
  {
    key: 'i',
    modifiers: ['ctrl', 'shift'],
    action: 'image',
    description: 'Insert image',
    category: 'Insert',
    handler: () => handlers.onImage(),
    allowInInputs: true
  },
  {
    key: 't',
    modifiers: ['ctrl', 'alt'],
    action: 'table',
    description: 'Insert table',
    category: 'Insert',
    handler: () => handlers.onTable(),
    allowInInputs: true
  },
  {
    key: 'k',
    modifiers: ['ctrl', 'shift'],
    action: 'codeBlock',
    description: 'Insert code block',
    category: 'Insert',
    handler: () => handlers.onCodeBlock(),
    allowInInputs: true
  },
  {
    key: 'q',
    modifiers: ['ctrl'],
    action: 'quote',
    description: 'Insert blockquote',
    category: 'Insert',
    handler: () => handlers.onQuote(),
    allowInInputs: true
  },
  {
    key: 'h',
    modifiers: ['ctrl', 'shift'],
    action: 'horizontalRule',
    description: 'Insert horizontal rule',
    category: 'Insert',
    handler: () => handlers.onHorizontalRule(),
    allowInInputs: true
  },

  // Search and Navigation
  {
    key: 'f',
    modifiers: ['ctrl'],
    action: 'find',
    description: 'Find in document',
    category: 'Search',
    handler: () => handlers.onFind(),
    allowInInputs: true
  },
  {
    key: 'h',
    modifiers: ['ctrl'],
    action: 'replace',
    description: 'Find and replace',
    category: 'Search',
    handler: () => handlers.onReplace(),
    allowInInputs: true
  },

  // View Controls
  {
    key: 'e',
    modifiers: ['ctrl', 'shift'],
    action: 'viewEdit',
    description: 'Switch to edit view',
    category: 'View',
    handler: () => handlers.onViewEdit()
  },
  {
    key: 'p',
    modifiers: ['ctrl', 'shift'],
    action: 'viewPreview',
    description: 'Switch to preview view',
    category: 'View',
    handler: () => handlers.onViewPreview()
  },
  {
    key: 's',
    modifiers: ['ctrl', 'alt'],
    action: 'viewSplit',
    description: 'Switch to split view',
    category: 'View',
    handler: () => handlers.onViewSplit()
  },
  {
    key: 'F11',
    modifiers: [],
    action: 'fullscreen',
    description: 'Toggle fullscreen mode',
    category: 'View',
    handler: () => handlers.onFullscreen()
  },

  // Selection and Editing
  {
    key: 'a',
    modifiers: ['ctrl'],
    action: 'selectAll',
    description: 'Select all text',
    category: 'Selection',
    handler: () => handlers.onSelectAll(),
    allowInInputs: true
  },
  {
    key: 'c',
    modifiers: ['ctrl'],
    action: 'copy',
    description: 'Copy selected text',
    category: 'Selection',
    handler: () => handlers.onCopy(),
    allowInInputs: true
  },
  {
    key: 'x',
    modifiers: ['ctrl'],
    action: 'cut',
    description: 'Cut selected text',
    category: 'Selection',
    handler: () => handlers.onCut(),
    allowInInputs: true
  },
  {
    key: 'v',
    modifiers: ['ctrl'],
    action: 'paste',
    description: 'Paste from clipboard',
    category: 'Selection',
    handler: () => handlers.onPaste(),
    allowInInputs: true
  },
  {
    key: 'd',
    modifiers: ['ctrl'],
    action: 'duplicate',
    description: 'Duplicate current line',
    category: 'Selection',
    handler: () => handlers.onDuplicate(),
    allowInInputs: true
  },
  {
    key: 'Delete',
    modifiers: ['ctrl'],
    action: 'deleteLine',
    description: 'Delete current line',
    category: 'Selection',
    handler: () => handlers.onDelete(),
    allowInInputs: true
  },

  // Help
  {
    key: '/',
    modifiers: ['ctrl'],
    action: 'help',
    description: 'Show keyboard shortcuts',
    category: 'Help',
    handler: () => handlers.onHelp()
  },
  {
    key: 'F1',
    modifiers: [],
    action: 'help-alt',
    description: 'Show help (alternative)',
    category: 'Help',
    handler: () => handlers.onHelp()
  }
]