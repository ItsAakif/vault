'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useScrollSync } from '@/hooks/use-scroll-sync'
import { useClickToEdit } from '@/hooks/use-click-to-edit'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { 
  Copy, 
  Download, 
  ExternalLink,
  CheckSquare,
  Square
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

interface MarkdownPreviewProps {
  content: string
  onContentChange?: (content: string) => void
  onScrollSync?: (scrollTop: number, scrollHeight: number) => void
  onNavigateToLine?: (lineNumber: number) => void
  syncScrollTop?: number
  className?: string
  showActions?: boolean
  interactive?: boolean
}

export function MarkdownPreview({
  content,
  onContentChange,
  onScrollSync,
  onNavigateToLine,
  syncScrollTop,
  className,
  showActions = true,
  interactive = true
}: MarkdownPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  
  const { createScrollHandler, syncScrollTo, isScrolling } = useScrollSync({
    enabled: !!onScrollSync
  })

  const { handlePreviewClick } = useClickToEdit({
    content,
    onNavigateToLine,
    enabled: interactive && !!onNavigateToLine
  })

  // Handle scroll synchronization
  const handleScroll = createScrollHandler((scrollTop, scrollHeight, scrollPercentage) => {
    if (onScrollSync) {
      onScrollSync(scrollTop, scrollHeight)
    }
  })

  // Sync scroll position from editor
  useEffect(() => {
    if (syncScrollTop !== undefined && scrollAreaRef.current) {
      syncScrollTo(scrollAreaRef.current, syncScrollTop)
    }
  }, [syncScrollTop, syncScrollTo])

  // Handle task list interactions
  const handleTaskToggle = useCallback((lineIndex: number) => {
    if (!onContentChange || !interactive) return

    const lines = content.split('\n')
    if (lineIndex >= 0 && lineIndex < lines.length) {
      const line = lines[lineIndex]
      const taskMatch = line.match(/^(\s*)- \[([ x])\] (.+)$/)
      
      if (taskMatch) {
        const [, indent, checked, text] = taskMatch
        const newChecked = checked === 'x' ? ' ' : 'x'
        lines[lineIndex] = `${indent}- [${newChecked}] ${text}`
        onContentChange(lines.join('\n'))
      }
    }
  }, [content, onContentChange, interactive])

  // Copy content to clipboard
  const copyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content)
      toast({
        title: 'Copied',
        description: 'Content copied to clipboard',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy content',
        variant: 'destructive',
      })
    }
  }, [content, toast])

  // Export as HTML
  const exportAsHTML = useCallback(() => {
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Exported Document</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            color: #333;
        }
        h1, h2, h3, h4, h5, h6 {
            margin-top: 2rem;
            margin-bottom: 1rem;
            font-weight: 600;
        }
        h1 { font-size: 2rem; border-bottom: 2px solid #eee; padding-bottom: 0.5rem; }
        h2 { font-size: 1.5rem; border-bottom: 1px solid #eee; padding-bottom: 0.25rem; }
        code {
            background-color: #f6f8fa;
            padding: 0.125rem 0.25rem;
            border-radius: 0.25rem;
            font-family: 'Monaco', 'Cascadia Code', monospace;
        }
        pre {
            background-color: #f6f8fa;
            padding: 1rem;
            border-radius: 0.5rem;
            overflow-x: auto;
        }
        blockquote {
            border-left: 4px solid #ddd;
            padding-left: 1rem;
            margin: 1rem 0;
            color: #666;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 1rem 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 0.5rem;
            text-align: left;
        }
        th {
            background-color: #f6f8fa;
            font-weight: 600;
        }
    </style>
</head>
<body>
    ${previewRef.current?.innerHTML || ''}
</body>
</html>`

    const blob = new Blob([htmlContent], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'document.html'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast({
      title: 'Exported',
      description: 'Document exported as HTML',
    })
  }, [toast])

  // Custom components for markdown rendering
  const components = {
    // Custom task list renderer
    li: ({ children, ...props }: any) => {
      const childText = children?.toString() || ''
      const isTaskItem = childText.includes('[ ]') || childText.includes('[x]')
      
      if (isTaskItem && interactive) {
        const isChecked = childText.includes('[x]')
        const text = childText.replace(/^\[([ x])\]\s*/, '')
        const lineIndex = 0 // This would need to be calculated properly
        
        return (
          <li className="flex items-center gap-2 list-none" {...props}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleTaskToggle(lineIndex)}
              className="h-5 w-5 p-0"
            >
              {isChecked ? (
                <CheckSquare className="h-4 w-4 text-primary" />
              ) : (
                <Square className="h-4 w-4" />
              )}
            </Button>
            <span className={isChecked ? 'line-through text-muted-foreground' : ''}>
              {text}
            </span>
          </li>
        )
      }
      
      return <li {...props}>{children}</li>
    },

    // Custom link renderer with external link icon
    a: ({ href, children, ...props }: any) => (
      <a
        href={href}
        target={href?.startsWith('http') ? '_blank' : undefined}
        rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
        className="text-primary hover:underline inline-flex items-center gap-1"
        {...props}
      >
        {children}
        {href?.startsWith('http') && (
          <ExternalLink className="h-3 w-3" />
        )}
      </a>
    ),

    // Custom code block with copy button
    pre: ({ children, ...props }: any) => (
      <div className="relative group">
        <pre className="bg-muted p-4 rounded-lg overflow-x-auto" {...props}>
          {children}
        </pre>
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => {
            const code = children?.props?.children || ''
            navigator.clipboard.writeText(code)
            toast({ title: 'Copied', description: 'Code copied to clipboard' })
          }}
        >
          <Copy className="h-3 w-3" />
        </Button>
      </div>
    ),

    // Custom table with better styling
    table: ({ children, ...props }: any) => (
      <div className="overflow-x-auto my-4">
        <table className="w-full border-collapse border border-border" {...props}>
          {children}
        </table>
      </div>
    ),

    th: ({ children, ...props }: any) => (
      <th className="border border-border bg-muted p-2 text-left font-semibold" {...props}>
        {children}
      </th>
    ),

    td: ({ children, ...props }: any) => (
      <td className="border border-border p-2" {...props}>
        {children}
      </td>
    )
  }

  return (
    <Card className={cn('h-full flex flex-col', className)}>
      {/* Preview Actions */}
      {showActions && (
        <div className="flex items-center justify-between p-3 border-b">
          <h3 className="font-semibold text-sm">Preview</h3>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={copyToClipboard}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={exportAsHTML}
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Preview Content */}
      <ScrollArea 
        className="flex-1"
        ref={scrollAreaRef}
        onScrollCapture={handleScroll}
      >
        <div 
          ref={previewRef}
          className="p-6 prose prose-sm max-w-none dark:prose-invert cursor-pointer"
          onClick={handlePreviewClick}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            rehypePlugins={[rehypeHighlight, rehypeRaw]}
            components={components}
          >
            {content || '*No content to preview*'}
          </ReactMarkdown>
        </div>
      </ScrollArea>
    </Card>
  )
}