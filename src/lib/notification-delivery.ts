import { emailService } from '@/lib/email-service'
import { logger } from '@/lib/logger'

class ServerNotificationDelivery {
  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    if (!to || !to.includes('@')) {
      throw new Error(`ServerNotificationDelivery.sendEmail requires an email address, received "${to}"`)
    }
    await emailService.sendEmail({
      to,
      subject,
      html: body,
      text: body,
      priority: 'normal',
    })
  }

  async sendPushNotification(userId: string, title: string, body: string): Promise<void> {
    logger.warn('[notification-delivery] push channel is not configured on the server; dropping', { userId, title })
    throw new Error('Server-side push delivery is not configured')
  }

  async sendSMS(userId: string, body: string): Promise<void> {
    logger.warn('[notification-delivery] sms channel is not configured on the server; dropping', { userId })
    throw new Error('Server-side SMS delivery is not configured')
  }
}

export const serverNotificationDelivery = new ServerNotificationDelivery()
export default serverNotificationDelivery
