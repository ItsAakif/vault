'use client'

import { useState, useEffect, useCallback } from 'react'
import { performanceManager, memoryMonitor, BundleAnalyzer } from '@/lib/performance'

interface PerformanceMetrics {
  score: number
  metrics: Record<string, { avg: number; min: number; max: number; count: number }>
  recommendations: string[]
  memory?: {
    current: { used: number; total: number; limit: number }
    trend: number
  }
  bundle?: {
    scripts: number
    stylesheets: number
    recommendations: string[]
  }
}

interface UsePerformanceOptions {
  enableMemoryMonitoring?: boolean
  enableBundleAnalysis?: boolean
  updateInterval?: number
}

export function usePerformance(options: UsePerformanceOptions = {}) {
  const {
    enableMemoryMonitoring = true,
    enableBundleAnalysis = true,
    updateInterval = 10000 // 10 seconds
  } = options

  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    score: 0,
    metrics: {},
    recommendations: []
  })
  
  const [isMonitoring, setIsMonitoring] = useState(false)

  // Update metrics
  const updateMetrics = useCallback(() => {
    const newMetrics: PerformanceMetrics = {
      score: performanceManager.getPerformanceScore(),
      metrics: performanceManager.getMetrics(),
      recommendations: performanceManager.getRecommendations()
    }

    // Add memory stats if enabled
    if (enableMemoryMonitoring) {
      const memoryStats = memoryMonitor.getStats()
      if (memoryStats) {
        newMetrics.memory = memoryStats
      }
    }

    // Add bundle analysis if enabled
    if (enableBundleAnalysis) {
      const bundleAnalysis = BundleAnalyzer.analyzeBundle()
      if (bundleAnalysis) {
        newMetrics.bundle = {
          scripts: bundleAnalysis.totalScripts,
          stylesheets: bundleAnalysis.totalStylesheets,
          recommendations: BundleAnalyzer.getRecommendations()
        }
      }
    }

    setMetrics(newMetrics)
  }, [enableMemoryMonitoring, enableBundleAnalysis])

  // Start monitoring
  const startMonitoring = useCallback(() => {
    if (isMonitoring) return

    setIsMonitoring(true)
    
    if (enableMemoryMonitoring) {
      memoryMonitor.start()
    }

    // Initial update
    updateMetrics()

    // Set up interval for updates
    const interval = setInterval(updateMetrics, updateInterval)

    return () => {
      clearInterval(interval)
      if (enableMemoryMonitoring) {
        memoryMonitor.stop()
      }
      setIsMonitoring(false)
    }
  }, [isMonitoring, enableMemoryMonitoring, updateMetrics, updateInterval])

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false)
    if (enableMemoryMonitoring) {
      memoryMonitor.stop()
    }
  }, [enableMemoryMonitoring])

  // Get performance grade
  const getPerformanceGrade = useCallback((score: number): string => {
    if (score >= 90) return 'A'
    if (score >= 80) return 'B'
    if (score >= 70) return 'C'
    if (score >= 60) return 'D'
    return 'F'
  }, [])

  // Get metric status
  const getMetricStatus = useCallback((metricName: string, value: number): 'good' | 'needs-improvement' | 'poor' => {
    switch (metricName) {
      case 'LCP':
        if (value <= 2500) return 'good'
        if (value <= 4000) return 'needs-improvement'
        return 'poor'
      
      case 'FID':
        if (value <= 100) return 'good'
        if (value <= 300) return 'needs-improvement'
        return 'poor'
      
      case 'CLS':
        if (value <= 0.1) return 'good'
        if (value <= 0.25) return 'needs-improvement'
        return 'poor'
      
      default:
        return 'good'
    }
  }, [])

  // Force update metrics
  const refreshMetrics = useCallback(() => {
    updateMetrics()
  }, [updateMetrics])

  // Start monitoring on mount
  useEffect(() => {
    const cleanup = startMonitoring()
    return cleanup
  }, [startMonitoring])

  return {
    // State
    metrics,
    isMonitoring,
    
    // Computed values
    performanceGrade: getPerformanceGrade(metrics.score),
    
    // Actions
    startMonitoring,
    stopMonitoring,
    refreshMetrics,
    getMetricStatus,
    
    // Utilities
    formatBytes: (bytes: number) => {
      const sizes = ['Bytes', 'KB', 'MB', 'GB']
      if (bytes === 0) return '0 Bytes'
      const i = Math.floor(Math.log(bytes) / Math.log(1024))
      return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
    },
    
    formatTime: (ms: number) => {
      if (ms < 1000) return `${Math.round(ms)}ms`
      return `${(ms / 1000).toFixed(1)}s`
    }
  }
}

// Hook for lazy loading images
export function useLazyImage(src: string, options: { threshold?: number; rootMargin?: string } = {}) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isInView, setIsInView] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const imgRef = useCallback((node: HTMLImageElement | null) => {
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      {
        threshold: options.threshold || 0.1,
        rootMargin: options.rootMargin || '50px'
      }
    )

    observer.observe(node)

    return () => observer.disconnect()
  }, [options.threshold, options.rootMargin])

  useEffect(() => {
    if (!isInView) return

    const img = new Image()
    
    img.onload = () => {
      setIsLoaded(true)
      setError(null)
    }
    
    img.onerror = () => {
      setError('Failed to load image')
    }
    
    img.src = src
  }, [isInView, src])

  return {
    imgRef,
    isLoaded,
    isInView,
    error,
    src: isInView ? src : undefined
  }
}

// Hook for code splitting
export function useCodeSplitting<T>(
  moduleLoader: () => Promise<{ default: T }>,
  moduleName: string
) {
  const [module, setModule] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const loadModule = useCallback(async () => {
    if (module || isLoading) return

    setIsLoading(true)
    setError(null)

    try {
      const loadedModule = await moduleLoader()
      setModule(loadedModule.default)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load module'))
    } finally {
      setIsLoading(false)
    }
  }, [module, isLoading, moduleLoader])

  // Preload module
  const preload = useCallback(() => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        loadModule().catch(() => {
          // Ignore preload errors
        })
      })
    }
  }, [loadModule])

  return {
    module,
    isLoading,
    error,
    loadModule,
    preload
  }
}

// Hook for virtual scrolling
export function useVirtualScrolling<T>(
  items: T[],
  itemHeight: number,
  containerHeight: number,
  overscan = 5
) {
  const [scrollTop, setScrollTop] = useState(0)

  const visibleRange = {
    start: Math.max(0, Math.floor(scrollTop / itemHeight) - overscan),
    end: Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    )
  }

  const visibleItems = items.slice(visibleRange.start, visibleRange.end + 1)

  const totalHeight = items.length * itemHeight
  const offsetY = visibleRange.start * itemHeight

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  return {
    visibleItems,
    totalHeight,
    offsetY,
    handleScroll,
    visibleRange
  }
}

// Hook for debounced performance monitoring
export function useDebouncedPerformance(delay = 1000) {
  const [debouncedMetrics, setDebouncedMetrics] = useState<PerformanceMetrics>({
    score: 0,
    metrics: {},
    recommendations: []
  })

  const { metrics } = usePerformance()

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedMetrics(metrics)
    }, delay)

    return () => clearTimeout(timer)
  }, [metrics, delay])

  return debouncedMetrics
}