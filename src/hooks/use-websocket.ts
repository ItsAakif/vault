'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { io, Socket } from 'socket.io-client'

interface WebSocketMessage {
  type: string
  action: string
  data: any
  timestamp: string
  senderId?: string
}

interface UseWebSocketOptions {
  onContentUpdate?: (data: any) => void
  onProjectUpdate?: (data: any) => void
  onJobUpdate?: (data: any) => void
  onCalendarUpdate?: (data: any) => void
  onTypingStart?: (data: any) => void
  onTypingStop?: (data: any) => void
  onCursorMove?: (data: any) => void
  onPresenceUpdate?: (data: any) => void
  onPresenceDisconnect?: (data: any) => void
  onConnect?: () => void
  onDisconnect?: () => void
}

// One report per page load, no matter how many hooks open their own socket
// (realtime sync, presence and collaborative editing each create one). A rejected
// handshake is the same problem every time, so it is reported once, with the reason.
let connectFailureReported = false

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { data: session } = useSession()
  const socketRef = useRef<Socket | null>(null)
  const isConnectedRef = useRef(false)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 5

  const connect = useCallback(() => {
    if (!session?.user || socketRef.current?.connected) return

    try {
      // Check if running with custom server (Socket.IO endpoint available)
      const isCustomServer = process.env.NEXT_PUBLIC_CUSTOM_SERVER === 'true'
      if (!isCustomServer) {
        console.log('WebSocket: Custom server not enabled, skipping connection')
        return
      }

      const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000', {
        // No `auth` payload: the NextAuth session JWT lives in an httpOnly cookie the
        // browser attaches to this same-origin handshake, and the server verifies that
        // cookie directly. Sending a placeholder token here only guaranteed rejection.
        path: '/api/socketio',
        transports: ['websocket', 'polling'],
        timeout: 5000,
        // Send cookies even when NEXT_PUBLIC_SOCKET_URL points at a different origin.
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 3000
      })

      socketRef.current = socket

      // Connection events
      socket.on('connect', () => {
        console.log('WebSocket connected')
        isConnectedRef.current = true
        reconnectAttemptsRef.current = 0
        // A working connection re-arms the guard so a later outage is reported too.
        connectFailureReported = false
        options.onConnect?.()
      })

      socket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason)
        isConnectedRef.current = false
        options.onDisconnect?.()
      })

      socket.on('connect_error', (error) => {
        isConnectedRef.current = false
        const reason = error?.message || 'unknown error'
        // Rejected credentials are not transient: retrying re-runs the same failed
        // handshake, which is how one bad token turned into a dozen identical errors.
        const isAuthError = /auth|unauthori[sz]ed|forbidden|credential/i.test(reason)

        if (isAuthError) {
          // Use the manager setter, not `opts.reconnection`: only the setter flips the
          // in-flight loop off and sets skipReconnect.
          socket.io.reconnection(false)
        }

        if (!connectFailureReported) {
          connectFailureReported = true
          console.error(
            isAuthError
              ? `WebSocket authentication failed: ${reason}. The NextAuth session cookie was not accepted by the Socket.IO server, so realtime sync is disabled until the page is reloaded with a valid session.`
              : `WebSocket connection failed: ${reason}. Realtime sync will retry; the app keeps working without it.`
          )
        }

        if (isAuthError) {
          socket.disconnect()
        }
      })

      // Sync events
      socket.on('sync', (message: WebSocketMessage) => {
        switch (message.type) {
          case 'content':
            options.onContentUpdate?.(message.data)
            break
          case 'project':
            options.onProjectUpdate?.(message.data)
            break
          case 'job':
            options.onJobUpdate?.(message.data)
            break
          case 'calendar':
            options.onCalendarUpdate?.(message.data)
            break
        }
      })

      // Specific update events
      if (options.onContentUpdate) socket.on('content:updated', options.onContentUpdate)
      if (options.onProjectUpdate) socket.on('project:updated', options.onProjectUpdate)
      if (options.onJobUpdate) socket.on('job:updated', options.onJobUpdate)
      if (options.onCalendarUpdate) socket.on('calendar:updated', options.onCalendarUpdate)

      // Typing indicators
      if (options.onTypingStart) socket.on('typing:start', options.onTypingStart)
      if (options.onTypingStop) socket.on('typing:stop', options.onTypingStop)

      // Cursor events
      if (options.onCursorMove) socket.on('cursor:moved', options.onCursorMove)

      // Presence events
      if (options.onPresenceUpdate) socket.on('presence:updated', options.onPresenceUpdate)
      if (options.onPresenceDisconnect) socket.on('presence:disconnected', options.onPresenceDisconnect)

      // Welcome message
      socket.on('connected', (data) => {
        console.log('WebSocket welcome message:', data)
      })

    } catch (error) {
      console.error('Error creating WebSocket connection:', error)
    }
  }, [session, options])

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
      isConnectedRef.current = false
    }
  }, [])

  const sendSync = useCallback((type: string, action: string, data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('sync', {
        type,
        action,
        data,
        timestamp: new Date().toISOString()
      })
    }
  }, [])

  const sendContentUpdate = useCallback((data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('content:update', data)
    }
  }, [])

  const sendProjectUpdate = useCallback((data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('project:update', data)
    }
  }, [])

  const sendJobUpdate = useCallback((data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('job:update', data)
    }
  }, [])

  const sendCalendarUpdate = useCallback((data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('calendar:update', data)
    }
  }, [])

  const sendTypingStart = useCallback((itemId: string, itemType: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('typing:start', { itemId, itemType })
    }
  }, [])

  const sendTypingStop = useCallback((itemId: string, itemType: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('typing:stop', { itemId, itemType })
    }
  }, [])

  const sendCursorMove = useCallback((itemId: string, position: number, selection: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('cursor:move', { itemId, position, selection })
    }
  }, [])

  const sendPresenceUpdate = useCallback((page: string, itemId?: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('presence:update', { page, itemId })
    }
  }, [])

  const isConnected = () => {
    return isConnectedRef.current && socketRef.current?.connected
  }

  // Auto-connect on session change
  useEffect(() => {
    if (session?.user) {
      connect()
    } else {
      disconnect()
    }

    return () => {
      disconnect()
    }
  }, [session, connect, disconnect])

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page is hidden, disconnect to save resources
        disconnect()
      } else {
        // Page is visible, reconnect
        if (session?.user) {
          connect()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [session, connect, disconnect])

  return {
    isConnected,
    connect,
    disconnect,
    sendSync,
    sendContentUpdate,
    sendProjectUpdate,
    sendJobUpdate,
    sendCalendarUpdate,
    // Subscription handlers registered for incoming sync events. Exposed so
    // wrappers (e.g. RealtimeSync) can mirror the socket contract publicly.
    onContentUpdate: options.onContentUpdate,
    onProjectUpdate: options.onProjectUpdate,
    onJobUpdate: options.onJobUpdate,
    onCalendarUpdate: options.onCalendarUpdate,
    sendTypingStart,
    sendTypingStop,
    sendCursorMove,
    sendPresenceUpdate
  }
}

