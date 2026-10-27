'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Wifi, 
  WifiOff, 
  Database, 
  RefreshCw, 
  Trash2, 
  Download,
  Upload,
  Clock,
  CheckCircle,
  AlertCircle,
  HardDrive
} from 'lucide-react'
import { useOffline } from '@/hooks/use-offline'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface OfflineStatusProps {
  className?: string
  showDetails?: boolean
  compact?: boolean
}

export function OfflineStatus({ className, showDetails = false, compact = false }: OfflineStatusProps) {
  const {
    isOnline,
    isInitialized,
    pendingOperations,
    cachedItems,
    storageUsed,
    lastSync,
    syncInProgress,
    forceSync,
    clearOfflineData,
    formatStorageSize
  } = useOffline()

  const getStatusInfo = () => {
    if (!isInitialized) {
      return {
        status: 'initializing',
        label: 'Initializing',
        description: 'Setting up offline functionality...',
        icon: RefreshCw,
        color: 'secondary' as const,
        bgColor: 'bg-blue-50'
      }
    }

    if (!isOnline) {
      return {
        status: 'offline',
        label: 'Offline',
        description: `${pendingOperations} changes queued for sync`,
        icon: WifiOff,
        color: 'destructive' as const,
        bgColor: 'bg-red-50'
      }
    }

    if (syncInProgress) {
      return {
        status: 'syncing',
        label: 'Syncing',
        description: 'Synchronizing offline changes...',
        icon: RefreshCw,
        color: 'secondary' as const,
        bgColor: 'bg-blue-50',
        animate: true
      }
    }

    if (pendingOperations > 0) {
      return {
        status: 'pending',
        label: 'Pending Sync',
        description: `${pendingOperations} changes waiting to sync`,
        icon: Upload,
        color: 'secondary' as const,
        bgColor: 'bg-yellow-50'
      }
    }

    return {
      status: 'online',
      label: 'Online',
      description: 'All changes synchronized',
      icon: Wifi,
      color: 'default' as const,
      bgColor: 'bg-green-50'
    }
  }

  const statusInfo = getStatusInfo()
  const StatusIcon = statusInfo.icon

  if (compact) {
    return (
      <div className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-md text-sm',
        statusInfo.bgColor,
        className
      )}>
        <StatusIcon 
          className={cn(
            'h-4 w-4',
            statusInfo.animate && 'animate-spin'
          )} 
        />
        <span className="font-medium">{statusInfo.label}</span>
        {pendingOperations > 0 && (
          <Badge variant="secondary" className="h-5 text-xs">
            {pendingOperations}
          </Badge>
        )}
      </div>
    )
  }

  if (!showDetails) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Badge variant={statusInfo.color} className="flex items-center gap-1">
          <StatusIcon 
            className={cn(
              'h-3 w-3',
              statusInfo.animate && 'animate-spin'
            )} 
          />
          {statusInfo.label}
        </Badge>
        {pendingOperations > 0 && (
          <Badge variant="outline" className="text-xs">
            {pendingOperations} pending
          </Badge>
        )}
      </div>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon 
              className={cn(
                'h-5 w-5',
                statusInfo.animate && 'animate-spin'
              )} 
            />
            <CardTitle className="text-base">{statusInfo.label}</CardTitle>
          </div>
          <Badge variant={statusInfo.color}>
            {isOnline ? 'Online' : 'Offline'}
          </Badge>
        </div>
        <CardDescription>{statusInfo.description}</CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Sync Status */}
        {syncInProgress && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Syncing changes...</span>
              <span>{pendingOperations} remaining</span>
            </div>
            <Progress value={pendingOperations > 0 ? 50 : 100} className="h-2" />
          </div>
        )}

        {/* Pending Operations Alert */}
        {pendingOperations > 0 && !syncInProgress && (
          <Alert>
            <Upload className="h-4 w-4" />
            <AlertDescription>
              {pendingOperations} changes are queued for synchronization.
              {isOnline && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={forceSync}
                  className="ml-2"
                >
                  Sync Now
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Offline Mode Alert */}
        {!isOnline && (
          <Alert>
            <WifiOff className="h-4 w-4" />
            <AlertDescription>
              You're working offline. Changes will be synchronized when you're back online.
            </AlertDescription>
          </Alert>
        )}

        {/* Storage Statistics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Database className="h-4 w-4" />
              Cached Items
            </div>
            <div className="text-2xl font-bold">{cachedItems}</div>
            <p className="text-xs text-muted-foreground">
              Available offline
            </p>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <HardDrive className="h-4 w-4" />
              Storage Used
            </div>
            <div className="text-2xl font-bold">
              {formatStorageSize(storageUsed)}
            </div>
            <p className="text-xs text-muted-foreground">
              Local storage
            </p>
          </div>
        </div>

        {/* Last Sync Info */}
        {lastSync && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Clock className="h-3 w-3" />
              <span>Last synced</span>
            </div>
            <span>{formatDistanceToNow(lastSync)} ago</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t">
          <Button
            size="sm"
            variant="outline"
            onClick={forceSync}
            disabled={!isOnline || syncInProgress}
            className="flex-1"
          >
            <RefreshCw className={cn(
              'h-3 w-3 mr-1',
              syncInProgress && 'animate-spin'
            )} />
            {syncInProgress ? 'Syncing...' : 'Force Sync'}
          </Button>
          
          <Button
            size="sm"
            variant="outline"
            onClick={clearOfflineData}
            className="flex-1"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear Cache
          </Button>
        </div>

        {/* Offline Capabilities */}
        {!isOnline && (
          <div className="space-y-2 pt-2 border-t">
            <h4 className="text-sm font-medium">Available Offline:</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                <span>View cached data</span>
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                <span>Create new items</span>
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                <span>Edit existing items</span>
              </div>
              <div className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3 text-orange-500" />
                <span>Limited search</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Simplified offline indicator for navigation
interface OfflineIndicatorProps {
  className?: string
}

export function OfflineIndicator({ className }: OfflineIndicatorProps) {
  const { isOnline, pendingOperations } = useOffline()

  if (isOnline && pendingOperations === 0) return null

  return (
    <div className={cn(
      'flex items-center gap-2 px-2 py-1 rounded-md text-xs',
      !isOnline ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800',
      className
    )}>
      {!isOnline ? (
        <>
          <WifiOff className="h-3 w-3" />
          <span>Offline</span>
        </>
      ) : (
        <>
          <Upload className="h-3 w-3" />
          <span>{pendingOperations} pending</span>
        </>
      )}
    </div>
  )
}

// Offline banner for full-width notifications
export function OfflineBanner() {
  const { isOnline, pendingOperations, forceSync, syncInProgress } = useOffline()

  if (isOnline && pendingOperations === 0) return null

  return (
    <div className={cn(
      'w-full px-4 py-2 text-sm flex items-center justify-between',
      !isOnline ? 'bg-red-50 text-red-800 border-b border-red-200' : 'bg-yellow-50 text-yellow-800 border-b border-yellow-200'
    )}>
      <div className="flex items-center gap-2">
        {!isOnline ? (
          <>
            <WifiOff className="h-4 w-4" />
            <span>You're working offline. Changes will sync when you're back online.</span>
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            <span>{pendingOperations} changes waiting to sync.</span>
          </>
        )}
      </div>
      
      {isOnline && pendingOperations > 0 && (
        <Button
          size="sm"
          variant="outline"
          onClick={forceSync}
          disabled={syncInProgress}
          className="h-7"
        >
          <RefreshCw className={cn(
            'h-3 w-3 mr-1',
            syncInProgress && 'animate-spin'
          )} />
          {syncInProgress ? 'Syncing...' : 'Sync Now'}
        </Button>
      )}
    </div>
  )
}