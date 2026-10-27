'use client'

import { logger } from '@/lib/logger'

// Performance monitoring and optimization utilities
class PerformanceManager {
  private metrics: Map<string, number[]> = new Map()
  private observers: Map<string, PerformanceObserver> = new Map()
  private isMonitoring = false

  constructor() {
    if (typeof window !== 'undefined') {
      this.initializeMonitoring()
    }
  }

  // Initialize performance monitoring
  private initializeMonitoring() {
    // Web Vitals monitoring
    this.observeWebVitals()
    
    // Resource timing
    this.observeResourceTiming()
    
    // Navigation timing
    this.observeNavigationTiming()
    
    // Long tasks
    this.observeLongTasks()
    
    this.isMonitoring = true
    logger.info('Performance monitoring initialized')
  }

  // Web Vitals (Core Web Vitals)
  private observeWebVitals() {
    // Largest Contentful Paint (LCP)
    this.createObserver('largest-contentful-paint', (entries) => {
      const lcpEntry = entries[entries.length - 1]
      this.recordMetric('LCP', lcpEntry.startTime)
      
      if (lcpEntry.startTime > 2500) {
        logger.warn('Poor LCP detected:', lcpEntry.startTime)
      }
    })

    // First Input Delay (FID)
    this.createObserver('first-input', (entries) => {
      const fidEntry = entries[0]
      const fid = fidEntry.processingStart - fidEntry.startTime
      this.recordMetric('FID', fid)
      
      if (fid > 100) {
        logger.warn('Poor FID detected:', fid)
      }
    })

    // Cumulative Layout Shift (CLS)
    this.createObserver('layout-shift', (entries) => {
      let clsValue = 0
      for (const entry of entries) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value
        }
      }
      this.recordMetric('CLS', clsValue)
      
      if (clsValue > 0.1) {
        logger.warn('Poor CLS detected:', clsValue)
      }
    })
  }

  // Resource timing monitoring
  private observeResourceTiming() {
    this.createObserver('resource', (entries) => {
      entries.forEach((entry: any) => {
        const duration = entry.responseEnd - entry.startTime
        this.recordMetric(`Resource_${entry.initiatorType}`, duration)
        
        // Alert on slow resources
        if (duration > 3000) {
          logger.warn('Slow resource detected:', {
            name: entry.name,
            duration,
            type: entry.initiatorType
          })
        }
      })
    })
  }

  // Navigation timing
  private observeNavigationTiming() {
    this.createObserver('navigation', (entries) => {
      const entry = entries[0] as any
      
      // Key navigation metrics
      const metrics = {
        'DNS_Lookup': entry.domainLookupEnd - entry.domainLookupStart,
        'TCP_Connection': entry.connectEnd - entry.connectStart,
        'TLS_Negotiation': entry.secureConnectionStart > 0 ? entry.connectEnd - entry.secureConnectionStart : 0,
        'Request_Response': entry.responseEnd - entry.requestStart,
        'DOM_Processing': entry.domComplete - entry.domLoading,
        'Load_Complete': entry.loadEventEnd - entry.loadEventStart
      }
      
      Object.entries(metrics).forEach(([name, value]) => {
        this.recordMetric(name, value)
      })
    })
  }

  // Long tasks monitoring
  private observeLongTasks() {
    if ('PerformanceObserver' in window && 'PerformanceLongTaskTiming' in window) {
      this.createObserver('longtask', (entries) => {
        entries.forEach((entry: any) => {
          this.recordMetric('Long_Task', entry.duration)
          
          logger.warn('Long task detected:', {
            duration: entry.duration,
            startTime: entry.startTime
          })
        })
      })
    }
  }

  // Create performance observer
  private createObserver(type: string, callback: (entries: any[]) => void) {
    try {
      const observer = new PerformanceObserver((list) => {
        callback(list.getEntries())
      })
      
      observer.observe({ type, buffered: true })
      this.observers.set(type, observer)
    } catch (error) {
      logger.error(`Failed to create ${type} observer:`, error)
    }
  }

  // Record performance metric
  private recordMetric(name: string, value: number) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, [])
    }
    
    const values = this.metrics.get(name)!
    values.push(value)
    
    // Keep only last 100 measurements
    if (values.length > 100) {
      values.shift()
    }
  }

  // Get performance metrics
  getMetrics(): Record<string, { avg: number; min: number; max: number; count: number }> {
    const result: Record<string, any> = {}
    
    this.metrics.forEach((values, name) => {
      if (values.length > 0) {
        result[name] = {
          avg: values.reduce((sum, val) => sum + val, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          count: values.length
        }
      }
    })
    
    return result
  }

  // Get performance score (0-100)
  getPerformanceScore(): number {
    const metrics = this.getMetrics()
    let score = 100
    
    // LCP scoring
    if (metrics.LCP) {
      if (metrics.LCP.avg > 4000) score -= 30
      else if (metrics.LCP.avg > 2500) score -= 15
    }
    
    // FID scoring
    if (metrics.FID) {
      if (metrics.FID.avg > 300) score -= 30
      else if (metrics.FID.avg > 100) score -= 15
    }
    
    // CLS scoring
    if (metrics.CLS) {
      if (metrics.CLS.avg > 0.25) score -= 30
      else if (metrics.CLS.avg > 0.1) score -= 15
    }
    
    // Long tasks penalty
    if (metrics.Long_Task && metrics.Long_Task.count > 0) {
      score -= Math.min(20, metrics.Long_Task.count * 2)
    }
    
    return Math.max(0, score)
  }

  // Performance recommendations
  getRecommendations(): string[] {
    const recommendations: string[] = []
    const metrics = this.getMetrics()
    
    if (metrics.LCP?.avg > 2500) {
      recommendations.push('Optimize Largest Contentful Paint by reducing server response times and optimizing critical resources')
    }
    
    if (metrics.FID?.avg > 100) {
      recommendations.push('Reduce First Input Delay by minimizing JavaScript execution time and using code splitting')
    }
    
    if (metrics.CLS?.avg > 0.1) {
      recommendations.push('Improve Cumulative Layout Shift by setting dimensions for images and avoiding dynamic content insertion')
    }
    
    if (metrics.Long_Task?.count > 5) {
      recommendations.push('Break up long tasks by using setTimeout or requestIdleCallback for non-critical work')
    }
    
    if (metrics.Resource_script?.avg > 1000) {
      recommendations.push('Optimize JavaScript loading with code splitting and lazy loading')
    }
    
    if (metrics.Resource_img?.avg > 2000) {
      recommendations.push('Optimize images with compression, WebP format, and responsive images')
    }
    
    return recommendations
  }

  // Cleanup
  cleanup() {
    this.observers.forEach(observer => observer.disconnect())
    this.observers.clear()
    this.metrics.clear()
    this.isMonitoring = false
  }
}

