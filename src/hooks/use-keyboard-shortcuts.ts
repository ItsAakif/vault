import { useEffect, useCallback } from 'react'

export interface KeyboardShortcut {
  key: string
  modifiers: readonly ('ctrl' | 'shift' | 'alt' | 'meta')[]
  action: string
  description: string
  handler: () => void
}

interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[]
  enabled?: boolean
}

export function useKeyboardShortcuts({ shortcuts, enabled = true }: UseKeyboardShortcutsOptions) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return

    // Don't trigger shortcuts when typing in input fields (except for specific cases)
    const target = event.target as HTMLElement
    const isInputField = target.tagName === 'INPUT' || 
                        target.tagName === 'TEXTAREA' || 
                        target.contentEditable === 'true'

    for (const shortcut of shortcuts) {
      const { key, modifiers, handler } = shortcut
      
      // Check if the key matches
      if (event.key.toLowerCase() !== key.toLowerCase()) continue
      
      // Check if all required modifiers are pressed
      const requiredModifiers = {
        ctrl: modifiers.includes('ctrl'),
        shift: modifiers.includes('shift'),
        alt: modifiers.includes('alt'),
        meta: modifiers.includes('meta')
      }
      
      const actualModifiers = {
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        alt: event.altKey,
        meta: event.metaKey
      }
      
      // Check if modifiers match exactly
      const modifiersMatch = Object.keys(requiredModifiers).every(
        mod => requiredModifiers[mod as keyof typeof requiredModifiers] === 
               actualModifiers[mod as keyof typeof actualModifiers]
      )
      
      if (!modifiersMatch) continue
      
      // For certain shortcuts, allow them even in input fields
      const allowInInputFields = ['ctrl+s', 'ctrl+z', 'ctrl+y', 'ctrl+/']
      const shortcutKey = [...modifiers, key].join('+')
      
      if (isInputField && !allowInInputFields.includes(shortcutKey)) continue
      
      // Prevent default behavior and execute handler
      event.preventDefault()
      event.stopPropagation()
      handler()
      break
    }
  }, [shortcuts, enabled])

  useEffect(() => {
    if (!enabled) return

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown, enabled])

  return {
    shortcuts: shortcuts.map(({ handler, ...rest }) => rest)
  }
}

// Predefined shortcut configurations
export const defaultMarkdownShortcuts = [
  {
    key: 'b',
    modifiers: ['ctrl'] as const,
    action: 'bold',
    description: 'Make text bold'
  },
  {
    key: 'i',
    modifiers: ['ctrl'] as const,
    action: 'italic',
    description: 'Make text italic'
  },
  {
    key: 'u',
    modifiers: ['ctrl'] as const,
    action: 'underline',
    description: 'Underline text'
  },
  {
    key: 'k',
    modifiers: ['ctrl'] as const,
    action: 'link',
    description: 'Insert link'
  },
  {
    key: 'c',
    modifiers: ['ctrl', 'shift'] as const,
    action: 'code',
    description: 'Format as inline code'
  },
  {
    key: 's',
    modifiers: ['ctrl', 'shift'] as const,
    action: 'strikethrough',
    description: 'Strikethrough text'
  },
  {
    key: '1',
    modifiers: ['ctrl'] as const,
    action: 'heading1',
    description: 'Insert heading 1'
  },
  {
    key: '2',
    modifiers: ['ctrl'] as const,
    action: 'heading2',
    description: 'Insert heading 2'
  },
  {
    key: '3',
    modifiers: ['ctrl'] as const,
    action: 'heading3',
    description: 'Insert heading 3'
  },
  {
    key: 'l',
    modifiers: ['ctrl', 'shift'] as const,
    action: 'bulletList',
    description: 'Insert bullet list'
  },
  {
    key: 'o',
    modifiers: ['ctrl', 'shift'] as const,
    action: 'numberedList',
    description: 'Insert numbered list'
  },
  {
    key: 't',
    modifiers: ['ctrl', 'shift'] as const,
    action: 'taskList',
    description: 'Insert task list'
  },
  {
    key: 't',
    modifiers: ['ctrl', 'alt'] as const,
    action: 'table',
    description: 'Insert table'
  },
  {
    key: 'q',
    modifiers: ['ctrl'] as const,
    action: 'quote',
    description: 'Insert blockquote'
  },
  {
    key: 'h',
    modifiers: ['ctrl'] as const,
    action: 'horizontalRule',
    description: 'Insert horizontal rule'
  },
  {
    key: 's',
    modifiers: ['ctrl'] as const,
    action: 'save',
    description: 'Save document'
  },
  {
    key: 'z',
    modifiers: ['ctrl'] as const,
    action: 'undo',
    description: 'Undo last action'
  },
  {
    key: 'y',
    modifiers: ['ctrl'] as const,
    action: 'redo',
    description: 'Redo last action'
  },
  {
    key: 'f',
    modifiers: ['ctrl'] as const,
    action: 'find',
    description: 'Find in document'
  },
  {
    key: 'h',
    modifiers: ['ctrl'] as const,
    action: 'replace',
    description: 'Find and replace'
  },
  {
    key: 'k',
    modifiers: ['ctrl', 'shift'] as const,
    action: 'codeBlock',
    description: 'Insert code block'
  },
  {
    key: 'i',
    modifiers: ['ctrl', 'shift'] as const,
    action: 'image',
    description: 'Insert image'
  },
  {
    key: '/',
    modifiers: ['ctrl'] as const,
    action: 'help',
    description: 'Show keyboard shortcuts'
  }
]