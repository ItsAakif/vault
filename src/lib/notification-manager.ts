'use client'

import { logger } from '@/lib/logger'

export interface NotificationChannel {
  id: string
  name: string
  type: 'in_app' | 'email' | 'push' | 'sms' | 'webhook'
  enabled: boolean
  config: Record<string, any>
}

export interface NotificationTemplate {
  id: string
  name: string
  subject: string
  body: string
  channels: string[]
  variables: string[]
}

export interface NotificationRule {
  id: string
  name: string
  trigger: string
  conditions: NotificationCondition[]
  actions: NotificationAction[]
  enabled: boolean
  priority: 'low' | 'medium' | 'high' | 'urgent'
}

export interface NotificationCondition {
  field: string
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in'
  value: any
}

export interface NotificationAction {
  type: 'send_notification' | 'create_task' | 'send_email' | 'webhook'
  config: Record<string, any>
}

export interface Notification {
  id: string
  type: string
  title: string
  message: string
  data?: Record<string, any>
  channels: string[]
  priority: 'low' | 'medium' | 'high' | 'urgent'
  scheduledFor?: Date
  sentAt?: Date
  readAt?: Date
  userId: string
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'read'
  retryCount: number
  createdAt: Date
  updatedAt: Date
}

export class NotificationManager {
  private channels: Map<string, NotificationChannel> = new Map()
  private templates: Map<string, NotificationTemplate> = new Map()
  private rules: Map<string, NotificationRule> = new Map()
  private queue: Notification[] = []
  private isProcessing = false

  constructor() {
    this.initializeDefaultChannels()
    this.initializeDefaultTemplates()
    this.startQueueProcessor()
  }

  // Channel Management
  private initializeDefaultChannels() {
    const defaultChannels: NotificationChannel[] = [
      {
        id: 'in_app',
        name: 'In-App Notifications',
        type: 'in_app',
        enabled: true,
        config: {
          showToast: true,
          persistInList: true,
          soundEnabled: true
        }
      },
      {
        id: 'email',
        name: 'Email Notifications',
        type: 'email',
        enabled: true,
        config: {
          fromAddress: 'noreply@vault.app',
          replyTo: 'support@vault.app',
          template: 'default'
        }
      },
      {
        id: 'push',
        name: 'Push Notifications',
        type: 'push',
        enabled: true,
        config: {
          icon: '/icon-192x192.png',
          badge: '/badge-72x72.png',
          vibrate: [100, 50, 100],
          requireInteraction: false
        }
      }
    ]

    defaultChannels.forEach(channel => {
      this.channels.set(channel.id, channel)
    })
  }

  private initializeDefaultTemplates() {
    const defaultTemplates: NotificationTemplate[] = [
      {
        id: 'task_due',
        name: 'Task Due Reminder',
        subject: 'Task Due: {{task.title}}',
        body: 'Your task "{{task.title}}" is due {{task.dueDate}}. Don\'t forget to complete it!',
        channels: ['in_app', 'email', 'push'],
        variables: ['task.title', 'task.dueDate', 'task.project']
      },
      {
        id: 'project_update',
        name: 'Project Update',
        subject: 'Project Update: {{project.title}}',
        body: 'There\'s been an update to your project "{{project.title}}": {{update.message}}',
        channels: ['in_app', 'email'],
        variables: ['project.title', 'update.message', 'update.author']
      },
      {
        id: 'calendar_reminder',
        name: 'Calendar Event Reminder',
        subject: 'Upcoming Event: {{event.title}}',
        body: 'Your event "{{event.title}}" starts in {{event.timeUntil}} at {{event.location}}.',
        channels: ['in_app', 'push'],
        variables: ['event.title', 'event.timeUntil', 'event.location']
      },
      {
        id: 'collaboration_invite',
        name: 'Collaboration Invite',
        subject: 'You\'ve been invited to collaborate',
        body: '{{inviter.name}} has invited you to collaborate on "{{project.title}}". Click to accept the invitation.',
        channels: ['in_app', 'email'],
        variables: ['inviter.name', 'project.title', 'invitation.role']
      }
    ]

    defaultTemplates.forEach(template => {
      this.templates.set(template.id, template)
    })
  }

