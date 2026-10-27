'use client'

import { SimplifiedMarkdownEditor } from './SimplifiedMarkdownEditor'

interface AdvancedMarkdownEditorProps {
  initialContent?: string
  initialTitle?: string
  onSave?: (content: string, title: string) => Promise<void>
  onContentChange?: (content: string) => void
  autoSave?: boolean
  autoSaveInterval?: number
  readOnly?: boolean
  collaborationEnabled?: boolean
  documentId?: string
  className?: string
}

// For backward compatibility, export the SimplifiedMarkdownEditor as AdvancedMarkdownEditor
export function AdvancedMarkdownEditor(props: AdvancedMarkdownEditorProps) {
  return <SimplifiedMarkdownEditor {...props} />
}