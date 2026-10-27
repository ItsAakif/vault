'use client'

import { useState, useEffect, useCallback } from 'react'
import { notificationManager } from '@/lib/notification-manager'
import type { Notification, NotificationChannel } from '@/lib/notification-manager'

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  isLoading: boolean
  channels: NotificationChannel[]
}

interface UseNotificationsOptions {
  autoMarkAsRead?: boolean
  maxNotifications?: number
  enableRealTime?: boolean
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const {
    autoMarkAsRead = false,
    maxNotifications = 50,
    enableRealTime = true
  } = options

  const [state, setState] = useState<NotificationState>({
    notifications: [],
    unreadCount: 0,
    isLoading: true,
    channels: []
  })

  // Load notifications from storage and API
  const loadNotifications = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }))

      // Load from localStorage first (for immediate display)
      const localNotifications = getLocalNotifications()
      
      // Load from API
      const response = await fetch('/api/notifications')
      const apiNotifications = response.ok ? await response.json() : []

      // Merge and deduplicate
      const allNotifications = mergeNotifications(localNotifications, apiNotifications)
        .slice(0, maxNotifications)

      const unreadCount = allNotifications.filter(n => !n.readAt).length

      setState(prev => ({
        ...prev,
        notifications: allNotifications,
        unreadCount,
        isLoading: false,
        channels: notificationManager.getChannels()
      }))
    } catch (error) {
      console.error('Failed to load notifications:', error)
      setState(prev => ({ ...prev, isLoading: false }))
    }
  }, [maxNotifications])

  // Send notification
  const sendNotification = useCallback(async (
    type: string,
    title: string,
    message: string,
    userId: string,
    options?: any
  ) => {
    try {
      const id = await notificationManager.sendNotification(
        type,
        title,
        message,
        userId,
        options
      )
      
      // Refresh notifications
      await loadNotifications()
      
      return id
    } catch (error) {
      console.error('Failed to send notification:', error)
      throw error
    }
  }, [loadNotifications])

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      // Update local state immediately
      setState(prev => ({
        ...prev,
        notifications: prev.notifications.map(n =>
          n.id === notificationId ? { ...n, readAt: new Date() } : n
        ),
        unreadCount: Math.max(0, prev.unreadCount - 1)
      }))

      // Update on server
      await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'POST'
      })

      // Update localStorage
      updateLocalNotification(notificationId, { readAt: new Date() })
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
    }
  }, [])

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      const unreadIds = state.notifications
        .filter(n => !n.readAt)
        .map(n => n.id)

      if (unreadIds.length === 0) return

      // Update local state immediately
      setState(prev => ({
        ...prev,
        notifications: prev.notifications.map(n => ({ ...n, readAt: new Date() })),
        unreadCount: 0
      }))

      // Update on server
      await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notificationIds: unreadIds })
      })

      // Update localStorage
      unreadIds.forEach(id => {
        updateLocalNotification(id, { readAt: new Date() })
      })
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error)
    }
  }, [state.notifications])

  // Delete notification
  const deleteNotification = useCallback(async (notificationId: string) => {
    try {
      // Update local state immediately
      setState(prev => {
        const notification = prev.notifications.find(n => n.id === notificationId)
        const wasUnread = notification && !notification.readAt
        
        return {
          ...prev,
          notifications: prev.notifications.filter(n => n.id !== notificationId),
          unreadCount: wasUnread ? Math.max(0, prev.unreadCount - 1) : prev.unreadCount
        }
      })

      // Delete on server
      await fetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE'
      })

      // Remove from localStorage
      removeLocalNotification(notificationId)
    } catch (error) {
      console.error('Failed to delete notification:', error)
    }
  }, [])

  // Clear all notifications
  const clearAll = useCallback(async () => {
    try {
      setState(prev => ({
        ...prev,
        notifications: [],
        unreadCount: 0
      }))

      // Clear on server
      await fetch('/api/notifications', {
        method: 'DELETE'
      })

      // Clear localStorage
      localStorage.removeItem('vault_notifications')
    } catch (error) {
      console.error('Failed to clear notifications:', error)
    }
  }, [])

  // Update channel settings
  const updateChannel = useCallback((channelId: string, updates: Partial<NotificationChannel>) => {
    notificationManager.updateChannel(channelId, updates)
    setState(prev => ({
      ...prev,
      channels: notificationManager.getChannels()
    }))
  }, [])

  // Request notification permission
  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      throw new Error('This browser does not support notifications')
    }

    if (Notification.permission === 'granted') {
      return true
    }

    if (Notification.permission === 'denied') {
      throw new Error('Notification permission denied')
    }

    const permission = await Notification.requestPermission()
    return permission === 'granted'
  }, [])

  // Subscribe to push notifications
  const subscribeToPush = useCallback(async () => {
    try {
      const hasPermission = await requestPermission()
      if (!hasPermission) {
        throw new Error('Notification permission required')
      }

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Push notifications not supported')
      }

      const registration = await navigator.serviceWorker.ready
      
      // Check if already subscribed
      const existingSubscription = await registration.pushManager.getSubscription()
      if (existingSubscription) {
        return existingSubscription
      }

      // Subscribe to push notifications
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      })

      // Send subscription to server
      await fetch('/api/notifications/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscription)
      })

      return subscription
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error)
      throw error
    }
  }, [requestPermission])

  // Real-time notification listener
  useEffect(() => {
    if (!enableRealTime) return

    const handleNewNotification = (event: CustomEvent) => {
      const notification = event.detail as Notification
      
      setState(prev => ({
        ...prev,
        notifications: [notification, ...prev.notifications].slice(0, maxNotifications),
        unreadCount: prev.unreadCount + 1
      }))

      // Auto-mark as read if enabled
      if (autoMarkAsRead) {
        setTimeout(() => markAsRead(notification.id), 3000)
      }
    }

    window.addEventListener('vault:notification', handleNewNotification as EventListener)
    
    return () => {
      window.removeEventListener('vault:notification', handleNewNotification as EventListener)
    }
  }, [enableRealTime, maxNotifications, autoMarkAsRead, markAsRead])

  // Load notifications on mount
  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Any cleanup needed
    }
  }, [])

  return {
    // State
    notifications: state.notifications,
    unreadCount: state.unreadCount,
    isLoading: state.isLoading,
    channels: state.channels,

    // Actions
    sendNotification,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    updateChannel,
    requestPermission,
    subscribeToPush,
    refresh: loadNotifications,

    // Utilities
    hasPermission: typeof window !== 'undefined' && 'Notification' in window 
      ? Notification.permission === 'granted'
      : false,
    supportsNotifications: typeof window !== 'undefined' && 'Notification' in window,
    supportsPush: typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
  }
}

