'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useUIStore } from '@/store'

// Toast management hook
export interface Toast {
  id: string
  title?: string
  description: string
  type: 'success' | 'error' | 'warning' | 'info'
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
  persistent?: boolean
}

export function useToast() {
  const { notifications, addNotification, removeNotification } = useUIStore()

  const toast = useCallback((options: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const toastItem: Toast = {
      id,
      duration: 5000,
      ...options,
      type: options.type || 'info'
    }

    addNotification(toastItem)

    // Auto-remove after duration (unless persistent)
    if (!toastItem.persistent && toastItem.duration && toastItem.duration > 0) {
      setTimeout(() => {
        removeNotification(id)
      }, toastItem.duration)
    }

    return id
  }, [addNotification, removeNotification])

  const dismiss = useCallback((id: string) => {
    removeNotification(id)
  }, [removeNotification])

  const dismissAll = useCallback(() => {
    notifications.forEach(notification => {
      removeNotification(notification.id)
    })
  }, [notifications, removeNotification])

  // Convenience methods
  const success = useCallback((description: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'description'>>) => {
    return toast({ ...options, description, type: 'success' })
  }, [toast])

  const error = useCallback((description: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'description'>>) => {
    return toast({ ...options, description, type: 'error' })
  }, [toast])

  const warning = useCallback((description: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'description'>>) => {
    return toast({ ...options, description, type: 'warning' })
  }, [toast])

  const info = useCallback((description: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'description'>>) => {
    return toast({ ...options, description, type: 'info' })
  }, [toast])

  return {
    toast,
    success,
    error,
    warning,
    info,
    dismiss,
    dismissAll,
    toasts: notifications
  }
}

// Loading state management hook
export interface LoadingState {
  isLoading: boolean
  error: string | null
  data: any
}

export function useLoadingState<T = any>(initialData?: T) {
  const [state, setState] = useState<LoadingState>({
    isLoading: false,
    error: null,
    data: initialData || null
  })

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, isLoading: loading, error: null }))
  }, [])

  const setError = useCallback((error: string | Error | null) => {
    setState(prev => ({
      ...prev,
      isLoading: false,
      error: error instanceof Error ? error.message : error
    }))
  }, [])

  const setData = useCallback((data: T) => {
    setState(prev => ({ ...prev, data, isLoading: false, error: null }))
  }, [])

  const reset = useCallback(() => {
    setState({
      isLoading: false,
      error: null,
      data: initialData || null
    })
  }, [initialData])

  // Execute async operation with loading state management
  const execute = useCallback(async <R>(
    operation: () => Promise<R>,
    options?: {
      onSuccess?: (result: R) => void
      onError?: (error: Error) => void
      showToast?: boolean
    }
  ): Promise<R | null> => {
    setLoading(true)
    
    try {
      const result = await operation()
      setData(result as any)
      options?.onSuccess?.(result)
      
      if (options?.showToast) {
        // This would need access to toast - could be passed as parameter
      }
      
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred'
      setError(errorMessage)
      options?.onError?.(error as Error)
      
      if (options?.showToast) {
        // This would need access to toast - could be passed as parameter
      }
      
      return null
    }
  }, [setLoading, setData, setError])

  return {
    ...state,
    setLoading,
    setError,
    setData,
    reset,
    execute
  }
}

// Progress tracking hook
export interface ProgressState {
  value: number
  max: number
  status: 'idle' | 'active' | 'success' | 'error' | 'paused'
  message?: string
  estimatedTimeRemaining?: number
}

export function useProgress(initialMax: number = 100) {
  const [progress, setProgress] = useState<ProgressState>({
    value: 0,
    max: initialMax,
    status: 'idle'
  })

  const startTime = useRef<number | null>(null)

  const start = useCallback((message?: string) => {
    startTime.current = Date.now()
    setProgress(prev => ({
      ...prev,
      value: 0,
      status: 'active',
      message,
      estimatedTimeRemaining: undefined
    }))
  }, [])

  const update = useCallback((value: number, message?: string) => {
    setProgress(prev => {
      let estimatedTimeRemaining: number | undefined

      // Calculate ETA if we have a start time and progress > 0
      if (startTime.current && value > 0 && value < prev.max) {
        const elapsed = (Date.now() - startTime.current) / 1000
        const rate = value / elapsed
        const remaining = prev.max - value
        estimatedTimeRemaining = remaining / rate
      }

      return {
        ...prev,
        value: Math.min(Math.max(value, 0), prev.max),
        message: message || prev.message,
        estimatedTimeRemaining
      }
    })
  }, [])

  const complete = useCallback((message?: string) => {
    setProgress(prev => ({
      ...prev,
      value: prev.max,
      status: 'success',
      message: message || 'Complete',
      estimatedTimeRemaining: undefined
    }))
    startTime.current = null
  }, [])

  const error = useCallback((message?: string) => {
    setProgress(prev => ({
      ...prev,
      status: 'error',
      message: message || 'Error occurred',
      estimatedTimeRemaining: undefined
    }))
    startTime.current = null
  }, [])

  const pause = useCallback(() => {
    setProgress(prev => ({ ...prev, status: 'paused' }))
  }, [])

  const resume = useCallback(() => {
    setProgress(prev => ({ ...prev, status: 'active' }))
  }, [])

  const reset = useCallback(() => {
    setProgress(prev => ({
      ...prev,
      value: 0,
      status: 'idle',
      message: undefined,
      estimatedTimeRemaining: undefined
    }))
    startTime.current = null
  }, [])

  const setMax = useCallback((max: number) => {
    setProgress(prev => ({ ...prev, max }))
  }, [])

  return {
    progress,
    start,
    update,
    complete,
    error,
    pause,
    resume,
    reset,
    setMax,
    percentage: (progress.value / progress.max) * 100
  }
}

