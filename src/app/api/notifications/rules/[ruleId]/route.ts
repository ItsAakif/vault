import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { notificationAutomationEngine } from '@/lib/notification-automation'
import { z } from 'zod'

const updateRuleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  trigger: z.object({
    type: z.enum(['event', 'time', 'condition', 'user_action']),
    event: z.object({
      entityType: z.string(),
      action: z.string(),
      conditions: z.record(z.string(), z.any()).optional()
    }).optional(),
    time: z.object({
      schedule: z.string(),
      timezone: z.string()
    }).optional(),
    condition: z.object({
      field: z.string(),
      operator: z.enum(['equals', 'not_equals', 'greater_than', 'less_than', 'contains']),
      value: z.any()
    }).optional(),
    userAction: z.object({
      action: z.string(),
      duration: z.number().optional()
    }).optional()
  }).optional(),
  actions: z.array(z.object({
    type: z.enum(['send_notification', 'send_email', 'send_sms', 'create_task', 'update_status']),
    config: z.object({
      title: z.string().optional(),
      message: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      category: z.string().optional(),
      channels: z.array(z.enum(['in-app', 'email', 'push', 'sms'])).optional(),
      delay: z.number().optional(),
      template: z.string().optional(),
      recipients: z.array(z.string()).optional()
    })
  })).optional(),
  escalation: z.array(z.object({
    delay: z.number(),
    condition: z.enum(['not_read', 'not_acknowledged', 'no_response']),
    action: z.object({
      type: z.enum(['send_notification', 'send_email', 'send_sms', 'create_task', 'update_status']),
      config: z.object({
        title: z.string().optional(),
        message: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        category: z.string().optional(),
        channels: z.array(z.enum(['in-app', 'email', 'push', 'sms'])).optional(),
        delay: z.number().optional(),
        template: z.string().optional(),
        recipients: z.array(z.string()).optional()
      })
    })
  })).optional(),
  filters: z.array(z.object({
    field: z.string(),
    operator: z.enum(['equals', 'not_equals', 'greater_than', 'less_than', 'contains']),
    value: z.any()
  })).optional()
})

// PUT /api/notifications/rules/[ruleId] - Update notification rule
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  try {
    const { ruleId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const validatedData = updateRuleSchema.parse(body)

    const updatedRule = await notificationAutomationEngine.updateRule(
      ruleId,
      { ...validatedData, userId: user.id }
    )

    return NextResponse.json(updatedRule)
  } catch (error) {
    console.error('Error updating notification rule:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to update notification rule' },
      { status: 500 }
    )
  }
}

// DELETE /api/notifications/rules/[ruleId] - Delete notification rule
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  try {
    const { ruleId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    await notificationAutomationEngine.deleteRule(user.id, ruleId)

    return NextResponse.json({ message: 'Rule deleted successfully' })
  } catch (error) {
    console.error('Error deleting notification rule:', error)
    return NextResponse.json(
      { error: 'Failed to delete notification rule' },
      { status: 500 }
    )
  }
}