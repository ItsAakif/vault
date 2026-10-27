import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, type Session } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { emailService } from '@/lib/email-service'
import { log } from '@/lib/production-logger'
import { z } from 'zod'

const sendEmailSchema = z.object({
  type: z.enum(['welcome', 'task_assigned', 'project_invitation', 'password_reset', 'task_reminder', 'custom']),
  to: z.string().email().or(z.array(z.string().email())),
  templateData: z.record(z.string(), z.any()).optional(),
  customSubject: z.string().optional(),
  customHtml: z.string().optional(),
  customText: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  scheduledFor: z.string().datetime().optional()
})

export async function POST(request: NextRequest) {
  let session: Session | null = null
  try {
    session = await getServerSession(authOptions)
    
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const validation = sendEmailSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data', details: validation.error.issues },
        { status: 400 }
      )
    }

    const { type, to, templateData, customSubject, customHtml, customText, priority, scheduledFor } = validation.data

    let emailId: string

    // Handle different email types
    switch (type) {
      case 'welcome':
        if (!templateData?.userName) {
          return NextResponse.json(
            { success: false, error: 'userName is required for welcome email' },
            { status: 400 }
          )
        }
        emailId = await emailService.sendTemplatedEmail(
          to as string,
          'welcome',
          {
            appName: 'Vault Command Center',
            userName: templateData.userName,
            loginUrl: `${process.env.NEXTAUTH_URL}/auth/signin`,
            ...templateData
          },
          { 
            priority,
            scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
            userId: session.user.id,
            entityType: 'user',
            entityId: templateData.userId
          }
        )
        break

      case 'task_assigned':
        if (!templateData?.taskTitle || !templateData?.projectName || !templateData?.assignedBy) {
          return NextResponse.json(
            { success: false, error: 'taskTitle, projectName, and assignedBy are required for task assignment email' },
            { status: 400 }
          )
        }
        emailId = await emailService.sendTemplatedEmail(
          to as string,
          'task_assigned',
          templateData,
          { 
            priority,
            scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
            userId: session.user.id,
            entityType: 'task',
            entityId: templateData.taskId
          }
        )
        break

      case 'project_invitation':
        if (!templateData?.projectName || !templateData?.invitedBy || !templateData?.role) {
          return NextResponse.json(
            { success: false, error: 'projectName, invitedBy, and role are required for project invitation email' },
            { status: 400 }
          )
        }
        emailId = await emailService.sendTemplatedEmail(
          to as string,
          'project_invitation',
          templateData,
          { 
            priority,
            scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
            userId: session.user.id,
            entityType: 'project',
            entityId: templateData.projectId
          }
        )
        break

      case 'password_reset':
        if (!templateData?.resetUrl) {
          return NextResponse.json(
            { success: false, error: 'resetUrl is required for password reset email' },
            { status: 400 }
          )
        }
        emailId = await emailService.sendTemplatedEmail(
          to as string,
          'password_reset',
          {
            appName: 'Vault Command Center',
            expiresIn: '1 hour',
            ...templateData
          },
          { 
            priority,
            scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
            userId: session.user.id,
            entityType: 'user',
            entityId: templateData.userId
          }
        )
        break

      case 'task_reminder':
        if (!templateData?.taskTitle || !templateData?.projectName || !templateData?.dueTime) {
          return NextResponse.json(
            { success: false, error: 'taskTitle, projectName, and dueTime are required for task reminder email' },
            { status: 400 }
          )
        }
        emailId = await emailService.sendTemplatedEmail(
          to as string,
          'task_reminder',
          templateData,
          { 
            priority,
            scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
            userId: session.user.id,
            entityType: 'task',
            entityId: templateData.taskId
          }
        )
        break

      case 'custom':
        if (!customSubject || (!customHtml && !customText)) {
          return NextResponse.json(
            { success: false, error: 'customSubject and either customHtml or customText are required for custom email' },
            { status: 400 }
          )
        }
        emailId = await emailService.sendEmail({
          to,
          subject: customSubject,
          html: customHtml,
          text: customText,
          priority,
          scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
          userId: session.user.id
        })
        break

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid email type' },
          { status: 400 }
        )
    }

    log.user('email_requested', {
      emailId,
      type,
      to: Array.isArray(to) ? to.join(', ') : to,
      priority
    })

    return NextResponse.json({
      success: true,
      emailId,
      message: 'Email queued for delivery'
    })

  } catch (error) {
    log.error('Failed to send email', error, {
      endpoint: '/api/notifications/email',
      userId: session?.user?.id
    })

    return NextResponse.json(
      { success: false, error: 'Failed to send email' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  let session: Session | null = null
  try {
    session = await getServerSession(authOptions)
    
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const emailId = searchParams.get('emailId')

    if (emailId) {
      // Get specific email status
      const status = emailService.getDeliveryStatus(emailId)
      
      if (!status) {
        return NextResponse.json(
          { success: false, error: 'Email not found' },
          { status: 404 }
        )
      }

      return NextResponse.json({
        success: true,
        status
      })
    } else {
      // Get queue statistics
      const stats = emailService.getQueueStats()
      
      return NextResponse.json({
        success: true,
        stats
      })
    }

  } catch (error) {
    log.error('Failed to get email status', error, {
      endpoint: '/api/notifications/email',
      userId: session?.user?.id
    })

    return NextResponse.json(
      { success: false, error: 'Failed to get email status' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  let session: Session | null = null
  try {
    session = await getServerSession(authOptions)
    
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const emailId = searchParams.get('emailId')

    if (!emailId) {
      return NextResponse.json(
        { success: false, error: 'emailId is required' },
        { status: 400 }
      )
    }

    const cancelled = emailService.cancelEmail(emailId)

    if (!cancelled) {
      return NextResponse.json(
        { success: false, error: 'Email not found or cannot be cancelled' },
        { status: 404 }
      )
    }

    log.user('email_cancelled', {
      emailId
    })

    return NextResponse.json({
      success: true,
      message: 'Email cancelled successfully'
    })

  } catch (error) {
    log.error('Failed to cancel email', error, {
      endpoint: '/api/notifications/email',
      userId: session?.user?.id
    })

    return NextResponse.json(
      { success: false, error: 'Failed to cancel email' },
      { status: 500 }
    )
  }
}