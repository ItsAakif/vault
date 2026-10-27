// Vault PWA Service Worker
const CACHE_NAME = 'vault-v1'
const STATIC_CACHE_NAME = 'vault-static-v1'
const DYNAMIC_CACHE_NAME = 'vault-dynamic-v1'
const API_CACHE_NAME = 'vault-api-v1'

// Files to cache immediately
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/offline.html',
  // Add other static assets as needed
]

// API endpoints to cache
const API_ENDPOINTS = [
  '/api/projects',
  '/api/tasks',
  '/api/content',
  '/api/calendar',
  '/api/user/preferences'
]

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...')
  
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        console.log('Service Worker: Caching static assets')
        return cache.addAll(STATIC_ASSETS)
      }),
      // Skip waiting to activate immediately
      self.skipWaiting()
    ])
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...')
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE_NAME && 
                cacheName !== DYNAMIC_CACHE_NAME && 
                cacheName !== API_CACHE_NAME) {
              console.log('Service Worker: Deleting old cache:', cacheName)
              return caches.delete(cacheName)
            }
          })
        )
      }),
      // Take control of all clients
      self.clients.claim()
    ])
  )
})

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests and chrome-extension requests
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return
  }

  // Handle different types of requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request))
  } else if (isStaticAsset(url.pathname)) {
    event.respondWith(handleStaticAsset(request))
  } else {
    event.respondWith(handlePageRequest(request))
  }
})

// Handle API requests with network-first strategy
async function handleApiRequest(request) {
  const url = new URL(request.url)
  
  try {
    // Try network first
    const networkResponse = await fetch(request)
    
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE_NAME)
      cache.put(request, networkResponse.clone())
    }
    
    return networkResponse
  } catch (error) {
    console.log('Service Worker: Network failed, trying cache for:', url.pathname)
    
    // Fall back to cache
    const cachedResponse = await caches.match(request)
    if (cachedResponse) {
      // Add offline indicator header
      const response = cachedResponse.clone()
      response.headers.set('X-Served-By', 'sw-cache')
      return response
    }
    
    // Return offline response for specific endpoints
    return createOfflineResponse(url.pathname)
  }
}

// Handle static assets with cache-first strategy
async function handleStaticAsset(request) {
  const cachedResponse = await caches.match(request)
  
  if (cachedResponse) {
    return cachedResponse
  }
  
  try {
    const networkResponse = await fetch(request)
    
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE_NAME)
      cache.put(request, networkResponse.clone())
    }
    
    return networkResponse
  } catch (error) {
    console.log('Service Worker: Failed to fetch static asset:', request.url)
    throw error
  }
}

// Handle page requests with network-first, cache fallback
async function handlePageRequest(request) {
  try {
    const networkResponse = await fetch(request)
    
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME)
      cache.put(request, networkResponse.clone())
    }
    
    return networkResponse
  } catch (error) {
    console.log('Service Worker: Network failed for page:', request.url)
    
    // Try cache first
    const cachedResponse = await caches.match(request)
    if (cachedResponse) {
      return cachedResponse
    }
    
    // Fall back to offline page
    const offlinePage = await caches.match('/offline.html')
    return offlinePage || new Response('Offline', { status: 503 })
  }
}

// Check if URL is a static asset
function isStaticAsset(pathname) {
  return pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)
}

// Create offline responses for API endpoints
function createOfflineResponse(pathname) {
  const offlineData = {
    error: 'Offline',
    message: 'This request is not available offline',
    offline: true,
    timestamp: new Date().toISOString()
  }

  // Provide meaningful offline responses for specific endpoints
  if (pathname.includes('/projects')) {
    return new Response(JSON.stringify({
      ...offlineData,
      data: [],
      message: 'Projects will be available when you\'re back online'
    }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'X-Served-By': 'sw-offline'
      }
    })
  }

  if (pathname.includes('/tasks')) {
    return new Response(JSON.stringify({
      ...offlineData,
      data: [],
      message: 'Tasks will be available when you\'re back online'
    }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'X-Served-By': 'sw-offline'
      }
    })
  }

  return new Response(JSON.stringify(offlineData), {
    status: 503,
    headers: {
      'Content-Type': 'application/json',
      'X-Served-By': 'sw-offline'
    }
  })
}

// Background sync for offline operations
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync triggered:', event.tag)
  
  if (event.tag === 'sync-offline-operations') {
    event.waitUntil(syncOfflineOperations())
  }
})

// Sync offline operations when back online
async function syncOfflineOperations() {
  try {
    // Get offline operations from IndexedDB
    const operations = await getOfflineOperations()
    
    for (const operation of operations) {
      try {
        await syncOperation(operation)
        await removeOfflineOperation(operation.id)
      } catch (error) {
        console.error('Service Worker: Failed to sync operation:', operation, error)
      }
    }
  } catch (error) {
    console.error('Service Worker: Background sync failed:', error)
  }
}

// Sync individual operation
async function syncOperation(operation) {
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
  
  return response.json()
}

// IndexedDB operations (simplified - in real implementation use a proper IndexedDB wrapper)
async function getOfflineOperations() {
  // This would typically use IndexedDB to get stored operations
  // For now, return empty array
  return []
}

async function removeOfflineOperation(operationId) {
  // This would typically remove the operation from IndexedDB
  console.log('Service Worker: Removing synced operation:', operationId)
}

// Push notification handling
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received')
  
  const options = {
    body: 'You have new updates in Vault',
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Open Vault',
        icon: '/icon-192x192.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/icon-192x192.png'
      }
    ]
  }
  
  if (event.data) {
    const data = event.data.json()
    options.body = data.message || options.body
    options.data = { ...options.data, ...data }
  }
  
  event.waitUntil(
    self.registration.showNotification('Vault', options)
  )
})

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked:', event.action)
  
  event.notification.close()
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    )
  }
})

// Message handling from main thread
self.addEventListener('message', (event) => {
  console.log('Service Worker: Message received:', event.data)
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
        return cache.addAll(event.data.urls)
      })
    )
  }
})

console.log('Service Worker: Loaded')