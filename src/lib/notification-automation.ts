import { db } from './db'
import { intelligentNotificationManager } from './intelligent-notifications'
import { serverNotificationDelivery } from './notification-delivery'

export interface NotificationRule {
  id: string
  name: string
  description: string
  enabled: boolean
  trigger: {
    type: 'event' | 'time' | 'condition' | 'user_action'
    event?: {
      entityType: string // 'task', 'project', 'calendar_event', etc.
      action: string     // 'created', 'updated', 'completed', 'due_soon', etc.
      conditions?: Record<string, any>
    }
    time?: {
      schedule: string   // cron expression
      timezone: string
    }
    condition?: {
      field: string
      operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains'
      value: any
    }
    userAction?: {
      action: string     // 'login', 'idle', 'active', etc.
      duration?: number  // in minutes
    }
  }
  actions: NotificationAction[]
  escalation?: EscalationRule[]
  filters?: NotificationFilter[]
  createdAt: Date
  updatedAt: Date
  userId: string
}

export interface NotificationAction {
  type: 'send_notification' | 'send_email' | 'send_sms' | 'create_task' | 'update_status'
  config: {
    title?: string
    message?: string
    priority?: 'low' | 'medium' | 'high' | 'urgent'
    category?: string
    channels?: ('in-app' | 'email' | 'push' | 'sms')[]
    delay?: number // in minutes
    template?: string
    recipients?: string[] // user IDs or email addresses
  }
}

export interface EscalationRule {
  delay: number // in minutes
  condition: 'not_read' | 'not_acknowledged' | 'no_response'
  action: NotificationAction
}

export interface NotificationFilter {
  field: string
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains'
  value: any
}

export interface NotificationSchedule {
  id: string
  ruleId: string
  userId: string
  scheduledFor: Date
  status: 'pending' | 'sent' | 'failed' | 'cancelled'
  attempts: number
  lastAttempt?: Date
  error?: string
}

