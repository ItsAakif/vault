'use client'

import {
  toolbarPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  CodeToggle,
  CreateLink,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  BlockTypeSelect,
  Separator,
  InsertCodeBlock,
  StrikeThroughSupSubToggles,
  type MDXEditorMethods
} from '@mdxeditor/editor'
import { Button } from '@/components/ui/button'
import { 
  Quote,
  CheckSquare,
  Indent,
  Outdent,
  Search,
  Download,
  Settings,
  HelpCircle
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface AdvancedToolbarProps {
  editorRef?: React.RefObject<MDXEditorMethods>
  onAction?: (action: string) => void
  disabled?: boolean
  className?: string
}

// Custom toolbar button component
const CustomToolbarButton = ({ 
  icon: Icon, 
  label, 
  onClick, 
  disabled = false,
  active = false,
  shortcut
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  shortcut?: string
}) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? 'default' : 'ghost'}
          size="sm"
          onClick={onClick}
          disabled={disabled}
          className={cn(
            'h-8 w-8 p-0',
            active && 'bg-primary text-primary-foreground'
          )}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-center">
          <div className="font-medium">{label}</div>
          {shortcut && (
            <div className="text-xs text-muted-foreground">{shortcut}</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
)

// Custom toolbar component that extends MDXEditor's toolbar
export function AdvancedToolbar({ 
  editorRef, 
  onAction, 
  disabled = false, 
  className 
}: AdvancedToolbarProps) {
  
  const handleAction = (action: string) => {
    if (onAction) {
      onAction(action)
    }
  }

  const insertQuote = () => {
    if (editorRef?.current) {
      // Insert blockquote markdown
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        const text = range.toString()
        range.deleteContents()
        range.insertNode(document.createTextNode(`\n> ${text || 'Quote'}\n`))
      }
    }
    handleAction('quote')
  }

  const insertTaskList = () => {
    if (editorRef?.current) {
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        const text = range.toString()
        range.deleteContents()
        range.insertNode(document.createTextNode(`\n- [ ] ${text || 'Task item'}\n`))
      }
    }
    handleAction('taskList')
  }

  const handleIndent = () => {
    // This would be handled by the editor's built-in functionality
    handleAction('indent')
  }

  const handleOutdent = () => {
    // This would be handled by the editor's built-in functionality
    handleAction('outdent')
  }

  return (
    <div className={cn(
      'flex items-center gap-1 p-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex-wrap',
      className
    )}>
      {/* History Actions */}
      <UndoRedo />
      <Separator />
      
      {/* Text Formatting */}
      <BoldItalicUnderlineToggles />
      <StrikeThroughSupSubToggles />
      <CodeToggle />
      <Separator />
      
      {/* Block Types */}
      <BlockTypeSelect />
      <Separator />
      
      {/* Lists */}
      <ListsToggle />
      
      {/* Custom Task List Button */}
      <CustomToolbarButton
        icon={CheckSquare}
        label="Task List"
        onClick={insertTaskList}
        disabled={disabled}
        shortcut="Ctrl+Shift+T"
      />
      
      {/* Indentation */}
      <CustomToolbarButton
        icon={Indent}
        label="Indent"
        onClick={handleIndent}
        disabled={disabled}
        shortcut="Tab"
      />
      
      <CustomToolbarButton
        icon={Outdent}
        label="Outdent"
        onClick={handleOutdent}
        disabled={disabled}
        shortcut="Shift+Tab"
      />
      
      <Separator />
      
      {/* Insert Elements */}
      <CreateLink />
      <InsertImage />
      <InsertTable />
      <InsertCodeBlock />
      
      {/* Custom Quote Button */}
      <CustomToolbarButton
        icon={Quote}
        label="Blockquote"
        onClick={insertQuote}
        disabled={disabled}
        shortcut="Ctrl+Q"
      />
      
      <InsertThematicBreak />
      <Separator />
      
      {/* Additional Actions */}
      <CustomToolbarButton
        icon={Search}
        label="Find & Replace"
        onClick={() => handleAction('search')}
        disabled={disabled}
        shortcut="Ctrl+F"
      />
      
      <CustomToolbarButton
        icon={Download}
        label="Export"
        onClick={() => handleAction('export')}
        disabled={disabled}
      />
      
      <CustomToolbarButton
        icon={Settings}
        label="Settings"
        onClick={() => handleAction('settings')}
        disabled={disabled}
      />
      
      <CustomToolbarButton
        icon={HelpCircle}
        label="Keyboard Shortcuts"
        onClick={() => handleAction('help')}
        disabled={disabled}
        shortcut="Ctrl+/"
      />
    </div>
  )
}

// Create the toolbar plugin configuration
export const createAdvancedToolbarPlugin = (props: AdvancedToolbarProps) => {
  return toolbarPlugin({
    toolbarContents: () => <AdvancedToolbar {...props} />
  })
}