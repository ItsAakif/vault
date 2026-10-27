'use client'

import { useState, useEffect, useCallback } from 'react'
import { offlineStorage } from '@/lib/offline-storage'
import { syncManager } from '@/lib/sync-manager'
import { logger } from '@/lib/logger'

interface OfflineState {
  isOnline: boolean
  isInitialized: boolean
  pendingOperations: number
  cachedItems: number
  storageUsed: number
  lastSync: Date | null
  syncInProgress: boolean
}

interface OfflineHookOptions {
  enableBackgroundSync?: boolean
  syncInterval?: number
  maxRetries?: number
}

export function useOffline(options: OfflineHookOptions = {}) {
  const {
    enableBackgroundSync = true,
    syncInterval = 30000, // 30 seconds
    maxRetries = 3
  } = options

  const [state, setState] = useState<OfflineState>({
    isOnline: typeof window !== 'undefined' ? navigator.onLine : true,
    isInitialized: false,
    pendingOperations: 0,
    cachedItems: 0,
    storageUsed: 0,
    lastSync: null,
    syncInProgress: false
  })

  // Initialize offline storage
  const initialize = useCallback(async () => {
    try {
      await offlineStorage.initialize()
      const stats = await offlineStorage.getStorageStats()
      
      setState(prev => ({
        ...prev,
        isInitialized: true,
        pendingOperations: stats.pendingOperations,
        cachedItems: stats.cachedItems,
        storageUsed: stats.storageUsed
      }))

      logger.info('Offline functionality initialized')
    } catch (error) {
      logger.error('Failed to initialize offline functionality:', error)
    }
  }, [])

  // Update storage stats
  const updateStats = useCallback(async () => {
    try {
      const stats = await offlineStorage.getStorageStats()
      setState(prev => ({
        ...prev,
        pendingOperations: stats.pendingOperations,
        cachedItems: stats.cachedItems,
        storageUsed: stats.storageUsed
      }))
    } catch (error) {
      logger.error('Failed to update storage stats:', error)
    }
  }, [])

  // Queue operation for offline sync
  const queueOperation = useCallback(async (
    type: 'create' | 'update' | 'delete',
    entity: string,
    entityId: string,
    data: any,
    userId: string
  ) => {
    try {
      await offlineStorage.addOperation({
        type,
        entity,
        entityId,
        data,
        userId
      })
      
      await updateStats()
      
      // Try to sync immediately if online
      if (state.isOnline) {
        syncPendingOperations()
      }
      
      return true
    } catch (error) {
      logger.error('Failed to queue operation:', error)
      return false
    }
  }, [state.isOnline, updateStats])

  // Cache data for offline access
  const cacheData = useCallback(async (
    entity: string,
    entityId: string,
    data: any,
    expiresIn?: number
  ) => {
    try {
      await offlineStorage.cacheData(entity, entityId, data, expiresIn)
      await updateStats()
      return true
    } catch (error) {
      logger.error('Failed to cache data:', error)
      return false
    }
  }, [updateStats])

  // Get cached data
  const getCachedData = useCallback(async (entity: string, entityId?: string) => {
    try {
      if (entityId) {
        return await offlineStorage.getCachedData(entity, entityId)
      } else {
        return await offlineStorage.getCachedDataByEntity(entity)
      }
    } catch (error) {
      logger.error('Failed to get cached data:', error)
      return null
    }
  }, [])

  // Sync pending operations
  const syncPendingOperations = useCallback(async () => {
    if (!state.isOnline || state.syncInProgress) return

    setState(prev => ({ ...prev, syncInProgress: true }))

    try {
      const pendingOps = await offlineStorage.getPendingOperations()
      
      for (const operation of pendingOps) {
        try {
          // Attempt to sync operation
          const response = await fetch('/api/sync/operations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(operation)
          })

          if (response.ok) {
            await offlineStorage.markOperationSynced(operation.id)
            logger.info('Operation synced successfully:', operation.id)
          } else {
            throw new Error(`Sync failed: ${response.statusText}`)
          }
        } catch (error) {
          logger.error('Failed to sync operation:', error, { operationId: operation.id })
          
          // Increment retry count
          await offlineStorage.incrementRetryCount(operation.id)
          
          // Remove operation if max retries reached
          if (operation.retryCount >= maxRetries) {
            await offlineStorage.removeOperation(operation.id)
            logger.warn('Operation removed after max retries:', operation.id)
          }
        }
      }

      setState(prev => ({ ...prev, lastSync: new Date() }))
      await updateStats()
    } catch (error) {
      logger.error('Sync process failed:', error)
    } finally {
      setState(prev => ({ ...prev, syncInProgress: false }))
    }
  }, [state.isOnline, state.syncInProgress, maxRetries, updateStats])

  // Force sync
  const forceSync = useCallback(async () => {
    if (state.isOnline) {
      await syncPendingOperations()
    }
  }, [state.isOnline, syncPendingOperations])

  // Clear all offline data
  const clearOfflineData = useCallback(async () => {
    try {
      await offlineStorage.clearAllData()
      await updateStats()
      logger.info('All offline data cleared')
      return true
    } catch (error) {
      logger.error('Failed to clear offline data:', error)
      return false
    }
  }, [updateStats])

  // Cleanup expired data
  const cleanupExpiredData = useCallback(async () => {
    try {
      await offlineStorage.cleanupExpiredData()
      await offlineStorage.cleanupSyncedOperations()
      await updateStats()
      logger.info('Expired data cleaned up')
    } catch (error) {
      logger.error('Failed to cleanup expired data:', error)
    }
  }, [updateStats])

  // Handle online/offline events
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = () => {
      setState(prev => ({ ...prev, isOnline: true }))
      logger.info('Connection restored')
      
      // Sync pending operations when back online
      if (enableBackgroundSync) {
        setTimeout(syncPendingOperations, 1000)
      }
    }

    const handleOffline = () => {
      setState(prev => ({ ...prev, isOnline: false }))
      logger.info('Connection lost - working offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [enableBackgroundSync, syncPendingOperations])

  // Background sync interval
  useEffect(() => {
    if (!enableBackgroundSync || !state.isOnline) return

    const interval = setInterval(() => {
      if (state.pendingOperations > 0) {
        syncPendingOperations()
      }
    }, syncInterval)

    return () => clearInterval(interval)
  }, [enableBackgroundSync, state.isOnline, state.pendingOperations, syncInterval, syncPendingOperations])

  // Periodic cleanup
  useEffect(() => {
    const cleanup = setInterval(cleanupExpiredData, 60000 * 60) // Every hour
    return () => clearInterval(cleanup)
  }, [cleanupExpiredData])

  // Initialize on mount
  useEffect(() => {
    initialize()
  }, [initialize])

  // Register service worker - DISABLED to fix loading issues
  useEffect(() => {
    // Service worker registration disabled
    logger.info('Service Worker registration disabled')
  }, [])

  return {
    // State
    isOnline: state.isOnline,
    isInitialized: state.isInitialized,
    pendingOperations: state.pendingOperations,
    cachedItems: state.cachedItems,
    storageUsed: state.storageUsed,
    lastSync: state.lastSync,
    syncInProgress: state.syncInProgress,

    // Actions
    queueOperation,
    cacheData,
    getCachedData,
    syncPendingOperations,
    forceSync,
    clearOfflineData,
    cleanupExpiredData,

    // Utilities
    formatStorageSize: (bytes: number) => {
      const sizes = ['Bytes', 'KB', 'MB', 'GB']
      if (bytes === 0) return '0 Bytes'
      const i = Math.floor(Math.log(bytes) / Math.log(1024))
      return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
    }
  }
}

// Hook for checking if data should be served from cache
export function useOfflineFirst<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: {
    cacheTime?: number
    staleTime?: number
    enabled?: boolean
  } = {}
) {
  const { cacheTime = 60000 * 5, staleTime = 60000, enabled = true } = options
  const { isOnline, getCachedData, cacheData } = useOffline()
  
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!enabled) return

    setIsLoading(true)
    setError(null)

    try {
      // Try cache first if offline or not forcing refresh
      if (!forceRefresh && (!isOnline || staleTime > 0)) {
        const cached = await getCachedData('query', key)
        if (cached) {
          setData(cached)
          setIsLoading(false)
          
          // If online and data is stale, fetch in background
          if (isOnline && Date.now() - new Date(cached.timestamp).getTime() > staleTime) {
            // Background fetch
            fetchFn().then(freshData => {
              setData(freshData)
              cacheData('query', key, { data: freshData, timestamp: new Date() }, cacheTime)
            }).catch(() => {
              // Ignore background fetch errors
            })
          }
          
          return
        }
      }

      // Fetch fresh data
      if (isOnline) {
        const freshData = await fetchFn()
        setData(freshData)
        
        // Cache the fresh data
        await cacheData('query', key, { data: freshData, timestamp: new Date() }, cacheTime)
      } else {
        // Offline and no cache available
        throw new Error('No cached data available offline')
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setIsLoading(false)
    }
  }, [key, fetchFn, enabled, isOnline, getCachedData, cacheData, cacheTime, staleTime])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    data,
    isLoading,
    error,
    refetch: () => fetchData(true)
  }
}