export class NotificationAutomationEngine {
  // Create a new notification rule
  async createRule(userId: string, rule: Omit<NotificationRule, 'id' | 'createdAt' | 'updatedAt' | 'userId'>): Promise<NotificationRule> {
    const newRule: NotificationRule = {
      ...rule,
      id: `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      userId
    }

    // Store rule in user preferences
    await this.storeRule(newRule)

    // If it's a time-based rule, schedule it
    if (rule.trigger.type === 'time' && rule.trigger.time) {
      await this.scheduleTimeBasedRule(newRule)
    }

    return newRule
  }

  // Update an existing rule
  async updateRule(ruleId: string, updates: Partial<NotificationRule>): Promise<NotificationRule> {
    const rules = await this.getUserRules(updates.userId!)
    const ruleIndex = rules.findIndex(r => r.id === ruleId)
    
    if (ruleIndex === -1) {
      throw new Error('Rule not found')
    }

    const updatedRule = {
      ...rules[ruleIndex],
      ...updates,
      updatedAt: new Date()
    }

    rules[ruleIndex] = updatedRule
    await this.storeRules(updates.userId!, rules)

    return updatedRule
  }

  // Delete a rule
  async deleteRule(userId: string, ruleId: string): Promise<void> {
    const rules = await this.getUserRules(userId)
    const filteredRules = rules.filter(r => r.id !== ruleId)
    await this.storeRules(userId, filteredRules)

    // Cancel any scheduled notifications for this rule
    await this.cancelScheduledNotifications(ruleId)
  }

  // Get user's notification rules
  async getUserRules(userId: string): Promise<NotificationRule[]> {
    const preferences = await db.userPreferences.findUnique({
      where: { userId }
    })

    if (!preferences?.notificationCategories) {
      return []
    }

    try {
      const settings = JSON.parse(preferences.notificationCategories)
      return Array.isArray(settings.notificationRules) ? settings.notificationRules : []
    } catch {
      return []
    }
  }

  // Process event-based triggers
  async processEventTrigger(
    entityType: string,
    entityId: string,
    action: string,
    data: any,
    userId: string
  ): Promise<void> {
    const rules = await this.getUserRules(userId)
    const eventRules = rules.filter(rule => 
      rule.enabled &&
      rule.trigger.type === 'event' &&
      rule.trigger.event?.entityType === entityType &&
      rule.trigger.event?.action === action
    )

    for (const rule of eventRules) {
      if (await this.evaluateConditions(rule, data)) {
        await this.executeRule(rule, { entityType, entityId, action, data })
      }
    }
  }

  // Process condition-based triggers
  async processConditionTrigger(userId: string, context: any): Promise<void> {
    const rules = await this.getUserRules(userId)
    const conditionRules = rules.filter(rule => 
      rule.enabled && rule.trigger.type === 'condition'
    )

    for (const rule of conditionRules) {
      if (await this.evaluateConditions(rule, context)) {
        await this.executeRule(rule, context)
      }
    }
  }

  // Process user action triggers
  async processUserActionTrigger(userId: string, action: string, duration?: number): Promise<void> {
    const rules = await this.getUserRules(userId)
    const actionRules = rules.filter(rule => 
      rule.enabled &&
      rule.trigger.type === 'user_action' &&
      rule.trigger.userAction?.action === action
    )

    for (const rule of actionRules) {
      // Check duration if specified
      if (rule.trigger.userAction?.duration && duration) {
        if (duration < rule.trigger.userAction.duration) {
          continue
        }
      }

      await this.executeRule(rule, { action, duration })
    }
  }

  // Execute a notification rule
  async executeRule(rule: NotificationRule, context: any): Promise<void> {
    try {
      // Apply filters
      if (rule.filters && !this.applyFilters(rule.filters, context)) {
        return
      }

      // Execute actions
      for (const action of rule.actions) {
        await this.executeAction(rule, action, context)
      }

      // Set up escalation if configured
      if (rule.escalation && rule.escalation.length > 0) {
        await this.setupEscalation(rule, context)
      }

      // Log rule execution
      await this.logRuleExecution(rule.id, 'success', context)
    } catch (error) {
      await this.logRuleExecution(rule.id, 'error', context, error instanceof Error ? error.message : 'Unknown error')
    }
  }

  // Execute a specific action
  async executeAction(rule: NotificationRule, action: NotificationAction, context: any): Promise<void> {
    const delay = action.config.delay || 0
    
    if (delay > 0) {
      // Schedule for later execution
      setTimeout(() => {
        this.performAction(rule, action, context)
      }, delay * 60 * 1000)
    } else {
      await this.performAction(rule, action, context)
    }
  }

  // Perform the actual action
  async performAction(rule: NotificationRule, action: NotificationAction, context: any): Promise<void> {
    switch (action.type) {
      case 'send_notification':
        await this.sendNotificationAction(rule, action, context)
        break
      case 'send_email':
        await this.sendEmailAction(rule, action, context)
        break
      case 'send_sms':
        await this.sendSMSAction(rule, action, context)
        break
      case 'create_task':
        await this.createTaskAction(rule, action, context)
        break
      case 'update_status':
        await this.updateStatusAction(rule, action, context)
        break
    }
  }

  // Send notification action
  async sendNotificationAction(rule: NotificationRule, action: NotificationAction, context: any): Promise<void> {
    const title = this.interpolateTemplate(action.config.title || rule.name, context)
    const message = this.interpolateTemplate(action.config.message || rule.description, context)

    await intelligentNotificationManager.processNotification(rule.userId, {
      type: 'AUTOMATION',
      title,
      message,
      category: action.config.category || 'system',
      priority: action.config.priority || 'medium',
      data: {
        ruleId: rule.id,
        context
      }
    })
  }

  // Send email action
  async sendEmailAction(rule: NotificationRule, action: NotificationAction, context: any): Promise<void> {
    const title = this.interpolateTemplate(action.config.title || rule.name, context)
    const message = this.interpolateTemplate(action.config.message || rule.description, context)

    const recipients = action.config.recipients || [rule.userId]
    
    for (const recipient of recipients) {
      if (recipient.includes('@')) {
        // Email address
        await serverNotificationDelivery.sendEmail(recipient, title, message)
      } else {
        // User ID
        const user = await db.user.findUnique({ where: { id: recipient } })
        if (user?.email) {
          await serverNotificationDelivery.sendEmail(user.email, title, message)
        }
      }
    }
  }

  // Send SMS action
  async sendSMSAction(rule: NotificationRule, action: NotificationAction, context: any): Promise<void> {
    const message = this.interpolateTemplate(action.config.message || rule.description, context)
    
    const recipients = action.config.recipients || [rule.userId]
    
    for (const recipient of recipients) {
      await serverNotificationDelivery.sendSMS(recipient, message)
    }
  }

  // Create task action
  async createTaskAction(rule: NotificationRule, action: NotificationAction, context: any): Promise<void> {
    const title = this.interpolateTemplate(action.config.title || 'Automated Task', context)
    const description = this.interpolateTemplate(action.config.message || '', context)

    // Find a default project for the user
    const project = await db.project.findFirst({
      where: { userId: rule.userId },
      orderBy: { updatedAt: 'desc' }
    })

    if (project) {
      await db.task.create({
        data: {
          title,
          description,
          priority: (action.config.priority || 'medium').toUpperCase() as any,
          projectId: project.id,
          createdAt: new Date()
        }
      })
    }
  }

  // Update status action
  async updateStatusAction(rule: NotificationRule, action: NotificationAction, context: any): Promise<void> {
    if (context.entityType && context.entityId) {
      const status = action.config.message || 'updated'
      
      switch (context.entityType) {
        case 'task':
          await db.task.update({
            where: { id: context.entityId },
            data: { status: status.toUpperCase() as any }
          })
          break
        case 'project':
          await db.project.update({
            where: { id: context.entityId },
            data: { status: status.toUpperCase() as any }
          })
          break
      }
    }
  }

  // Set up escalation
  async setupEscalation(rule: NotificationRule, context: any): Promise<void> {
    if (!rule.escalation) return

    for (const escalation of rule.escalation) {
      setTimeout(async () => {
        // Check escalation condition
        if (await this.checkEscalationCondition(rule, escalation, context)) {
          await this.performAction(rule, escalation.action, context)
        }
      }, escalation.delay * 60 * 1000)
    }
  }

  // Check escalation condition
  async checkEscalationCondition(rule: NotificationRule, escalation: EscalationRule, context: any): Promise<boolean> {
    switch (escalation.condition) {
      case 'not_read':
        // Check if related notifications are still unread
        const unreadCount = await db.notification.count({
          where: {
            userId: rule.userId,
            read: false,
            data: { contains: `"ruleId":"${rule.id}"` }
          }
        })
        return unreadCount > 0

      case 'not_acknowledged':
        // Similar to not_read but could have different logic
        return true

      case 'no_response':
        // Check if user has taken any action
        return true

      default:
        return false
    }
  }

  // Evaluate rule conditions
  async evaluateConditions(rule: NotificationRule, data: any): Promise<boolean> {
    if (rule.trigger.event?.conditions) {
      for (const [field, expectedValue] of Object.entries(rule.trigger.event.conditions)) {
        if (data[field] !== expectedValue) {
          return false
        }
      }
    }

    if (rule.trigger.condition) {
      const condition = rule.trigger.condition
      const actualValue = data[condition.field]
      
      switch (condition.operator) {
        case 'equals':
          return actualValue === condition.value
        case 'not_equals':
          return actualValue !== condition.value
        case 'greater_than':
          return actualValue > condition.value
        case 'less_than':
          return actualValue < condition.value
        case 'contains':
          return String(actualValue).includes(String(condition.value))
        default:
          return false
      }
    }

    return true
  }

  // Apply filters
  applyFilters(filters: NotificationFilter[], data: any): boolean {
    for (const filter of filters) {
      const actualValue = data[filter.field]
      
      switch (filter.operator) {
        case 'equals':
          if (actualValue !== filter.value) return false
          break
        case 'not_equals':
          if (actualValue === filter.value) return false
          break
        case 'greater_than':
          if (actualValue <= filter.value) return false
          break
        case 'less_than':
          if (actualValue >= filter.value) return false
          break
        case 'contains':
          if (!String(actualValue).includes(String(filter.value))) return false
          break
      }
    }
    
    return true
  }

  // Interpolate template variables
  interpolateTemplate(template: string, context: any): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return context[key] || match
    })
  }

  // Schedule time-based rule
  async scheduleTimeBasedRule(rule: NotificationRule): Promise<void> {
    if (!rule.trigger.time) return

    // This would typically use a job scheduler like node-cron
    // For now, we'll just store the schedule
    const schedule: NotificationSchedule = {
      id: `schedule-${Date.now()}`,
      ruleId: rule.id,
      userId: rule.userId,
      scheduledFor: new Date(), // This would be calculated from cron expression
      status: 'pending',
      attempts: 0
    }

    // Store schedule (in a real implementation, this would be in a separate table)
    console.log('Scheduled rule:', schedule)
  }

  // Cancel scheduled notifications
  async cancelScheduledNotifications(ruleId: string): Promise<void> {
    // Cancel any pending schedules for this rule
    console.log('Cancelled schedules for rule:', ruleId)
  }

  // Store rule
  async storeRule(rule: NotificationRule): Promise<void> {
    const rules = await this.getUserRules(rule.userId)
    rules.push(rule)
    await this.storeRules(rule.userId, rules)
  }

  // Store rules
  async storeRules(userId: string, rules: NotificationRule[]): Promise<void> {
    // UserPreferences has no dedicated rules column; rules are kept inside the
    // existing JSON settings blob (notificationCategories) under a namespaced key.
    const preferences = await db.userPreferences.findUnique({ where: { userId } })
    let settings: Record<string, unknown> = {}
    try {
      settings = JSON.parse(preferences?.notificationCategories || '{}')
    } catch {
      settings = {}
    }
    settings.notificationRules = rules

    await db.userPreferences.upsert({
      where: { userId },
      create: {
        userId,
        notificationCategories: JSON.stringify(settings)
      },
      update: {
        notificationCategories: JSON.stringify(settings)
      }
    })
  }

  // Log rule execution
  async logRuleExecution(ruleId: string, status: 'success' | 'error', context: any, error?: string): Promise<void> {
    // In a real implementation, this would be stored in a separate audit table
    console.log('Rule execution:', { ruleId, status, context, error })
  }

  // Get predefined rule templates
  getRuleTemplates(): Partial<NotificationRule>[] {
    return [
      {
        name: 'Task Due Soon',
        description: 'Notify when a task is due within 24 hours',
        trigger: {
          type: 'condition',
          condition: {
            field: 'dueDate',
            operator: 'less_than',
            value: new Date(Date.now() + 24 * 60 * 60 * 1000)
          }
        },
        actions: [{
          type: 'send_notification',
          config: {
            title: 'Task Due Soon: {{title}}',
            message: 'Task "{{title}}" is due in less than 24 hours',
            priority: 'high',
            category: 'task'
          }
        }]
      },
      {
        name: 'Project Milestone Reached',
        description: 'Notify when project progress reaches a milestone',
        trigger: {
          type: 'event',
          event: {
            entityType: 'project',
            action: 'updated',
            conditions: { progress: 50 }
          }
        },
        actions: [{
          type: 'send_notification',
          config: {
            title: 'Milestone Reached: {{title}}',
            message: 'Project "{{title}}" has reached 50% completion',
            priority: 'medium',
            category: 'project'
          }
        }]
      },
      {
        name: 'Daily Summary',
        description: 'Send daily summary of tasks and events',
        trigger: {
          type: 'time',
          time: {
            schedule: '0 9 * * *', // 9 AM daily
            timezone: 'UTC'
          }
        },
        actions: [{
          type: 'send_email',
          config: {
            title: 'Daily Summary',
            message: 'Here\'s your daily summary of tasks and events',
            template: 'daily-summary'
          }
        }]
      },
      {
        name: 'Idle User Reminder',
        description: 'Remind user to check in after being idle',
        trigger: {
          type: 'user_action',
          userAction: {
            action: 'idle',
            duration: 120 // 2 hours
          }
        },
        actions: [{
          type: 'send_notification',
          config: {
            title: 'Time to Check In',
            message: 'You\'ve been away for a while. Any updates on your tasks?',
            priority: 'low',
            category: 'system'
          }
        }]
      }
    ]
  }

  // Analyze rule performance
  async analyzeRulePerformance(userId: string, days: number = 30): Promise<any> {
    const rules = await this.getUserRules(userId)
    
    // This would analyze rule execution logs
    return {
      totalRules: rules.length,
      activeRules: rules.filter(r => r.enabled).length,
      executionStats: {
        // Would be populated from execution logs
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0
      },
      topPerformingRules: [],
      recommendedOptimizations: []
    }
  }
}

// Singleton instance
export const notificationAutomationEngine = new NotificationAutomationEngine()