  // Notification Creation and Sending
  async sendNotification(
    type: string,
    title: string,
    message: string,
    userId: string,
    options: {
      data?: Record<string, any>
      channels?: string[]
      priority?: 'low' | 'medium' | 'high' | 'urgent'
      scheduledFor?: Date
      templateId?: string
      templateData?: Record<string, any>
    } = {}
  ): Promise<string> {
    const notification: Notification = {
      id: this.generateId(),
      type,
      title,
      message,
      data: options.data,
      channels: options.channels || ['in_app'],
      priority: options.priority || 'medium',
      scheduledFor: options.scheduledFor,
      userId,
      status: 'pending',
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    // Apply template if specified
    if (options.templateId && options.templateData) {
      const template = this.templates.get(options.templateId)
      if (template) {
        notification.title = this.processTemplate(template.subject, options.templateData)
        notification.message = this.processTemplate(template.body, options.templateData)
        notification.channels = template.channels
      }
    }

    // Add to queue
    this.queue.push(notification)
    
    // Process immediately if not scheduled
    if (!notification.scheduledFor) {
      this.processQueue()
    }

    logger.info('Notification queued:', notification.id)
    return notification.id
  }

  async sendBulkNotifications(
    notifications: Array<{
      type: string
      title: string
      message: string
      userId: string
      options?: any
    }>
  ): Promise<string[]> {
    const ids = await Promise.all(
      notifications.map(notif => 
        this.sendNotification(
          notif.type,
          notif.title,
          notif.message,
          notif.userId,
          notif.options
        )
      )
    )

    return ids
  }

  // Queue Processing
  private startQueueProcessor() {
    setInterval(() => {
      this.processQueue()
    }, 5000) // Process every 5 seconds
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return

    this.isProcessing = true

    try {
      const now = new Date()
      const readyNotifications = this.queue.filter(notif => 
        notif.status === 'pending' && 
        (!notif.scheduledFor || notif.scheduledFor <= now)
      )

      for (const notification of readyNotifications) {
        await this.processNotification(notification)
      }

      // Remove processed notifications
      this.queue = this.queue.filter(notif => notif.status === 'pending')
    } catch (error) {
      logger.error('Queue processing error:', error)
    } finally {
      this.isProcessing = false
    }
  }

  private async processNotification(notification: Notification) {
    try {
      const results = await Promise.allSettled(
        notification.channels.map(channelId => 
          this.sendToChannel(notification, channelId)
        )
      )

      const hasFailures = results.some(result => result.status === 'rejected')
      
      if (hasFailures && notification.retryCount < 3) {
        // Retry failed notifications
        notification.retryCount++
        notification.updatedAt = new Date()
        logger.warn(`Notification ${notification.id} failed, retrying (${notification.retryCount}/3)`)
      } else {
        notification.status = hasFailures ? 'failed' : 'sent'
        notification.sentAt = new Date()
        notification.updatedAt = new Date()
        
        // Store in database
        await this.storeNotification(notification)
        
        logger.info(`Notification ${notification.id} processed:`, notification.status)
      }
    } catch (error) {
      logger.error(`Failed to process notification ${notification.id}:`, error)
      notification.status = 'failed'
      notification.updatedAt = new Date()
    }
  }

  private async sendToChannel(notification: Notification, channelId: string): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel || !channel.enabled) {
      throw new Error(`Channel ${channelId} not found or disabled`)
    }

