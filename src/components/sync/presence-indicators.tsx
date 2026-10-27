'use client'

import * as React from 'react'
import { Users, PenLine } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useRealTimeSync } from '@/hooks/use-real-time-sync'
import { cn } from '@/lib/utils'

/**
 * Presence components for collaborative editing.
 *
 * These are intentionally presentational: they read live presence data from the
 * real-time sync hook (backed by the Socket.IO presence events broadcast by
 * `src/lib/socket.ts`: presence:update, typing:start/stop, cursor:move) and
 * render lightweight indicators. No additional dependencies are introduced.
 */

export interface PresenceUser {
  userId: string
  userName: string
  location?: string
  isActive?: boolean
  lastSeen?: Date
}

const PRESENCE_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#8B5CF6', // purple
  '#F59E0B', // orange
  '#EF4444', // red
  '#06B6D4', // cyan
  '#84CC16', // lime
  '#F97316', // pale orange
]

/**
 * Deterministic color for a user id, shared by avatars, cursors and selections.
 */
export function getUserColor(userId: string): string {
  if (!userId) return PRESENCE_COLORS[0]
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = (hash + userId.charCodeAt(i)) % PRESENCE_COLORS.length
  }
  return PRESENCE_COLORS[hash]
}

function initials(name: string): string {
  const trimmed = (name || '').trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Stacked avatar indicators showing who is currently present in a context.
 *
 * Presence is filtered by `context` when provided (matching the location string
 * broadcast in the `presence:update` payload). `presentUsers` may be supplied to
 * render a controlled/presentational list instead of subscribing to the socket.
 */
export interface PresenceIndicatorsProps {
  /** Location context to filter presence by, e.g. "project/<id>". */
  context?: string
  /** Explicit presence list; when omitted, live presence is used. */
  presentUsers?: PresenceUser[]
  /** Maximum number of avatars to render before collapsing into a "+N". */
  maxVisible?: number
  /** Users currently typing in this context (optional, presentational). */
  typingUsers?: Array<{ userId: string; userName: string }>
  className?: string
}

export function PresenceIndicators({
  context,
  presentUsers,
  maxVisible = 5,
  typingUsers,
  className,
}: PresenceIndicatorsProps) {
  const { presence } = useRealTimeSync(
    context ? { presenceLocation: context } : {}
  )

  const users: PresenceUser[] = React.useMemo(() => {
    if (presentUsers) return presentUsers
    return presence
      .filter((p) => (context ? p.location?.includes(context) : true))
      .filter((p) => p.isActive !== false)
      .map((p) => ({
        userId: p.userId,
        userName: p.userName,
        location: p.location,
        isActive: p.isActive,
        lastSeen: p.lastSeen,
      }))
  }, [presentUsers, presence, context])

  const visible = maxVisible > 0 ? users.slice(0, maxVisible) : users
  const overflow = users.length - visible.length
  const typing = typingUsers ?? []

  if (users.length === 0 && typing.length === 0) {
    return null
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="flex items-center -space-x-2">
        {visible.map((user) => {
          const color = getUserColor(user.userId)
          return (
            <Tooltip key={user.userId}>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex"
                  title={user.userName}
                  data-user-id={user.userId}
                >
                  <Avatar className="size-6 ring-2 ring-background">
                    <AvatarFallback
                      className="text-[10px] font-semibold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {initials(user.userName)}
                    </AvatarFallback>
                  </Avatar>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{user.userName || 'Collaborator'}</p>
              </TooltipContent>
            </Tooltip>
          )
        })}

        {overflow > 0 && (
          <span
            className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-background"
            title={users
              .slice(maxVisible)
              .map((u) => u.userName)
              .join(', ')}
          >
            +{overflow}
          </span>
        )}
      </div>

      {typing.length > 0 && (
        <span
          className="flex items-center gap-0.5 text-xs text-muted-foreground"
          title={
            typing.length === 1
              ? `${typing[0].userName} is typing...`
              : `${typing.length} people are typing...`
          }
        >
          <PenLine className="h-3 w-3" />
        </span>
      )}

      {users.length > 0 && (
        <span className="sr-only">
          <Users className="h-3 w-3" />
          {users.length} collaborator{users.length === 1 ? '' : 's'} present
        </span>
      )}
    </div>
  )
}

/**
 * A single remote cursor rendered at a screen position.
 */
export interface CursorIndicatorProps {
  userId: string
  userName: string
  position: { x: number; y: number }
  color?: string
  className?: string
}

export function CursorIndicator({
  userId,
  userName,
  position,
  color,
  className,
}: CursorIndicatorProps) {
  const cursorColor = color || getUserColor(userId)

  return (
    <div
      className={cn(
        'pointer-events-none absolute z-20 transition-transform duration-75 ease-out',
        className
      )}
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      aria-hidden="true"
    >
      <div className="h-5 w-0.5" style={{ backgroundColor: cursorColor }} />
      <div
        className="mt-0.5 w-fit whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium leading-none text-white"
        style={{ backgroundColor: cursorColor }}
      >
        {userName || 'Collaborator'}
      </div>
    </div>
  )
}

/**
 * A remote selection highlight spanning horizontal offsets within a container.
 */
export interface SelectionIndicatorProps {
  userId: string
  userName: string
  start: number
  end: number
  color?: string
  className?: string
}

export function SelectionIndicator({
  userId,
  userName,
  start,
  end,
  color,
  className,
}: SelectionIndicatorProps) {
  const selectionColor = color || getUserColor(userId)
  const left = Math.min(start, end)
  const width = Math.abs(end - start)

  return (
    <div
      className={cn('pointer-events-none absolute top-0 h-full rounded-sm', className)}
      style={{
        left: `${left}px`,
        width: `${Math.max(width, 1)}px`,
        backgroundColor: `${selectionColor}33`,
        borderLeft: `2px solid ${selectionColor}`,
      }}
      aria-hidden="true"
    >
      <span
        className="absolute -top-5 left-0 w-fit whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium leading-none text-white"
        style={{ backgroundColor: selectionColor }}
      >
        {userName || 'Collaborator'}
      </span>
    </div>
  )
}
