import nodemailer from 'nodemailer'
import { log } from '@/lib/production-logger'
import { logger } from '@/lib/logger'

export interface EmailConfig {
  provider: 'smtp' | 'sendgrid' | 'mailgun' | 'ses'
  smtp?: {
    host: string
    port: number
    secure: boolean
    auth: {
      user: string
      pass: string
    }
  }
  sendgrid?: {
    apiKey: string
  }
  mailgun?: {
    apiKey: string
    domain: string
  }
  ses?: {
    region: string
    accessKeyId: string
    secretAccessKey: string
  }
  from: {
    name: string
    email: string
  }
  replyTo?: string
}

export interface EmailTemplate {
  id: string
  name: string
  subject: string
  htmlTemplate: string
  textTemplate?: string
  variables: string[]
}

export interface EmailNotification {
  id: string
  to: string | string[]
  cc?: string | string[]
  bcc?: string | string[]
  subject: string
  template?: string
  templateData?: Record<string, any>
  html?: string
  text?: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  scheduledFor?: Date
  attachments?: Array<{
    filename: string
    content: Buffer | string
    contentType?: string
  }>
  metadata?: Record<string, any>
  userId?: string
  entityType?: string
  entityId?: string
}

export interface EmailDeliveryStatus {
  id: string
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'complained'
  sentAt?: Date
  deliveredAt?: Date
  failedAt?: Date
  error?: string
  attempts: number
  lastAttemptAt?: Date
  nextRetryAt?: Date
}

class EmailNotificationService {
  private config: EmailConfig
  private transporter: any = null
  private transporterError: Error | null = null
  private initPromise: Promise<void> | null = null
  private templates: Map<string, EmailTemplate> = new Map()
  private deliveryQueue: EmailNotification[] = []
  private deliveryStatus: Map<string, EmailDeliveryStatus> = new Map()
  private isProcessing = false
  private maxRetries = 3
  private retryDelays = [1000, 5000, 15000] // 1s, 5s, 15s

  constructor(config: EmailConfig) {
    this.config = config
    // Transporter initialization is intentionally lazy (see ensureTransporter).
    // Constructing the service - and therefore importing this module - must never
    // perform network I/O or throw, so a missing/unreachable SMTP server cannot
    // crash the process at module load time.
    this.registerDefaultTemplates()
    this.startQueueProcessor()
  }

  /**
   * Initialize email transporter based on provider
   */
  private async initializeTransporter() {
    try {
      switch (this.config.provider) {
        case 'smtp':
          if (!this.config.smtp) {
            throw new Error('SMTP configuration is required')
          }
          this.transporter = nodemailer.createTransport({
            host: this.config.smtp.host,
            port: this.config.smtp.port,
            secure: this.config.smtp.secure,
            auth: {
              user: this.config.smtp.auth.user,
              pass: this.config.smtp.auth.pass
            }
          })
          break

        case 'sendgrid':
          // Would implement SendGrid API integration
          throw new Error('SendGrid provider not yet implemented')

        case 'mailgun':
          // Would implement Mailgun API integration
          throw new Error('Mailgun provider not yet implemented')

        case 'ses':
          // Would implement AWS SES integration
          throw new Error('AWS SES provider not yet implemented')

        default:
          throw new Error(`Unsupported email provider: ${this.config.provider}`)
      }

      // Verify connection
      if (this.transporter && this.transporter.verify) {
        await this.transporter.verify()
        log.info('Email service initialized successfully', {
          provider: this.config.provider,
          from: this.config.from.email
        })
      }
    } catch (error) {
      // Non-fatal: record the failure and leave the transporter unset so that a
      // later send attempt surfaces a descriptive error to the retry machinery
      // instead of producing an unhandled rejection at module load.
      this.transporter = null
      this.transporterError = error instanceof Error ? error : new Error(String(error))
      log.warn('Failed to initialize email service; email delivery will fail until configuration is corrected', {
        provider: this.config.provider,
        error: this.transporterError.message
      })
    }
  }

  /**
   * Lazily resolve the transporter, initializing it on first use.
   *
   * Initialization never throws: failures are logged and cached, and callers
   * receive a descriptive Error only when a send is actually attempted.
   */
  private async ensureTransporter(): Promise<any> {
    if (this.transporter) {
      return this.transporter
    }

    if (!this.initPromise) {
      this.initPromise = this.initializeTransporter().finally(() => {
        this.initPromise = null
      })
    }
    await this.initPromise

    if (!this.transporter) {
      const reason = this.transporterError?.message || 'Email transporter is not configured'
      throw new Error(`Email transporter is not available: ${reason}`)
    }

    return this.transporter
  }

