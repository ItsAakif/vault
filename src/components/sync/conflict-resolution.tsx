'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  AlertTriangle, 
  Users, 
  Clock, 
  CheckCircle, 
  X, 
  Merge,
  ArrowRight,
  User,
  Calendar
} from 'lucide-react'
import { useRealTimeSync } from '@/hooks/use-real-time-sync'
import { format, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface ConflictResolution {
  operationId: string
  conflictType: 'concurrent_edit' | 'version_mismatch' | 'dependency_conflict'
  conflictingOperations: Array<{
    id: string
    type: 'create' | 'update' | 'delete'
    entity: string
    entityId: string
    field?: string
    data: any
    userId: string
    timestamp: Date
    version: number
  }>
  resolution?: 'accept_local' | 'accept_remote' | 'merge' | 'manual'
  mergedData?: any
  resolvedAt?: Date
}

interface ConflictResolutionProps {
  conflicts?: ConflictResolution[]
  onResolve?: (operationId: string, resolution: string, mergedData?: any) => void
  className?: string
}

export function ConflictResolutionPanel({ 
  conflicts: externalConflicts, 
  onResolve: externalOnResolve,
  className 
}: ConflictResolutionProps) {
  const { conflicts: syncConflicts, resolveConflict } = useRealTimeSync()
  const [selectedConflict, setSelectedConflict] = React.useState<string | null>(null)
  const [mergedContent, setMergedContent] = React.useState<string>('')

  const conflicts = externalConflicts || syncConflicts
  const onResolve = externalOnResolve || resolveConflict

  const getConflictTypeInfo = (type: ConflictResolution['conflictType']) => {
    switch (type) {
      case 'concurrent_edit':
        return {
          label: 'Concurrent Edit',
          description: 'Multiple users edited the same content simultaneously',
          icon: Users,
          color: 'bg-orange-100 text-orange-800'
        }
      case 'version_mismatch':
        return {
          label: 'Version Mismatch',
          description: 'Changes were made to an outdated version',
          icon: Clock,
          color: 'bg-blue-100 text-blue-800'
        }
      case 'dependency_conflict':
        return {
          label: 'Dependency Conflict',
          description: 'Changes conflict with related data',
          icon: AlertTriangle,
          color: 'bg-red-100 text-red-800'
        }
      default:
        return {
          label: 'Unknown Conflict',
          description: 'An unknown conflict type occurred',
          icon: AlertTriangle,
          color: 'bg-gray-100 text-gray-800'
        }
    }
  }

  const handleResolve = async (
    operationId: string, 
    resolution: 'accept_local' | 'accept_remote' | 'merge'
  ) => {
    const conflict = conflicts.find(c => c.operationId === operationId)
    if (!conflict) return

    let mergedData = undefined
    if (resolution === 'merge') {
      // Create merged data from both operations
      const [localOp, remoteOp] = conflict.conflictingOperations
      mergedData = {
        ...remoteOp.data,
        ...localOp.data,
        // Add merge metadata
        _merged: true,
        _mergedAt: new Date().toISOString(),
        _mergedBy: 'user' // In real app, use actual user ID
      }
    }

    await onResolve(operationId, resolution, mergedData)
    setSelectedConflict(null)
    setMergedContent('')
  }

  const handleManualMerge = async (operationId: string) => {
    try {
      const parsedContent = JSON.parse(mergedContent)
      await onResolve(operationId, 'merge', parsedContent)
      setSelectedConflict(null)
      setMergedContent('')
    } catch (error) {
      console.error('Invalid JSON in merged content:', error)
    }
  }

  const formatOperationData = (data: any) => {
    if (typeof data === 'string') return data
    return JSON.stringify(data, null, 2)
  }

  if (conflicts.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Conflicts</h3>
          <p className="text-muted-foreground text-center">
            All changes are synchronized without conflicts
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {conflicts.length} sync conflict{conflicts.length > 1 ? 's' : ''} require{conflicts.length === 1 ? 's' : ''} your attention.
          Please review and resolve each conflict to continue syncing.
        </AlertDescription>
      </Alert>

      {conflicts.map((conflict) => {
        const typeInfo = getConflictTypeInfo(conflict.conflictType)
        const TypeIcon = typeInfo.icon
        const [localOp, remoteOp] = conflict.conflictingOperations
        const isSelected = selectedConflict === conflict.operationId

        return (
          <Card key={conflict.operationId} className={cn(
            'transition-all duration-200',
            isSelected && 'ring-2 ring-primary'
          )}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <TypeIcon className="h-5 w-5 mt-0.5 text-orange-600" />
                  <div>
                    <CardTitle className="text-base">{typeInfo.label}</CardTitle>
                    <CardDescription className="mt-1">
                      {typeInfo.description}
                    </CardDescription>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-xs">
                        {conflict.conflictingOperations[0].entity}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {conflict.conflictingOperations[0].field || 'Multiple fields'}
                      </Badge>
                    </div>
                  </div>
                </div>
                <Badge className={typeInfo.color}>
                  {conflict.conflictType.replace('_', ' ')}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Conflict Details */}
              <div className="grid gap-4 md:grid-cols-2">
                {/* Local Changes */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    <h4 className="font-medium text-sm">Your Changes</h4>
                    <Badge variant="secondary" className="text-xs">
                      v{localOp.version}
                    </Badge>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(localOp.timestamp), 'MMM dd, HH:mm')}
                    </div>
                    <pre className="text-xs whitespace-pre-wrap font-mono">
                      {formatOperationData(localOp.data)}
                    </pre>
                  </div>
                </div>

                {/* Remote Changes */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <h4 className="font-medium text-sm">Remote Changes</h4>
                    <Badge variant="secondary" className="text-xs">
                      v{remoteOp.version}
                    </Badge>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(remoteOp.timestamp), 'MMM dd, HH:mm')}
                    </div>
                    <pre className="text-xs whitespace-pre-wrap font-mono">
                      {formatOperationData(remoteOp.data)}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Resolution Options */}
              <div className="space-y-3 pt-4 border-t">
                <h4 className="font-medium text-sm">Resolution Options</h4>
                
                <div className="grid gap-2 md:grid-cols-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleResolve(conflict.operationId, 'accept_local')}
                    className="flex items-center gap-2"
                  >
                    <User className="h-3 w-3" />
                    Keep Mine
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleResolve(conflict.operationId, 'accept_remote')}
                    className="flex items-center gap-2"
                  >
                    <Users className="h-3 w-3" />
                    Keep Theirs
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleResolve(conflict.operationId, 'merge')}
                    className="flex items-center gap-2"
                  >
                    <Merge className="h-3 w-3" />
                    Auto Merge
                  </Button>
                </div>

                {/* Manual Merge Option */}
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedConflict(null)
                        setMergedContent('')
                      } else {
                        setSelectedConflict(conflict.operationId)
                        // Pre-populate with merged data
                        const merged = {
                          ...remoteOp.data,
                          ...localOp.data
                        }
                        setMergedContent(JSON.stringify(merged, null, 2))
                      }
                    }}
                    className="w-full flex items-center gap-2"
                  >
                    <ArrowRight className={cn(
                      'h-3 w-3 transition-transform',
                      isSelected && 'rotate-90'
                    )} />
                    Manual Merge
                  </Button>

                  {isSelected && (
                    <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                      <div>
                        <label className="text-sm font-medium">
                          Merged Content (JSON)
                        </label>
                        <Textarea
                          value={mergedContent}
                          onChange={(e) => setMergedContent(e.target.value)}
                          className="mt-1 font-mono text-xs"
                          rows={8}
                          placeholder="Edit the merged content..."
                        />
                      </div>
                      
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleManualMerge(conflict.operationId)}
                          disabled={!mergedContent.trim()}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Apply Merge
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedConflict(null)
                            setMergedContent('')
                          }}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// Simplified conflict indicator for showing in other components
interface ConflictIndicatorProps {
  conflictCount: number
  onClick?: () => void
  className?: string
}

export function ConflictIndicator({ conflictCount, onClick, className }: ConflictIndicatorProps) {
  if (conflictCount === 0) return null

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={onClick}
      className={cn('flex items-center gap-2', className)}
    >
      <AlertTriangle className="h-3 w-3" />
      {conflictCount} Conflict{conflictCount > 1 ? 's' : ''}
    </Button>
  )
}