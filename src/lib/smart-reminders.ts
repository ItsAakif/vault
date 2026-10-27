import { differenceInMinutes, differenceInHours, differenceInDays, addMinutes, addHours, addDays, isBefore, isAfter } from 'date-fns'
import { logger } from '@/lib/logger'

export interface Reminder {
  id: string
  entityType: 'task' | 'project' | 'event' | 'job_application' | 'deadline'
  entityId: string
  entityTitle: string
  reminderType: 'due_date' | 'deadline' | 'follow_up' | 'milestone' | 'custom'
  scheduledFor: Date
  triggerDate: Date
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  isRecurring: boolean
  recurringPattern?: {
    interval: 'minutes' | 'hours' | 'days' | 'weeks' | 'months'
    frequency: number
    endDate?: Date
  }
  userId: string
  channels: ('email' | 'push' | 'in_app' | 'sms')[]
  isActive: boolean
  isSent: boolean
  sentAt?: Date
  metadata?: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

export interface SmartReminderConfig {
  defaultLeadTimes: {
    task: number[] // minutes before due date
    project: number[] // days before deadline
    event: number[] // minutes before start
    job_application: number[] // days before deadline
    deadline: number[] // hours before deadline
  }
  adaptiveSettings: {
    enabled: boolean
    userBehaviorWeight: number // 0-1, how much to weight user's past behavior
    urgencyMultiplier: number // multiplier for high priority items
  }
  contextualFactors: {
    workingHours: { start: number; end: number } // 24-hour format
    weekends: boolean // send reminders on weekends
    holidays: string[] // ISO date strings for holidays
    timeZone: string
  }
}

export class SmartReminderEngine {
  private config: SmartReminderConfig
  private userBehaviorData: Map<string, UserBehaviorData> = new Map()
  private locationReminders: Map<string, LocationReminderEntry[]> = new Map()

  constructor(config: SmartReminderConfig) {
    this.config = config
  }