// Connection status hook
export function useConnectionStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [syncInProgress, setSyncInProgress] = useState(false)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const startSync = useCallback(() => {
    setSyncInProgress(true)
  }, [])

  const completeSync = useCallback(() => {
    setSyncInProgress(false)
    setLastSync(new Date())
  }, [])

  const failSync = useCallback(() => {
    setSyncInProgress(false)
  }, [])

  return {
    isOnline,
    lastSync,
    syncInProgress,
    startSync,
    completeSync,
    failSync
  }
}

// File upload progress hook
export interface FileUploadState {
  name: string
  progress: number
  status: 'uploading' | 'success' | 'error'
  error?: string
}

export function useFileUpload() {
  const [files, setFiles] = useState<FileUploadState[]>([])

  const addFile = useCallback((name: string) => {
    setFiles(prev => [...prev, {
      name,
      progress: 0,
      status: 'uploading'
    }])
  }, [])

  const updateProgress = useCallback((name: string, progress: number) => {
    setFiles(prev => prev.map(file =>
      file.name === name ? { ...file, progress } : file
    ))
  }, [])

  const completeUpload = useCallback((name: string) => {
    setFiles(prev => prev.map(file =>
      file.name === name ? { ...file, progress: 100, status: 'success' } : file
    ))
  }, [])

  const failUpload = useCallback((name: string, error: string) => {
    setFiles(prev => prev.map(file =>
      file.name === name ? { ...file, status: 'error', error } : file
    ))
  }, [])

  const removeFile = useCallback((name: string) => {
    setFiles(prev => prev.filter(file => file.name !== name))
  }, [])

  const clearCompleted = useCallback(() => {
    setFiles(prev => prev.filter(file => file.status === 'uploading'))
  }, [])

  const clearAll = useCallback(() => {
    setFiles([])
  }, [])

  // Upload file with progress tracking
  const uploadFile = useCallback(async (
    file: File,
    uploadFn: (file: File, onProgress: (progress: number) => void) => Promise<any>
  ) => {
    addFile(file.name)

    try {
      const result = await uploadFn(file, (progress) => {
        updateProgress(file.name, progress)
      })
      
      completeUpload(file.name)
      return result
    } catch (error) {
      failUpload(file.name, error instanceof Error ? error.message : 'Upload failed')
      throw error
    }
  }, [addFile, updateProgress, completeUpload, failUpload])

  return {
    files,
    addFile,
    updateProgress,
    completeUpload,
    failUpload,
    removeFile,
    clearCompleted,
    clearAll,
    uploadFile
  }
}

// Action feedback hook (for buttons and forms)
export function useActionFeedback() {
  const [state, setState] = useState({
    isLoading: false,
    isSuccess: false,
    isError: false,
    message: ''
  })

  const setLoading = useCallback((loading: boolean, message?: string) => {
    setState({
      isLoading: loading,
      isSuccess: false,
      isError: false,
      message: message || ''
    })
  }, [])

  const setSuccess = useCallback((message?: string) => {
    setState({
      isLoading: false,
      isSuccess: true,
      isError: false,
      message: message || 'Success!'
    })

    // Auto-clear success state after 2 seconds
    setTimeout(() => {
      setState(prev => ({ ...prev, isSuccess: false, message: '' }))
    }, 2000)
  }, [])

  const setError = useCallback((message?: string) => {
    setState({
      isLoading: false,
      isSuccess: false,
      isError: true,
      message: message || 'Error occurred'
    })
  }, [])

  const reset = useCallback(() => {
    setState({
      isLoading: false,
      isSuccess: false,
      isError: false,
      message: ''
    })
  }, [])

  // Execute action with feedback
  const execute = useCallback(async <T>(
    action: () => Promise<T>,
    options?: {
      loadingMessage?: string
      successMessage?: string
      errorMessage?: string
    }
  ): Promise<T | null> => {
    setLoading(true, options?.loadingMessage)

    try {
      const result = await action()
      setSuccess(options?.successMessage)
      return result
    } catch (error) {
      const errorMessage = options?.errorMessage || 
        (error instanceof Error ? error.message : 'An error occurred')
      setError(errorMessage)
      return null
    }
  }, [setLoading, setSuccess, setError])

  return {
    ...state,
    setLoading,
    setSuccess,
    setError,
    reset,
    execute
  }
}

// System performance monitoring hook
export function usePerformanceMonitor() {
  const [metrics, setMetrics] = useState({
    responseTime: 0,
    uptime: 100,
    errorRate: 0
  })

  const updateMetrics = useCallback((newMetrics: Partial<typeof metrics>) => {
    setMetrics(prev => ({ ...prev, ...newMetrics }))
  }, [])

  // Measure API response time
  const measureApiCall = useCallback(async <T>(
    apiCall: () => Promise<T>
  ): Promise<T> => {
    const startTime = performance.now()
    
    try {
      const result = await apiCall()
      const responseTime = performance.now() - startTime
      updateMetrics({ responseTime })
      return result
    } catch (error) {
      const responseTime = performance.now() - startTime
      updateMetrics({ responseTime })
      throw error
    }
  }, [updateMetrics])

  return {
    metrics,
    updateMetrics,
    measureApiCall
  }
}