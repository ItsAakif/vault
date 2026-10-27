import { useState, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { log } from '@/lib/production-logger'

export interface EmailRequest {
  type: 'welcome' | 'task_assigned' | 'project_invitation' | 'password_reset' | 'task_reminder' | 'custom'
  to: string | string[]
  templateData?: Record<string, any>
  customSubject?: string
  customHtml?: string
  customText?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  scheduledFor?: string
}

export interface EmailStatus {
  id: string
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'complained'
  sentAt?: string
  deliveredAt?: string
  failedAt?: string
  error?: string
  attempts: number
  lastAttemptAt?: string
  nextRetryAt?: string
}

export interface EmailStats {
  pending: number
  processing: boolean
  failed: number
  sent: number
}

export function useEmailNotifications() {
  const [isLoading, setIsLoading] = useState(false)
  const queryClient = useQueryClient()

  // Send email mutation
  const sendEmailMutation = useMutation({
    mutationFn: async (emailData: EmailRequest): Promise<{ emailId: string; message: string }> => {
      const response = await fetch('/api/notifications/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send email')
      }

      return response.json()
    },
    onSuccess: (data, variables) => {
      toast.success('Email queued for delivery', {
        description: `Email will be sent to ${Array.isArray(variables.to) ? variables.to.join(', ') : variables.to}`
      })
      
      log.user('email_notification_sent', {
        emailId: data.emailId,
        type: variables.type,
        priority: variables.priority || 'normal'
      })

      // Invalidate email stats query
      queryClient.invalidateQueries({ queryKey: ['email-stats'] })
    },
    onError: (error: Error, variables) => {
      toast.error('Failed to send email', {
        description: error.message
      })
      
      log.error('Email notification failed', error, {
        type: variables.type,
        to: Array.isArray(variables.to) ? variables.to.join(', ') : variables.to
      })
    },
  })

  // Cancel email mutation
  const cancelEmailMutation = useMutation({
    mutationFn: async (emailId: string): Promise<{ message: string }> => {
      const response = await fetch(`/api/notifications/email?emailId=${emailId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to cancel email')
      }

      return response.json()
    },
    onSuccess: (data, emailId) => {
      toast.success('Email cancelled successfully')
      
      log.user('email_notification_cancelled', { emailId })

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['email-status', emailId] })
      queryClient.invalidateQueries({ queryKey: ['email-stats'] })
    },
    onError: (error: Error, emailId) => {
      toast.error('Failed to cancel email', {
        description: error.message
      })
      
      log.error('Email cancellation failed', error, { emailId })
    },
  })

  // Get email status query
  const useEmailStatus = (emailId: string | null) => {
    return useQuery({
      queryKey: ['email-status', emailId],
      queryFn: async (): Promise<EmailStatus['status']> => {
        if (!emailId) throw new Error('Email ID is required')
        
        const response = await fetch(`/api/notifications/email?emailId=${emailId}`)
        
        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to get email status')
        }

        const data = await response.json()
        return data.status
      },
      enabled: !!emailId,
      refetchInterval: (query) => {
        // Stop polling if email is in final state
        const status = query.state.data
        if (status === 'sent' || status === 'failed' || status === 'delivered') {
          return false
        }
        return 5000 // Poll every 5 seconds for pending emails
      },
    })
  }

  // Get email stats query
  const useEmailStats = () => {
    return useQuery({
      queryKey: ['email-stats'],
      queryFn: async (): Promise<EmailStats> => {
        const response = await fetch('/api/notifications/email')
        
        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to get email stats')
        }

        const data = await response.json()
        return data.stats
      },
      refetchInterval: 30000, // Refresh every 30 seconds
    })
  }

  // Convenience functions for common email types
  const sendWelcomeEmail = useCallback(async (
    to: string,
    userName: string,
    userId?: string,
    options: Partial<EmailRequest> = {}
  ) => {
    return sendEmailMutation.mutateAsync({
      type: 'welcome',
      to,
      templateData: { userName, userId },
      priority: 'high',
      ...options
    })
  }, [sendEmailMutation])

  const sendTaskAssignmentEmail = useCallback(async (
    to: string,
    data: {
      userName: string
      taskTitle: string
      projectName: string
      assignedBy: string
      taskUrl: string
      taskId?: string
      dueDate?: string
    },
    options: Partial<EmailRequest> = {}
  ) => {
    return sendEmailMutation.mutateAsync({
      type: 'task_assigned',
      to,
      templateData: data,
      priority: 'normal',
      ...options
    })
  }, [sendEmailMutation])

  const sendProjectInvitationEmail = useCallback(async (
    to: string,
    data: {
      userName: string
      projectName: string
      invitedBy: string
      role: string
      acceptUrl: string
      projectId?: string
    },
    options: Partial<EmailRequest> = {}
  ) => {
    return sendEmailMutation.mutateAsync({
      type: 'project_invitation',
      to,
      templateData: data,
      priority: 'high',
      ...options
    })
  }, [sendEmailMutation])

  const sendPasswordResetEmail = useCallback(async (
    to: string,
    data: {
      userName: string
      resetUrl: string
      userId?: string
      expiresIn?: string
    },
    options: Partial<EmailRequest> = {}
  ) => {
    return sendEmailMutation.mutateAsync({
      type: 'password_reset',
      to,
      templateData: data,
      priority: 'high',
      ...options
    })
  }, [sendEmailMutation])

  const sendTaskReminderEmail = useCallback(async (
    to: string,
    data: {
      userName: string
      taskTitle: string
      projectName: string
      dueTime: string
      taskUrl: string
      taskId?: string
    },
    options: Partial<EmailRequest> = {}
  ) => {
    return sendEmailMutation.mutateAsync({
      type: 'task_reminder',
      to,
      templateData: data,
      priority: 'normal',
      ...options
    })
  }, [sendEmailMutation])

  const sendCustomEmail = useCallback(async (
    to: string | string[],
    subject: string,
    html?: string,
    text?: string,
    options: Partial<EmailRequest> = {}
  ) => {
    return sendEmailMutation.mutateAsync({
      type: 'custom',
      to,
      customSubject: subject,
      customHtml: html,
      customText: text,
      priority: 'normal',
      ...options
    })
  }, [sendEmailMutation])

  const cancelEmail = useCallback(async (emailId: string) => {
    return cancelEmailMutation.mutateAsync(emailId)
  }, [cancelEmailMutation])

  return {
    // Mutations
    sendEmail: sendEmailMutation.mutateAsync,
    cancelEmail,
    
    // Convenience functions
    sendWelcomeEmail,
    sendTaskAssignmentEmail,
    sendProjectInvitationEmail,
    sendPasswordResetEmail,
    sendTaskReminderEmail,
    sendCustomEmail,
    
    // Queries
    useEmailStatus,
    useEmailStats,
    
    // Loading states
    isSending: sendEmailMutation.isPending,
    isCancelling: cancelEmailMutation.isPending,
    
    // Error states
    sendError: sendEmailMutation.error,
    cancelError: cancelEmailMutation.error,
  }
}

// Hook for email notification preferences
export function useEmailPreferences() {
  const [preferences, setPreferences] = useState({
    taskAssignments: true,
    projectInvitations: true,
    taskReminders: true,
    taskDeadlines: true,
    projectUpdates: false,
    weeklyDigest: true,
    marketingEmails: false,
  })

  const updatePreferences = useCallback(async (newPreferences: Partial<typeof preferences>) => {
    try {
      const response = await fetch('/api/user/email-preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newPreferences),
      })

      if (!response.ok) {
        throw new Error('Failed to update email preferences')
      }

      setPreferences(prev => ({ ...prev, ...newPreferences }))
      toast.success('Email preferences updated')
      
      log.user('email_preferences_updated', newPreferences)

    } catch (error) {
      toast.error('Failed to update email preferences')
      log.error('Email preferences update failed', error)
    }
  }, [])

  return {
    preferences,
    updatePreferences,
  }
}

export default useEmailNotifications