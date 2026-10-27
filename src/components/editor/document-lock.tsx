'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Lock, 
  Unlock, 
  User, 
  Clock, 
  AlertTriangle,
  Shield,
  Key
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface DocumentLock {
  id: string
  entityType: string
  entityId: string
  field?: string
  lockedBy: {
    id: string
    name: string
    email: string
    avatar?: string
  }
  lockedAt: Date
  expiresAt?: Date
  reason?: string
  isActive: boolean
}

interface DocumentLockProps {
  entityType: string
  entityId: string
  field?: string
  currentLock?: DocumentLock
  canLock?: boolean
  canUnlock?: boolean
  onLock?: (reason?: string) => void
  onUnlock?: () => void
  onRequestUnlock?: () => void
  className?: string
}

export function DocumentLockManager({
  entityType,
  entityId,
  field,
  currentLock,
  canLock = true,
  canUnlock = false,
  onLock,
  onUnlock,
  onRequestUnlock,
  className
}: DocumentLockProps) {
  const [lockReason, setLockReason] = React.useState('')
  const [showLockDialog, setShowLockDialog] = React.useState(false)

  const isLocked = currentLock?.isActive
  const isOwnLock = currentLock?.lockedBy.id === 'current-user-id' // Replace with actual user ID
  const isExpired = currentLock?.expiresAt && new Date() > currentLock.expiresAt

  const handleLock = () => {
    if (onLock) {
      onLock(lockReason)
      setLockReason('')
      setShowLockDialog(false)
    }
  }

  const handleUnlock = () => {
    if (onUnlock) {
      onUnlock()
    }
  }

  const handleRequestUnlock = () => {
    if (onRequestUnlock) {
      onRequestUnlock()
    }
  }

  const getLockStatusInfo = () => {
    if (!isLocked) {
      return {
        status: 'unlocked',
        label: 'Unlocked',
        description: 'Document is available for editing',
        color: 'bg-green-100 text-green-800',
        icon: Unlock
      }
    }

    if (isExpired) {
      return {
        status: 'expired',
        label: 'Lock Expired',
        description: 'Lock has expired and can be removed',
        color: 'bg-orange-100 text-orange-800',
        icon: Clock
      }
    }

    if (isOwnLock) {
      return {
        status: 'own-lock',
        label: 'Locked by You',
        description: 'You have locked this document',
        color: 'bg-blue-100 text-blue-800',
        icon: Key
      }
    }

    return {
      status: 'locked',
      label: 'Locked',
      description: 'Document is locked by another user',
      color: 'bg-red-100 text-red-800',
      icon: Lock
    }
  }

  const statusInfo = getLockStatusInfo()
  const StatusIcon = statusInfo.icon

  return (
    <div className={cn('space-y-4', className)}>
      {/* Lock Status Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusIcon className="h-5 w-5" />
              <CardTitle className="text-base">{statusInfo.label}</CardTitle>
              <Badge className={statusInfo.color}>
                {statusInfo.status.replace('-', ' ')}
              </Badge>
            </div>
            
            <div className="flex items-center gap-2">
              {!isLocked && canLock && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowLockDialog(true)}
                >
                  <Lock className="h-3 w-3 mr-1" />
                  Lock
                </Button>
              )}
              
              {isLocked && isOwnLock && canUnlock && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleUnlock}
                >
                  <Unlock className="h-3 w-3 mr-1" />
                  Unlock
                </Button>
              )}
              
              {isLocked && !isOwnLock && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRequestUnlock}
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Request Unlock
                </Button>
              )}
            </div>
          </div>
          <CardDescription>{statusInfo.description}</CardDescription>
        </CardHeader>
        
        {currentLock && (
          <CardContent>
            <div className="flex items-start gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={currentLock.lockedBy.avatar} />
                <AvatarFallback>
                  {currentLock.lockedBy.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 space-y-2">
                <div>
                  <p className="font-medium text-sm">{currentLock.lockedBy.name}</p>
                  <p className="text-xs text-muted-foreground">{currentLock.lockedBy.email}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>Locked {formatDistanceToNow(currentLock.lockedAt)} ago</span>
                  </div>
                  
                  {currentLock.expiresAt && (
                    <div className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      <span>
                        Expires {formatDistanceToNow(currentLock.expiresAt)}
                      </span>
                    </div>
                  )}
                </div>
                
                {currentLock.reason && (
                  <div className="p-2 bg-muted rounded text-xs">
                    <strong>Reason:</strong> {currentLock.reason}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Lock Dialog */}
      {showLockDialog && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Lock Document
            </CardTitle>
            <CardDescription>
              Locking will prevent other users from editing this document
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">
                Reason for locking (optional)
              </label>
              <textarea
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                placeholder="e.g., Making major changes, reviewing content..."
                className="w-full mt-1 p-2 border rounded text-sm"
                rows={3}
              />
            </div>
            
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                Other users will be notified that you have locked this document.
                The lock will automatically expire after 2 hours of inactivity.
              </AlertDescription>
            </Alert>
            
            <div className="flex gap-2">
              <Button onClick={handleLock} className="flex-1">
                <Lock className="h-3 w-3 mr-1" />
                Lock Document
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setShowLockDialog(false)}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lock Warning for Other Users */}
      {isLocked && !isOwnLock && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            This document is currently locked by {currentLock?.lockedBy.name}.
            You cannot make changes until the lock is released.
            {currentLock?.reason && (
              <div className="mt-2 p-2 bg-muted rounded text-xs">
                <strong>Reason:</strong> {currentLock.reason}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

// Simplified lock indicator for showing in other components
interface LockIndicatorProps {
  isLocked: boolean
  lockedBy?: string
  onClick?: () => void
  className?: string
}

export function LockIndicator({ isLocked, lockedBy, onClick, className }: LockIndicatorProps) {
  if (!isLocked) return null

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className={cn('flex items-center gap-2', className)}
    >
      <Lock className="h-3 w-3" />
      {lockedBy ? `Locked by ${lockedBy}` : 'Locked'}
    </Button>
  )
}

// Hook for managing document locks
export function useDocumentLock(entityType: string, entityId: string, field?: string) {
  const [currentLock, setCurrentLock] = React.useState<DocumentLock | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)

  const fetchLockStatus = React.useCallback(async () => {
    try {
      const response = await fetch(`/api/locks/${entityType}/${entityId}${field ? `/${field}` : ''}`)
      if (response.ok) {
        const lock = await response.json()
        setCurrentLock(lock)
      }
    } catch (error) {
      console.error('Failed to fetch lock status:', error)
    }
  }, [entityType, entityId, field])

  const lockDocument = React.useCallback(async (reason?: string) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/locks/${entityType}/${entityId}${field ? `/${field}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      })
      
      if (response.ok) {
        const lock = await response.json()
        setCurrentLock(lock)
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to lock document:', error)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [entityType, entityId, field])

  const unlockDocument = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/locks/${entityType}/${entityId}${field ? `/${field}` : ''}`, {
        method: 'DELETE'
      })
      
      if (response.ok) {
        setCurrentLock(null)
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to unlock document:', error)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [entityType, entityId, field])

  const requestUnlock = React.useCallback(async () => {
    try {
      const response = await fetch(`/api/locks/${entityType}/${entityId}${field ? `/${field}` : ''}/request-unlock`, {
        method: 'POST'
      })
      
      return response.ok
    } catch (error) {
      console.error('Failed to request unlock:', error)
      return false
    }
  }, [entityType, entityId, field])

  React.useEffect(() => {
    fetchLockStatus()
    
    // Poll for lock status changes every 30 seconds
    const interval = setInterval(fetchLockStatus, 30000)
    return () => clearInterval(interval)
  }, [fetchLockStatus])

  return {
    currentLock,
    isLoading,
    lockDocument,
    unlockDocument,
    requestUnlock,
    refreshLockStatus: fetchLockStatus
  }
}