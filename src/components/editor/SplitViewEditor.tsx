'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Edit, 
  Eye, 
  Split, 
  Maximize2, 
  Minimize2,
  RotateCcw
} from 'lucide-react'
import { MarkdownPreview } from './MarkdownPreview'
import { cn } from '@/lib/utils'

interface SplitViewEditorProps {
  editorComponent: React.ReactNode
  content: string
  onContentChange?: (content: string) => void
  viewMode?: 'edit' | 'preview' | 'split'
  onViewModeChange?: (mode: 'edit' | 'preview' | 'split') => void
  className?: string
}

export function SplitViewEditor({
  editorComponent,
  content,
  onContentChange,
  viewMode = 'split',
  onViewModeChange,
  className
}: SplitViewEditorProps) {
  const [editorScrollTop, setEditorScrollTop] = useState(0)
  const [previewScrollTop, setPreviewScrollTop] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [panelSizes, setPanelSizes] = useState([50, 50])
  
  const editorRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  // Handle view mode changes
  const handleViewModeChange = useCallback((mode: 'edit' | 'preview' | 'split') => {
    if (onViewModeChange) {
      onViewModeChange(mode)
    }
  }, [onViewModeChange])

  // Handle scroll synchronization from editor to preview
  const handleEditorScroll = useCallback((scrollTop: number, scrollHeight: number) => {
    if (viewMode === 'split') {
      const scrollPercentage = scrollHeight > 0 ? scrollTop / scrollHeight : 0
      setPreviewScrollTop(scrollTop)
    }
  }, [viewMode])

  // Handle scroll synchronization from preview to editor
  const handlePreviewScroll = useCallback((scrollTop: number, scrollHeight: number) => {
    if (viewMode === 'split') {
      const scrollPercentage = scrollHeight > 0 ? scrollTop / scrollHeight : 0
      setEditorScrollTop(scrollTop)
    }
  }, [viewMode])

  // Toggle fullscreen mode
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(!isFullscreen)
  }, [isFullscreen])

  // Reset panel sizes
  const resetPanelSizes = useCallback(() => {
    setPanelSizes([50, 50])
  }, [])

  // Handle panel resize
  const handlePanelResize = useCallback((sizes: number[]) => {
    setPanelSizes(sizes)
  }, [])

  // Keyboard shortcuts for view modes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey) {
        switch (e.key) {
          case 'E':
            handleViewModeChange('edit')
            e.preventDefault()
            break
          case 'P':
            handleViewModeChange('preview')
            e.preventDefault()
            break
          case 'S':
            handleViewModeChange('split')
            e.preventDefault()
            break
          case 'F':
            toggleFullscreen()
            e.preventDefault()
            break
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleViewModeChange, toggleFullscreen])

  const ViewModeControls = () => (
    <div className="flex items-center gap-2">
      <Tabs value={viewMode} onValueChange={handleViewModeChange as any}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="edit" className="flex items-center gap-1">
            <Edit className="h-3 w-3" />
            Edit
          </TabsTrigger>
          <TabsTrigger value="split" className="flex items-center gap-1">
            <Split className="h-3 w-3" />
            Split
          </TabsTrigger>
          <TabsTrigger value="preview" className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            Preview
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {viewMode === 'split' && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetPanelSizes}
            title="Reset panel sizes"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </>
      )}
    </div>
  )

  const renderContent = () => {
    switch (viewMode) {
      case 'edit':
        return (
          <div className="h-full w-full">
            {editorComponent}
          </div>
        )

      case 'preview':
        return (
          <MarkdownPreview
            content={content}
            onContentChange={onContentChange}
            className="h-full"
            interactive={true}
          />
        )

      case 'split':
        return (
          <ResizablePanelGroup
            direction="horizontal"
            onLayout={handlePanelResize}
            className="h-full"
          >
            <ResizablePanel 
              defaultSize={panelSizes[0]} 
              minSize={20}
              className="flex flex-col"
            >
              <div className="flex-1 border-r">
                {editorComponent}
              </div>
            </ResizablePanel>
            
            <ResizableHandle withHandle />
            
            <ResizablePanel 
              defaultSize={panelSizes[1]} 
              minSize={20}
              className="flex flex-col"
            >
              <MarkdownPreview
                content={content}
                onContentChange={onContentChange}
                onScrollSync={handlePreviewScroll}
                syncScrollTop={previewScrollTop}
                className="h-full border-0"
                interactive={true}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        )

      default:
        return null
    }
  }

  return (
    <div className={cn(
      'flex flex-col h-full',
      isFullscreen && 'fixed inset-0 z-50 bg-background',
      className
    )}>
      {/* View Mode Controls */}
      <div className="flex items-center justify-between p-3 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">View Mode</span>
        </div>
        <ViewModeControls />
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {renderContent()}
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/50 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>Mode: {viewMode}</span>
          {viewMode === 'split' && (
            <span>
              Editor: {panelSizes[0]}% | Preview: {panelSizes[1]}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span>{content.length} characters</span>
          <span>{content.split('\n').length} lines</span>
          <span>{content.split(/\s+/).filter(word => word.length > 0).length} words</span>
        </div>
      </div>
    </div>
  )
}