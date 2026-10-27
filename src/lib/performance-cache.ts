import { log } from '@/lib/production-logger'

export interface CacheEntry<T = any> {
  data: T
  timestamp: number
  ttl: number
  hits: number
  tags?: string[]
  size?: number
}

export interface CacheOptions {
  ttl?: number // Time to live in milliseconds
  tags?: string[]
  serialize?: (data: any) => string
  deserialize?: (data: string) => any
  priority?: 'low' | 'normal' | 'high'
}

export interface CacheStats {
  hits: number
  misses: number
  sets: number
  deletes: number
  evictions: number
  memoryUsage: number
  hitRate: number
}

class PerformanceCacheService {
  private cache = new Map<string, CacheEntry>()
  private maxSize: number
  private defaultTtl: number
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0,
    memoryUsage: 0,
    hitRate: 0
  }
  
  // LRU tracking
  private accessOrder = new Map<string, number>()
  private accessCounter = 0

  constructor(options: {
    maxSize?: number
    defaultTtl?: number
  } = {}) {
    this.maxSize = options.maxSize || 100 * 1024 * 1024 // 100MB default
    this.defaultTtl = options.defaultTtl || 60 * 60 * 1000 // 1 hour default
    
    // Cleanup expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000)
    
    log.info('Performance cache service initialized', {
      maxSize: this.maxSize,
      defaultTtl: this.defaultTtl
    })
  }

  /**
   * Get item from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    
    if (!entry) {
      this.stats.misses++
      this.updateHitRate()
      return null
    }

    // Check if expired
    if (Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key)
      this.accessOrder.delete(key)
      this.stats.misses++
      this.updateHitRate()
      return null
    }

    // Update access tracking
    entry.hits++
    this.accessOrder.set(key, ++this.accessCounter)
    this.stats.hits++
    this.updateHitRate()

    log.debug('Cache hit', { key, hits: entry.hits })
    return entry.data
  }

  /**
   * Set item in cache
   */
  set<T>(key: string, data: T, options: CacheOptions = {}): void {
    const ttl = options.ttl || this.defaultTtl
    const serializedData = options.serialize ? options.serialize(data) : data
    const dataSize = this.calculateSize(serializedData)

    // Check if we need to evict items
    this.ensureCapacity(dataSize)

    const entry: CacheEntry<T | string> = {
      data: serializedData,
      timestamp: Date.now(),
      ttl,
      hits: 0,
      tags: options.tags,
      size: dataSize
    }

    this.cache.set(key, entry)
    this.accessOrder.set(key, ++this.accessCounter)
    this.stats.sets++
    this.updateMemoryUsage()

    log.debug('Cache set', { 
      key, 
      size: dataSize, 
      ttl,
      tags: options.tags 
    })
  }

  /**
   * Delete item from cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key)
    this.accessOrder.delete(key)
    
    if (deleted) {
      this.stats.deletes++
      this.updateMemoryUsage()
    }
    
    return deleted
  }

  /**
   * Clear all items or items with specific tags
   */
  clear(tags?: string[]): void {
    if (!tags) {
      this.cache.clear()
      this.accessOrder.clear()
      this.stats.deletes += this.cache.size
    } else {
      for (const [key, entry] of this.cache.entries()) {
        if (entry.tags && tags.some(tag => entry.tags!.includes(tag))) {
          this.cache.delete(key)
          this.accessOrder.delete(key)
          this.stats.deletes++
        }
      }
    }
    
    this.updateMemoryUsage()
    log.info('Cache cleared', { tags })
  }

  /**
   * Get or set with automatic caching
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T> | T,
    options: CacheOptions = {}
  ): Promise<T> {
    const cached = this.get<T>(key)
    
    if (cached !== null) {
      return options.deserialize ? options.deserialize(cached as any) : cached
    }

    try {
      const data = await factory()
      this.set(key, data, options)
      return data
    } catch (error) {
      log.error('Cache factory function failed', error, { key })
      throw error
    }
  }

  /**
   * Memoize function calls
   */
  memoize<TArgs extends any[], TReturn>(
    fn: (...args: TArgs) => Promise<TReturn> | TReturn,
    options: CacheOptions & {
      keyGenerator?: (...args: TArgs) => string
      maxAge?: number
    } = {}
  ) {
    const keyGen = options.keyGenerator || ((...args) => JSON.stringify(args))
    const maxAge = options.maxAge || this.defaultTtl

    return async (...args: TArgs): Promise<TReturn> => {
      const key = `memoized:${fn.name}:${keyGen(...args)}`
      
      return this.getOrSet(
        key,
        () => fn(...args),
        { ...options, ttl: maxAge }
      )
    }
  }

  /**
   * Batch operations
   */
  mget(keys: string[]): Record<string, any> {
    const result: Record<string, any> = {}
    
    for (const key of keys) {
      const value = this.get(key)
      if (value !== null) {
        result[key] = value
      }
    }
    
    return result
  }

  mset(entries: Record<string, any>, options: CacheOptions = {}): void {
    for (const [key, value] of Object.entries(entries)) {
      this.set(key, value, options)
    }
  }

  /**
   * Cache warming - preload frequently accessed data
   */
  async warm(warmupFunctions: Record<string, () => Promise<any>>): Promise<void> {
    log.info('Starting cache warmup', { functions: Object.keys(warmupFunctions) })
    
    const promises = Object.entries(warmupFunctions).map(async ([key, fn]) => {
      try {
        const data = await fn()
        this.set(key, data, { ttl: this.defaultTtl, tags: ['warmup'] })
        log.debug('Cache warmed', { key })
      } catch (error) {
        log.error('Cache warmup failed', error, { key })
      }
    })

    await Promise.all(promises)
    log.info('Cache warmup completed')
  }

  /**
   * Ensure cache capacity by evicting LRU items
   */
  private ensureCapacity(newItemSize: number): void {
    let currentSize = this.getCurrentSize()
    
    while (currentSize + newItemSize > this.maxSize && this.cache.size > 0) {
      const lruKey = this.findLruKey()
      if (lruKey) {
        const entry = this.cache.get(lruKey)
        this.cache.delete(lruKey)
        this.accessOrder.delete(lruKey)
        this.stats.evictions++
        
        if (entry?.size) {
          currentSize -= entry.size
        }
        
        log.debug('Cache eviction', { 
          key: lruKey, 
          reason: 'capacity',
          freed: entry?.size || 0
        })
      } else {
        break
      }
    }
  }

  /**
   * Find least recently used key
   */
  private findLruKey(): string | null {
    let lruKey: string | null = null
    let lruAccess = Infinity

    for (const [key, accessTime] of this.accessOrder.entries()) {
      if (accessTime < lruAccess) {
        lruAccess = accessTime
        lruKey = key
      }
    }

    return lruKey
  }

  /**
   * Calculate memory size of data
   */
  private calculateSize(data: any): number {
    if (typeof data === 'string') {
      return data.length * 2 // Approximate UTF-16 encoding
    }
    
    if (data instanceof ArrayBuffer || data instanceof Buffer) {
      return data.byteLength
    }
    
    // Rough estimate for objects
    return JSON.stringify(data).length * 2
  }

  /**
   * Get current total cache size
   */
  private getCurrentSize(): number {
    let totalSize = 0
    for (const entry of this.cache.values()) {
      totalSize += entry.size || 0
    }
    return totalSize
  }

  /**
   * Update memory usage stats
   */
  private updateMemoryUsage(): void {
    this.stats.memoryUsage = this.getCurrentSize()
  }

  /**
   * Update hit rate
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now()
    let cleaned = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.timestamp + entry.ttl) {
        this.cache.delete(key)
        this.accessOrder.delete(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      this.updateMemoryUsage()
      log.info('Cache cleanup completed', { 
        entriesRemoved: cleaned,
        remainingEntries: this.cache.size
      })
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & {
    size: number
    memoryUsagePercentage: number
  } {
    return {
      ...this.stats,
      size: this.cache.size,
      memoryUsagePercentage: (this.stats.memoryUsage / this.maxSize) * 100
    }
  }

  /**
   * Health check
   */
  getHealth(): {
    status: 'healthy' | 'warning' | 'critical'
    details: {
      hitRate: number
      memoryUsage: number
      size: number
      evictionRate: number
    }
  } {
    const stats = this.getStats()
    const evictionRate = this.stats.sets > 0 ? (this.stats.evictions / this.stats.sets) * 100 : 0
    
    let status: 'healthy' | 'warning' | 'critical' = 'healthy'
    
    if (stats.hitRate < 50 || stats.memoryUsagePercentage > 90 || evictionRate > 20) {
      status = 'critical'
    } else if (stats.hitRate < 70 || stats.memoryUsagePercentage > 75 || evictionRate > 10) {
      status = 'warning'
    }

    return {
      status,
      details: {
        hitRate: stats.hitRate,
        memoryUsage: stats.memoryUsagePercentage,
        size: stats.size,
        evictionRate
      }
    }
  }
}