  /**
   * Generate smart reminders for an entity based on its properties and user behavior
   */
  async generateSmartReminders(
    entityType: Reminder['entityType'],
    entityId: string,
    entityTitle: string,
    targetDate: Date,
    userId: string,
    priority: Reminder['priority'] = 'MEDIUM',
    customOptions?: Partial<Reminder>
  ): Promise<Reminder[]> {
    try {
      const userBehavior = await this.getUserBehaviorData(userId)
      const baseReminders = this.getBaseReminders(entityType, targetDate)
      const adaptiveReminders = this.config.adaptiveSettings.enabled && userBehavior
        ? this.calculateAdaptiveReminders(baseReminders, userBehavior, priority)
        : baseReminders
      
      const optimizedTiming = this.optimizeReminderTiming(adaptiveReminders, userId)
      
      return optimizedTiming.map((scheduledFor, index) => ({
        id: `${entityId}-reminder-${index}`,
        entityType,
        entityId,
        entityTitle,
        reminderType: this.determineReminderType(entityType, scheduledFor, targetDate),
        scheduledFor,
        triggerDate: targetDate,
        priority,
        isRecurring: false,
        userId,
        channels: this.selectOptimalChannels(priority, scheduledFor, userBehavior),
        isActive: true,
        isSent: false,
        metadata: {
          generatedBy: 'smart-engine',
          adaptiveFactors: userBehavior ? Object.keys(userBehavior) : [],
          ...customOptions?.metadata
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        ...customOptions
      }))
    } catch (error) {
      logger.error('Failed to generate smart reminders:', error)
      return []
    }
  }

  /**
   * Create recurring reminders with intelligent patterns
   */
  createRecurringReminder(
    entityType: Reminder['entityType'],
    entityId: string,
    entityTitle: string,
    pattern: Reminder['recurringPattern'],
    userId: string,
    baseDate: Date = new Date()
  ): Reminder {
    const nextTrigger = this.calculateNextRecurrence(baseDate, pattern!)
    
    return {
      id: `${entityId}-recurring-${Date.now()}`,
      entityType,
      entityId,
      entityTitle,
      reminderType: 'custom',
      scheduledFor: nextTrigger,
      triggerDate: nextTrigger,
      priority: 'MEDIUM',
      isRecurring: true,
      recurringPattern: pattern,
      userId,
      channels: ['in_app', 'push'],
      isActive: true,
      isSent: false,
      metadata: {
        generatedBy: 'recurring-engine'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }

  /**
   * Create the default reminder set for a calendar event and schedule them.
   *
   * The reminder APIs have no target timestamp to hand, so the event's
   * reminders are generated relative to `now`; this mirrors the in-memory,
   * mock-persistence style of the rest of this engine.
   */
  async createEventReminders(eventId: string, userId: string): Promise<Reminder[]> {
    const reminders = await this.generateSmartReminders(
      'event',
      eventId,
      'Event',
      new Date(),
      userId
    )
    for (const reminder of reminders) {
      await this.scheduleReminder(reminder)
    }
    return reminders
  }

  /**
   * Create the default reminder set for a task and schedule them.
   */
  async createTaskReminders(taskId: string, userId: string): Promise<Reminder[]> {
    const reminders = await this.generateSmartReminders(
      'task',
      taskId,
      'Task',
      new Date(),
      userId
    )
    for (const reminder of reminders) {
      await this.scheduleReminder(reminder)
    }
    return reminders
  }

  /**
   * Register a location-based reminder for a user.
   */
  async createLocationReminder(
    title: string,
    location: LocationCoordinates,
    userId: string,
    message: string
  ): Promise<Reminder> {
    const now = new Date()
    const reminder: Reminder = {
      id: `location-${userId}-${Date.now()}`,
      entityType: 'event',
      entityId: `location-${location.latitude},${location.longitude}`,
      entityTitle: title,
      reminderType: 'custom',
      scheduledFor: now,
      triggerDate: now,
      priority: 'MEDIUM',
      isRecurring: false,
      userId,
      channels: ['in_app', 'push'],
      isActive: true,
      isSent: false,
      metadata: {
        generatedBy: 'location-engine',
        message,
        location,
      },
      createdAt: now,
      updatedAt: now,
    }

    const entries = this.locationReminders.get(userId) ?? []
    entries.push({ reminder, location })
    this.locationReminders.set(userId, entries)

    return reminder
  }

  /**
   * Evaluate registered location reminders against a reported position and
   * return the ones now within range.
   */
  async processLocationTriggers(
    userId: string,
    location: LocationCoordinates
  ): Promise<Reminder[]> {
    const entries = this.locationReminders.get(userId) ?? []
    const triggered: Reminder[] = []

    for (const entry of entries) {
      const distance = this.calculateDistanceMeters(location, entry.location)
      const radius = entry.location.radius ?? 100
      if (distance <= radius) {
        const now = new Date()
        triggered.push({
          ...entry.reminder,
          scheduledFor: now,
          triggerDate: now,
          updatedAt: now,
        })
      }
    }

    return triggered
  }

  /**
   * Postpone a reminder. The engine has no persistent reminder store, so the
   * resulting snooze window is returned to the caller.
   */
  async snoozeNotification(
    reminderId: string,
    duration?: string
  ): Promise<SnoozedReminder> {
    const durationMinutes = this.parseSnoozeDuration(duration)
    return {
      id: reminderId,
      durationMinutes,
      snoozedUntil: addMinutes(new Date(), durationMinutes),
    }
  }

  /**
   * Analyze a user's notification patterns.
   */
  async analyzeUserPatterns(userId: string): Promise<UserBehaviorData> {
    return this.analyzeUserBehavior(userId)
  }

  /**
   * Process and send due reminders
   */
  async processDueReminders(): Promise<void> {
    const now = new Date()
    const dueReminders = await this.getDueReminders(now)
    
    for (const reminder of dueReminders) {
      try {
        await this.sendReminder(reminder)
        await this.markReminderAsSent(reminder.id)
        
        // Handle recurring reminders
        if (reminder.isRecurring && reminder.recurringPattern) {
          const nextReminder = this.generateNextRecurringReminder(reminder)
          await this.scheduleReminder(nextReminder)
        }
        
        logger.info(`Reminder sent: ${reminder.id}`, {
          entityType: reminder.entityType,
          entityId: reminder.entityId,
          userId: reminder.userId
        })
      } catch (error) {
        logger.error(`Failed to send reminder ${reminder.id}:`, error)
      }
    }
  }

  /**
   * Analyze user behavior to improve reminder timing
   */
  async analyzeUserBehavior(userId: string): Promise<UserBehaviorData> {
    // This would analyze user's interaction patterns with reminders
    // For now, return mock data structure
    return {
      averageResponseTime: 30, // minutes
      preferredChannels: ['in_app', 'push'],
      activeHours: { start: 9, end: 17 },
      completionRate: 0.75,
      procrastinationPattern: 0.3, // 0-1, higher means more procrastination
      urgencyThreshold: 'HIGH'
    }
  }

  /**
   * Smart reminder scheduling based on context
   */
  private optimizeReminderTiming(baseTimes: Date[], userId: string): Date[] {
    const userBehavior = this.userBehaviorData.get(userId)
    if (!userBehavior) return baseTimes

    return baseTimes.map(time => {
      const optimizedTime = new Date(time)
      
      // Avoid sending during non-working hours
      const hour = optimizedTime.getHours()
      if (hour < this.config.contextualFactors.workingHours.start) {
        optimizedTime.setHours(this.config.contextualFactors.workingHours.start)
      } else if (hour > this.config.contextualFactors.workingHours.end) {
        optimizedTime.setDate(optimizedTime.getDate() + 1)
        optimizedTime.setHours(this.config.contextualFactors.workingHours.start)
      }
      
      // Avoid weekends if configured
      if (!this.config.contextualFactors.weekends) {
        const dayOfWeek = optimizedTime.getDay()
        if (dayOfWeek === 0 || dayOfWeek === 6) { // Sunday or Saturday
          const daysToAdd = dayOfWeek === 0 ? 1 : 2
          optimizedTime.setDate(optimizedTime.getDate() + daysToAdd)
        }
      }
      
      return optimizedTime
    })
  }

  /**
   * Select optimal channels based on priority and user behavior
   */
  private selectOptimalChannels(
    priority: Reminder['priority'],
    scheduledFor: Date,
    userBehavior?: UserBehaviorData
  ): Reminder['channels'] {
    const baseChannels: Reminder['channels'] = ['in_app']
    
    // Add push notifications for medium+ priority
    if (priority !== 'LOW') {
      baseChannels.push('push')
    }
    
    // Add email for high+ priority or if it's the user's preferred channel
    if (priority === 'HIGH' || priority === 'CRITICAL' ||
        userBehavior?.preferredChannels.includes('email')) {
      baseChannels.push('email')
    }
    
    // Add SMS for critical items only
    if (priority === 'CRITICAL') {
      baseChannels.push('sms')
    }
    
    return baseChannels
  }

  /**
   * Get base reminder times for different entity types
   */
  private getBaseReminders(entityType: Reminder['entityType'], targetDate: Date): Date[] {
    const leadTimes = this.config.defaultLeadTimes[entityType] || []
    const now = new Date()
    
    return leadTimes
      .map(leadTime => {
        switch (entityType) {
          case 'task':
          case 'event':
            return addMinutes(targetDate, -leadTime)
          case 'project':
          case 'job_application':
            return addDays(targetDate, -leadTime)
          case 'deadline':
            return addHours(targetDate, -leadTime)
          default:
            return addMinutes(targetDate, -leadTime)
        }
      })
      .filter(date => isAfter(date, now)) // Only future reminders
  }

  /**
   * Calculate adaptive reminders based on user behavior
   */
  private calculateAdaptiveReminders(
    baseReminders: Date[],
    userBehavior: UserBehaviorData,
    priority: Reminder['priority']
  ): Date[] {
    const adaptiveReminders = [...baseReminders]
    
    // Adjust based on user's procrastination pattern
    if (userBehavior.procrastinationPattern > 0.5) {
      // Add earlier reminders for procrastinators
      const earliestReminder = baseReminders[0]
      if (earliestReminder) {
        const extraReminder = addHours(earliestReminder, -2)
        adaptiveReminders.unshift(extraReminder)
      }
    }
    
    // Adjust based on completion rate
    if (userBehavior.completionRate < 0.5) {
      // Add more frequent reminders for users with low completion rates
      const additionalReminders = baseReminders.map(reminder => 
        addMinutes(reminder, -30)
      )
      adaptiveReminders.push(...additionalReminders)
    }
    
    // Adjust for high priority items
    if (priority === 'HIGH' || priority === 'CRITICAL') {
      const urgencyMultiplier = this.config.adaptiveSettings.urgencyMultiplier
      const urgentReminders = baseReminders.map(reminder => 
        addMinutes(reminder, -Math.floor(30 * urgencyMultiplier))
      )
      adaptiveReminders.unshift(...urgentReminders)
    }
    
    return adaptiveReminders.sort((a, b) => a.getTime() - b.getTime())
  }

  /**
   * Determine the type of reminder based on timing
   */
  private determineReminderType(
    entityType: Reminder['entityType'],
    scheduledFor: Date,
    targetDate: Date
  ): Reminder['reminderType'] {
    const timeDiff = differenceInMinutes(targetDate, scheduledFor)
    
    if (timeDiff <= 15) return 'deadline'
    if (timeDiff <= 60) return 'due_date'
    if (timeDiff <= 1440) return 'follow_up' // 24 hours
    return 'milestone'
  }

  /**
   * Calculate next recurrence date
   */
  private calculateNextRecurrence(
    baseDate: Date,
    pattern: Reminder['recurringPattern']
  ): Date {
    if (!pattern) return baseDate
    
    switch (pattern.interval) {
      case 'minutes':
        return addMinutes(baseDate, pattern.frequency)
      case 'hours':
        return addHours(baseDate, pattern.frequency)
      case 'days':
        return addDays(baseDate, pattern.frequency)
      case 'weeks':
        return addDays(baseDate, pattern.frequency * 7)
      case 'months':
        const nextMonth = new Date(baseDate)
        nextMonth.setMonth(nextMonth.getMonth() + pattern.frequency)
        return nextMonth
      default:
        return addDays(baseDate, 1)
    }
  }

  /**
   * Get user behavior data (would typically come from database)
   */
  private async getUserBehaviorData(userId: string): Promise<UserBehaviorData | undefined> {
    return this.userBehaviorData.get(userId)
  }

  /**
   * Mock methods for database operations (to be implemented with actual DB)
   */
  private async getDueReminders(now: Date): Promise<Reminder[]> {
    // This would query the database for reminders due now
    return []
  }

  private async sendReminder(reminder: Reminder): Promise<void> {
    // This would send the reminder through appropriate channels
    logger.info(`Sending reminder: ${reminder.id}`)
  }

  private async markReminderAsSent(reminderId: string): Promise<void> {
    // This would update the reminder in the database
    logger.info(`Marked reminder as sent: ${reminderId}`)
  }

  private async scheduleReminder(reminder: Reminder): Promise<void> {
    // This would save the reminder to the database
    logger.info(`Scheduled reminder: ${reminder.id}`)
  }

  /**
   * Great-circle distance between two coordinates, in metres.
   */
  private calculateDistanceMeters(a: LocationCoordinates, b: LocationCoordinates): number {
    const earthRadius = 6371000
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180
    const dLat = toRadians(b.latitude - a.latitude)
    const dLon = toRadians(b.longitude - a.longitude)
    const lat1 = toRadians(a.latitude)
    const lat2 = toRadians(b.latitude)

    const haversine =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2

    return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(haversine)))
  }

  /**
   * Parse snooze durations such as "15m", "1h" or "1d" into minutes.
   */
  private parseSnoozeDuration(duration?: string): number {
    if (!duration) return 15

    const match = /^(\d+)\s*(m|min|minutes?|h|hours?|d|days?)?$/i.exec(duration.trim())
    if (!match) return 15

    const value = parseInt(match[1], 10)
    const unit = (match[2] ?? 'm').toLowerCase()

    if (unit.startsWith('d')) return value * 60 * 24
    if (unit.startsWith('h')) return value * 60
    return value
  }

  private generateNextRecurringReminder(reminder: Reminder): Reminder {
    const nextTrigger = this.calculateNextRecurrence(
      reminder.triggerDate,
      reminder.recurringPattern!
    )
    
    return {
      ...reminder,
      id: `${reminder.entityId}-recurring-${Date.now()}`,
      scheduledFor: nextTrigger,
      triggerDate: nextTrigger,
      isSent: false,
      sentAt: undefined,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }
}

export interface LocationCoordinates {
  latitude: number
  longitude: number
  radius?: number
}

interface LocationReminderEntry {
  reminder: Reminder
  location: LocationCoordinates
}

export interface SnoozedReminder {
  id: string
  durationMinutes: number
  snoozedUntil: Date
}

/**
 * User behavior data interface
 */
interface UserBehaviorData {  averageResponseTime: number // minutes
  preferredChannels: Reminder['channels']
  activeHours: { start: number; end: number }
  completionRate: number // 0-1
  procrastinationPattern: number // 0-1, higher means more procrastination
  urgencyThreshold: Reminder['priority']
}

/**
 * Default configuration for smart reminders
 */
export const defaultSmartReminderConfig: SmartReminderConfig = {
  defaultLeadTimes: {
    task: [15, 60, 1440], // 15 min, 1 hour, 1 day before
    project: [7, 3, 1], // 7, 3, 1 days before
    event: [15, 60], // 15 min, 1 hour before
    job_application: [7, 3, 1], // 7, 3, 1 days before
    deadline: [2, 24, 48] // 2, 24, 48 hours before
  },
  adaptiveSettings: {
    enabled: true,
    userBehaviorWeight: 0.7,
    urgencyMultiplier: 1.5
  },
  contextualFactors: {
    workingHours: { start: 9, end: 17 },
    weekends: false,
    holidays: [],
    timeZone: 'UTC'
  }
}

/**
 * Create and export a default smart reminder engine instance
 */
export const smartReminderEngine = new SmartReminderEngine(defaultSmartReminderConfig)

// Export as smartReminderSystem for backward compatibility
export const smartReminderSystem = smartReminderEngine