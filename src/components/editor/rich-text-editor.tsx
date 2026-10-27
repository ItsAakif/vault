'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  Save, 
  FileText, 
  Eye, 
  EyeOff, 
  Split, 
  History, 
  Plus, 
  X,
  Loader2
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface RichTextEditorProps {
  initialContent?: string
  initialTitle?: string
  onSave?: (content: string, title: string) => Promise<void>
  autoSave?: boolean
  autoSaveInterval?: number
  placeholder?: string
  className?: string
}

export function RichTextEditor({
  initialContent = '',
  initialTitle = '',
  onSave,
  autoSave = true,
  autoSaveInterval = 30000,
  placeholder = 'Start writing...',
  className = ''
}: RichTextEditorProps) {
  const [title, setTitle] = useState(initialTitle)
  const [content, setContent] = useState(initialContent)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  
  const { toast } = useToast()

  // Handle content changes
  const handleContentChange = useCallback((value: string) => {
    setContent(value)
    setIsDirty(value !== initialContent)
  }, [initialContent])

  // Handle title changes
  const handleTitleChange = useCallback((value: string) => {
    setTitle(value)
    setIsDirty(value !== initialTitle || content !== initialContent)
  }, [initialTitle, content, initialContent])

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
    if (!isDirty || !title.trim()) {
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
      
      setIsDirty(false)
      
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
              <Badge variant={isDirty ? 'destructive' : 'secondary'}>
                {isDirty ? 'Unsaved' : 'Saved'}
              </Badge>
              
              <Button
                onClick={handleSave}
                disabled={!isDirty || isSaving}
                size="sm"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="px-0">
          <div className="space-y-4">
            <Textarea
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder={placeholder}
              className="min-h-[400px] resize-none border-0 px-0 focus-visible:ring-0 shadow-none text-base"
            />
            
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div>
                {content.length} characters
              </div>
              
              {autoSave && (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  Auto-save enabled
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}