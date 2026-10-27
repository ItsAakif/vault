'use client'

import { logger } from '@/lib/logger'

export interface SyncOperation {
  id: string
  type: 'create' | 'update' | 'delete' | 'move'
  entity: string
  entityId: string
  field?: string
  data: any
  userId: string
  timestamp: Date
  version: number
  dependencies?: string[]
}

export interface ConflictResolution {
  operationId: string
  conflictType: 'concurrent_edit' | 'version_mismatch' | 'dependency_conflict'
  conflictingOperations: SyncOperation[]
  resolution?: 'accept_local' | 'accept_remote' | 'merge' | 'manual'
  mergedData?: any
  resolvedAt?: Date
}

export interface SyncState {
  isOnline: boolean
  isSyncing: boolean
  lastSync: Date | null
  pendingOperations: SyncOperation[]
  conflicts: ConflictResolution[]
  syncQueue: SyncOperation[]
  operationHistory: Map<string, SyncOperation[]>
}

class SyncManager {
  private state: SyncState = {
    isOnline: true,
    isSyncing: false,
    lastSync: null,
    pendingOperations: [],
    conflicts: [],
    syncQueue: [],
    operationHistory: new Map()
  }

  private listeners: Map<string, Function[]> = new Map()
  private retryAttempts = new Map<string, number>()
  private maxRetries = 3
  private retryDelay = 1000

  constructor() {
    this.setupNetworkListeners()
    this.startSyncLoop()
  }

