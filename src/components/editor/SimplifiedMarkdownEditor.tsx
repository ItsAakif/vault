'use client'

import { useRef, useCallback } from 'react'
import { 
  MDXEditor, 
  headingsPlugin, 
  listsPlugin, 
  quotePlugin, 
  thematicBreakPlugin,
  markdownShortcutPlugin,
  linkPlugin,
  linkDialogPlugin,
  imagePlugin,
  tablePlugin,
  codeBlockPlugin,
  codeMirrorPlugin,
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
  type MDXEditorMethods
} from '@mdxeditor/editor'
import './mdx-editor.css'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { 
  Save, 
  Loader2
} from 'lucide-react'
import { useMarkdownEditor } from '@/hooks/use-markdown-editor'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

interface SimplifiedMarkdownEditorProps {
  initialContent?: string
  initialTitle?: string
  onSave?: (content: string, title: string) => Promise<void>
  onContentChange?: (content: string) => void
  autoSave?: boolean
  autoSaveInterval?: number
  readOnly?: boolean
  className?: string
}

export function SimplifiedMarkdownEditor({
  initialContent = '',
  initialTitle = '',
  onSave,
  onContentChange,
  autoSave = true,
  autoSaveInterval = 30000,
  readOnly = false,
  className = ''
}: SimplifiedMarkdownEditorProps) {
  const {
    title,
    content,
    isDirty,
    isSaving,
    editorRef,
    handleContentChange,
    handleTitleChange,
    handleSave
  } = useMarkdownEditor({
    initialContent,
    initialTitle,
    onSave,
    onContentChange,
    autoSave,
    autoSaveInterval,
    readOnly
  })

  const { toast } = useToast()

  // Handle image paste functionality
  const handleImagePaste = useCallback(async (file: File) => {
    try {
      // Show loading toast
      const loadingToast = toast({
        title: "Uploading image...",
        description: "Please wait while your image is being uploaded.",
      })

      // Upload image to server
      const formData = new FormData()
      formData.append('image', file)
      
      const response = await fetch('/api/upload/image', {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        throw new Error('Failed to upload image')
      }
      
      const result = await response.json()
      
      if (result.url && editorRef.current) {
        // Insert the image markdown with uploaded URL
        const imageMarkdown = `\n\n![Uploaded image](${result.url})\n\n`
        const currentContent = editorRef.current.getMarkdown()
        const newContent = currentContent + imageMarkdown
        editorRef.current.setMarkdown(newContent)
        handleContentChange(newContent)
        
        toast({
          title: "Image uploaded",
          description: "Image has been successfully uploaded and inserted.",
        })
      }
    } catch (error) {
      console.error('Error uploading image:', error)
      toast({
        title: "Upload failed",
        description: "Failed to upload image. Please try again.",
        variant: "destructive"
      })
    }
  }, [editorRef, handleContentChange, toast])

  // Handle drag and drop events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.classList.add('dragover')
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.classList.remove('dragover')
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.classList.remove('dragover')
    
    const files = Array.from(e.dataTransfer.files)
    const imageFiles = files.filter(file => file.type.startsWith('image/'))
    
    if (imageFiles.length > 0) {
      // Handle the first image file
      handleImagePaste(imageFiles[0])
    }
  }, [handleImagePaste])

  // Handle paste events
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          handleImagePaste(file)
        }
        break
      }
    }
  }, [handleImagePaste])

  // Add ref for editor container
  const editorContainerRef = useRef<HTMLDivElement>(null)

  return (
    <div className={cn('w-full max-w-6xl mx-auto', className)}>
      <Card className="border-0 shadow-none">
        <CardHeader className="px-0 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <Input
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Enter title..."
                className="text-2xl font-bold border-0 px-0 focus-visible:ring-0 shadow-none"
                readOnly={readOnly}
              />
            </div>
            
            <div className="flex items-center gap-2">
              {/* Save Status */}
              {isDirty && (
                <Badge variant="outline" className="text-orange-600">
                  Unsaved
                </Badge>
              )}
              
              {/* Save Button */}
              <Button
                onClick={handleSave}
                disabled={!isDirty || isSaving || readOnly}
                size="sm"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="px-0">
          <div 
            ref={editorContainerRef}
            className="border rounded-lg overflow-hidden"
            onPaste={handlePaste}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <MDXEditor
              ref={editorRef}
              markdown={content}
              onChange={handleContentChange}
              readOnly={readOnly}
              className="min-h-[500px]"
              contentEditableClassName="prose prose-sm max-w-none focus:outline-none p-4"
              plugins={[
                // Core editing plugins that support text selection
                headingsPlugin(),
                listsPlugin(),
                quotePlugin(),
                thematicBreakPlugin(),
                markdownShortcutPlugin(),
                
                // Link and media plugins
                linkPlugin(),
                linkDialogPlugin(),
                imagePlugin({
                  imageUploadHandler: async (image) => {
                    // Handle uploaded images via API
                    const formData = new FormData()
                    formData.append('image', image)
                    
                    try {
                      const response = await fetch('/api/upload/image', {
                        method: 'POST',
                        body: formData
                      })
                      
                      if (!response.ok) {
                        throw new Error('Upload failed')
                      }
                      
                      const result = await response.json()
                      return result.url
                    } catch (error) {
                      console.error('Error uploading image:', error)
                      toast({
                        title: "Upload failed",
                        description: "Failed to upload image. Please try again.",
                        variant: "destructive"
                      })
                      throw error
                    }
                  },
                  imageAutocompleteSuggestions: []
                }),
                
                // Table plugin
                tablePlugin(),
                
                // Code plugins
                codeBlockPlugin({ defaultCodeBlockLanguage: 'javascript' }),
                codeMirrorPlugin({ 
                  codeBlockLanguages: {
                    javascript: 'JavaScript',
                    typescript: 'TypeScript',
                    python: 'Python',
                    html: 'HTML',
                    css: 'CSS',
                    json: 'JSON',
                    markdown: 'Markdown',
                    bash: 'Bash'
                  }
                }),
                
                // Toolbar with standard controls
                toolbarPlugin({
                  toolbarContents: () => (
                    <div className="flex items-center gap-1 p-2 border-b bg-background/95 flex-wrap">
                      <UndoRedo />
                      <Separator />
                      <BoldItalicUnderlineToggles />
                      <CodeToggle />
                      <Separator />
                      <BlockTypeSelect />
                      <Separator />
                      <ListsToggle />
                      <Separator />
                      <CreateLink />
                      <InsertImage />
                      <InsertTable />
                      <InsertThematicBreak />
                      <InsertCodeBlock />
                      <Separator />
                      <div className="text-xs text-muted-foreground px-2 flex items-center gap-1">
                        📋 Paste images directly with Ctrl+V
                      </div>
                    </div>
                  )
                })
              ]}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}