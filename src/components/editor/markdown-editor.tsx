'use client'

import { useState, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
// Temporarily disabled highlight.js CSS due to webpack issues
// import 'highlight.js/styles/github.css'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Save, 
  FileText, 
  Eye, 
  EyeOff, 
  History, 
  Plus, 
  X,
  Loader2,
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Code,
  Link,
  Image
} from 'lucide-react'
import { useEditorStore } from '@/store'
import { useToast } from '@/hooks/use-toast'

interface MarkdownEditorProps {
  initialContent?: string
  initialTitle?: string
  onSave?: (content: string, title: string) => Promise<void>
  autoSave?: boolean
  autoSaveInterval?: number
  placeholder?: string
  className?: string
}

export function MarkdownEditor({
  initialContent = '',
  initialTitle = '',
  onSave,
  autoSave = true,
  autoSaveInterval = 30000,
  placeholder = 'Start writing...',
  className = ''
}: MarkdownEditorProps) {
  const [title, setTitle] = useState(initialTitle)
  const [content, setContent] = useState(initialContent)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showVersions, setShowVersions] = useState(false)
  const [activeTab, setActiveTab] = useState('edit')
  
  const { toast } = useToast()
  
  const {
    setContent: setStoreContent,
    setTitle: setStoreTitle,
    setIsDirty: setStoreIsDirty,
    setIsSaving: setStoreIsSaving,
    setLastSaved,
    addVersion,
    versions
  } = useEditorStore()

  // Handle content changes
  const handleContentChange = useCallback((value: string) => {
    setContent(value)
    setIsDirty(value !== initialContent)
    setStoreContent(value)
    setStoreIsDirty(value !== initialContent)
  }, [initialContent, setStoreContent, setStoreIsDirty])

  // Handle title changes
  const handleTitleChange = useCallback((value: string) => {
    setTitle(value)
    setIsDirty(value !== initialTitle || content !== initialContent)
    setStoreTitle(value)
    setStoreIsDirty(value !== initialTitle || content !== initialContent)
  }, [initialTitle, content, initialContent, setStoreTitle, setStoreIsDirty])

  // Auto-save functionality
  useEffect(() => {
    if (!autoSave || !isDirty) return

    const interval = setInterval(async () => {
      if (isDirty && !isSaving) {
        await handleSave()
      }
    }, autoSaveInterval)

    return () => clearInterval(interval)
  }, [autoSave, isDirty, isSaving, autoSaveInterval])

  // Handle save
  const handleSave = async () => {
    if (!isDirty) return

    setIsSaving(true)
    setStoreIsSaving(true)

    try {
      if (onSave) {
        await onSave(content, title)
      }
      
      // Add to version history
      addVersion(content, `Auto-save ${new Date().toLocaleString()}`)
      
      setIsDirty(false)
      setStoreIsDirty(false)
      setLastSaved(new Date())
      
      toast({
        title: 'Saved',
        description: 'Your document has been saved successfully.',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save your document. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
      setStoreIsSaving(false)
    }
  }

  // Insert markdown syntax
  const insertMarkdown = (syntax: string, placeholder = '') => {
    const textarea = document.querySelector('textarea[name="content"]') as HTMLTextAreaElement
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = content.substring(start, end)
    const textToInsert = selectedText || placeholder
    const newText = syntax.replace('{}', textToInsert)
    
    const newContent = 
      content.substring(0, start) + 
      newText + 
      content.substring(end)
    
    handleContentChange(newContent)
    
    // Set cursor position
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + syntax.indexOf('{}'), start + syntax.indexOf('{}') + textToInsert.length)
    }, 0)
  }

  // Restore version
  const handleRestoreVersion = (versionIndex: number) => {
    const version = versions[versionIndex]
    if (version) {
      setContent(version.content)
      setStoreContent(version.content)
      setIsDirty(true)
      setStoreIsDirty(true)
      setShowVersions(false)
      
      toast({
        title: 'Version Restored',
        description: `Restored version from ${version.timestamp.toLocaleString()}`,
      })
    }
  }

  return (
    <div className={`w-full max-w-4xl mx-auto ${className}`}>
      <Card className="border-0 shadow-none">
        <CardHeader className="px-0 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <Input
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Enter title..."
                className="text-2xl font-bold border-0 px-0 focus-visible:ring-0 shadow-none"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowVersions(!showVersions)}
              >
                <History className="h-4 w-4" />
              </Button>
              
              <Button
                onClick={handleSave}
                disabled={!isDirty || isSaving}
                size="sm"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
          
          {isDirty && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Unsaved changes</Badge>
            </div>
          )}
        </CardHeader>
        
        <CardContent className="px-0">
          <div className="relative">
            {/* Version History Sidebar */}
            {showVersions && (
              <div className="absolute right-0 top-0 w-80 h-full bg-background border-l z-10 shadow-lg">
                <div className="p-4 border-b">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Version History</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowVersions(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
                  {versions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No versions yet</p>
                  ) : (
                    versions.map((version, index) => (
                      <div
                        key={version.id}
                        className="p-3 border rounded-lg cursor-pointer hover:bg-accent transition-colors"
                        onClick={() => handleRestoreVersion(index)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{version.label}</span>
                          <Badge variant="outline" className="text-xs">
                            v{index + 1}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {version.timestamp.toLocaleString()}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            
            {/* Editor */}
            <div className={`${showVersions ? 'pr-80' : ''}`}>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="edit">Edit</TabsTrigger>
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                </TabsList>
                
                <TabsContent value="edit" className="space-y-4">
                  {/* Markdown Toolbar */}
                  <div className="flex items-center gap-2 p-2 border rounded-lg">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => insertMarkdown('**{}**', 'bold text')}
                      title="Bold"
                    >
                      <Bold className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => insertMarkdown('*{}*', 'italic text')}
                      title="Italic"
                    >
                      <Italic className="h-4 w-4" />
                    </Button>
                    
                    <Separator orientation="vertical" className="h-6" />
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => insertMarkdown('\n- {}\n', 'list item')}
                      title="Bullet List"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => insertMarkdown('\n1. {}\n', 'numbered item')}
                      title="Numbered List"
                    >
                      <ListOrdered className="h-4 w-4" />
                    </Button>
                    
                    <Separator orientation="vertical" className="h-6" />
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => insertMarkdown('\n> {}\n', 'quote')}
                      title="Quote"
                    >
                      <Quote className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => insertMarkdown('`{}`', 'code')}
                      title="Inline Code"
                    >
                      <Code className="h-4 w-4" />
                    </Button>
                    
                    <Separator orientation="vertical" className="h-6" />
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => insertMarkdown('[{}](url)', 'link text')}
                      title="Link"
                    >
                      <Link className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => insertMarkdown('![{}](url)', 'alt text')}
                      title="Image"
                    >
                      <Image className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {/* Markdown Textarea */}
                  <textarea
                    name="content"
                    value={content}
                    onChange={(e) => handleContentChange(e.target.value)}
                    placeholder={placeholder}
                    className="w-full min-h-[500px] p-4 border rounded-lg font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </TabsContent>
                
                <TabsContent value="preview" className="space-y-4">
                  <div className="prose prose-sm dark:prose-invert max-w-none p-4 border rounded-lg min-h-[500px]">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkBreaks]}
                      rehypePlugins={[rehypeHighlight]}
                    >
                      {content || placeholder}
                    </ReactMarkdown>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}