// Utility functions
function getLocalNotifications(): Notification[] {
  try {
    const stored = localStorage.getItem('vault_notifications')
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function updateLocalNotification(id: string, updates: Partial<Notification>) {
  try {
    const notifications = getLocalNotifications()
    const index = notifications.findIndex(n => n.id === id)
    
    if (index !== -1) {
      notifications[index] = { ...notifications[index], ...updates }
      localStorage.setItem('vault_notifications', JSON.stringify(notifications))
    }
  } catch (error) {
    console.error('Failed to update local notification:', error)
  }
}

function removeLocalNotification(id: string) {
  try {
    const notifications = getLocalNotifications()
    const filtered = notifications.filter(n => n.id !== id)
    localStorage.setItem('vault_notifications', JSON.stringify(filtered))
  } catch (error) {
    console.error('Failed to remove local notification:', error)
  }
}

function mergeNotifications(local: Notification[], api: Notification[]): Notification[] {
  const merged = new Map<string, Notification>()
  
  // Add API notifications first (they're the source of truth)
  api.forEach(notification => {
    merged.set(notification.id, notification)
  })
  
  // Add local notifications that aren't in API response
  local.forEach(notification => {
    if (!merged.has(notification.id)) {
      merged.set(notification.id, notification)
    }
  })
  
  return Array.from(merged.values()).sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

// Hook for notification preferences
export function useNotificationPreferences() {
  const [preferences, setPreferences] = useState({
    emailEnabled: true,
    pushEnabled: true,
    inAppEnabled: true,
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '08:00'
    },
    categories: {
      tasks: true,
      projects: true,
      calendar: true,
      collaboration: true,
      system: false
    }
  })

  const updatePreferences = useCallback(async (updates: Partial<typeof preferences>) => {
    const newPreferences = { ...preferences, ...updates }
    setPreferences(newPreferences)
    
    try {
      await fetch('/api/user/notification-preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newPreferences)
      })
    } catch (error) {
      console.error('Failed to update notification preferences:', error)
    }
  }, [preferences])

  useEffect(() => {
    // Load preferences on mount
    fetch('/api/user/notification-preferences')
      .then(response => response.json())
      .then(setPreferences)
      .catch(console.error)
  }, [])

  return {
    preferences,
    updatePreferences
  }
}