// Offline-First Architecture with Sync Capabilities
// Handles offline data storage, conflict resolution, and synchronization

import { db } from '@/lib/db';

export interface OfflineChange {
  id: string;
  entityType: 'content' | 'task' | 'project' | 'event' | 'file';
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  data: any;
  userId: string;
  deviceId: string;
  timestamp: Date;
  synced: boolean;
  conflictResolved?: boolean;
}

export interface SyncConflict {
  id: string;
  entityType: string;
  entityId: string;
  localChange: OfflineChange;
  serverData: any;
  conflictType: 'modify_modify' | 'delete_modify' | 'modify_delete';
  resolved: boolean;
  resolution?: 'local' | 'server' | 'merge';
  resolvedAt?: Date;
}

export interface SyncResult {
  success: boolean;
  processed: number;
  conflicts: SyncConflict[];
  errors: string[];
}

function extractLocalChange(value: unknown): OfflineChange | null {
  if (value && typeof value === 'object' && 'id' in value && 'entityType' in value) {
    return value as OfflineChange;
  }
  return null;
}

export class OfflineSync {
  private static instance: OfflineSync;
  private isOnline: boolean = true;
  private syncInProgress: boolean = false;

  private constructor() {
    if (typeof window !== 'undefined') {
      this.isOnline = navigator.onLine;
      this.setupNetworkListeners();
    }
  }

  static getInstance(): OfflineSync {
    if (!OfflineSync.instance) {
      OfflineSync.instance = new OfflineSync();
    }
    return OfflineSync.instance;
  }

