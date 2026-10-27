'use client'

import { useState, useCallback } from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { 
  Copy, 
  Scissors, // Using Scissors instead of Cut
  ClipboardPaste, // Using ClipboardPaste instead of Paste
  Bold,
  Italic,
  Underline,
  Code,
  Link,
  Image,
  Table,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Minus,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Undo,
  Redo,
  Search,
  Trash2
} from 'lucide-react'
import { EditorActions } from '@/lib/editor-actions'
import { type MDXEditorMethods } from '@mdxeditor/editor'

interface EditorContextMenuProps {
  children: React.ReactNode
  editorRef: React.RefObject<MDXEditorMethods>
  onAction?: (action: string) => void
  disabled?: boolean
}

export function EditorContextMenu({
  children,
  editorRef,
  onAction,
  disabled = false
}: EditorContextMenuProps) {
  const [hasSelection, setHasSelection] = useState(false)
  
  const editorActions = new EditorActions(editorRef)

  const handleContextMenu = useCallback(() => {
    // Check if there's selected text
    const selection = window.getSelection()
    setHasSelection(!!selection && selection.toString().length > 0)
  }, [])

  const handleAction = useCallback((action: string, handler: () => void) => {
    if (disabled) return
    
    handler()
    if (onAction) {
      onAction(action)
    }
  }, [disabled, onAction])

  return (
    <ContextMenu>
      <ContextMenuTrigger onContextMenu={handleContextMenu}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        {/* Basic Editing */}
        <ContextMenuItem
          onClick={() => handleAction('undo', () => editorActions.undo())}
          disabled={disabled}
        >
          <Undo className="mr-2 h-4 w-4" />
          Undo
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+Z</span>
        </ContextMenuItem>
        
        <ContextMenuItem
          onClick={() => handleAction('redo', () => editorActions.redo())}
          disabled={disabled}
        >
          <Redo className="mr-2 h-4 w-4" />
          Redo
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+Y</span>
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Clipboard Operations */}
        <ContextMenuItem
          onClick={() => handleAction('cut', () => editorActions.cut())}
          disabled={disabled || !hasSelection}
        >
          <Scissors className="mr-2 h-4 w-4" />
          Cut
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+X</span>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => handleAction('copy', () => editorActions.copy())}
          disabled={disabled || !hasSelection}
        >
          <Copy className="mr-2 h-4 w-4" />
          Copy
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+C</span>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => handleAction('paste', () => editorActions.paste())}
          disabled={disabled}
        >
          <ClipboardPaste className="mr-2 h-4 w-4" />
          Paste
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+V</span>
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Text Formatting */}
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={disabled}>
            <Bold className="mr-2 h-4 w-4" />
            Format Text
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem
              onClick={() => handleAction('bold', () => editorActions.bold())}
              disabled={disabled}
            >
              <Bold className="mr-2 h-4 w-4" />
              Bold
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+B</span>
            </ContextMenuItem>

            <ContextMenuItem
              onClick={() => handleAction('italic', () => editorActions.italic())}
              disabled={disabled}
            >
              <Italic className="mr-2 h-4 w-4" />
              Italic
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+I</span>
            </ContextMenuItem>

            <ContextMenuItem
              onClick={() => handleAction('underline', () => editorActions.underline())}
              disabled={disabled}
            >
              <Underline className="mr-2 h-4 w-4" />
              Underline
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+U</span>
            </ContextMenuItem>

            <ContextMenuItem
              onClick={() => handleAction('code', () => editorActions.code())}
              disabled={disabled}
            >
              <Code className="mr-2 h-4 w-4" />
              Inline Code
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+E</span>
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        {/* Headings */}
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={disabled}>
            <Heading1 className="mr-2 h-4 w-4" />
            Insert Heading
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem
              onClick={() => handleAction('heading1', () => editorActions.heading1())}
              disabled={disabled}
            >
              <Heading1 className="mr-2 h-4 w-4" />
              Heading 1
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+1</span>
            </ContextMenuItem>

            <ContextMenuItem
              onClick={() => handleAction('heading2', () => editorActions.heading2())}
              disabled={disabled}
            >
              <Heading2 className="mr-2 h-4 w-4" />
              Heading 2
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+2</span>
            </ContextMenuItem>

            <ContextMenuItem
              onClick={() => handleAction('heading3', () => editorActions.heading3())}
              disabled={disabled}
            >
              <Heading3 className="mr-2 h-4 w-4" />
              Heading 3
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+3</span>
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        {/* Lists */}
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={disabled}>
            <List className="mr-2 h-4 w-4" />
            Insert List
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem
              onClick={() => handleAction('bulletList', () => editorActions.bulletList())}
              disabled={disabled}
            >
              <List className="mr-2 h-4 w-4" />
              Bullet List
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+Shift+L</span>
            </ContextMenuItem>

            <ContextMenuItem
              onClick={() => handleAction('numberedList', () => editorActions.numberedList())}
              disabled={disabled}
            >
              <ListOrdered className="mr-2 h-4 w-4" />
              Numbered List
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+Shift+O</span>
            </ContextMenuItem>

            <ContextMenuItem
              onClick={() => handleAction('taskList', () => editorActions.taskList())}
              disabled={disabled}
            >
              <CheckSquare className="mr-2 h-4 w-4" />
              Task List
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+Shift+T</span>
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        {/* Insert Elements */}
        <ContextMenuItem
          onClick={() => handleAction('link', () => editorActions.link())}
          disabled={disabled}
        >
          <Link className="mr-2 h-4 w-4" />
          Insert Link
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+K</span>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => handleAction('image', () => editorActions.image())}
          disabled={disabled}
        >
          <Image className="mr-2 h-4 w-4" />
          Insert Image
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+Shift+I</span>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => handleAction('table', () => editorActions.table())}
          disabled={disabled}
        >
          <Table className="mr-2 h-4 w-4" />
          Insert Table
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+Alt+T</span>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => handleAction('codeBlock', () => editorActions.codeBlock())}
          disabled={disabled}
        >
          <Code2 className="mr-2 h-4 w-4" />
          Code Block
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+Shift+K</span>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => handleAction('quote', () => editorActions.quote())}
          disabled={disabled}
        >
          <Quote className="mr-2 h-4 w-4" />
          Blockquote
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+Q</span>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => handleAction('horizontalRule', () => editorActions.horizontalRule())}
          disabled={disabled}
        >
          <Minus className="mr-2 h-4 w-4" />
          Horizontal Rule
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+Shift+H</span>
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Advanced Actions */}
        <ContextMenuItem
          onClick={() => handleAction('duplicate', () => editorActions.duplicate())}
          disabled={disabled}
        >
          <Copy className="mr-2 h-4 w-4" />
          Duplicate Line
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+D</span>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => handleAction('deleteLine', () => editorActions.deleteLine())}
          disabled={disabled}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Line
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+Del</span>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem
          onClick={() => handleAction('find', () => editorActions.find())}
          disabled={disabled}
        >
          <Search className="mr-2 h-4 w-4" />
          Find & Replace
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+F</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}