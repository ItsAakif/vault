'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { io, Socket } from 'socket.io-client'
import { syncManager, SyncOperation, ConflictResolution } from '@/lib/sync-manager'

interface PresenceData {
  userId: string
  userName: string
  location: string
  lastSeen: Date
  isActive: boolean
}

interface SyncState {
  isConnected: boolean
  isOnline: boolean
  isSyncing: boolean
  lastSync: Date | null
  pendingOperations: number
  conflicts: ConflictResolution[]
  presence: PresenceData[]
}

interface UseRealTimeSyncOptions {
  autoConnect?: boolean
  enablePresence?: boolean
  presenceLocation?: string
}

export function useRealTimeSync(options: UseRealTimeSyncOptions = {}) {
  const { data: session } = useSession()
  const { autoConnect = true, enablePresence = true, presenceLocation = '' } = options

  const [syncState, setSyncState] = useState<SyncState>({
    isConnected: false,
    isOnline: true,
    isSyncing: false,
    lastSync: null,
    pendingOperations: 0,
    conflicts: [],
    presence: []
  })

  const socketRef = useRef<Socket | null>(null)
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize socket connection
  const connect = useCallback(() => {
    if (!session?.user?.id || socketRef.current?.connected) return

    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || '', {
      auth: {
        token: session.user.id // In production, use proper JWT token
      },
      transports: ['websocket', 'polling']
    })

    socketRef.current = socket

    // Connection events
    socket.on('connect', () => {
      setSyncState(prev => ({ ...prev, isConnected: true }))
      
      if (enablePresence && presenceLocation) {
        updatePresence(presenceLocation)
      }
      
      startHeartbeat()
    })

    socket.on('disconnect', () => {
      setSyncState(prev => ({ ...prev, isConnected: false }))
      stopHeartbeat()
    })

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error)
      setSyncState(prev => ({ ...prev, isConnected: false }))
    })

    // Sync events
    socket.on('sync:operation', (operation: SyncOperation) => {
      syncManager.applyRemoteOperation(operation)
    })

    socket.on('sync:ack', (data: { operationId: string; success: boolean; error?: string }) => {
      if (!data.success) {
        console.error(`Sync operation ${data.operationId} failed:`, data.error)
      }
    })

    socket.on('sync:conflict', (conflict: ConflictResolution) => {
      setSyncState(prev => ({
        ...prev,
        conflicts: [...prev.conflicts, conflict]
      }))
    })

    // Presence events
    socket.on('presence:update', (presence: PresenceData) => {
      setSyncState(prev => ({
        ...prev,
        presence: prev.presence.filter(p => p.userId !== presence.userId).concat(presence)
      }))
    })

    return socket
  }, [session?.user?.id, enablePresence, presenceLocation])

  // Disconnect socket
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }
    stopHeartbeat()
    setSyncState(prev => ({ ...prev, isConnected: false }))
  }, [])

  // Update presence
  const updatePresence = useCallback((location: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('presence:update', { location })
    }
  }, [])

  // Start heartbeat to maintain presence
  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) return

    heartbeatIntervalRef.current = setInterval(() => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('presence:heartbeat')
      }
    }, 30000) // Every 30 seconds
  }, [])

  // Stop heartbeat
  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }
  }, [])

  // Queue sync operation
  const queueOperation = useCallback(async (
    type: SyncOperation['type'],
    entity: string,
    entityId: string,
    data: any,
    field?: string
  ) => {
    const operationId = await syncManager.queueOperation({
      type,
      entity,
      entityId,
      field,
      data,
      userId: session?.user?.id || ''
    })

    // Send to server if connected
    if (socketRef.current?.connected) {
      socketRef.current.emit('sync:operation', {
        type,
        entity,
        entityId,
        field,
        data,
        userId: session?.user?.id
      })
    }

    return operationId
  }, [session?.user?.id])

  // Resolve conflict
  const resolveConflict = useCallback(async (
    operationId: string,
    resolution: 'accept_local' | 'accept_remote' | 'merge',
    mergedData?: any
  ) => {
    await syncManager.resolveConflict(operationId, resolution, mergedData)
    
    // Notify server
    if (socketRef.current?.connected) {
      socketRef.current.emit('sync:resolve-conflict', {
        operationId,
        resolution,
        mergedData
      })
    }

    // Remove from local conflicts
    setSyncState(prev => ({
      ...prev,
      conflicts: prev.conflicts.filter(c => c.operationId !== operationId)
    }))
  }, [])

  // Get presence for specific context
  const getPresence = useCallback(async (context: string): Promise<PresenceData[]> => {
    return new Promise((resolve) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('presence:get', { context }, (presence: PresenceData[]) => {
          resolve(presence)
        })
      } else {
        resolve([])
      }
    })
  }, [])

  // Join project room for collaboration
  const joinProject = useCallback((projectId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('project:join', { projectId })
    }
  }, [])

  // Leave project room
  const leaveProject = useCallback((projectId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('project:leave', { projectId })
    }
  }, [])

  // Send real-time edit
  const sendEdit = useCallback((projectId: string, field: string, value: any, cursorPosition?: number) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('project:edit', {
        projectId,
        field,
        value,
        cursorPosition
      })
    }
  }, [])

  // Send cursor position
  const sendCursor = useCallback((projectId: string, field: string, position: number) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('project:cursor', {
        projectId,
        field,
        position
      })
    }
  }, [])

  // Force sync
  const forceSync = useCallback(async () => {
    setSyncState(prev => ({ ...prev, isSyncing: true }))
    try {
      await syncManager.forcSync()
    } finally {
      setSyncState(prev => ({ ...prev, isSyncing: false }))
    }
  }, [])

  // Listen to sync manager events
  useEffect(() => {
    const handleSyncStarted = () => {
      setSyncState(prev => ({ ...prev, isSyncing: true }))
    }

    const handleSyncCompleted = () => {
      setSyncState(prev => ({ 
        ...prev, 
        isSyncing: false, 
        lastSync: new Date(),
        pendingOperations: syncManager.getPendingOperations().length
      }))
    }

    const handleSyncFailed = () => {
      setSyncState(prev => ({ ...prev, isSyncing: false }))
    }

    const handleNetworkOnline = () => {
      setSyncState(prev => ({ ...prev, isOnline: true }))
    }

    const handleNetworkOffline = () => {
      setSyncState(prev => ({ ...prev, isOnline: false }))
    }

    const handleConflictDetected = (conflict: ConflictResolution) => {
      setSyncState(prev => ({
        ...prev,
        conflicts: [...prev.conflicts, conflict]
      }))
    }

    const handleOperationQueued = () => {
      setSyncState(prev => ({
        ...prev,
        pendingOperations: syncManager.getPendingOperations().length
      }))
    }

    // Subscribe to sync manager events
    syncManager.on('sync:started', handleSyncStarted)
    syncManager.on('sync:completed', handleSyncCompleted)
    syncManager.on('sync:failed', handleSyncFailed)
    syncManager.on('network:online', handleNetworkOnline)
    syncManager.on('network:offline', handleNetworkOffline)
    syncManager.on('conflict:detected', handleConflictDetected)
    syncManager.on('operation:queued', handleOperationQueued)

    return () => {
      syncManager.off('sync:started', handleSyncStarted)
      syncManager.off('sync:completed', handleSyncCompleted)
      syncManager.off('sync:failed', handleSyncFailed)
      syncManager.off('network:online', handleNetworkOnline)
      syncManager.off('network:offline', handleNetworkOffline)
      syncManager.off('conflict:detected', handleConflictDetected)
      syncManager.off('operation:queued', handleOperationQueued)
    }
  }, [])

  // Auto-connect when session is available
  useEffect(() => {
    if (autoConnect && session?.user?.id && !socketRef.current?.connected) {
      connect()
    }

    return () => {
      if (!autoConnect) {
        disconnect()
      }
    }
  }, [session?.user?.id, autoConnect, connect, disconnect])

  // Update presence when location changes
  useEffect(() => {
    if (enablePresence && presenceLocation && socketRef.current?.connected) {
      updatePresence(presenceLocation)
    }
  }, [presenceLocation, enablePresence, updatePresence])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    // State
    syncState,
    isConnected: syncState.isConnected,
    isOnline: syncState.isOnline,
    isSyncing: syncState.isSyncing,
    lastSync: syncState.lastSync,
    pendingOperations: syncState.pendingOperations,
    conflicts: syncState.conflicts,
    presence: syncState.presence,

    // Actions
    connect,
    disconnect,
    updatePresence,
    queueOperation,
    resolveConflict,
    getPresence,
    joinProject,
    leaveProject,
    sendEdit,
    sendCursor,
    forceSync
  }
}