  private setupNetworkListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.triggerAutoSync();
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
      });
    }
  }

  // Queue offline changes
  async queueChange(change: Omit<OfflineChange, 'id' | 'timestamp' | 'synced'>): Promise<void> {
    const offlineChange: OfflineChange = {
      ...change,
      id: this.generateChangeId(),
      timestamp: new Date(),
      synced: false,
    };

    if (typeof window !== 'undefined' && 'indexedDB' in window) {
      // Store in IndexedDB for browser clients
      await this.storeInIndexedDB(offlineChange);
    } else {
      // Store in SQLite for Node.js/Electron clients
      await this.storeInDatabase(offlineChange);
    }

    // Try to sync immediately if online
    if (this.isOnline && !this.syncInProgress) {
      this.triggerAutoSync();
    }
  }

  // Store change in IndexedDB (for web/mobile clients)
  private async storeInIndexedDB(change: OfflineChange): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('VaultOfflineDB', 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as any).result;
        if (!db.objectStoreNames.contains('changes')) {
          db.createObjectStore('changes', { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        const db = (event.target as any).result;
        const transaction = db.transaction(['changes'], 'readwrite');
        const store = transaction.objectStore('changes');
        
        const addRequest = store.add(change);
        addRequest.onsuccess = () => resolve();
        addRequest.onerror = () => reject(addRequest.error);
      };

      request.onerror = () => reject(request.error);
    });
  }

  // Store change in SQLite database
  private async storeInDatabase(change: OfflineChange): Promise<void> {
    await db.offlineChange.create({
      data: change,
    });
  }

  // Get pending changes from IndexedDB
  private async getPendingChangesFromIndexedDB(userId: string): Promise<OfflineChange[]> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('VaultOfflineDB', 1);

      request.onsuccess = (event) => {
        const db = (event.target as any).result;
        const transaction = db.transaction(['changes'], 'readonly');
        const store = transaction.objectStore('changes');
        
        const getAllRequest = store.getAll();
        getAllRequest.onsuccess = () => {
          const changes = getAllRequest.result.filter(
            (change: OfflineChange) => change.userId === userId && !change.synced
          );
          resolve(changes);
        };
        getAllRequest.onerror = () => reject(getAllRequest.error);
      };

      request.onerror = () => reject(request.error);
    });
  }

  // Get pending changes from database
  private async getPendingChangesFromDatabase(userId: string): Promise<OfflineChange[]> {
    const changes = await db.offlineChange.findMany({
      where: {
        userId,
        synced: false,
      },
      orderBy: {
        timestamp: 'asc',
      },
    });

    return changes as OfflineChange[];
  }

  // Sync all pending changes
  async syncChanges(userId: string): Promise<SyncResult> {
    if (this.syncInProgress) {
      return {
        success: false,
        processed: 0,
        conflicts: [],
        errors: ['Sync already in progress'],
      };
    }

    this.syncInProgress = true;

    try {
      // Get pending changes
      const pendingChanges = typeof window !== 'undefined' && 'indexedDB' in window
        ? await this.getPendingChangesFromIndexedDB(userId)
        : await this.getPendingChangesFromDatabase(userId);

      const conflicts: SyncConflict[] = [];
      const errors: string[] = [];
      let processed = 0;

      // Process each change
      for (const change of pendingChanges) {
        try {
          const result = await this.processChange(change);
          
          if (result.conflict) {
            conflicts.push(result.conflict);
          } else if (result.success) {
            await this.markChangeSynced(change.id);
            processed++;
          } else {
            errors.push(result.error || 'Unknown error');
          }
        } catch (error) {
          errors.push(`Failed to process change ${change.id}: ${error}`);
        }
      }

      return {
        success: true,
        processed,
        conflicts,
        errors,
      };
    } catch (error) {
      return {
        success: false,
        processed: 0,
        conflicts: [],
        errors: [`Sync failed: ${error}`],
      };
    } finally {
      this.syncInProgress = false;
    }
  }

  // Process individual change
  private async processChange(change: OfflineChange): Promise<{
    success: boolean;
    conflict?: SyncConflict;
    error?: string;
  }> {
    try {
      // Check for conflicts
      const conflict = await this.checkForConflict(change);
      if (conflict) {
        return { success: false, conflict };
      }

      // Apply the change
      await this.applyChange(change);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  // Check for conflicts
  private async checkForConflict(change: OfflineChange): Promise<SyncConflict | null> {
    try {
      let serverData: any = null;

      // Get current server state
      switch (change.entityType) {
        case 'content':
          serverData = await db.contentItem.findUnique({
            where: { id: change.entityId },
          });
          break;
        case 'task':
          serverData = await db.task.findUnique({
            where: { id: change.entityId },
          });
          break;
        case 'project':
          serverData = await db.project.findUnique({
            where: { id: change.entityId },
          });
          break;
        case 'event':
          serverData = await db.calendarEvent.findUnique({
            where: { id: change.entityId },
          });
          break;
      }

      if (!serverData && change.operation !== 'create') {
        // Item was deleted on server
        return {
          id: this.generateConflictId(),
          entityType: change.entityType,
          entityId: change.entityId,
          localChange: change,
          serverData: null,
          conflictType: change.operation === 'delete' ? 'delete_modify' : 'modify_delete',
          resolved: false,
        };
      }

      if (serverData && change.operation === 'create') {
        // Item already exists on server
        return {
          id: this.generateConflictId(),
          entityType: change.entityType,
          entityId: change.entityId,
          localChange: change,
          serverData,
          conflictType: 'modify_modify',
          resolved: false,
        };
      }

      if (serverData && change.operation === 'update') {
        // Check if server version is newer
        const serverUpdatedAt = new Date(serverData.updatedAt);
        if (serverUpdatedAt > change.timestamp) {
          return {
            id: this.generateConflictId(),
            entityType: change.entityType,
            entityId: change.entityId,
            localChange: change,
            serverData,
            conflictType: 'modify_modify',
            resolved: false,
          };
        }
      }

      return null;
    } catch (error) {
      console.error('Conflict check error:', error);
      return null;
    }
  }

  // Apply change to server
  private async applyChange(change: OfflineChange): Promise<void> {
    switch (change.entityType) {
      case 'content':
        await this.applyContentChange(change);
        break;
      case 'task':
        await this.applyTaskChange(change);
        break;
      case 'project':
        await this.applyProjectChange(change);
        break;
      case 'event':
        await this.applyEventChange(change);
        break;
      default:
        throw new Error(`Unknown entity type: ${change.entityType}`);
    }
  }

  private async applyContentChange(change: OfflineChange): Promise<void> {
    switch (change.operation) {
      case 'create':
        await db.contentItem.create({ data: change.data });
        break;
      case 'update':
        await db.contentItem.update({
          where: { id: change.entityId },
          data: change.data,
        });
        break;
      case 'delete':
        await db.contentItem.delete({
          where: { id: change.entityId },
        });
        break;
    }
  }

  private async applyTaskChange(change: OfflineChange): Promise<void> {
    switch (change.operation) {
      case 'create':
        await db.task.create({ data: change.data });
        break;
      case 'update':
        await db.task.update({
          where: { id: change.entityId },
          data: change.data,
        });
        break;
      case 'delete':
        await db.task.delete({
          where: { id: change.entityId },
        });
        break;
    }
  }

  private async applyProjectChange(change: OfflineChange): Promise<void> {
    switch (change.operation) {
      case 'create':
        await db.project.create({ data: change.data });
        break;
      case 'update':
        await db.project.update({
          where: { id: change.entityId },
          data: change.data,
        });
        break;
      case 'delete':
        await db.project.delete({
          where: { id: change.entityId },
        });
        break;
    }
  }

  private async applyEventChange(change: OfflineChange): Promise<void> {
    switch (change.operation) {
      case 'create':
        await db.calendarEvent.create({ data: change.data });
        break;
      case 'update':
        await db.calendarEvent.update({
          where: { id: change.entityId },
          data: change.data,
        });
        break;
      case 'delete':
        await db.calendarEvent.delete({
          where: { id: change.entityId },
        });
        break;
    }
  }

  // Mark change as synced
  private async markChangeSynced(changeId: string): Promise<void> {
    if (typeof window !== 'undefined' && 'indexedDB' in window) {
      await this.markSyncedInIndexedDB(changeId);
    } else {
      await db.offlineChange.update({
        where: { id: changeId },
        data: { synced: true },
      });
    }
  }

  private async markSyncedInIndexedDB(changeId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('VaultOfflineDB', 1);

      request.onsuccess = (event) => {
        const db = (event.target as any).result;
        const transaction = db.transaction(['changes'], 'readwrite');
        const store = transaction.objectStore('changes');
        
        const getRequest = store.get(changeId);
        getRequest.onsuccess = () => {
          const change = getRequest.result;
          if (change) {
            change.synced = true;
            store.put(change);
          }
          resolve();
        };
        getRequest.onerror = () => reject(getRequest.error);
      };

      request.onerror = () => reject(request.error);
    });
  }

  // Resolve conflict
  async resolveConflict(
    conflictId: string,
    resolution: 'local' | 'server' | 'merge',
    mergedData?: any
  ): Promise<boolean> {
    try {
      const conflict = await db.syncConflict.findUnique({
        where: { id: conflictId },
      });

      if (!conflict) {
        return false;
      }

      // The persisted `localChange` column is JSON; narrow it back to the
      // shape written by `checkForConflict` before using it.
      const localChange = extractLocalChange(conflict.localChange);
      if (!localChange) {
        return false;
      }

      let finalData: any;
      
      switch (resolution) {
        case 'local':
          finalData = localChange.data;
          break;
        case 'server':
          finalData = conflict.serverData;
          break;
        case 'merge':
          finalData = mergedData || conflict.serverData;
          break;
      }

      // Apply the resolved data
      await this.applyChange({
        ...localChange,
        data: finalData,
      });

      // Mark conflict as resolved
      await db.syncConflict.update({
        where: { id: conflictId },
        data: {
          resolved: true,
          resolution,
          resolvedAt: new Date(),
        },
      });

      // Mark original change as synced
      await this.markChangeSynced(localChange.id);

      return true;
    } catch (error) {
      console.error('Conflict resolution error:', error);
      return false;
    }
  }

  // Auto-sync trigger
  private async triggerAutoSync(): Promise<void> {
    // Implement auto-sync logic with debouncing
    setTimeout(async () => {
      if (this.isOnline && !this.syncInProgress) {
        // Get current user ID (this would come from auth context)
        const userId = 'current-user-id'; // Replace with actual user ID
        await this.syncChanges(userId);
      }
    }, 1000);
  }

  // Get sync status
  async getSyncStatus(userId: string): Promise<{
    isOnline: boolean;
    lastSync: Date | null;
    pendingChanges: number;
    syncInProgress: boolean;
  }> {
    const pendingChanges = typeof window !== 'undefined' && 'indexedDB' in window
      ? await this.getPendingChangesFromIndexedDB(userId)
      : await this.getPendingChangesFromDatabase(userId);

    const lastSync = await db.syncLog.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    return {
      isOnline: this.isOnline,
      lastSync: lastSync?.createdAt || null,
      pendingChanges: pendingChanges.length,
      syncInProgress: this.syncInProgress,
    };
  }

  // Utility methods
  private generateChangeId(): string {
    return `change_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  private generateConflictId(): string {
    return `conflict_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }
}

// Export singleton instance
export const offlineSync = OfflineSync.getInstance();