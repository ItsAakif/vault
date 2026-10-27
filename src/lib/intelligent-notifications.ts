import { db } from './db'
import { serverNotificationDelivery } from './notification-delivery'
import { Notification, User, UserPreferences } from '@prisma/client'

export interface NotificationCategory {
  id: string
  name: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  enabled: boolean
  channels: ('in-app' | 'email' | 'push' | 'sms')[]
  quietHours: boolean
  grouping: boolean
  batching: boolean
}

export interface NotificationGroup {
  id: string
  category: string
  title: string
  notifications: Notification[]
  createdAt: Date
  priority: 'low' | 'medium' | 'high' | 'urgent'
}

export interface NotificationBatch {
  id: string
  userId: string
  notifications: Notification[]
  scheduledFor: Date
  status: 'pending' | 'sent' | 'cancelled'
}

export interface QuietHours {
  enabled: boolean
  start: string // HH:MM format
  end: string   // HH:MM format
  days: number[] // 0-6, Sunday = 0
  exceptions: string[] // notification types that bypass quiet hours
}

export class IntelligentNotificationManager {
  // Get default notification categories
  getDefaultCategories(): NotificationCategory[] {
    return [
      {
        id: 'system',
        name: 'System',
        description: 'System updates and maintenance notifications',
        priority: 'medium',
        enabled: true,
        channels: ['in-app', 'email'],
        quietHours: false,
        grouping: true,
        batching: false
      },
      {
        id: 'project',
        name: 'Projects',
        description: 'Project updates, deadlines, and collaboration',
        priority: 'high',
        enabled: true,
        channels: ['in-app', 'push'],
        quietHours: true,
        grouping: true,
        batching: true
      },
      {
        id: 'calendar',
        name: 'Calendar',
        description: 'Event reminders and calendar updates',
        priority: 'high',
        enabled: true,
        channels: ['in-app', 'push'],
        quietHours: false,
        grouping: false,
        batching: false
      },
      {
        id: 'task',
        name: 'Tasks',
        description: 'Task assignments, due dates, and completions',
        priority: 'medium',
        enabled: true,
        channels: ['in-app', 'push'],
        quietHours: true,
        grouping: true,
        batching: true
      },
      {
        id: 'collaboration',
        name: 'Collaboration',
        description: 'Comments, mentions, and team updates',
        priority: 'medium',
        enabled: true,
        channels: ['in-app', 'email'],
        quietHours: true,
        grouping: true,
        batching: true
      },
      {
        id: 'security',
        name: 'Security',
        description: 'Security alerts and login notifications',
        priority: 'urgent',
        enabled: true,
        channels: ['in-app', 'email', 'sms'],
        quietHours: false,
        grouping: false,
        batching: false
      }
    ]
  }

  // Process notification with intelligent routing
  async processNotification(
    userId: string,
    notification: {
      type: string
      title: string
      message: string
      category?: string
      priority?: 'low' | 'medium' | 'high' | 'urgent'
      data?: any
    }
  ): Promise<void> {
    const user = await db.user.findUnique({
      where: { id: userId },
      include: { preferences: true }
    })

    if (!user) {
      throw new Error('User not found')
    }

    const categories = this.getUserCategories(user.preferences)
    const category = categories.find(c => c.id === notification.category) || categories[0]

    // Check if category is enabled
    if (!category.enabled) {
      return
    }

    // Check quiet hours
    if (category.quietHours && this.isQuietHours(user.preferences)) {
      await this.scheduleForLater(userId, notification)
      return
    }

    // Check rate limiting
    if (await this.isRateLimited(userId)) {
      await this.addToBatch(userId, notification)
      return
    }

    // Create notification
    const createdNotification = await this.createNotification(userId, notification, category)

    // Handle grouping
    if (category.grouping) {
      await this.handleGrouping(createdNotification, category)
    }

    // Handle batching
    if (category.batching) {
      await this.handleBatching(createdNotification, category)
    } else {
      // Send immediately
      await this.deliverNotification(createdNotification, category)
    }
  }

