'use client'

import React, { useRef, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { 
  Users, 
  Lock, 
  Unlock, 
  Save, 
  History,
  Eye,
  Edit,
  AlertCircle
} from 'lucide-react'
import { useRealTimeSync } from '@/hooks/use-real-time-sync'
import { PresenceIndicators, CursorIndicator } from '@/components/sync/presence-indicators'
import { ConflictIndicator } from '@/components/sync/conflict-resolution'
import { cn } from '@/lib/utils'
import { debounce } from 'lodash'

interface CollaborativeEditorProps {
  entityId: string
  entityType: string
  initialContent: string
  field: string
  title?: string
  placeholder?: string
  readOnly?: boolean
  onSave?: (content: string) => void
  className?: string
}

interface CursorPosition {
  userId: string
  userName: string
  position: number
  selection?: { start: number; end: number }
}

interface EditOperation {
  type: 'insert' | 'delete' | 'replace'
  position: number
  content: string
  length?: number
  userId: string
  timestamp: Date
}

export function CollaborativeEditor({
  entityId,
  entityType,
  initialContent,
  field,
  title,
  placeholder = 'Start typing...',
  readOnly = false,
  onSave,
  className
}: CollaborativeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [content, setContent] = React.useState(initialContent)
  const [isLocked, setIsLocked] = React.useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false)
  const [cursors, setCursors] = React.useState<CursorPosition[]>([])
  const [isEditing, setIsEditing] = React.useState(false)
  const [lastSaved, setLastSaved] = React.useState<Date | null>(null)

  const {
    isConnected,
    presence,
    conflicts,
    queueOperation,
    sendEdit,
    sendCursor,
    joinProject,
    leaveProject
  } = useRealTimeSync({
    presenceLocation: `${entityType}/${entityId}/${field}`
  })

  // Join collaboration room on mount
  useEffect(() => {
    if (entityType === 'project') {
      joinProject(entityId)
    }
    
    return () => {
      if (entityType === 'project') {
        leaveProject(entityId)
      }
    }
  }, [entityId, entityType, joinProject, leaveProject])

  // Debounced sync function
  const debouncedSync = useCallback(
    debounce(async (newContent: string, cursorPos: number) => {
      if (newContent !== initialContent) {
        await queueOperation('update', entityType, entityId, {
          [field]: newContent
        }, field)
        
        // Send real-time edit to other users
        sendEdit(entityId, field, newContent, cursorPos)
        setHasUnsavedChanges(false)
        setLastSaved(new Date())
      }
    }, 1000),
    [entityId, entityType, field, initialContent, queueOperation, sendEdit]
  )

  // Handle content changes
  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    const cursorPosition = e.target.selectionStart
    
    setContent(newContent)
    setHasUnsavedChanges(true)
    
    if (!readOnly && isConnected) {
      debouncedSync(newContent, cursorPosition)
    }
  }, [readOnly, isConnected, debouncedSync])

  // Handle cursor position changes
  const handleCursorChange = useCallback(() => {
    if (!textareaRef.current || readOnly) return

    const textarea = textareaRef.current
    const cursorPosition = textarea.selectionStart
    const selectionEnd = textarea.selectionEnd

    // Send cursor position to other users
    if (isConnected && entityType === 'project') {
      sendCursor(entityId, field, cursorPosition)
    }

    // Update local cursor tracking
    if (cursorPosition !== selectionEnd) {
      // User has made a selection
      // Handle selection tracking if needed
    }
  }, [readOnly, isConnected, entityType, entityId, field, sendCursor])

  // Handle focus events
  const handleFocus = useCallback(() => {
    setIsEditing(true)
  }, [])

  const handleBlur = useCallback(() => {
    setIsEditing(false)
  }, [])

  // Manual save function
  const handleSave = useCallback(async () => {
    if (onSave) {
      onSave(content)
    }
    
    await queueOperation('update', entityType, entityId, {
      [field]: content
    }, field)
    
    setHasUnsavedChanges(false)
    setLastSaved(new Date())
  }, [content, onSave, queueOperation, entityType, entityId, field])

  // Lock/unlock document
  const handleToggleLock = useCallback(async () => {
    const newLockState = !isLocked
    setIsLocked(newLockState)
    
    // Send lock state to server
    await queueOperation('update', entityType, entityId, {
      [`${field}_locked`]: newLockState
    })
  }, [isLocked, queueOperation, entityType, entityId, field])

  // Apply remote edits
  const applyRemoteEdit = useCallback((operation: EditOperation) => {
    if (operation.userId === 'current-user-id') return // Don't apply own edits
    
    setContent(prevContent => {
      let newContent = prevContent
      
      switch (operation.type) {
        case 'insert':
          newContent = 
            prevContent.slice(0, operation.position) + 
            operation.content + 
            prevContent.slice(operation.position)
          break
        case 'delete':
          newContent = 
            prevContent.slice(0, operation.position) + 
            prevContent.slice(operation.position + (operation.length || 0))
          break
        case 'replace':
          newContent = 
            prevContent.slice(0, operation.position) + 
            operation.content + 
            prevContent.slice(operation.position + (operation.length || 0))
          break
      }
      
      return newContent
    })
  }, [])

  // Get active collaborators
  const activeCollaborators = presence.filter(p => 
    p.location.includes(`${entityType}/${entityId}`) && p.isActive
  )

  // Get conflicts for this field
  const fieldConflicts = conflicts.filter(c => 
    c.conflictingOperations.some(op => 
      op.entityId === entityId && op.field === field
    )
  )

  return (
    <Card className={cn('relative', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {title && <CardTitle className="text-base">{title}</CardTitle>}
            {isEditing && (
              <Badge variant="secondary" className="text-xs">
                <Edit className="h-3 w-3 mr-1" />
                Editing
              </Badge>
            )}
            {hasUnsavedChanges && (
              <Badge variant="outline" className="text-xs">
                Unsaved
              </Badge>
            )}
            {isLocked && (
              <Badge variant="destructive" className="text-xs">
                <Lock className="h-3 w-3 mr-1" />
                Locked
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {fieldConflicts.length > 0 && (
              <ConflictIndicator 
                conflictCount={fieldConflicts.length}
                className="h-7"
              />
            )}
            
            <PresenceIndicators 
              context={`${entityType}/${entityId}`}
              maxVisible={3}
            />
            
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleToggleLock}
                disabled={readOnly}
                className="h-7 px-2"
              >
                {isLocked ? (
                  <Lock className="h-3 w-3" />
                ) : (
                  <Unlock className="h-3 w-3" />
                )}
              </Button>
              
              <Button
                size="sm"
                variant="ghost"
                onClick={handleSave}
                disabled={!hasUnsavedChanges || readOnly}
                className="h-7 px-2"
              >
                <Save className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
        
        {/* Connection status */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className={cn(
              'w-2 h-2 rounded-full',
              isConnected ? 'bg-green-500' : 'bg-red-500'
            )} />
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
          
          {activeCollaborators.length > 0 && (
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {activeCollaborators.length} active
            </div>
          )}
          
          {lastSaved && (
            <div className="flex items-center gap-1">
              <History className="h-3 w-3" />
              Saved {lastSaved.toLocaleTimeString()}
            </div>
          )}
        </div>
      </CardHeader>
      
      <Separator />
      
      <CardContent className="p-0 relative">
        {/* Collaborative cursors overlay */}
        <div className="absolute inset-0 pointer-events-none z-10">
          {cursors.map((cursor) => (
            <CursorIndicator
              key={cursor.userId}
              userId={cursor.userId}
              userName={cursor.userName}
              position={{ x: 0, y: cursor.position * 20 }} // Simplified positioning
            />
          ))}
        </div>
        
        {/* Main editor */}
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onSelect={handleCursorChange}
            onKeyUp={handleCursorChange}
            onClick={handleCursorChange}
            placeholder={placeholder}
            disabled={readOnly || isLocked}
            className={cn(
              'min-h-[300px] resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0',
              'font-mono text-sm leading-relaxed',
              (readOnly || isLocked) && 'bg-muted/50 cursor-not-allowed'
            )}
          />
          
          {/* Overlay for locked state */}
          {isLocked && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Lock className="h-4 w-4" />
                <span className="text-sm">Document is locked</span>
              </div>
            </div>
          )}
          
          {/* Offline indicator */}
          {!isConnected && (
            <div className="absolute top-2 right-2 flex items-center gap-2 px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs">
              <AlertCircle className="h-3 w-3" />
              Working offline
            </div>
          )}
        </div>
      </CardContent>
      
      {/* Footer with additional info */}
      {(hasUnsavedChanges || fieldConflicts.length > 0) && (
        <>
          <Separator />
          <div className="p-3 bg-muted/30">
            <div className="flex items-center justify-between text-xs">
              {hasUnsavedChanges && (
                <div className="flex items-center gap-2 text-orange-600">
                  <AlertCircle className="h-3 w-3" />
                  You have unsaved changes
                </div>
              )}
              
              {fieldConflicts.length > 0 && (
                <div className="flex items-center gap-2 text-red-600">
                  <AlertCircle className="h-3 w-3" />
                  {fieldConflicts.length} conflicts need resolution
                </div>
              )}
              
              <div className="flex gap-2">
                {hasUnsavedChanges && (
                  <Button size="sm" onClick={handleSave}>
                    Save Changes
                  </Button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}

// Simplified read-only viewer for collaborative content
interface CollaborativeViewerProps {
  content: string
  entityId: string
  entityType: string
  field: string
  title?: string
  showPresence?: boolean
  className?: string
}

export function CollaborativeViewer({
  content,
  entityId,
  entityType,
  field,
  title,
  showPresence = true,
  className
}: CollaborativeViewerProps) {
  const { presence } = useRealTimeSync({
    presenceLocation: `${entityType}/${entityId}/${field}`
  })

  const activeViewers = presence.filter(p => 
    p.location.includes(`${entityType}/${entityId}`) && p.isActive
  )

  return (
    <Card className={className}>
      {(title || showPresence) && (
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            {title && <CardTitle className="text-base">{title}</CardTitle>}
            
            {showPresence && activeViewers.length > 0 && (
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <PresenceIndicators 
                  context={`${entityType}/${entityId}`}
                  maxVisible={5}
                />
              </div>
            )}
          </div>
        </CardHeader>
      )}
      
      <CardContent>
        <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
          {content || <span className="text-muted-foreground italic">No content</span>}
        </div>
      </CardContent>
    </Card>
  )
}