  /**
   * Register email templates
   */
  registerTemplate(template: EmailTemplate): void {
    this.templates.set(template.id, template)
    log.info('Email template registered', { templateId: template.id, name: template.name })
  }

  /**
   * Send email notification
   */
  async sendEmail(notification: Omit<EmailNotification, 'id'>): Promise<string> {
    const emailId = this.generateEmailId()
    const emailNotification: EmailNotification = {
      ...notification,
      id: emailId
    }

    // Add to delivery queue
    this.deliveryQueue.push(emailNotification)
    
    // Initialize delivery status
    this.deliveryStatus.set(emailId, {
      id: emailId,
      status: 'pending',
      attempts: 0
    })

    log.info('Email queued for delivery', {
      emailId,
      to: Array.isArray(notification.to) ? notification.to.join(', ') : notification.to,
      subject: notification.subject,
      priority: notification.priority
    })

    // Process immediately for high priority emails
    if (notification.priority === 'urgent' || notification.priority === 'high') {
      this.processQueue()
    }

    return emailId
  }

  /**
   * Send templated email
   */
  async sendTemplatedEmail(
    to: string | string[],
    templateId: string,
    templateData: Record<string, any>,
    options: Partial<EmailNotification> = {}
  ): Promise<string> {
    const template = this.templates.get(templateId)
    if (!template) {
      throw new Error(`Template not found: ${templateId}`)
    }

    const compiledSubject = this.compileTemplate(template.subject, templateData)
    const compiledHtml = this.compileTemplate(template.htmlTemplate, templateData)
    const compiledText = template.textTemplate 
      ? this.compileTemplate(template.textTemplate, templateData)
      : undefined

    return this.sendEmail({
      to,
      subject: compiledSubject,
      html: compiledHtml,
      text: compiledText,
      template: templateId,
      templateData,
      priority: 'normal',
      ...options
    })
  }

  /**
   * Get delivery status
   */
  getDeliveryStatus(emailId: string): EmailDeliveryStatus | undefined {
    return this.deliveryStatus.get(emailId)
  }

  /**
   * Cancel scheduled email
   */
  cancelEmail(emailId: string): boolean {
    const index = this.deliveryQueue.findIndex(email => email.id === emailId)
    if (index !== -1) {
      this.deliveryQueue.splice(index, 1)
      
      const status = this.deliveryStatus.get(emailId)
      if (status && status.status === 'pending') {
        this.deliveryStatus.set(emailId, {
          ...status,
          status: 'failed',
          error: 'Cancelled by user',
          failedAt: new Date()
        })
        return true
      }
    }
    return false
  }

  /**
   * Process email queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.deliveryQueue.length === 0) {
      return
    }

    this.isProcessing = true

    try {
      // Sort by priority and scheduled time
      this.deliveryQueue.sort((a, b) => {
        const priorityOrder = { urgent: 4, high: 3, normal: 2, low: 1 }
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority]
        
        if (priorityDiff !== 0) return priorityDiff
        
        const aTime = a.scheduledFor?.getTime() || Date.now()
        const bTime = b.scheduledFor?.getTime() || Date.now()
        return aTime - bTime
      })

      const now = new Date()
      const emailsToProcess = this.deliveryQueue.filter(email => 
        !email.scheduledFor || email.scheduledFor <= now
      )

      for (const email of emailsToProcess) {
        try {
          await this.deliverEmail(email)
          
          // Remove from queue after successful delivery
          const index = this.deliveryQueue.findIndex(e => e.id === email.id)
          if (index !== -1) {
            this.deliveryQueue.splice(index, 1)
          }
        } catch (error) {
          log.error('Failed to deliver email', error, { emailId: email.id })
          await this.handleDeliveryFailure(email, error as Error)
        }
      }
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Deliver individual email
   */
  private async deliverEmail(email: EmailNotification): Promise<void> {
    const status = this.deliveryStatus.get(email.id)
    if (!status) return

    try {
      this.deliveryStatus.set(email.id, {
        ...status,
        status: 'pending',
        attempts: status.attempts + 1,
        lastAttemptAt: new Date()
      })

      const mailOptions = {
        from: `\"${this.config.from.name}\" <${this.config.from.email}>`,
        to: Array.isArray(email.to) ? email.to.join(', ') : email.to,
        cc: email.cc ? (Array.isArray(email.cc) ? email.cc.join(', ') : email.cc) : undefined,
        bcc: email.bcc ? (Array.isArray(email.bcc) ? email.bcc.join(', ') : email.bcc) : undefined,
        replyTo: this.config.replyTo,
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments: email.attachments
      }

      const transporter = await this.ensureTransporter()
      const result = await transporter.sendMail(mailOptions)

      this.deliveryStatus.set(email.id, {
        ...status,
        status: 'sent',
        sentAt: new Date(),
        attempts: status.attempts + 1
      })

      log.info('Email delivered successfully', {
        emailId: email.id,
        to: mailOptions.to,
        subject: email.subject,
        messageId: result.messageId
      })

      // Log user action if userId is provided
      if (email.userId) {
        log.user('email_sent', {
          emailId: email.id,
          template: email.template,
          entityType: email.entityType,
          entityId: email.entityId
        })
      }

    } catch (error) {
      throw error
    }
  }

