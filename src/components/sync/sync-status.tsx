'use client'

import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  Zap,
  CloudOff,
  Cloud
} from 'lucide-react'
import { useRealTimeSync } from '@/hooks/use-real-time-sync'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface SyncStatusProps {
  className?: string
  showDetails?: boolean
  compact?: boolean
}

export function SyncStatus({ className, showDetails = false, compact = false }: SyncStatusProps) {
  const {
    isConnected,
    isOnline,
    isSyncing,
    lastSync,
    pendingOperations,
    conflicts,
    forceSync
  } = useRealTimeSync()

  const getSyncStatusInfo = () => {
    if (!isOnline) {
      return {
        status: 'offline',
        label: 'Offline',
        description: 'No internet connection',
        icon: WifiOff,
        color: 'destructive' as const,
        bgColor: 'bg-destructive/10'
      }
    }

    if (!isConnected) {
      return {
        status: 'disconnected',
        label: 'Disconnected',
        description: 'Not connected to sync server',
        icon: CloudOff,
        color: 'destructive' as const,
        bgColor: 'bg-destructive/10'
      }
    }

    if (isSyncing) {
      return {
        status: 'syncing',
        label: 'Syncing',
        description: 'Synchronizing changes...',
        icon: RefreshCw,
        color: 'secondary' as const,
        bgColor: 'bg-blue-50',
        animate: true
      }
    }

    if (conflicts.length > 0) {
      return {
        status: 'conflicts',
        label: 'Conflicts',
        description: `${conflicts.length} sync conflicts need resolution`,
        icon: AlertCircle,
        color: 'destructive' as const,
        bgColor: 'bg-orange-50'
      }
    }

    if (pendingOperations > 0) {
      return {
        status: 'pending',
        label: 'Pending',
        description: `${pendingOperations} changes waiting to sync`,
        icon: Clock,
        color: 'secondary' as const,
        bgColor: 'bg-yellow-50'
      }
    }

    return {
      status: 'synced',
      label: 'Synced',
      description: lastSync ? `Last synced ${formatDistanceToNow(lastSync)} ago` : 'All changes synced',
      icon: CheckCircle,
      color: 'default' as const,
      bgColor: 'bg-green-50'
    }
  }

  const statusInfo = getSyncStatusInfo()
  const StatusIcon = statusInfo.icon

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              'flex items-center gap-2 px-2 py-1 rounded-md text-sm',
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
          </TooltipTrigger>
          <TooltipContent>
            <p>{statusInfo.description}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
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
        {conflicts.length > 0 && (
          <Badge variant="destructive" className="text-xs">
            {conflicts.length} conflicts
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
          <div className="flex items-center gap-2">
            {isOnline ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}
            {isConnected ? (
              <Cloud className="h-4 w-4 text-blue-500" />
            ) : (
              <CloudOff className="h-4 w-4 text-gray-400" />
            )}
          </div>
        </div>
        <CardDescription>{statusInfo.description}</CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Sync Progress */}
        {isSyncing && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Syncing changes...</span>
              <span>{pendingOperations} remaining</span>
            </div>
            <Progress value={pendingOperations > 0 ? 50 : 100} className="h-2" />
          </div>
        )}

        {/* Pending Operations */}
        {pendingOperations > 0 && !isSyncing && (
          <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-600" />
              <span className="text-sm font-medium">
                {pendingOperations} changes pending sync
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={forceSync}
              disabled={!isConnected || !isOnline}
            >
              <Zap className="h-3 w-3 mr-1" />
              Sync Now
            </Button>
          </div>
        )}

        {/* Conflicts */}
        {conflicts.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-orange-600">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">
                {conflicts.length} sync conflicts require attention
              </span>
            </div>
            <div className="space-y-1">
              {conflicts.slice(0, 3).map((conflict) => (
                <div key={conflict.operationId} className="text-xs text-muted-foreground p-2 bg-orange-50 rounded">
                  Conflict in {conflict.conflictingOperations[0]?.entity}: {conflict.conflictType}
                </div>
              ))}
              {conflicts.length > 3 && (
                <div className="text-xs text-muted-foreground">
                  +{conflicts.length - 3} more conflicts
                </div>
              )}
            </div>
          </div>
        )}

        {/* Last Sync Info */}
        {lastSync && statusInfo.status === 'synced' && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Last synced</span>
            <span>{formatDistanceToNow(lastSync)} ago</span>
          </div>
        )}

        {/* Connection Status */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className={cn(
              'w-2 h-2 rounded-full',
              isOnline ? 'bg-green-500' : 'bg-red-500'
            )} />
            <span className="text-muted-foreground">
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn(
              'w-2 h-2 rounded-full',
              isConnected ? 'bg-blue-500' : 'bg-gray-400'
            )} />
            <span className="text-muted-foreground">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={forceSync}
            disabled={!isConnected || !isOnline || isSyncing}
            className="flex-1"
          >
            <RefreshCw className={cn(
              'h-3 w-3 mr-1',
              isSyncing && 'animate-spin'
            )} />
            Force Sync
          </Button>
          {conflicts.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => {
                // Navigate to conflicts resolution page
                window.location.href = '/sync/conflicts'
              }}
            >
              <AlertCircle className="h-3 w-3 mr-1" />
              Resolve
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}