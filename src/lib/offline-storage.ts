'use client'

import { logger } from '@/lib/logger'

interface OfflineOperation {
  id: string
  type: 'create' | 'update' | 'delete'
  entity: string
  entityId: string
  data: any
  timestamp: Date
  userId: string
  synced: boolean
  retryCount: number
}

interface CachedData {
  id: string
  entity: string
  data: any
  timestamp: Date
  expiresAt?: Date
}

class OfflineStorageManager {
  private dbName = 'VaultOfflineDB'
  private dbVersion = 1
  private db: IDBDatabase | null = null

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') {
        resolve()
        return
      }

      const request = indexedDB.open(this.dbName, this.dbVersion)

      request.onerror = () => {
        logger.error('Failed to open IndexedDB:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        logger.info('IndexedDB initialized successfully')
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Create object stores
        if (!db.objectStoreNames.contains('operations')) {
          const operationsStore = db.createObjectStore('operations', { keyPath: 'id' })
          operationsStore.createIndex('entity', 'entity', { unique: false })
          operationsStore.createIndex('synced', 'synced', { unique: false })
          operationsStore.createIndex('timestamp', 'timestamp', { unique: false })
        }

        if (!db.objectStoreNames.contains('cache')) {
          const cacheStore = db.createObjectStore('cache', { keyPath: 'id' })
          cacheStore.createIndex('entity', 'entity', { unique: false })
          cacheStore.createIndex('timestamp', 'timestamp', { unique: false })
          cacheStore.createIndex('expiresAt', 'expiresAt', { unique: false })
        }

        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' })
        }

        logger.info('IndexedDB schema upgraded')
      }
    })
  }

  // Operations management
  async addOperation(operation: Omit<OfflineOperation, 'id' | 'timestamp' | 'synced' | 'retryCount'>): Promise<string> {
    if (!this.db) throw new Error('Database not initialized')

    const fullOperation: OfflineOperation = {
      ...operation,
      id: this.generateId(),
      timestamp: new Date(),
      synced: false,
      retryCount: 0
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['operations'], 'readwrite')
      const store = transaction.objectStore('operations')
      const request = store.add(fullOperation)

      request.onsuccess = () => {
        logger.info('Operation added to offline queue:', fullOperation.id)
        resolve(fullOperation.id)
      }

      request.onerror = () => {
        logger.error('Failed to add operation:', request.error)
        reject(request.error)
      }
    })
  }

  async getPendingOperations(): Promise<OfflineOperation[]> {
    if (!this.db) return []

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['operations'], 'readonly')
      const store = transaction.objectStore('operations')
      // IndexedDB cannot index boolean keys, so read all and filter in JS.
      const request = store.getAll()

      request.onsuccess = () => {
        const operations = (request.result as OfflineOperation[])
          .filter(op => !op.synced)
          .sort((a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          )
        resolve(operations)
      }

      request.onerror = () => {
        logger.error('Failed to get pending operations:', request.error)
        reject(request.error)
      }
    })
  }

  async markOperationSynced(operationId: string): Promise<void> {
    if (!this.db) return

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['operations'], 'readwrite')
      const store = transaction.objectStore('operations')
      const request = store.get(operationId)

      request.onsuccess = () => {
        const operation = request.result
        if (operation) {
          operation.synced = true
          const updateRequest = store.put(operation)
          
          updateRequest.onsuccess = () => {
            logger.info('Operation marked as synced:', operationId)
            resolve()
          }
          
          updateRequest.onerror = () => {
            logger.error('Failed to mark operation as synced:', updateRequest.error)
            reject(updateRequest.error)
          }
        } else {
          resolve() // Operation not found, consider it synced
        }
      }

      request.onerror = () => {
        logger.error('Failed to get operation for sync update:', request.error)
        reject(request.error)
      }
    })
  }

  async incrementRetryCount(operationId: string): Promise<void> {
    if (!this.db) return

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['operations'], 'readwrite')
      const store = transaction.objectStore('operations')
      const request = store.get(operationId)

      request.onsuccess = () => {
        const operation = request.result
        if (operation) {
          operation.retryCount = (operation.retryCount || 0) + 1
          const updateRequest = store.put(operation)
          
          updateRequest.onsuccess = () => resolve()
          updateRequest.onerror = () => reject(updateRequest.error)
        } else {
          resolve()
        }
      }

      request.onerror = () => reject(request.error)
    })
  }

  async removeOperation(operationId: string): Promise<void> {
    if (!this.db) return

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['operations'], 'readwrite')
      const store = transaction.objectStore('operations')
      const request = store.delete(operationId)

      request.onsuccess = () => {
        logger.info('Operation removed from queue:', operationId)
        resolve()
      }

      request.onerror = () => {
        logger.error('Failed to remove operation:', request.error)
        reject(request.error)
      }
    })
  }

  // Cache management
  async cacheData(entity: string, entityId: string, data: any, expiresIn?: number): Promise<void> {
    if (!this.db) return

    const cachedData: CachedData = {
      id: `${entity}:${entityId}`,
      entity,
      data,
      timestamp: new Date(),
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn) : undefined
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readwrite')
      const store = transaction.objectStore('cache')
      const request = store.put(cachedData)

      request.onsuccess = () => {
        logger.debug('Data cached:', cachedData.id)
        resolve()
      }

      request.onerror = () => {
        logger.error('Failed to cache data:', request.error)
        reject(request.error)
      }
    })
  }

  async getCachedData(entity: string, entityId: string): Promise<any | null> {
    if (!this.db) return null

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readonly')
      const store = transaction.objectStore('cache')
      const request = store.get(`${entity}:${entityId}`)

      request.onsuccess = () => {
        const cached = request.result
        if (!cached) {
          resolve(null)
          return
        }

        // Check if expired
        if (cached.expiresAt && new Date() > new Date(cached.expiresAt)) {
          // Remove expired data
          this.removeCachedData(entity, entityId)
          resolve(null)
          return
        }

        resolve(cached.data)
      }

      request.onerror = () => {
        logger.error('Failed to get cached data:', request.error)
        reject(request.error)
      }
    })
  }

  async getCachedDataByEntity(entity: string): Promise<any[]> {
    if (!this.db) return []

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readonly')
      const store = transaction.objectStore('cache')
      const index = store.index('entity')
      const request = index.getAll(entity)

      request.onsuccess = () => {
        const results = request.result
          .filter(cached => {
            // Filter out expired data
            if (cached.expiresAt && new Date() > new Date(cached.expiresAt)) {
              this.removeCachedData(cached.entity, cached.id.split(':')[1])
              return false
            }
            return true
          })
          .map(cached => cached.data)

        resolve(results)
      }

      request.onerror = () => {
        logger.error('Failed to get cached data by entity:', request.error)
        reject(request.error)
      }
    })
  }

  async removeCachedData(entity: string, entityId: string): Promise<void> {
    if (!this.db) return

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readwrite')
      const store = transaction.objectStore('cache')
      const request = store.delete(`${entity}:${entityId}`)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // Metadata management
  async setMetadata(key: string, value: any): Promise<void> {
    if (!this.db) return

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['metadata'], 'readwrite')
      const store = transaction.objectStore('metadata')
      const request = store.put({ key, value, timestamp: new Date() })

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getMetadata(key: string): Promise<any | null> {
    if (!this.db) return null

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['metadata'], 'readonly')
      const store = transaction.objectStore('metadata')
      const request = store.get(key)

      request.onsuccess = () => {
        const result = request.result
        resolve(result ? result.value : null)
      }

      request.onerror = () => reject(request.error)
    })
  }

  // Cleanup operations
  async cleanupExpiredData(): Promise<void> {
    if (!this.db) return

    const now = new Date()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readwrite')
      const store = transaction.objectStore('cache')
      const index = store.index('expiresAt')
      const request = index.openCursor(IDBKeyRange.upperBound(now))

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        } else {
          logger.info('Expired cache data cleaned up')
          resolve()
        }
      }

      request.onerror = () => {
        logger.error('Failed to cleanup expired data:', request.error)
        reject(request.error)
      }
    })
  }

  async cleanupSyncedOperations(): Promise<void> {
    if (!this.db) return

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['operations'], 'readwrite')
      const store = transaction.objectStore('operations')
      // IndexedDB cannot index boolean keys; scan and delete only synced rows.
      const request = store.openCursor()

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result
        if (cursor) {
          const operation = cursor.value as OfflineOperation
          if (operation.synced) {
            // Keep operations for 24 hours after sync for debugging
            const keepUntil = new Date(operation.timestamp)
            keepUntil.setHours(keepUntil.getHours() + 24)

            if (new Date() > keepUntil) {
              cursor.delete()
            }
          }
          cursor.continue()
        } else {
          logger.info('Old synced operations cleaned up')
          resolve()
        }
      }

      request.onerror = () => {
        logger.error('Failed to cleanup synced operations:', request.error)
        reject(request.error)
      }
    })
  }

  // Utility methods
  private generateId(): string {
    return `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  async getStorageStats(): Promise<{
    pendingOperations: number
    cachedItems: number
    storageUsed: number
  }> {
    if (!this.db) return { pendingOperations: 0, cachedItems: 0, storageUsed: 0 }

    const [pendingOps, cachedItems] = await Promise.all([
      this.getPendingOperations(),
      this.getCachedDataByEntity('*') // Get all cached data
    ])

    // Estimate storage usage (rough calculation)
    const storageUsed = await this.estimateStorageUsage()

    return {
      pendingOperations: pendingOps.length,
      cachedItems: cachedItems.length,
      storageUsed
    }
  }

  private async estimateStorageUsage(): Promise<number> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate()
        return estimate.usage || 0
      } catch (error) {
        logger.error('Failed to estimate storage usage:', error)
      }
    }
    return 0
  }

  async clearAllData(): Promise<void> {
    if (!this.db) return

    const storeNames = ['operations', 'cache', 'metadata']
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeNames, 'readwrite')
      
      let completed = 0
      const total = storeNames.length

      storeNames.forEach(storeName => {
        const store = transaction.objectStore(storeName)
        const request = store.clear()
        
        request.onsuccess = () => {
          completed++
          if (completed === total) {
            logger.info('All offline data cleared')
            resolve()
          }
        }
        
        request.onerror = () => {
          logger.error(`Failed to clear ${storeName}:`, request.error)
          reject(request.error)
        }
      })
    })
  }
}

export const offlineStorage = new OfflineStorageManager()
export default offlineStorage