  /**
   * Handle delivery failure and retry logic
   */
  private async handleDeliveryFailure(email: EmailNotification, error: Error): Promise<void> {
    const status = this.deliveryStatus.get(email.id)
    if (!status) return

    const maxAttempts = this.maxRetries + 1
    
    if (status.attempts >= maxAttempts) {
      // Max retries reached - mark as failed
      this.deliveryStatus.set(email.id, {
        ...status,
        status: 'failed',
        failedAt: new Date(),
        error: error.message
      })

      // Remove from queue
      const index = this.deliveryQueue.findIndex(e => e.id === email.id)
      if (index !== -1) {
        this.deliveryQueue.splice(index, 1)
      }

      log.error('Email delivery failed permanently', error, {
        emailId: email.id,
        attempts: status.attempts,
        maxAttempts
      })
    } else {
      // Schedule retry
      const retryDelay = this.retryDelays[status.attempts - 1] || this.retryDelays[this.retryDelays.length - 1]
      const nextRetryAt = new Date(Date.now() + retryDelay)
      
      this.deliveryStatus.set(email.id, {
        ...status,
        status: 'pending',
        error: error.message,
        nextRetryAt
      })

      log.warn('Email delivery failed, scheduling retry', {
        emailId: email.id,
        attempt: status.attempts,
        nextRetryAt,
        error: error.message
      })

      // Schedule retry
      setTimeout(() => {
        this.processQueue()
      }, retryDelay)
    }
  }

  /**
   * Start queue processor
   */
  private startQueueProcessor(): void {
    // Process queue every 30 seconds
    setInterval(() => {
      this.processQueue()
    }, 30000)

    log.info('Email queue processor started')
  }

  /**
   * Compile template with data
   */
  private compileTemplate(template: string, data: Record<string, any>): string {
    let compiled = template
    
    Object.keys(data).forEach(key => {
      const value = data[key]
      const regex = new RegExp(`{{\\\\s*${key}\\\\s*}}`, 'g')
      compiled = compiled.replace(regex, String(value || ''))
    })
    
    return compiled
  }

