'use client'

import React, { useRef, useEffect, useCallback } from 'react'
import { useRealTimeSync } from '@/hooks/use-real-time-sync'
import { CursorIndicator, SelectionIndicator } from '@/components/sync/presence-indicators'
import { cn } from '@/lib/utils'

interface CursorPosition {
  userId: string
  userName: string
  position: number
  selection?: { start: number; end: number }
  timestamp: Date
}

interface LiveCursorsProps {
  entityId: string
  entityType: string
  field: string
  textareaRef: React.RefObject<HTMLTextAreaElement>
  className?: string
}

const CURSOR_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#8B5CF6', // purple
  '#F59E0B', // orange
  '#EF4444', // red
  '#06B6D4', // cyan
  '#84CC16', // lime
  '#F97316'  // orange
]

export function LiveCursors({
  entityId,
  entityType,
  field,
  textareaRef,
  className
}: LiveCursorsProps) {
  const [cursors, setCursors] = React.useState<Map<string, CursorPosition>>(new Map())
  const [selections, setSelections] = React.useState<Map<string, CursorPosition>>(new Map())
  const cursorTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const { sendCursor, isConnected } = useRealTimeSync()

  // Get cursor color for user
  const getCursorColor = useCallback((userId: string) => {
    const index = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return CURSOR_COLORS[index % CURSOR_COLORS.length]
  }, [])

  // Convert text position to screen coordinates
  const getCoordinatesFromPosition = useCallback((position: number) => {
    if (!textareaRef.current) return { x: 0, y: 0 }

    const textarea = textareaRef.current
    const text = textarea.value
    
    // Create a temporary div to measure text
    const div = document.createElement('div')
    div.style.position = 'absolute'
    div.style.visibility = 'hidden'
    div.style.whiteSpace = 'pre-wrap'
    div.style.wordWrap = 'break-word'
    div.style.font = window.getComputedStyle(textarea).font
    div.style.width = textarea.clientWidth + 'px'
    div.style.padding = window.getComputedStyle(textarea).padding
    div.style.border = window.getComputedStyle(textarea).border
    
    document.body.appendChild(div)
    
    // Add text up to cursor position
    div.textContent = text.substring(0, position)
    
    // Add a span to measure cursor position
    const span = document.createElement('span')
    span.textContent = '|'
    div.appendChild(span)
    
    const rect = textarea.getBoundingClientRect()
    const spanRect = span.getBoundingClientRect()
    
    const x = spanRect.left - rect.left + textarea.scrollLeft
    const y = spanRect.top - rect.top + textarea.scrollTop
    
    document.body.removeChild(div)
    
    return { x, y }
  }, [textareaRef])

  // Handle cursor position updates from other users
  const handleRemoteCursor = useCallback((data: {
    userId: string
    userName: string
    position: number
    selection?: { start: number; end: number }
  }) => {
    if (!isConnected) return

    const cursorData: CursorPosition = {
      ...data,
      timestamp: new Date()
    }

    setCursors(prev => new Map(prev.set(data.userId, cursorData)))

    if (data.selection) {
      setSelections(prev => new Map(prev.set(data.userId, cursorData)))
    } else {
      setSelections(prev => {
        const newSelections = new Map(prev)
        newSelections.delete(data.userId)
        return newSelections
      })
    }

    // Clear cursor after 5 seconds of inactivity
    const existingTimeout = cursorTimeouts.current.get(data.userId)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    const timeout = setTimeout(() => {
      setCursors(prev => {
        const newCursors = new Map(prev)
        newCursors.delete(data.userId)
        return newCursors
      })
      setSelections(prev => {
        const newSelections = new Map(prev)
        newSelections.delete(data.userId)
        return newSelections
      })
      cursorTimeouts.current.delete(data.userId)
    }, 5000)

    cursorTimeouts.current.set(data.userId, timeout)
  }, [isConnected])

  // Send local cursor position
  const sendCursorPosition = useCallback((position: number, selection?: { start: number; end: number }) => {
    if (!isConnected || entityType !== 'project') return

    sendCursor(entityId, field, position)
    
    // Also send selection if exists
    if (selection && selection.start !== selection.end) {
      // Send selection data through custom event
      // In a real implementation, you'd extend the socket events
    }
  }, [isConnected, entityType, entityId, field, sendCursor])

  // Listen for textarea cursor changes
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    const handleSelectionChange = () => {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      
      if (start !== end) {
        sendCursorPosition(start, { start, end })
      } else {
        sendCursorPosition(start)
      }
    }

    textarea.addEventListener('selectionchange', handleSelectionChange)
    textarea.addEventListener('keyup', handleSelectionChange)
    textarea.addEventListener('mouseup', handleSelectionChange)
    textarea.addEventListener('focus', handleSelectionChange)

    return () => {
      textarea.removeEventListener('selectionchange', handleSelectionChange)
      textarea.removeEventListener('keyup', handleSelectionChange)
      textarea.removeEventListener('mouseup', handleSelectionChange)
      textarea.removeEventListener('focus', handleSelectionChange)
    }
  }, [textareaRef, sendCursorPosition])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      cursorTimeouts.current.forEach(timeout => clearTimeout(timeout))
      cursorTimeouts.current.clear()
    }
  }, [])

  if (!isConnected || !textareaRef.current) {
    return null
  }

  return (
    <div className={cn('absolute inset-0 pointer-events-none z-10', className)}>
      {/* Render selections */}
      {Array.from(selections.values()).map((selection) => {
        if (!selection.selection) return null
        
        const startCoords = getCoordinatesFromPosition(selection.selection.start)
        const endCoords = getCoordinatesFromPosition(selection.selection.end)
        
        return (
          <SelectionIndicator
            key={`selection-${selection.userId}`}
            userId={selection.userId}
            userName={selection.userName}
            start={startCoords.x}
            end={endCoords.x}
            color={getCursorColor(selection.userId)}
          />
        )
      })}

      {/* Render cursors */}
      {Array.from(cursors.values()).map((cursor) => {
        const coords = getCoordinatesFromPosition(cursor.position)
        
        return (
          <CursorIndicator
            key={`cursor-${cursor.userId}`}
            userId={cursor.userId}
            userName={cursor.userName}
            position={coords}
            color={getCursorColor(cursor.userId)}
          />
        )
      })}
    </div>
  )
}