// Bundle analyzer utilities
export class BundleAnalyzer {
  static analyzeBundle() {
    if (typeof window === 'undefined') return null

    const scripts = Array.from(document.querySelectorAll('script[src]'))
    const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    
    const analysis = {
      scripts: scripts.map((script: any) => ({
        src: script.src,
        size: script.src.length, // Approximation
        async: script.async,
        defer: script.defer
      })),
      stylesheets: stylesheets.map((link: any) => ({
        href: link.href,
        size: link.href.length // Approximation
      })),
      totalScripts: scripts.length,
      totalStylesheets: stylesheets.length
    }
    
    return analysis
  }

  static getRecommendations() {
    const analysis = this.analyzeBundle()
    if (!analysis) return []

    const recommendations: string[] = []
    
    if (analysis.totalScripts > 10) {
      recommendations.push('Consider bundling or reducing the number of script files')
    }
    
    if (analysis.scripts.some(s => !s.async && !s.defer)) {
      recommendations.push('Add async or defer attributes to non-critical scripts')
    }
    
    if (analysis.totalStylesheets > 5) {
      recommendations.push('Consider combining CSS files to reduce HTTP requests')
    }
    
    return recommendations
  }
}

// Memory usage monitoring
export class MemoryMonitor {
  private measurements: number[] = []
  private interval: NodeJS.Timeout | null = null

