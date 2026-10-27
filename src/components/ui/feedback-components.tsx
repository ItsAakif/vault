'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { animations } from '@/lib/animations'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { 
  CheckCircle, 
  AlertCircle, 
  Info, 
  AlertTriangle,
  X,
  RefreshCw,
  Wifi,
  WifiOff,
  Upload,
  Download,
  Clock,
  Zap
} from 'lucide-react'

// Toast notification system
export interface ToastProps {
  id?: string
  title?: string
  description: string
  type?: 'success' | 'error' | 'warning' | 'info'
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
  onClose?: () => void
  persistent?: boolean
}

export function Toast({
  title,
  description,
  type = 'info',
  duration = 5000,
  action,
  onClose,
  persistent = false
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    if (!persistent && duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false)
        setTimeout(() => onClose?.(), 300)
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [duration, persistent, onClose])

  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info
  }

  const colors = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  }

  const iconColors = {
    success: 'text-green-600',
    error: 'text-red-600',
    warning: 'text-yellow-600',
    info: 'text-blue-600'
  }

  const Icon = icons[type]

  if (!isVisible) return null

  return (
    <motion.div
      className={cn(
        'flex items-start space-x-3 p-4 rounded-lg border shadow-lg max-w-md',
        colors[type]
      )}
      {...animations.toastSlideIn}
      exit={{ opacity: 0, x: 100, scale: 0.95 }}
    >
      <Icon className={cn('h-5 w-5 flex-shrink-0 mt-0.5', iconColors[type])} />
      
      <div className="flex-1 min-w-0">
        {title && (
          <p className="text-sm font-medium mb-1">{title}</p>
        )}
        <p className="text-sm opacity-90">{description}</p>
        
        {action && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-auto p-0 text-current hover:bg-black/10"
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        )}
      </div>
      
      {!persistent && (
        <Button
          variant="ghost"
          size="sm"
          className="h-auto p-0 text-current hover:bg-black/10"
          onClick={() => {
            setIsVisible(false)
            setTimeout(() => onClose?.(), 300)
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </motion.div>
  )
}

// Progress feedback component
interface ProgressFeedbackProps {
  value: number
  max?: number
  label?: string
  description?: string
  showPercentage?: boolean
  showETA?: boolean
  estimatedTimeRemaining?: number
  status?: 'active' | 'success' | 'error' | 'paused'
  className?: string
}

export function ProgressFeedback({
  value,
  max = 100,
  label,
  description,
  showPercentage = true,
  showETA = false,
  estimatedTimeRemaining,
  status = 'active',
  className
}: ProgressFeedbackProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)
  
  const statusColors = {
    active: 'bg-blue-600',
    success: 'bg-green-600',
    error: 'bg-red-600',
    paused: 'bg-yellow-600'
  }

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`
    return `${Math.round(seconds / 3600)}h`
  }

  return (
    <motion.div 
      className={cn('space-y-2', className)}
      {...animations.fadeInUp}
    >
      {(label || showPercentage || showETA) && (
        <div className="flex justify-between items-center text-sm">
          <span className="font-medium text-neutral-900">
            {label || 'Progress'}
          </span>
          <div className="flex items-center space-x-2 text-neutral-600">
            {showPercentage && (
              <span>{Math.round(percentage)}%</span>
            )}
            {showETA && estimatedTimeRemaining && (
              <span>ETA: {formatTime(estimatedTimeRemaining)}</span>
            )}
          </div>
        </div>
      )}
      
      <div className="w-full bg-neutral-200 rounded-full h-2 overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', statusColors[status])}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      
      {description && (
        <p className="text-xs text-neutral-600">{description}</p>
      )}
    </motion.div>
  )
}

// Connection status indicator
interface ConnectionStatusProps {
  isOnline: boolean
  lastSync?: Date
  syncInProgress?: boolean
  className?: string
}

export function ConnectionStatus({
  isOnline,
  lastSync,
  syncInProgress,
  className
}: ConnectionStatusProps) {
  const [showDetails, setShowDetails] = useState(false)

  const formatLastSync = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`
    return date.toLocaleDateString()
  }

  return (
    <div className={cn('relative', className)}>
      <Button
        variant="ghost"
        size="sm"
        className="h-auto p-2"
        onClick={() => setShowDetails(!showDetails)}
      >
        <div className="flex items-center space-x-2">
          {syncInProgress ? (
            <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
          ) : isOnline ? (
            <Wifi className="h-4 w-4 text-green-600" />
          ) : (
            <WifiOff className="h-4 w-4 text-red-600" />
          )}
          
          <span className="text-xs font-medium">
            {syncInProgress ? 'Syncing...' : isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </Button>

      <AnimatePresence>
        {showDetails && (
          <motion.div
            className="absolute top-full right-0 mt-2 p-3 bg-white border rounded-lg shadow-lg z-50 min-w-[200px]"
            {...animations.fadeInUp}
          >
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-neutral-600">Status:</span>
                <span className={cn(
                  'font-medium',
                  isOnline ? 'text-green-600' : 'text-red-600'
                )}>
                  {isOnline ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              
              {lastSync && (
                <div className="flex justify-between">
                  <span className="text-neutral-600">Last sync:</span>
                  <span className="font-medium">{formatLastSync(lastSync)}</span>
                </div>
              )}
              
              {syncInProgress && (
                <div className="flex items-center space-x-2 text-blue-600">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  <span>Synchronizing changes...</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// File upload progress
interface FileUploadProgressProps {
  files: Array<{
    name: string
    progress: number
    status: 'uploading' | 'success' | 'error'
    error?: string
  }>
  onRetry?: (fileName: string) => void
  onCancel?: (fileName: string) => void
  className?: string
}

export function FileUploadProgress({
  files,
  onRetry,
  onCancel,
  className
}: FileUploadProgressProps) {
  if (files.length === 0) return null

  return (
    <motion.div 
      className={cn('space-y-3', className)}
      {...animations.fadeInUp}
    >
      {files.map((file, index) => (
        <motion.div
          key={file.name}
          className="p-3 bg-white border rounded-lg shadow-sm"
          {...animations.staggerItem}
          transition={{ delay: index * 0.1 }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              {file.status === 'uploading' && (
                <Upload className="h-4 w-4 text-blue-600" />
              )}
              {file.status === 'success' && (
                <CheckCircle className="h-4 w-4 text-green-600" />
              )}
              {file.status === 'error' && (
                <AlertCircle className="h-4 w-4 text-red-600" />
              )}
              
              <span className="text-sm font-medium truncate max-w-[200px]">
                {file.name}
              </span>
            </div>
            
            <div className="flex items-center space-x-2">
              {file.status === 'uploading' && (
                <span className="text-xs text-neutral-600">
                  {Math.round(file.progress)}%
                </span>
              )}
              
              {file.status === 'error' && onRetry && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRetry(file.name)}
                  className="h-auto p-1"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              )}
              
              {onCancel && file.status === 'uploading' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onCancel(file.name)}
                  className="h-auto p-1"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
          
          {file.status === 'uploading' && (
            <Progress value={file.progress} className="h-1" />
          )}
          
          {file.status === 'error' && file.error && (
            <p className="text-xs text-red-600 mt-1">{file.error}</p>
          )}
        </motion.div>
      ))}
    </motion.div>
  )
}

// Action feedback (for button states)
interface ActionFeedbackProps {
  isLoading?: boolean
  isSuccess?: boolean
  isError?: boolean
  loadingText?: string
  successText?: string
  errorText?: string
  children: React.ReactNode
  className?: string
}

export function ActionFeedback({
  isLoading,
  isSuccess,
  isError,
  loadingText = 'Loading...',
  successText = 'Success!',
  errorText = 'Error',
  children,
  className
}: ActionFeedbackProps) {
  const [showSuccess, setShowSuccess] = useState(false)

  useEffect(() => {
    if (isSuccess) {
      setShowSuccess(true)
      const timer = setTimeout(() => setShowSuccess(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [isSuccess])

  return (
    <div className={cn('relative inline-flex', className)}>
      <AnimatePresence mode="wait">
        {isLoading && (
          <motion.div
            key="loading"
            className="flex items-center space-x-2"
            {...animations.fadeIn}
          >
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>{loadingText}</span>
          </motion.div>
        )}
        
        {showSuccess && (
          <motion.div
            key="success"
            className="flex items-center space-x-2 text-green-600"
            {...animations.fadeIn}
          >
            <CheckCircle className="h-4 w-4" />
            <span>{successText}</span>
          </motion.div>
        )}
        
        {isError && (
          <motion.div
            key="error"
            className="flex items-center space-x-2 text-red-600"
            {...animations.fadeIn}
          >
            <AlertCircle className="h-4 w-4" />
            <span>{errorText}</span>
          </motion.div>
        )}
        
        {!isLoading && !showSuccess && !isError && (
          <motion.div key="default" {...animations.fadeIn}>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// System status banner
interface SystemStatusProps {
  status: 'operational' | 'degraded' | 'maintenance' | 'outage'
  message?: string
  details?: string
  actionLabel?: string
  onAction?: () => void
  dismissible?: boolean
  onDismiss?: () => void
}

export function SystemStatus({
  status,
  message,
  details,
  actionLabel,
  onAction,
  dismissible,
  onDismiss
}: SystemStatusProps) {
  const statusConfig = {
    operational: {
      color: 'bg-green-50 border-green-200 text-green-800',
      icon: CheckCircle,
      iconColor: 'text-green-600'
    },
    degraded: {
      color: 'bg-yellow-50 border-yellow-200 text-yellow-800',
      icon: AlertTriangle,
      iconColor: 'text-yellow-600'
    },
    maintenance: {
      color: 'bg-blue-50 border-blue-200 text-blue-800',
      icon: Clock,
      iconColor: 'text-blue-600'
    },
    outage: {
      color: 'bg-red-50 border-red-200 text-red-800',
      icon: AlertCircle,
      iconColor: 'text-red-600'
    }
  }

  const config = statusConfig[status]
  const Icon = config.icon

  if (status === 'operational' && !message) return null

  return (
    <motion.div
      className={cn(
        'flex items-center justify-between p-4 border rounded-lg',
        config.color
      )}
      {...animations.fadeInDown}
    >
      <div className="flex items-start space-x-3">
        <Icon className={cn('h-5 w-5 flex-shrink-0 mt-0.5', config.iconColor)} />
        
        <div className="flex-1">
          <p className="text-sm font-medium">
            {message || `System is ${status}`}
          </p>
          {details && (
            <p className="text-sm opacity-90 mt-1">{details}</p>
          )}
        </div>
      </div>
      
      <div className="flex items-center space-x-2">
        {actionLabel && onAction && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onAction}
            className="text-current hover:bg-black/10"
          >
            {actionLabel}
          </Button>
        )}
        
        {dismissible && onDismiss && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="text-current hover:bg-black/10"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </motion.div>
  )
}

// Performance indicator
interface PerformanceIndicatorProps {
  metrics: {
    responseTime: number
    uptime: number
    errorRate: number
  }
  className?: string
}

export function PerformanceIndicator({
  metrics,
  className
}: PerformanceIndicatorProps) {
  const getResponseTimeColor = (time: number) => {
    if (time < 200) return 'text-green-600'
    if (time < 500) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getUptimeColor = (uptime: number) => {
    if (uptime >= 99.9) return 'text-green-600'
    if (uptime >= 99) return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <div className={cn('flex items-center space-x-4 text-xs', className)}>
      <div className="flex items-center space-x-1">
        <Zap className="h-3 w-3 text-neutral-400" />
        <span className="text-neutral-600">Response:</span>
        <span className={getResponseTimeColor(metrics.responseTime)}>
          {metrics.responseTime}ms
        </span>
      </div>
      
      <div className="flex items-center space-x-1">
        <CheckCircle className="h-3 w-3 text-neutral-400" />
        <span className="text-neutral-600">Uptime:</span>
        <span className={getUptimeColor(metrics.uptime)}>
          {metrics.uptime.toFixed(1)}%
        </span>
      </div>
      
      <div className="flex items-center space-x-1">
        <AlertTriangle className="h-3 w-3 text-neutral-400" />
        <span className="text-neutral-600">Errors:</span>
        <span className={metrics.errorRate > 1 ? 'text-red-600' : 'text-green-600'}>
          {metrics.errorRate.toFixed(2)}%
        </span>
      </div>
    </div>
  )
}