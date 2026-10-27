import { useState, useCallback, useRef, useEffect } from 'react'
import { type MDXEditorMethods } from '@mdxeditor/editor'
import { useKeyboardShortcuts, defaultMarkdownShortcuts } from './use-keyboard-shortcuts'
import { useToast } from './use-toast'

interface UseMarkdownEditorOptions {
  initialContent?: string
  initialTitle?: string
  onSave?: (content: string, title: string) => Promise<void>
  onContentChange?: (content: string) => void
  autoSave?: boolean
  autoSaveInterval?: number
  readOnly?: boolean
}

export function useMarkdownEditor({
  initialContent = '',
  initialTitle = '',
  onSave,
  onContentChange,
  autoSave = true,
  autoSaveInterval = 30000,
  readOnly = false
}: UseMarkdownEditorOptions) {
  const [title, setTitle] = useState(initialTitle)
  const [content, setContent] = useState(initialContent)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('edit')
  const [showSearch, setShowSearch] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  
  const editorRef = useRef<MDXEditorMethods>(null)
  // The last failure we toasted. Kept in a ref (not state) because it is bookkeeping for the
  // toast, not something the UI renders: the 30s autosave must not repeat the same failure toast
  // forever (ADR-008 D6, spec edge case 8). Cleared by the next successful save.
  const lastSaveErrorRef = useRef<string | null>(null)
  const { toast } = useToast()

  // Handle content changes
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent)
    setIsDirty(newContent !== initialContent)
    
    if (onContentChange) {
      onContentChange(newContent)
    }
  }, [initialContent, onContentChange])

  // Handle title changes
  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle)
    setIsDirty(newTitle !== initialTitle || content !== initialContent)
  }, [initialTitle, content, initialContent])

  // Save function
  const handleSave = useCallback(async () => {
    if (!isDirty || !title.trim() || readOnly) {
      if (!title.trim()) {
        toast({
          title: 'Error',
          description: 'Please enter a title for your document.',
          variant: 'destructive',
        })
      }
      return
    }

    setIsSaving(true)

    try {
      if (onSave) {
        await onSave(content, title)
      }

      lastSaveErrorRef.current = null
      setIsDirty(false)

      toast({
        title: 'Saved',
        description: 'Your document has been saved successfully.',
      })
    } catch (error) {
      // The document is NOT clean: the user's text stays in the editor and the dirty flag stays
      // set so the next save (or autosave) retries. ADR-008 D6.
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Failed to save your document. Please try again.'
      // The 30s autosave must not repeat the same failure toast forever.
      if (lastSaveErrorRef.current !== message) {
        lastSaveErrorRef.current = message
        toast({ title: 'Error', description: message, variant: 'destructive' })
      }
    } finally {
      setIsSaving(false)
    }
  }, [isDirty, title, readOnly, onSave, content, toast])

  // Editor actions
  const editorActions = {
    bold: useCallback(() => {
      // This will be handled by MDXEditor's built-in shortcuts
    }, []),
    
    italic: useCallback(() => {
      // This will be handled by MDXEditor's built-in shortcuts
    }, []),
    
    underline: useCallback(() => {
      // This will be handled by MDXEditor's built-in shortcuts
    }, []),
    
    code: useCallback(() => {
      // This will be handled by MDXEditor's built-in shortcuts
    }, []),
    
    strikethrough: useCallback(() => {
      // This will be handled by MDXEditor's built-in shortcuts
    }, []),
    
    taskList: useCallback(() => {
      if (editorRef.current) {
        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0)
          const text = range.toString()
          range.deleteContents()
          range.insertNode(document.createTextNode(`\n- [ ] ${text || 'Task item'}\n`))
        }
      }
    }, []),
    
    codeBlock: useCallback(() => {
      if (editorRef.current) {
        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0)
          const text = range.toString()
          range.deleteContents()
          range.insertNode(document.createTextNode(`\n\`\`\`\n${text || 'code'}\n\`\`\`\n`))
        }
      }
    }, []),
    
    image: useCallback(() => {
      // This will be handled by MDXEditor's built-in shortcuts
    }, []),
    
    link: useCallback(() => {
      // This will be handled by MDXEditor's built-in shortcuts
    }, []),
    
    heading1: useCallback(() => {
      if (editorRef.current) {
        // Insert heading syntax
        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0)
          const text = range.toString()
          range.deleteContents()
          range.insertNode(document.createTextNode(`# ${text || 'Heading 1'}`))
        }
      }
    }, []),
    
    heading2: useCallback(() => {
      if (editorRef.current) {
        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0)
          const text = range.toString()
          range.deleteContents()
          range.insertNode(document.createTextNode(`## ${text || 'Heading 2'}`))
        }
      }
    }, []),
    
    heading3: useCallback(() => {
      if (editorRef.current) {
        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0)
          const text = range.toString()
          range.deleteContents()
          range.insertNode(document.createTextNode(`### ${text || 'Heading 3'}`))
        }
      }
    }, []),
    
    bulletList: useCallback(() => {
      // This will be handled by MDXEditor's built-in shortcuts
    }, []),
    
    numberedList: useCallback(() => {
      // This will be handled by MDXEditor's built-in shortcuts
    }, []),
    
    table: useCallback(() => {
      // This will be handled by MDXEditor's built-in shortcuts
    }, []),
    
    quote: useCallback(() => {
      // This will be handled by MDXEditor's built-in shortcuts
    }, []),
    
    horizontalRule: useCallback(() => {
      if (editorRef.current) {
        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0)
          range.insertNode(document.createTextNode('\n---\n'))
        }
      }
    }, []),
    
    save: handleSave,
    
    undo: useCallback(() => {
      // This will be handled by MDXEditor's built-in shortcuts
    }, []),
    
    redo: useCallback(() => {
      // This will be handled by MDXEditor's built-in shortcuts
    }, []),
    
    find: useCallback(() => {
      setShowSearch(true)
    }, []),
    
    replace: useCallback(() => {
      setShowSearch(true)
    }, []),
    
    help: useCallback(() => {
      setShowHelp(true)
    }, [])
  }

  // Create keyboard shortcuts with handlers
  const shortcuts = defaultMarkdownShortcuts.map(shortcut => ({
    ...shortcut,
    handler: editorActions[shortcut.action as keyof typeof editorActions] || (() => {})
  }))

  // Set up keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts,
    enabled: !readOnly
  })

  // Auto-save functionality
  useEffect(() => {
    if (!autoSave || !isDirty || readOnly) return

    const interval = setInterval(async () => {
      if (isDirty && !isSaving) {
        await handleSave()
      }
    }, autoSaveInterval)

    return () => clearInterval(interval)
  }, [autoSave, isDirty, isSaving, autoSaveInterval, readOnly, handleSave])

  // Initialize content
  useEffect(() => {
    if (initialContent && editorRef.current) {
      editorRef.current.setMarkdown(initialContent)
    }
  }, [initialContent])

  return {
    // State
    title,
    content,
    isDirty,
    isSaving,
    viewMode,
    showSearch,
    showHelp,
    
    // Refs
    editorRef,
    
    // Handlers
    handleContentChange,
    handleTitleChange,
    handleSave,
    setViewMode,
    setShowSearch,
    setShowHelp,
    
    // Actions
    ...editorActions,
    
    // Shortcuts info
    shortcuts: shortcuts.map(({ handler, ...rest }) => rest)
  }
}