  // Event system
  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(callback)
  }

  off(event: string, callback: Function) {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      const index = callbacks.indexOf(callback)
      if (index > -1) {
        callbacks.splice(index, 1)
      }
    }
  }

  private emit(event: string, data?: any) {
    const callbacks = this.listeners.get(event) || []
    callbacks.forEach(callback => {
      try {
        callback(data)
      } catch (error) {
        logger.error(`Error in sync event callback for ${event}:`, error)
      }
    })
  }

  // Network status management
  private setupNetworkListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.state.isOnline = true
        this.emit('network:online')
        this.processSyncQueue()
      })

      window.addEventListener('offline', () => {
        this.state.isOnline = false
        this.emit('network:offline')
      })

      this.state.isOnline = navigator.onLine
    }
  }

  // Main sync operations
  async queueOperation(operation: Omit<SyncOperation, 'id' | 'timestamp' | 'version'>): Promise<string> {
    const syncOp: SyncOperation = {
      ...operation,
      id: this.generateOperationId(),
      timestamp: new Date(),
      version: this.getNextVersion(operation.entityId)
    }

    // Add to pending operations
    this.state.pendingOperations.push(syncOp)
    this.state.syncQueue.push(syncOp)

    // Add to operation history
    this.addToOperationHistory(syncOp)

    this.emit('operation:queued', syncOp)

    // Try to sync immediately if online
    if (this.state.isOnline) {
      this.processSyncQueue()
    }

    return syncOp.id
  }

  async applyRemoteOperation(operation: SyncOperation): Promise<void> {
    try {
      // Check for conflicts
      const conflict = this.detectConflict(operation)
      if (conflict) {
        this.handleConflict(conflict)
        return
      }

      // Apply operation locally
      await this.applyOperationLocally(operation)

      // Add to operation history
      this.addToOperationHistory(operation)

      this.emit('operation:applied', operation)
    } catch (error) {
      logger.error('Failed to apply remote operation:', error)
      this.emit('operation:failed', { operation, error })
    }
  }

  // Operational Transformation
  private transformOperation(localOp: SyncOperation, remoteOp: SyncOperation): SyncOperation | null {
    // Basic operational transformation logic
    if (localOp.entityId !== remoteOp.entityId) {
      return localOp // No transformation needed for different entities
    }

    if (localOp.type === 'update' && remoteOp.type === 'update') {
      return this.transformConcurrentUpdates(localOp, remoteOp)
    }

    if (localOp.type === 'delete' && remoteOp.type === 'update') {
      // Delete wins over update
      return null
    }

    if (localOp.type === 'update' && remoteOp.type === 'delete') {
      // Delete wins over update
      return null
    }

    return localOp
  }

  private transformConcurrentUpdates(localOp: SyncOperation, remoteOp: SyncOperation): SyncOperation {
    // Handle concurrent updates to the same entity
    if (localOp.field && remoteOp.field && localOp.field !== remoteOp.field) {
      // Different fields, no conflict
      return localOp
    }

    // Same field updated concurrently - need conflict resolution
    const conflict: ConflictResolution = {
      operationId: localOp.id,
      conflictType: 'concurrent_edit',
      conflictingOperations: [localOp, remoteOp]
    }

    this.state.conflicts.push(conflict)
    this.emit('conflict:detected', conflict)

    // Return transformed operation or null if needs manual resolution
    return this.autoResolveConflict(conflict) || localOp
  }

  // Conflict detection and resolution
  private detectConflict(remoteOp: SyncOperation): ConflictResolution | null {
    // Check for version conflicts
    const localHistory = this.state.operationHistory.get(remoteOp.entityId) || []
    const lastLocalOp = localHistory[localHistory.length - 1]

    if (lastLocalOp && lastLocalOp.version >= remoteOp.version) {
      return {
        operationId: remoteOp.id,
        conflictType: 'version_mismatch',
        conflictingOperations: [lastLocalOp, remoteOp]
      }
    }

    // Check for concurrent edits
    const concurrentOps = this.state.pendingOperations.filter(op => 
      op.entityId === remoteOp.entityId && 
      op.field === remoteOp.field &&
      Math.abs(op.timestamp.getTime() - remoteOp.timestamp.getTime()) < 5000 // 5 second window
    )

    if (concurrentOps.length > 0) {
      return {
        operationId: remoteOp.id,
        conflictType: 'concurrent_edit',
        conflictingOperations: [concurrentOps[0], remoteOp]
      }
    }

    return null
  }

  private handleConflict(conflict: ConflictResolution) {
    this.state.conflicts.push(conflict)
    this.emit('conflict:detected', conflict)

    // Try auto-resolution first
    const resolved = this.autoResolveConflict(conflict)
    if (resolved) {
      this.resolveConflict(conflict.operationId, 'merge', resolved.data)
    }
  }

  private autoResolveConflict(conflict: ConflictResolution): SyncOperation | null {
    const [localOp, remoteOp] = conflict.conflictingOperations

    switch (conflict.conflictType) {
      case 'concurrent_edit':
        return this.mergeOperations(localOp, remoteOp)
      
      case 'version_mismatch':
        // Use timestamp to determine winner
        return localOp.timestamp > remoteOp.timestamp ? localOp : remoteOp
      
      default:
        return null
    }
  }

  private mergeOperations(localOp: SyncOperation, remoteOp: SyncOperation): SyncOperation | null {
    // Simple merge strategy - combine data objects
    if (typeof localOp.data === 'object' && typeof remoteOp.data === 'object') {
      const mergedData = { ...remoteOp.data, ...localOp.data }
      
      return {
        ...localOp,
        data: mergedData,
        version: Math.max(localOp.version, remoteOp.version) + 1
      }
    }

    // For non-object data, prefer local changes
    return localOp
  }

  async resolveConflict(operationId: string, resolution: ConflictResolution['resolution'], mergedData?: any) {
    const conflictIndex = this.state.conflicts.findIndex(c => c.operationId === operationId)
    if (conflictIndex === -1) return

    const conflict = this.state.conflicts[conflictIndex]
    conflict.resolution = resolution
    conflict.resolvedAt = new Date()

    switch (resolution) {
      case 'accept_local':
        await this.applyOperationLocally(conflict.conflictingOperations[0])
        break
      
      case 'accept_remote':
        await this.applyOperationLocally(conflict.conflictingOperations[1])
        break
      
      case 'merge':
        if (mergedData) {
          const mergedOp: SyncOperation = {
            ...conflict.conflictingOperations[0],
            data: mergedData,
            version: Math.max(...conflict.conflictingOperations.map(op => op.version)) + 1
          }
          await this.applyOperationLocally(mergedOp)
        }
        break
    }

    // Remove resolved conflict
    this.state.conflicts.splice(conflictIndex, 1)
    this.emit('conflict:resolved', { operationId, resolution })
  }

  // Sync queue processing
  private async processSyncQueue() {
    if (!this.state.isOnline || this.state.isSyncing || this.state.syncQueue.length === 0) {
      return
    }

    this.state.isSyncing = true
    this.emit('sync:started')

    try {
      const operations = [...this.state.syncQueue]
      this.state.syncQueue = []

      for (const operation of operations) {
        await this.syncOperation(operation)
      }

      this.state.lastSync = new Date()
      this.emit('sync:completed')
    } catch (error) {
      logger.error('Sync queue processing failed:', error)
      this.emit('sync:failed', error)
    } finally {
      this.state.isSyncing = false
    }
  }

  private async syncOperation(operation: SyncOperation): Promise<void> {
    const retryCount = this.retryAttempts.get(operation.id) || 0

    try {
      // Send operation to server
      await this.sendOperationToServer(operation)

      // Remove from pending operations
      this.state.pendingOperations = this.state.pendingOperations.filter(op => op.id !== operation.id)
      
      // Clear retry count
      this.retryAttempts.delete(operation.id)

      this.emit('operation:synced', operation)
    } catch (error) {
      logger.error(`Failed to sync operation ${operation.id}:`, error)

      if (retryCount < this.maxRetries) {
        // Retry with exponential backoff
        this.retryAttempts.set(operation.id, retryCount + 1)
        setTimeout(() => {
          this.state.syncQueue.unshift(operation)
          this.processSyncQueue()
        }, this.retryDelay * Math.pow(2, retryCount))
      } else {
        // Max retries reached, mark as failed
        this.emit('operation:failed', { operation, error })
        this.retryAttempts.delete(operation.id)
      }
    }
  }

  private async sendOperationToServer(operation: SyncOperation): Promise<void> {
    // This would typically send the operation via WebSocket or HTTP
    // For now, we'll simulate the API call
    const response = await fetch('/api/sync/operations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(operation)
    })

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.statusText}`)
    }
  }

  private async applyOperationLocally(operation: SyncOperation): Promise<void> {
    // Apply the operation to local state/storage
    // This would typically update the local database or state management
    this.emit('operation:local-apply', operation)
  }

  // Utility methods
  private addToOperationHistory(operation: SyncOperation) {
    const entityHistory = this.state.operationHistory.get(operation.entityId) || []
    entityHistory.push(operation)
    
    // Keep only last 50 operations per entity
    if (entityHistory.length > 50) {
      entityHistory.shift()
    }
    
    this.state.operationHistory.set(operation.entityId, entityHistory)
  }

  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private getNextVersion(entityId: string): number {
    const history = this.state.operationHistory.get(entityId) || []
    return history.length + 1
  }

  private startSyncLoop() {
    // Process sync queue every 5 seconds
    setInterval(() => {
      if (this.state.isOnline && this.state.syncQueue.length > 0) {
        this.processSyncQueue()
      }
    }, 5000)
  }

  // Public API
  getState(): SyncState {
    return { ...this.state }
  }

  getPendingOperations(): SyncOperation[] {
    return [...this.state.pendingOperations]
  }

  getConflicts(): ConflictResolution[] {
    return [...this.state.conflicts]
  }

  isOnline(): boolean {
    return this.state.isOnline
  }

  isSyncing(): boolean {
    return this.state.isSyncing
  }

  getLastSync(): Date | null {
    return this.state.lastSync
  }

  // Force sync
  async forcSync(): Promise<void> {
    if (this.state.isOnline) {
      await this.processSyncQueue()
    }
  }

  // Clear all pending operations (use with caution)
  clearPendingOperations(): void {
    this.state.pendingOperations = []
    this.state.syncQueue = []
    this.emit('operations:cleared')
  }
}

export const syncManager = new SyncManager()
export default syncManager