  start() {
    if (typeof window === 'undefined' || !('memory' in performance)) {
      logger.warn('Memory monitoring not supported')
      return
    }

    this.interval = setInterval(() => {
      const memory = (performance as any).memory
      if (memory) {
        this.measurements.push(memory.usedJSHeapSize)
        
        // Keep only last 100 measurements
        if (this.measurements.length > 100) {
          this.measurements.shift()
        }
        
        // Alert on high memory usage (>50MB)
        if (memory.usedJSHeapSize > 50 * 1024 * 1024) {
          logger.warn('High memory usage detected:', {
            used: Math.round(memory.usedJSHeapSize / 1024 / 1024) + 'MB',
            total: Math.round(memory.totalJSHeapSize / 1024 / 1024) + 'MB',
            limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024) + 'MB'
          })
        }
      }
    }, 5000) // Check every 5 seconds
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  getStats() {
    if (typeof window === 'undefined' || !('memory' in performance)) {
      return null
    }

    const memory = (performance as any).memory
    if (!memory) return null

    return {
      current: {
        used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
        total: Math.round(memory.totalJSHeapSize / 1024 / 1024),
        limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024)
      },
      trend: this.measurements.length > 1 
        ? this.measurements[this.measurements.length - 1] - this.measurements[0]
        : 0
    }
  }
}

// Image optimization utilities
export class ImageOptimizer {
  static async optimizeImage(file: File, maxWidth = 1920, quality = 0.8): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()
      
      img.onload = () => {
        // Calculate new dimensions
        let { width, height } = img
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }
        
        canvas.width = width
        canvas.height = height
        
        // Draw and compress
        ctx?.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob)
            } else {
              reject(new Error('Failed to optimize image'))
            }
          },
          'image/jpeg',
          quality
        )
      }
      
      img.onerror = reject
      img.src = URL.createObjectURL(file)
    })
  }

  static async createWebPVersion(file: File): Promise<Blob | null> {
    if (!HTMLCanvasElement.prototype.toBlob) {
      return null // WebP not supported
    }

    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()
      
      return new Promise((resolve) => {
        img.onload = () => {
          canvas.width = img.width
          canvas.height = img.height
          ctx?.drawImage(img, 0, 0)
          
          canvas.toBlob(
            (blob) => resolve(blob),
            'image/webp',
            0.8
          )
        }
        
        img.onerror = () => resolve(null)
        img.src = URL.createObjectURL(file)
      })
    } catch {
      return null
    }
  }
}

// Lazy loading utilities
export class LazyLoader {
  private observer: IntersectionObserver | null = null
  private elements = new Set<Element>()

  constructor() {
    if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              this.loadElement(entry.target)
              this.observer?.unobserve(entry.target)
              this.elements.delete(entry.target)
            }
          })
        },
        {
          rootMargin: '50px' // Start loading 50px before element is visible
        }
      )
    }
  }

  observe(element: Element) {
    if (this.observer) {
      this.observer.observe(element)
      this.elements.add(element)
    } else {
      // Fallback for browsers without IntersectionObserver
      this.loadElement(element)
    }
  }

  private loadElement(element: Element) {
    if (element.tagName === 'IMG') {
      const img = element as HTMLImageElement
      const dataSrc = img.dataset.src
      if (dataSrc) {
        img.src = dataSrc
        img.removeAttribute('data-src')
      }
    }
    
    // Handle other lazy-loadable elements
    const dataSrc = element.getAttribute('data-src')
    if (dataSrc) {
      element.setAttribute('src', dataSrc)
      element.removeAttribute('data-src')
    }
  }

  cleanup() {
    if (this.observer) {
      this.observer.disconnect()
      this.elements.clear()
    }
  }
}

// Code splitting utilities
export class CodeSplitter {
  private static loadedModules = new Set<string>()

  static async loadModule<T>(
    moduleLoader: () => Promise<T>,
    moduleName: string
  ): Promise<T> {
    if (this.loadedModules.has(moduleName)) {
      logger.debug(`Module ${moduleName} already loaded`)
    }

    try {
      const startTime = performance.now()
      const module = await moduleLoader()
      const loadTime = performance.now() - startTime
      
      this.loadedModules.add(moduleName)
      logger.info(`Module ${moduleName} loaded in ${loadTime.toFixed(2)}ms`)
      
      return module
    } catch (error) {
      logger.error(`Failed to load module ${moduleName}:`, error)
      throw error
    }
  }

  static preloadModule(moduleLoader: () => Promise<any>, moduleName: string) {
    // Preload module during idle time
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        this.loadModule(moduleLoader, moduleName).catch(() => {
          // Ignore preload errors
        })
      })
    }
  }
}

// Export singleton instance
export const performanceManager = new PerformanceManager()
export const memoryMonitor = new MemoryMonitor()
export const lazyLoader = new LazyLoader()

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    performanceManager.cleanup()
    memoryMonitor.stop()
    lazyLoader.cleanup()
  })
}