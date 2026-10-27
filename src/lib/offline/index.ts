// Offline data management utilities
export interface OfflineAction {
  id?: number;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  data: any;
  timestamp: number;
  token?: string;
}

class OfflineManager {
  private dbName = 'OrgAppOfflineDB';
  private version = 1;

  async initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object store for offline actions
        if (!db.objectStoreNames.contains('offlineActions')) {
          const store = db.createObjectStore('offlineActions', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        // Create object store for cached data
        if (!db.objectStoreNames.contains('cachedData')) {
          const store = db.createObjectStore('cachedData', { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  async saveOfflineAction(action: Omit<OfflineAction, 'id' | 'timestamp'>): Promise<number> {
    const db = await this.initDB();
    const transaction = db.transaction(['offlineActions'], 'readwrite');
    const store = transaction.objectStore('offlineActions');
    
    const offlineAction: OfflineAction = {
      ...action,
      timestamp: Date.now()
    };
    
    return new Promise((resolve, reject) => {
      const request = store.add(offlineAction);
      request.onsuccess = () => resolve(request.result as number);
      request.onerror = () => reject(request.error);
    });
  }

  async getOfflineActions(): Promise<OfflineAction[]> {
    const db = await this.initDB();
    const transaction = db.transaction(['offlineActions'], 'readonly');
    const store = transaction.objectStore('offlineActions');
    const index = store.index('timestamp');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async removeOfflineAction(id: number): Promise<void> {
    const db = await this.initDB();
    const transaction = db.transaction(['offlineActions'], 'readwrite');
    const store = transaction.objectStore('offlineActions');
    
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async cacheData(key: string, data: any, ttl: number = 3600000): Promise<void> {
    const db = await this.initDB();
    const transaction = db.transaction(['cachedData'], 'readwrite');
    const store = transaction.objectStore('cachedData');
    
    const cacheEntry = {
      key,
      data,
      timestamp: Date.now(),
      ttl
    };
    
    return new Promise((resolve, reject) => {
      const request = store.put(cacheEntry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getCachedData(key: string): Promise<any | null> {
    const db = await this.initDB();
    const transaction = db.transaction(['cachedData'], 'readonly');
    const store = transaction.objectStore('cachedData');
    
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }
        
        // Check if cache is expired
        const now = Date.now();
        if (now - result.timestamp > result.ttl) {
          // Remove expired cache entry
          store.delete(key);
          resolve(null);
          return;
        }
        
        resolve(result.data);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clearExpiredCache(): Promise<void> {
    const db = await this.initDB();
    const transaction = db.transaction(['cachedData'], 'readwrite');
    const store = transaction.objectStore('cachedData');
    const index = store.index('timestamp');
    
    return new Promise((resolve, reject) => {
      const now = Date.now();
      const request = index.openCursor();
      
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        
        const value = cursor.value;
        if (now - value.timestamp > value.ttl) {
          cursor.delete();
        }
        cursor.continue();
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  async clearAllData(): Promise<void> {
    const db = await this.initDB();
    const transaction1 = db.transaction(['offlineActions'], 'readwrite');
    const transaction2 = db.transaction(['cachedData'], 'readwrite');
    
    const store1 = transaction1.objectStore('offlineActions');
    const store2 = transaction2.objectStore('cachedData');
    
    return new Promise((resolve, reject) => {
      const request1 = store1.clear();
      const request2 = store2.clear();
      
      let completed = 0;
      const onComplete = () => {
        completed++;
        if (completed === 2) resolve();
      };
      
      request1.onsuccess = onComplete;
      request1.onerror = () => reject(request1.error);
      
      request2.onsuccess = onComplete;
      request2.onerror = () => reject(request2.error);
    });
  }

  // Check if online
  isOnline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine;
  }

  // Register online/offline event listeners
  registerConnectivityListeners(): void {
    if (typeof window === 'undefined') return;
    
    window.addEventListener('online', () => {
      console.log('App is online');
      this.syncOfflineData();
    });
    
    window.addEventListener('offline', () => {
      console.log('App is offline');
    });
  }

  // Sync offline data when coming back online
  async syncOfflineData(): Promise<void> {
    if (!this.isOnline()) return;
    
    try {
      const actions = await this.getOfflineActions();
      
      for (const action of actions) {
        try {
          const options: RequestInit = {
            method: action.method,
            headers: {
              'Content-Type': 'application/json'
            }
          };
          
          if (action.token) {
            options.headers = {
              ...options.headers,
              'Authorization': `Bearer ${action.token}`
            };
          }
          
          if (action.method !== 'GET' && action.data) {
            options.body = JSON.stringify(action.data);
          }
          
          const response = await fetch(action.url, options);
          
          if (response.ok) {
            await this.removeOfflineAction(action.id!);
          }
        } catch (error) {
          console.error('Failed to sync offline action:', error);
        }
      }
    } catch (error) {
      console.error('Error syncing offline data:', error);
    }
  }
}

// Export singleton instance
export const offlineManager = new OfflineManager();

// Hook for offline functionality
export function useOffline() {
  const [isOnline, setIsOnline] = useState(false);
  const [pendingActions, setPendingActions] = useState(0);

  useEffect(() => {
    // Initialize online status
    setIsOnline(offlineManager.isOnline());
    
    // Register connectivity listeners
    offlineManager.registerConnectivityListeners();
    
    // Update online status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Update pending actions count
    const updatePendingActions = async () => {
      const actions = await offlineManager.getOfflineActions();
      setPendingActions(actions.length);
    };
    
    updatePendingActions();
    const interval = setInterval(updatePendingActions, 5000);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  return {
    isOnline,
    pendingActions,
    saveOfflineAction: offlineManager.saveOfflineAction.bind(offlineManager),
    getCachedData: offlineManager.getCachedData.bind(offlineManager),
    cacheData: offlineManager.cacheData.bind(offlineManager),
    syncOfflineData: offlineManager.syncOfflineData.bind(offlineManager)
  };
}

// Import useState from react
import { useState, useEffect } from 'react';