// Hook for real-time presence
export function usePresence(page: string, itemId?: string) {
  const { sendPresenceUpdate } = useWebSocket({
    onPresenceUpdate: (data) => {
      console.log('Presence update:', data)
    },
    onPresenceDisconnect: (data) => {
      console.log('Presence disconnect:', data)
    }
  })

  useEffect(() => {
    if (page) {
      sendPresenceUpdate(page, itemId)
    }
  }, [page, itemId, sendPresenceUpdate])

  return { sendPresenceUpdate }
}

// Hook for collaborative editing
export function useCollaborativeEditing(itemId: string, itemType: string) {
  const { sendTypingStart, sendTypingStop, sendCursorMove } = useWebSocket({
    onTypingStart: (data) => {
      if (data.itemId === itemId && data.itemType === itemType) {
        console.log('User started typing:', data)
      }
    },
    onTypingStop: (data) => {
      if (data.itemId === itemId && data.itemType === itemType) {
        console.log('User stopped typing:', data)
      }
    },
    onCursorMove: (data) => {
      if (data.itemId === itemId && data.itemType === itemType) {
        console.log('Cursor moved:', data)
      }
    }
  })

  const startTyping = () => sendTypingStart(itemId, itemType)
  const stopTyping = () => sendTypingStop(itemId, itemType)
  const moveCursor = (position: number, selection: any) => sendCursorMove(itemId, position, selection)

  return {
    startTyping,
    stopTyping,
    moveCursor
  }
}