  // Group related notifications
  async handleGrouping(notification: Notification, category: NotificationCategory): Promise<void> {
    const groupWindow = 5 * 60 * 1000 // 5 minutes
    const cutoffTime = new Date(Date.now() - groupWindow)

    // Find existing group for this category
    const existingGroup = await db.notification.findFirst({
      where: {
        userId: notification.userId,
        category: notification.category,
        groupId: { not: null },
        createdAt: { gte: cutoffTime }
      }
    })

    let groupId: string

    if (existingGroup?.groupId) {
      groupId = existingGroup.groupId
    } else {
      groupId = `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }

    // Update notification with group ID
    await db.notification.update({
      where: { id: notification.id },
      data: { groupId }
    })

    // Update group summary
    await this.updateGroupSummary(groupId, notification.userId)
  }

  // Batch notifications for delivery
  async handleBatching(notification: Notification, category: NotificationCategory): Promise<void> {
    const batchWindow = 15 * 60 * 1000 // 15 minutes
    const scheduledTime = new Date(Date.now() + batchWindow)

    // Find or create batch
    let batch = await this.findOrCreateBatch(notification.userId, scheduledTime)

    // Add notification to batch
    await db.notification.update({
      where: { id: notification.id },
      data: { batchId: batch.id }
    })

    // Schedule batch delivery if not already scheduled
    if (batch.status === 'pending') {
      setTimeout(() => {
        this.deliverBatch(batch.id)
      }, batchWindow)
    }
  }

  // Check if user is in quiet hours
  isQuietHours(preferences: UserPreferences | null): boolean {
    if (!preferences?.quietHours) {
      return false
    }

    try {
      const quietHours: QuietHours = JSON.parse(preferences.quietHours as string)
      
      if (!quietHours.enabled) {
        return false
      }

      const now = new Date()
      const currentDay = now.getDay()
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

      // Check if current day is in quiet hours
      if (!quietHours.days.includes(currentDay)) {
        return false
      }

      // Check if current time is in quiet hours
      return currentTime >= quietHours.start && currentTime <= quietHours.end
    } catch {
      return false
    }
  }

  // Check if user has exceeded notification rate limit
  async isRateLimited(userId: string): Promise<boolean> {
    const user = await db.user.findUnique({
      where: { id: userId },
      include: { preferences: true }
    })

    if (!user?.preferences) {
      return false
    }

    const maxPerHour = user.preferences.maxNotificationsPerHour || 10
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    const recentCount = await db.notification.count({
      where: {
        userId,
        createdAt: { gte: oneHourAgo },
        deliveryStatus: { in: ['sent', 'delivered'] }
      }
    })

    return recentCount >= maxPerHour
  }

  // Get user's notification categories
  getUserCategories(preferences: UserPreferences | null): NotificationCategory[] {
    const defaultCategories = this.getDefaultCategories()

    if (!preferences?.notificationCategories) {
      return defaultCategories
    }

    try {
      const userCategories = JSON.parse(preferences.notificationCategories as string)
      return defaultCategories.map(category => ({
        ...category,
        ...userCategories[category.id]
      }))
    } catch {
      return defaultCategories
    }
  }

  // Create notification in database
  async createNotification(
    userId: string,
    notification: any,
    category: NotificationCategory
  ): Promise<Notification> {
    return await db.notification.create({
      data: {
        type: notification.type as any,
        title: notification.title,
        message: notification.message,
        category: category.id,
        priority: (notification.priority || category.priority).toUpperCase() as any,
        data: JSON.stringify(notification.data || {}),
        userId,
        deliveryStatus: 'pending'
      }
    })
  }

  // Deliver notification through appropriate channels
  async deliverNotification(notification: Notification, category: NotificationCategory): Promise<void> {
    const deliveryChannels: string[] = []

    for (const channel of category.channels) {
      try {
        switch (channel) {
          case 'in-app':
            // In-app notifications are already stored in database
            deliveryChannels.push('in-app')
            break

          case 'email': {
            const user = await db.user.findUnique({
              where: { id: notification.userId },
              select: { email: true }
            })
            if (!user?.email) throw new Error('User has no email address')
            await serverNotificationDelivery.sendEmail(user.email, notification.title, notification.message)
            deliveryChannels.push('email')
            break
          }

          case 'push':
            await serverNotificationDelivery.sendPushNotification(
              notification.userId,
              notification.title,
              notification.message
            )
            deliveryChannels.push('push')
            break

          case 'sms':
            await serverNotificationDelivery.sendSMS(
              notification.userId,
              notification.message
            )
            deliveryChannels.push('sms')
            break
        }
      } catch (error) {
        console.error(`Failed to deliver notification via ${channel}:`, error)
      }
    }

    // Update delivery status
    await db.notification.update({
      where: { id: notification.id },
      data: {
        deliveryStatus: deliveryChannels.length > 0 ? 'sent' : 'failed',
        deliveryChannels: JSON.stringify(deliveryChannels)
      }
    })
  }

  // Schedule notification for later delivery
  async scheduleForLater(userId: string, notification: any): Promise<void> {
    const user = await db.user.findUnique({
      where: { id: userId },
      include: { preferences: true }
    })

    if (!user?.preferences?.quietHours) {
      return
    }

    try {
      const quietHours: QuietHours = JSON.parse(user.preferences.quietHours as string)
      const now = new Date()
      const endTime = new Date()
      const [endHour, endMinute] = quietHours.end.split(':').map(Number)
      
      endTime.setHours(endHour, endMinute, 0, 0)
      
      // If end time is before current time, schedule for next day
      if (endTime <= now) {
        endTime.setDate(endTime.getDate() + 1)
      }

      // Create scheduled notification
      await db.notification.create({
        data: {
          type: notification.type as any,
          title: notification.title,
          message: notification.message,
          category: notification.category,
          priority: (notification.priority || 'medium').toUpperCase() as any,
          data: JSON.stringify({
            ...notification.data,
            scheduledFor: endTime.toISOString()
          }),
          userId,
          deliveryStatus: 'pending'
        }
      })
    } catch (error) {
      console.error('Failed to schedule notification:', error)
    }
  }

  // Add notification to batch
  async addToBatch(userId: string, notification: any): Promise<void> {
    const nextBatchTime = this.getNextBatchTime()
    const batch = await this.findOrCreateBatch(userId, nextBatchTime)

    await db.notification.create({
      data: {
        type: notification.type as any,
        title: notification.title,
        message: notification.message,
        category: notification.category,
        priority: (notification.priority || 'medium').toUpperCase() as any,
        data: JSON.stringify(notification.data || {}),
        batchId: batch.id,
        userId,
        deliveryStatus: 'pending'
      }
    })
  }

  // Find or create notification batch
  async findOrCreateBatch(userId: string, scheduledTime: Date): Promise<NotificationBatch> {
    // Try to find existing batch within 5 minutes of scheduled time
    const timeWindow = 5 * 60 * 1000
    const existingBatch = await db.notification.findFirst({
      where: {
        userId,
        batchId: { not: null },
        deliveryStatus: 'pending',
        data: {
          contains: `"scheduledFor":"${scheduledTime.toISOString()}"`
        }
      }
    })

    if (existingBatch?.batchId) {
      return {
        id: existingBatch.batchId,
        userId,
        notifications: [],
        scheduledFor: scheduledTime,
        status: 'pending'
      }
    }

    // Create new batch
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    return {
      id: batchId,
      userId,
      notifications: [],
      scheduledFor: scheduledTime,
      status: 'pending'
    }
  }

  // Deliver batched notifications
  async deliverBatch(batchId: string): Promise<void> {
    const notifications = await db.notification.findMany({
      where: {
        batchId,
        deliveryStatus: 'pending'
      }
    })

    if (notifications.length === 0) {
      return
    }

    const userId = notifications[0].userId
    const user = await db.user.findUnique({
      where: { id: userId },
      include: { preferences: true }
    })

    if (!user) {
      return
    }

    // Create batch summary notification
    const batchSummary = await db.notification.create({
      data: {
        type: 'SYSTEM',
        title: `${notifications.length} New Notifications`,
        message: this.createBatchSummary(notifications),
        category: 'system',
        priority: 'MEDIUM',
        data: JSON.stringify({
          batchId,
          notificationIds: notifications.map(n => n.id)
        }),
        userId,
        deliveryStatus: 'pending'
      }
    })

    // Deliver batch summary
    const categories = this.getUserCategories(user.preferences)
    const systemCategory = categories.find(c => c.id === 'system')!
    
    await this.deliverNotification(batchSummary, systemCategory)

    // Mark individual notifications as batched
    await db.notification.updateMany({
      where: { batchId },
      data: { deliveryStatus: 'sent' }
    })
  }

  // Update group summary
  async updateGroupSummary(groupId: string, userId: string): Promise<void> {
    const groupNotifications = await db.notification.findMany({
      where: { groupId, userId },
      orderBy: { createdAt: 'desc' }
    })

    if (groupNotifications.length <= 1) {
      return
    }

    const latestNotification = groupNotifications[0]
    const groupTitle = `${groupNotifications.length} ${latestNotification.category} updates`
    const groupMessage = this.createGroupSummary(groupNotifications)

    // Update the latest notification to be the group summary
    await db.notification.update({
      where: { id: latestNotification.id },
      data: {
        title: groupTitle,
        message: groupMessage,
        data: JSON.stringify({
          ...JSON.parse(latestNotification.data || '{}'),
          isGroupSummary: true,
          groupedNotifications: groupNotifications.slice(1).map(n => ({
            id: n.id,
            title: n.title,
            message: n.message
          }))
        })
      }
    })

    // Hide other notifications in the group
    await db.notification.updateMany({
      where: {
        groupId,
        id: { not: latestNotification.id }
      },
      data: {
        data: JSON.stringify({ hidden: true })
      }
    })
  }

  // Create batch summary message
  createBatchSummary(notifications: Notification[]): string {
    const categories = notifications.reduce((acc, notification) => {
      const category = notification.category || 'other'
      acc[category] = (acc[category] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const summaryParts = Object.entries(categories).map(([category, count]) => 
      `${count} ${category} update${count > 1 ? 's' : ''}`
    )

    return `You have ${summaryParts.join(', ')}.`
  }

  // Create group summary message
  createGroupSummary(notifications: Notification[]): string {
    const recentNotifications = notifications.slice(0, 3)
    const summary = recentNotifications.map(n => n.title).join(', ')
    
    if (notifications.length > 3) {
      return `${summary} and ${notifications.length - 3} more updates`
    }
    
    return summary
  }

  // Get next batch time based on user preferences
  getNextBatchTime(): Date {
    const now = new Date()
    const batchInterval = 15 * 60 * 1000 // 15 minutes
    
    return new Date(now.getTime() + batchInterval)
  }

  // Get notification history for analytics
  async getNotificationHistory(userId: string, days: number = 30): Promise<any> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    
    const notifications = await db.notification.findMany({
      where: {
        userId,
        createdAt: { gte: startDate }
      },
      orderBy: { createdAt: 'desc' }
    })

    const stats = {
      total: notifications.length,
      read: notifications.filter(n => n.read).length,
      unread: notifications.filter(n => !n.read).length,
      byCategory: notifications.reduce((acc, n) => {
        const category = n.category || 'other'
        acc[category] = (acc[category] || 0) + 1
        return acc
      }, {} as Record<string, number>),
      byPriority: notifications.reduce((acc, n) => {
        acc[n.priority] = (acc[n.priority] || 0) + 1
        return acc
      }, {} as Record<string, number>),
      responseTime: this.calculateAverageResponseTime(notifications)
    }

    return {
      notifications: notifications.slice(0, 50), // Return latest 50
      stats
    }
  }

  // Calculate average response time
  calculateAverageResponseTime(notifications: Notification[]): number {
    const readNotifications = notifications.filter(n => n.read && n.readAt)
    
    if (readNotifications.length === 0) {
      return 0
    }

    const totalResponseTime = readNotifications.reduce((sum, notification) => {
      const responseTime = new Date(notification.readAt!).getTime() - new Date(notification.createdAt).getTime()
      return sum + responseTime
    }, 0)

    return Math.round(totalResponseTime / readNotifications.length / (60 * 1000)) // Return in minutes
  }

  // Archive old notifications
  async archiveOldNotifications(userId: string, olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)
    
    const result = await db.notification.deleteMany({
      where: {
        userId,
        createdAt: { lt: cutoffDate },
        read: true
      }
    })

    return result.count
  }
}

// Singleton instance
export const intelligentNotificationManager = new IntelligentNotificationManager()