    switch (channel.type) {
      case 'in_app':
        await this.sendInAppNotification(notification, channel)
        break
      case 'email':
        await this.sendEmailNotification(notification, channel)
        break
      case 'push':
        await this.sendPushNotification(notification, channel)
        break
      case 'sms':
        await this.sendSMSNotification(notification, channel)
        break
      case 'webhook':
        await this.sendWebhookNotification(notification, channel)
        break
      default:
        throw new Error(`Unsupported channel type: ${channel.type}`)
    }
  }

  // Channel-specific sending methods
  private async sendInAppNotification(notification: Notification, channel: NotificationChannel) {
    // Store in local storage or state management
    const inAppNotifications = this.getStoredNotifications()
    inAppNotifications.unshift({
      ...notification,
      channel: channel.id
    })
    
    // Keep only last 100 notifications
    if (inAppNotifications.length > 100) {
      inAppNotifications.splice(100)
    }
    
    localStorage.setItem('vault_notifications', JSON.stringify(inAppNotifications))
    
    // Show toast if enabled
    if (channel.config.showToast) {
      this.showToast(notification)
    }
    
    // Play sound if enabled
    if (channel.config.soundEnabled) {
      this.playNotificationSound()
    }
    
    // Dispatch custom event for real-time updates
    window.dispatchEvent(new CustomEvent('vault:notification', {
      detail: notification
    }))
  }

  private async sendEmailNotification(notification: Notification, channel: NotificationChannel) {
    try {
      const response = await fetch('/api/notifications/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: notification.userId, // This should be resolved to email address
          subject: notification.title,
          body: notification.message,
          data: notification.data,
          config: channel.config
        })
      })

      if (!response.ok) {
        throw new Error(`Email API error: ${response.statusText}`)
      }
    } catch (error) {
      logger.error('Email notification failed:', error)
      throw error
    }
  }

  private async sendPushNotification(notification: Notification, channel: NotificationChannel) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error('Push notifications not supported')
    }

    try {
      const registration = await navigator.serviceWorker.ready

      const options: NotificationOptions & {
        vibrate?: number[];
        actions?: Array<{ action: string; title: string; icon?: string }>;
      } = {
        body: notification.message,
        icon: channel.config.icon,
        badge: channel.config.badge,
        vibrate: channel.config.vibrate,
        requireInteraction: channel.config.requireInteraction,
        data: notification.data,
        actions: [
          {
            action: 'view',
            title: 'View',
            icon: '/icon-view.png'
          },
          {
            action: 'dismiss',
            title: 'Dismiss',
            icon: '/icon-dismiss.png'
          }
        ]
      }

      await registration.showNotification(notification.title, options)
    } catch (error) {
      logger.error('Push notification failed:', error)
      throw error
    }
  }

  private async sendSMSNotification(notification: Notification, channel: NotificationChannel) {
    try {
      const response = await fetch('/api/notifications/sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: notification.userId, // This should be resolved to phone number
          message: `${notification.title}: ${notification.message}`,
          config: channel.config
        })
      })

      if (!response.ok) {
        throw new Error(`SMS API error: ${response.statusText}`)
      }
    } catch (error) {
      logger.error('SMS notification failed:', error)
      throw error
    }
  }

  private async sendWebhookNotification(notification: Notification, channel: NotificationChannel) {
    try {
      const response = await fetch(channel.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...channel.config.headers
        },
        body: JSON.stringify({
          notification,
          timestamp: new Date().toISOString()
        })
      })

      if (!response.ok) {
        throw new Error(`Webhook error: ${response.statusText}`)
      }
    } catch (error) {
      logger.error('Webhook notification failed:', error)
      throw error
    }
  }

  // Template Processing
  private processTemplate(template: string, data: Record<string, any>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const value = this.getNestedValue(data, path.trim())
      return value !== undefined ? String(value) : match
    })
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj)
  }

  // Utility Methods
  private generateId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private getStoredNotifications(): any[] {
    try {
      const stored = localStorage.getItem('vault_notifications')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  }

  private showToast(notification: Notification) {
    // This would integrate with your toast system
    console.log('Toast:', notification.title, notification.message)
  }

  private playNotificationSound() {
    try {
      const audio = new Audio('/notification-sound.mp3')
      audio.volume = 0.3
      audio.play().catch(() => {
        // Ignore audio play failures (user interaction required)
      })
    } catch {
      // Ignore audio errors
    }
  }

  private async storeNotification(notification: Notification) {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notification)
      })
    } catch (error) {
      logger.error('Failed to store notification:', error)
    }
  }

  // Public API
  getChannels(): NotificationChannel[] {
    return Array.from(this.channels.values())
  }

  getTemplates(): NotificationTemplate[] {
    return Array.from(this.templates.values())
  }

  updateChannel(channelId: string, updates: Partial<NotificationChannel>) {
    const channel = this.channels.get(channelId)
    if (channel) {
      this.channels.set(channelId, { ...channel, ...updates })
    }
  }

  addTemplate(template: NotificationTemplate) {
    this.templates.set(template.id, template)
  }

  removeTemplate(templateId: string) {
    this.templates.delete(templateId)
  }

  // Rule-based notifications
  addRule(rule: NotificationRule) {
    this.rules.set(rule.id, rule)
  }

  removeRule(ruleId: string) {
    this.rules.delete(ruleId)
  }

  async evaluateRules(trigger: string, data: Record<string, any>) {
    const applicableRules = Array.from(this.rules.values()).filter(
      rule => rule.enabled && rule.trigger === trigger
    )

    for (const rule of applicableRules) {
      if (this.evaluateConditions(rule.conditions, data)) {
        await this.executeActions(rule.actions, data)
      }
    }
  }

  private evaluateConditions(conditions: NotificationCondition[], data: Record<string, any>): boolean {
    return conditions.every(condition => {
      const value = this.getNestedValue(data, condition.field)
      
      switch (condition.operator) {
        case 'equals':
          return value === condition.value
        case 'contains':
          return String(value).includes(String(condition.value))
        case 'greater_than':
          return Number(value) > Number(condition.value)
        case 'less_than':
          return Number(value) < Number(condition.value)
        case 'in':
          return Array.isArray(condition.value) && condition.value.includes(value)
        case 'not_in':
          return Array.isArray(condition.value) && !condition.value.includes(value)
        default:
          return false
      }
    })
  }

  private async executeActions(actions: NotificationAction[], data: Record<string, any>) {
    for (const action of actions) {
      switch (action.type) {
        case 'send_notification':
          await this.sendNotification(
            action.config.type || 'system',
            action.config.title || 'Notification',
            action.config.message || 'You have a new notification',
            data.userId,
            action.config
          )
          break
        // Add other action types as needed
      }
    }
  }

  // Cleanup
  cleanup() {
    // Clear any intervals or listeners
    this.queue = []
    this.channels.clear()
    this.templates.clear()
    this.rules.clear()
  }
}

export const notificationManager = new NotificationManager()
export default notificationManager