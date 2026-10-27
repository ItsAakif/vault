'use client'

import { 
  Bold, 
  Italic, 
  Underline, 
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Link,
  Image,
  Table,
  Minus,
  Code2,
  Undo,
  Redo,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Indent,
  Outdent,
  Highlighter,
  Subscript,
  Superscript
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface ToolbarAction {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  shortcut?: string
  action: () => void
  isActive?: boolean
  disabled?: boolean
}

interface ToolbarGroup {
  id: string
  label: string
  actions: ToolbarAction[]
}

interface EditorToolbarProps {
  onAction: (actionId: string, ...args: any[]) => void
  activeFormats?: string[]
  disabled?: boolean
  className?: string
}

export function EditorToolbar({
  onAction,
  activeFormats = [],
  disabled = false,
  className
}: EditorToolbarProps) {
  
  const isActive = (actionId: string) => activeFormats.includes(actionId)
  
  const toolbarGroups: ToolbarGroup[] = [
    {
      id: 'history',
      label: 'History',
      actions: [
        {
          id: 'undo',
          label: 'Undo',
          icon: Undo,
          shortcut: 'Ctrl+Z',
          action: () => onAction('undo')
        },
        {
          id: 'redo',
          label: 'Redo',
          icon: Redo,
          shortcut: 'Ctrl+Y',
          action: () => onAction('redo')
        }
      ]
    },
    {
      id: 'text-formatting',
      label: 'Text Formatting',
      actions: [
        {
          id: 'bold',
          label: 'Bold',
          icon: Bold,
          shortcut: 'Ctrl+B',
          action: () => onAction('bold'),
          isActive: isActive('bold')
        },
        {
          id: 'italic',
          label: 'Italic',
          icon: Italic,
          shortcut: 'Ctrl+I',
          action: () => onAction('italic'),
          isActive: isActive('italic')
        },
        {
          id: 'underline',
          label: 'Underline',
          icon: Underline,
          shortcut: 'Ctrl+U',
          action: () => onAction('underline'),
          isActive: isActive('underline')
        },
        {
          id: 'strikethrough',
          label: 'Strikethrough',
          icon: Strikethrough,
          shortcut: 'Ctrl+Shift+S',
          action: () => onAction('strikethrough'),
          isActive: isActive('strikethrough')
        },
        {
          id: 'code',
          label: 'Inline Code',
          icon: Code,
          shortcut: 'Ctrl+Shift+C',
          action: () => onAction('code'),
          isActive: isActive('code')
        }
      ]
    },
    {
      id: 'lists',
      label: 'Lists',
      actions: [
        {
          id: 'bulletList',
          label: 'Bullet List',
          icon: List,
          shortcut: 'Ctrl+Shift+L',
          action: () => onAction('bulletList'),
          isActive: isActive('bulletList')
        },
        {
          id: 'numberedList',
          label: 'Numbered List',
          icon: ListOrdered,
          shortcut: 'Ctrl+Shift+O',
          action: () => onAction('numberedList'),
          isActive: isActive('numberedList')
        },
        {
          id: 'taskList',
          label: 'Task List',
          icon: CheckSquare,
          shortcut: 'Ctrl+Shift+T',
          action: () => onAction('taskList'),
          isActive: isActive('taskList')
        },
        {
          id: 'indent',
          label: 'Indent',
          icon: Indent,
          shortcut: 'Tab',
          action: () => onAction('indent')
        },
        {
          id: 'outdent',
          label: 'Outdent',
          icon: Outdent,
          shortcut: 'Shift+Tab',
          action: () => onAction('outdent')
        }
      ]
    },
    {
      id: 'insert',
      label: 'Insert',
      actions: [
        {
          id: 'link',
          label: 'Insert Link',
          icon: Link,
          shortcut: 'Ctrl+K',
          action: () => onAction('link')
        },
        {
          id: 'image',
          label: 'Insert Image',
          icon: Image,
          shortcut: 'Ctrl+Shift+I',
          action: () => onAction('image')
        },
        {
          id: 'table',
          label: 'Insert Table',
          icon: Table,
          shortcut: 'Ctrl+Shift+T',
          action: () => onAction('table')
        },
        {
          id: 'codeBlock',
          label: 'Code Block',
          icon: Code2,
          shortcut: 'Ctrl+Shift+K',
          action: () => onAction('codeBlock')
        },
        {
          id: 'quote',
          label: 'Blockquote',
          icon: Quote,
          shortcut: 'Ctrl+Q',
          action: () => onAction('quote'),
          isActive: isActive('quote')
        },
        {
          id: 'horizontalRule',
          label: 'Horizontal Rule',
          icon: Minus,
          shortcut: 'Ctrl+H',
          action: () => onAction('horizontalRule')
        }
      ]
    }
  ]

  const headingOptions = [
    { id: 'paragraph', label: 'Paragraph', shortcut: 'Ctrl+0' },
    { id: 'heading1', label: 'Heading 1', shortcut: 'Ctrl+1' },
    { id: 'heading2', label: 'Heading 2', shortcut: 'Ctrl+2' },
    { id: 'heading3', label: 'Heading 3', shortcut: 'Ctrl+3' },
    { id: 'heading4', label: 'Heading 4', shortcut: 'Ctrl+4' },
    { id: 'heading5', label: 'Heading 5', shortcut: 'Ctrl+5' },
    { id: 'heading6', label: 'Heading 6', shortcut: 'Ctrl+6' }
  ]

  const getCurrentHeading = () => {
    const activeHeading = headingOptions.find(h => isActive(h.id))
    return activeHeading?.label || 'Paragraph'
  }

  const ToolbarButton = ({ action }: { action: ToolbarAction }) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={action.isActive ? 'default' : 'ghost'}
            size="sm"
            onClick={action.action}
            disabled={disabled || action.disabled}
            className={cn(
              'h-8 w-8 p-0',
              action.isActive && 'bg-primary text-primary-foreground'
            )}
          >
            <action.icon className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-center">
            <div className="font-medium">{action.label}</div>
            {action.shortcut && (
              <div className="text-xs text-muted-foreground">{action.shortcut}</div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )

  return (
    <div className={cn(
      'flex items-center gap-1 p-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
      className
    )}>
      {/* Heading Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className="min-w-[120px] justify-start"
          >
            {getCurrentHeading()}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {headingOptions.map((heading) => (
            <DropdownMenuItem
              key={heading.id}
              onClick={() => onAction(heading.id)}
              className="flex items-center justify-between"
            >
              <span>{heading.label}</span>
              <span className="text-xs text-muted-foreground ml-4">
                {heading.shortcut}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Toolbar Groups */}
      {toolbarGroups.map((group, groupIndex) => (
        <div key={group.id} className="flex items-center gap-1">
          {group.actions.map((action) => (
            <ToolbarButton key={action.id} action={action} />
          ))}
          {groupIndex < toolbarGroups.length - 1 && (
            <Separator orientation="vertical" className="h-6 mx-1" />
          )}
        </div>
      ))}
    </div>
  )
}