// Hook for managing live cursor tracking
export function useLiveCursors(
  entityId: string,
  entityType: string,
  field: string,
  textareaRef: React.RefObject<HTMLTextAreaElement>
) {
  const [cursors, setCursors] = React.useState<CursorPosition[]>([])
  const { sendCursor, isConnected } = useRealTimeSync()

  const sendCursorPosition = useCallback((position: number) => {
    if (isConnected && entityType === 'project') {
      sendCursor(entityId, field, position)
    }
  }, [isConnected, entityType, entityId, field, sendCursor])

  const trackCursor = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    const position = textarea.selectionStart
    sendCursorPosition(position)
  }, [textareaRef, sendCursorPosition])

  return {
    cursors,
    trackCursor,
    sendCursorPosition
  }
}

// Collaborative text selection component
interface CollaborativeSelectionProps {
  userId: string
  userName: string
  start: number
  end: number
  text: string
  color?: string
  className?: string
}

export function CollaborativeSelection({
  userId,
  userName,
  start,
  end,
  text,
  color,
  className
}: CollaborativeSelectionProps) {
  const selectionColor = color || CURSOR_COLORS[userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % CURSOR_COLORS.length]
  
  return (
    <span
      className={cn(
        'relative inline-block',
        className
      )}
      style={{
        backgroundColor: `${selectionColor}20`,
        borderLeft: `2px solid ${selectionColor}`,
        borderRight: `2px solid ${selectionColor}`
      }}
    >
      {text.substring(start, end)}
      <span
        className="absolute -top-6 left-0 px-1 py-0.5 rounded text-xs text-white whitespace-nowrap z-20"
        style={{ backgroundColor: selectionColor }}
      >
        {userName}
      </span>
    </span>
  )
}

// Real-time typing indicator
interface TypingIndicatorProps {
  typingUsers: Array<{ userId: string; userName: string }>
  className?: string
}

export function TypingIndicator({ typingUsers, className }: TypingIndicatorProps) {
  if (typingUsers.length === 0) return null

  const getTypingText = () => {
    if (typingUsers.length === 1) {
      return `${typingUsers[0].userName} is typing...`
    } else if (typingUsers.length === 2) {
      return `${typingUsers[0].userName} and ${typingUsers[1].userName} are typing...`
    } else {
      return `${typingUsers[0].userName} and ${typingUsers.length - 1} others are typing...`
    }
  }

  return (
    <div className={cn(
      'flex items-center gap-2 text-xs text-muted-foreground animate-pulse',
      className
    )}>
      <div className="flex gap-1">
        <div className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span>{getTypingText()}</span>
    </div>
  )
}