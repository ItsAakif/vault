'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Upload, 
  RefreshCw, 
  Trash2, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  FileText,
  Folder,
  Calendar,
  User,
  X
} from 'lucide-react'
import { useOffline } from '@/hooks/use-offline'
import { offlineStorage } from '@/lib/offline-storage'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

interface OfflineOperation {
  id: string
  type: 'create' | 'update' | 'delete'
  entity: string
  entityId: string
  data: any
  timestamp: Date
  userId: string
  synced: boolean
  retryCount: number
}

interface OfflineQueueProps {
  className?: string
  maxItems?: number
}

export function OfflineQueue({ className, maxItems = 10 }: OfflineQueueProps) {
  const [operations, setOperations] = React.useState<OfflineOperation[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  
  const {
    isOnline,
    pendingOperations,
    syncInProgress,
    forceSync
  } = useOffline()

  // Load pending operations
  const loadOperations = React.useCallback(async () => {
    try {
      setIsLoading(true)
      const pending = await offlineStorage.getPendingOperations()
      setOperations(pending.slice(0, maxItems))
    } catch (error) {
      console.error('Failed to load operations:', error)
    } finally {
      setIsLoading(false)
    }
  }, [maxItems])

  // Remove specific operation
  const removeOperation = async (operationId: string) => {
    try {
      await offlineStorage.removeOperation(operationId)
      await loadOperations()
    } catch (error) {
      console.error('Failed to remove operation:', error)
    }
  }

  // Get entity icon
  const getEntityIcon = (entity: string) => {
    switch (entity) {
      case 'project':
        return Folder
      case 'task':
        return CheckCircle
      case 'content':
        return FileText
      case 'calendar':
        return Calendar
      default:
        return FileText
    }
  }

  // Get operation color
  const getOperationColor = (type: string) => {
    switch (type) {
      case 'create':
        return 'text-green-600'
      case 'update':
        return 'text-blue-600'
      case 'delete':
        return 'text-red-600'
      default:
        return 'text-gray-600'
    }
  }

  // Get operation description
  const getOperationDescription = (operation: OfflineOperation) => {
    const entityName = operation.data?.title || operation.data?.name || operation.entityId
    
    switch (operation.type) {
      case 'create':
        return `Create ${operation.entity}: ${entityName}`
      case 'update':
        return `Update ${operation.entity}: ${entityName}`
      case 'delete':
        return `Delete ${operation.entity}: ${entityName}`
      default:
        return `${operation.type} ${operation.entity}`
    }
  }

  React.useEffect(() => {
    loadOperations()
  }, [loadOperations, pendingOperations])

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            <CardTitle className="text-base">Offline Queue</CardTitle>
            <Badge variant="secondary">
              {pendingOperations}
            </Badge>
          </div>
          
          {isOnline && pendingOperations > 0 && (
            <Button
              size="sm"
              onClick={forceSync}
              disabled={syncInProgress}
            >
              <RefreshCw className={cn(
                'h-3 w-3 mr-1',
                syncInProgress && 'animate-spin'
              )} />
              Sync All
            </Button>
          )}
        </div>
        
        <CardDescription>
          {pendingOperations === 0 
            ? 'All changes are synchronized'
            : `${pendingOperations} changes waiting to sync`
          }
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {operations.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">All Synced!</h3>
            <p className="text-muted-foreground">
              No pending changes in the offline queue
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {!isOnline && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  You're offline. Changes will be synchronized when you're back online.
                </AlertDescription>
              </Alert>
            )}
            
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {operations.map((operation) => {
                  const EntityIcon = getEntityIcon(operation.entity)
                  
                  return (
                    <div
                      key={operation.id}
                      className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50"
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        <EntityIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn(
                            'text-sm font-medium capitalize',
                            getOperationColor(operation.type)
                          )}>
                            {operation.type}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {operation.entity}
                          </Badge>
                          {operation.retryCount > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {operation.retryCount} retries
                            </Badge>
                          )}
                        </div>
                        
                        <p className="text-sm text-muted-foreground truncate">
                          {getOperationDescription(operation)}
                        </p>
                        
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{format(new Date(operation.timestamp), 'MMM dd, HH:mm')}</span>
                          </div>
                          
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            <span>You</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        {syncInProgress ? (
                          <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeOperation(operation.id)}
                            className="h-8 w-8 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
            
            {pendingOperations > maxItems && (
              <div className="text-center text-sm text-muted-foreground">
                Showing {maxItems} of {pendingOperations} operations
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Compact queue indicator
interface QueueIndicatorProps {
  className?: string
  onClick?: () => void
}

export function QueueIndicator({ className, onClick }: QueueIndicatorProps) {
  const { pendingOperations, syncInProgress } = useOffline()

  if (pendingOperations === 0) return null

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className={cn('flex items-center gap-2', className)}
    >
      {syncInProgress ? (
        <RefreshCw className="h-3 w-3 animate-spin" />
      ) : (
        <Upload className="h-3 w-3" />
      )}
      <span>{pendingOperations} queued</span>
    </Button>
  )
}

// Queue summary for dashboard
export function QueueSummary() {
  const { 
    pendingOperations, 
    syncInProgress, 
    isOnline,
    forceSync 
  } = useOffline()

  if (pendingOperations === 0) return null

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Upload className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <h3 className="font-medium">Offline Queue</h3>
              <p className="text-sm text-muted-foreground">
                {pendingOperations} changes waiting to sync
              </p>
            </div>
          </div>
          
          {isOnline && (
            <Button
              size="sm"
              onClick={forceSync}
              disabled={syncInProgress}
            >
              {syncInProgress ? (
                <>
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Upload className="h-3 w-3 mr-1" />
                  Sync Now
                </>
              )}
            </Button>
          )}
        </div>
        
        {syncInProgress && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Syncing changes...</span>
              <span>{pendingOperations} remaining</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1">
              <div 
                className="bg-blue-600 h-1 rounded-full transition-all duration-300"
                style={{ width: '50%' }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}