  /**
   * Generate unique email ID
   */
  private generateEmailId(): string {
    return `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Register default email templates
   */
  private registerDefaultTemplates(): void {
    // Welcome email template
    this.registerTemplate({
      id: 'welcome',
      name: 'Welcome Email',
      subject: 'Welcome to {{ appName }}, {{ userName }}!',
      variables: ['appName', 'userName', 'loginUrl'],
      htmlTemplate: `
        <div style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;\">
          <h1 style=\"color: #3b82f6;\">Welcome to {{ appName }}!</h1>
          <p>Hi {{ userName }},</p>
          <p>Thank you for joining {{ appName }}. We're excited to have you on board!</p>
          <p>You can get started by logging into your account:</p>
          <a href=\"{{ loginUrl }}\" style=\"background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;\">Login to Your Account</a>
          <p>If you have any questions, feel free to reach out to our support team.</p>
          <p>Best regards,<br>The {{ appName }} Team</p>
        </div>
      `,
      textTemplate: `
        Welcome to {{ appName }}!
        
        Hi {{ userName }},
        
        Thank you for joining {{ appName }}. We're excited to have you on board!
        
        You can get started by logging into your account: {{ loginUrl }}
        
        If you have any questions, feel free to reach out to our support team.
        
        Best regards,
        The {{ appName }} Team
      `
    })

    // Task assignment notification
    this.registerTemplate({
      id: 'task_assigned',
      name: 'Task Assignment Notification',
      subject: 'You have been assigned a new task: {{ taskTitle }}',
      variables: ['userName', 'taskTitle', 'projectName', 'dueDate', 'assignedBy', 'taskUrl'],
      htmlTemplate: `
        <div style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;\">
          <h2 style=\"color: #3b82f6;\">New Task Assignment</h2>
          <p>Hi {{ userName }},</p>
          <p>You have been assigned a new task in project <strong>{{ projectName }}</strong>:</p>
          <div style=\"background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;\">
            <h3 style=\"margin: 0 0 8px 0; color: #1e293b;\">{{ taskTitle }}</h3>
            <p style=\"margin: 0; color: #64748b;\">Assigned by: {{ assignedBy }}</p>
            {{ #if dueDate }}<p style=\"margin: 0; color: #dc2626;\">Due: {{ dueDate }}</p>{{ /if }}
          </div>
          <a href=\"{{ taskUrl }}\" style=\"background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;\">View Task</a>
          <p>Best regards,<br>The Vault Team</p>
        </div>
      `
    })

    // Project invitation
    this.registerTemplate({
      id: 'project_invitation',
      name: 'Project Collaboration Invitation',
      subject: "You've been invited to collaborate on {{ projectName }}",
      variables: ['userName', 'projectName', 'invitedBy', 'role', 'acceptUrl'],
      htmlTemplate: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3b82f6;">Project Collaboration Invitation</h2>
          <p>Hi {{ userName }},</p>
          <p>{{ invitedBy }} has invited you to collaborate on the project <strong>{{ projectName }}</strong> as a {{ role }}.</p>
          <p>Click the button below to accept the invitation and start collaborating:</p>
          <a href="{{ acceptUrl }}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Accept Invitation</a>
          <p>If you don't want to join this project, you can ignore this email.</p>
          <p>Best regards,<br>The Vault Team</p>
        </div>
      `
    })

    // Password reset
    this.registerTemplate({
      id: 'password_reset',
      name: 'Password Reset Request',
      subject: 'Reset your password for {{ appName }}',
      variables: ['userName', 'appName', 'resetUrl', 'expiresIn'],
      htmlTemplate: `
        <div style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;\">
          <h2 style=\"color: #3b82f6;\">Password Reset Request</h2>
          <p>Hi {{ userName }},</p>
          <p>We received a request to reset your password for {{ appName }}.</p>
          <p>Click the button below to reset your password:</p>
          <a href=\"{{ resetUrl }}\" style=\"background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;\">Reset Password</a>
          <p style=\"color: #64748b; font-size: 14px;\">This link will expire in {{ expiresIn }}.</p>
          <p>If you didn't request this password reset, you can ignore this email.</p>
          <p>Best regards,<br>The {{ appName }} Team</p>
        </div>
      `
    })

    // Email verification
    this.registerTemplate({
      id: 'email_verification',
      name: 'Email Address Verification',
      subject: 'Verify your email address for {{ appName }}',
      variables: ['userName', 'appName', 'verificationUrl', 'expiresIn'],
      htmlTemplate: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3b82f6;">Verify Your Email Address</h2>
          <p>Hi {{ userName }},</p>
          <p>Thanks for signing up for {{ appName }}. Please confirm your email address by clicking the button below:</p>
          <a href="{{ verificationUrl }}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Verify Email Address</a>
          <p style="color: #64748b; font-size: 14px;">This link will expire in {{ expiresIn }}.</p>
          <p>If you didn't create an account, you can safely ignore this email.</p>
          <p>Best regards,<br>The {{ appName }} Team</p>
        </div>
      `,
      textTemplate: `
        Verify your email address for {{ appName }}

        Hi {{ userName }},

        Thanks for signing up for {{ appName }}. Please confirm your email address by visiting the link below:

        {{ verificationUrl }}

        This link will expire in {{ expiresIn }}.

        If you didn't create an account, you can safely ignore this email.

        Best regards,
        The {{ appName }} Team
      `
    })

    // Task reminder
    this.registerTemplate({
      id: 'task_reminder',
      name: 'Task Due Reminder',
      subject: 'Reminder: {{ taskTitle }} is due {{ dueTime }}',
      variables: ['userName', 'taskTitle', 'projectName', 'dueTime', 'taskUrl'],
      htmlTemplate: `
        <div style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;\">
          <h2 style=\"color: #f59e0b;\">Task Reminder</h2>
          <p>Hi {{ userName }},</p>
          <p>This is a reminder that your task is due {{ dueTime }}:</p>
          <div style=\"background-color: #fef3c7; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #f59e0b;\">
            <h3 style=\"margin: 0 0 8px 0; color: #92400e;\">{{ taskTitle }}</h3>
            <p style=\"margin: 0; color: #78350f;\">Project: {{ projectName }}</p>
          </div>
          <a href=\"{{ taskUrl }}\" style=\"background-color: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;\">View Task</a>
          <p>Best regards,<br>The Vault Team</p>
        </div>
      `
    })

    log.info('Default email templates registered', { count: this.templates.size })
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): {
    pending: number
    processing: boolean
    failed: number
    sent: number
  } {
    const pending = this.deliveryQueue.length
    const statuses = Array.from(this.deliveryStatus.values())
    const failed = statuses.filter(s => s.status === 'failed').length
    const sent = statuses.filter(s => s.status === 'sent' || s.status === 'delivered').length

    return {
      pending,
      processing: this.isProcessing,
      failed,
      sent
    }
  }
}

// Default email configuration
const defaultEmailConfig: EmailConfig = {
  provider: 'smtp',
  smtp: {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || ''
    }
  },
  from: {
    name: process.env.SMTP_FROM_NAME || 'Vault Command Center',
    email: process.env.SMTP_FROM_EMAIL || 'noreply@vault.com'
  },
  replyTo: process.env.SMTP_REPLY_TO
}

// Create and export singleton instance
export const emailService = new EmailNotificationService(defaultEmailConfig)

// Convenience functions
export const sendWelcomeEmail = (to: string, userName: string) => {
  return emailService.sendTemplatedEmail(to, 'welcome', {
    appName: 'Vault Command Center',
    userName,
    loginUrl: `${process.env.NEXTAUTH_URL}/auth/signin`
  }, { priority: 'high' })
}

export const sendTaskAssignmentEmail = (
  to: string,
  userName: string,
  taskTitle: string,
  projectName: string,
  assignedBy: string,
  taskUrl: string,
  dueDate?: string
) => {
  return emailService.sendTemplatedEmail(to, 'task_assigned', {
    userName,
    taskTitle,
    projectName,
    assignedBy,
    taskUrl,
    dueDate
  }, { priority: 'normal' })
}

export const sendProjectInvitationEmail = (
  to: string,
  userName: string,
  projectName: string,
  invitedBy: string,
  role: string,
  acceptUrl: string
) => {
  return emailService.sendTemplatedEmail(to, 'project_invitation', {
    userName,
    projectName,
    invitedBy,
    role,
    acceptUrl
  }, { priority: 'high' })
}

export const sendPasswordResetEmail = (
  to: string,
  userName: string,
  token: string,
  expiresIn: string = '1 hour'
) => {
  const resetUrl = `${process.env.NEXTAUTH_URL}/auth/reset-password?token=${token}`
  return emailService.sendTemplatedEmail(to, 'password_reset', {
    userName,
    appName: 'Vault Command Center',
    resetUrl,
    expiresIn
  }, { priority: 'high' })
}

export const sendEmailVerificationEmail = (
  to: string,
  userName: string,
  token: string
) => {
  const verificationUrl = `${process.env.NEXTAUTH_URL}/auth/verify-email?token=${token}`
  return emailService.sendTemplatedEmail(to, 'email_verification', {
    userName,
    appName: 'Vault Command Center',
    verificationUrl,
    expiresIn: '24 hours'
  }, { priority: 'high' })
}

export const sendTaskReminderEmail = (
  to: string,
  userName: string,
  taskTitle: string,
  projectName: string,
  dueTime: string,
  taskUrl: string
) => {
  return emailService.sendTemplatedEmail(to, 'task_reminder', {
    userName,
    taskTitle,
    projectName,
    dueTime,
    taskUrl
  }, { priority: 'normal' })
}

export default emailService