// Cache instances for different use cases
export const memoryCache = new PerformanceCacheService({
  maxSize: 50 * 1024 * 1024, // 50MB
  defaultTtl: 30 * 60 * 1000 // 30 minutes
})

export const apiCache = new PerformanceCacheService({
  maxSize: 20 * 1024 * 1024, // 20MB
  defaultTtl: 5 * 60 * 1000 // 5 minutes
})

export const staticCache = new PerformanceCacheService({
  maxSize: 100 * 1024 * 1024, // 100MB
  defaultTtl: 24 * 60 * 60 * 1000 // 24 hours
})

// Utility functions for common caching patterns
export const withCache = <T>(
  cache: PerformanceCacheService,
  key: string,
  fn: () => Promise<T> | T,
  options?: CacheOptions
) => {
  return cache.getOrSet(key, fn, options)
}

export const invalidateCache = (
  cache: PerformanceCacheService,
  pattern: string | string[]
): void => {
  if (Array.isArray(pattern)) {
    cache.clear(pattern)
  } else {
    // Simple pattern matching for keys
    const stats = cache.getStats()
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'))
      for (const key of Object.keys(stats)) {
        if (regex.test(key)) {
          cache.delete(key)
        }
      }
    } else {
      cache.delete(pattern)
    }
  }
}

// Decorator for automatic caching
export function Cached(options: CacheOptions = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value
    const cache = options.tags?.includes('api') ? apiCache : memoryCache
    
    descriptor.value = async function (...args: any[]) {
      const key = `${target.constructor.name}:${propertyKey}:${JSON.stringify(args)}`
      
      return cache.getOrSet(
        key,
        () => originalMethod.apply(this, args),
        options
      )
    }
    
    return descriptor
  }
}

export default PerformanceCacheService