import { google } from 'googleapis'
import { Client } from '@microsoft/microsoft-graph-client'
import { AuthenticationProvider } from '@microsoft/microsoft-graph-client'
import { PublicClientApplication } from '@azure/msal-node'
import ICAL from 'ical.js'
import icalGenerator from 'ical-generator'
import { createObjectCsvWriter } from 'csv-writer'
import csvParser from 'csv-parser'
import moment from 'moment-timezone'
import { CalendarEvent, Integration, User } from '@prisma/client'
import { db } from './db'

// Types
export interface ExternalCalendarEvent {
  id: string
  title: string
  description?: string
  startTime: Date
  endTime: Date
  allDay: boolean
  location?: string
  timezone?: string
  recurring?: string
  reminders?: string[]
  uid?: string
}

export interface CalendarIntegrationConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export interface SyncResult {
  imported: number
  exported: number
  updated: number
  errors: string[]
}

// Google Calendar Integration
export class GoogleCalendarIntegration {
  private oauth2Client: any
  private calendar: any

  constructor(config: CalendarIntegrationConfig, credentials?: any) {
    this.oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    )

    if (credentials) {
      this.oauth2Client.setCredentials(credentials)
    }

    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client })
  }

  async getAuthUrl(): Promise<string> {
    const scopes = [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events'
    ]

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    })
  }

  async exchangeCodeForTokens(code: string): Promise<any> {
    const { tokens } = await this.oauth2Client.getToken(code)
    this.oauth2Client.setCredentials(tokens)
    return tokens
  }

  async getCalendars(): Promise<any[]> {
    try {
      const response = await this.calendar.calendarList.list()
      return response.data.items || []
    } catch (error) {
      console.error('Error fetching Google calendars:', error)
      throw error
    }
  }

  async getEvents(calendarId: string = 'primary', timeMin?: Date, timeMax?: Date): Promise<ExternalCalendarEvent[]> {
    try {
      const response = await this.calendar.events.list({
        calendarId,
        timeMin: timeMin?.toISOString(),
        timeMax: timeMax?.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      })

      return (response.data.items || []).map(this.mapGoogleEvent)
    } catch (error) {
      console.error('Error fetching Google Calendar events:', error)
      throw error
    }
  }

  async createEvent(calendarId: string, event: Partial<CalendarEvent>): Promise<string> {
    try {
      const googleEvent = {
        summary: event.title,
        description: event.description,
        location: event.location,
        start: {
          dateTime: event.startTime?.toISOString(),
          timeZone: event.timezone || 'UTC'
        },
        end: {
          dateTime: event.endTime?.toISOString(),
          timeZone: event.timezone || 'UTC'
        }
      }

      const response = await this.calendar.events.insert({
        calendarId,
        resource: googleEvent
      })

      return response.data.id
    } catch (error) {
      console.error('Error creating Google Calendar event:', error)
      throw error
    }
  }

  async updateEvent(calendarId: string, eventId: string, event: Partial<CalendarEvent>): Promise<void> {
    try {
      const googleEvent = {
        summary: event.title,
        description: event.description,
        location: event.location,
        start: {
          dateTime: event.startTime?.toISOString(),
          timeZone: event.timezone || 'UTC'
        },
        end: {
          dateTime: event.endTime?.toISOString(),
          timeZone: event.timezone || 'UTC'
        }
      }

      await this.calendar.events.update({
        calendarId,
        eventId,
        resource: googleEvent
      })
    } catch (error) {
      console.error('Error updating Google Calendar event:', error)
      throw error
    }
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    try {
      await this.calendar.events.delete({
        calendarId,
        eventId
      })
    } catch (error) {
      console.error('Error deleting Google Calendar event:', error)
      throw error
    }
  }

  private mapGoogleEvent(googleEvent: any): ExternalCalendarEvent {
    const start = googleEvent.start?.dateTime || googleEvent.start?.date
    const end = googleEvent.end?.dateTime || googleEvent.end?.date
    
    return {
      id: googleEvent.id,
      title: googleEvent.summary || 'Untitled Event',
      description: googleEvent.description,
      startTime: new Date(start),
      endTime: new Date(end),
      allDay: !googleEvent.start?.dateTime,
      location: googleEvent.location,
      timezone: googleEvent.start?.timeZone,
      recurring: googleEvent.recurrence?.join(','),
      reminders: googleEvent.reminders?.overrides?.map((r: any) => `${r.method}:${r.minutes}`),
      uid: googleEvent.iCalUID
    }
  }
}

// Microsoft Graph (Outlook) Integration
class MSALAuthProvider implements AuthenticationProvider {
  private accessToken: string

  constructor(accessToken: string) {
    this.accessToken = accessToken
  }

  async getAccessToken(): Promise<string> {
    return this.accessToken
  }
}

export class OutlookCalendarIntegration {
  private graphClient: Client | null = null
  private msalInstance: PublicClientApplication

  constructor(config: CalendarIntegrationConfig, accessToken?: string) {
    this.msalInstance = new PublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: 'https://login.microsoftonline.com/common'
      }
    })

    if (accessToken) {
      const authProvider = new MSALAuthProvider(accessToken)
      this.graphClient = Client.initWithMiddleware({ authProvider })
    }
  }

  async getAuthUrl(): Promise<string> {
    // This would typically be handled by MSAL in the frontend
    const scopes = ['https://graph.microsoft.com/Calendars.ReadWrite']
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${process.env.OUTLOOK_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(process.env.OUTLOOK_REDIRECT_URI!)}&scope=${encodeURIComponent(scopes.join(' '))}`
  }

  async getCalendars(): Promise<any[]> {
    try {
      if (!this.graphClient) throw new Error('Outlook integration is not authenticated')
      const calendars = await this.graphClient.api('/me/calendars').get()
      return calendars.value || []
    } catch (error) {
      console.error('Error fetching Outlook calendars:', error)
      throw error
    }
  }

  async getEvents(calendarId?: string, timeMin?: Date, timeMax?: Date): Promise<ExternalCalendarEvent[]> {
    try {
      if (!this.graphClient) throw new Error('Outlook integration is not authenticated')
      let endpoint = '/me/events'
      if (calendarId) {
        endpoint = `/me/calendars/${calendarId}/events`
      }

      let query = this.graphClient.api(endpoint)
      
      if (timeMin || timeMax) {
        const filter: string[] = []
        if (timeMin) filter.push(`start/dateTime ge '${timeMin.toISOString()}'`)
        if (timeMax) filter.push(`end/dateTime le '${timeMax.toISOString()}'`)
        query = query.filter(filter.join(' and '))
      }

      const events = await query.get()
      return (events.value || []).map(this.mapOutlookEvent)
    } catch (error) {
      console.error('Error fetching Outlook events:', error)
      throw error
    }
  }

  async createEvent(calendarId: string, event: Partial<CalendarEvent>): Promise<string> {
    try {
      if (!this.graphClient) throw new Error('Outlook integration is not authenticated')
      const outlookEvent = {
        subject: event.title,
        body: {
          contentType: 'text',
          content: event.description || ''
        },
        location: {
          displayName: event.location || ''
        },
        start: {
          dateTime: event.startTime?.toISOString(),
          timeZone: event.timezone || 'UTC'
        },
        end: {
          dateTime: event.endTime?.toISOString(),
          timeZone: event.timezone || 'UTC'
        }
      }

      const endpoint = calendarId ? `/me/calendars/${calendarId}/events` : '/me/events'
      const response = await this.graphClient.api(endpoint).post(outlookEvent)
      return response.id
    } catch (error) {
      console.error('Error creating Outlook event:', error)
      throw error
    }
  }

  private mapOutlookEvent(outlookEvent: any): ExternalCalendarEvent {
    return {
      id: outlookEvent.id,
      title: outlookEvent.subject || 'Untitled Event',
      description: outlookEvent.body?.content,
      startTime: new Date(outlookEvent.start.dateTime),
      endTime: new Date(outlookEvent.end.dateTime),
      allDay: outlookEvent.isAllDay || false,
      location: outlookEvent.location?.displayName,
      timezone: outlookEvent.start.timeZone,
      recurring: outlookEvent.recurrence ? JSON.stringify(outlookEvent.recurrence) : undefined,
      reminders: outlookEvent.reminderMinutesBeforeStart ? [`email:${outlookEvent.reminderMinutesBeforeStart}`] : undefined
    }
  }
}

// iCal Import/Export
export class ICalService {
  static async exportToICal(events: CalendarEvent[], timezone: string = 'UTC'): Promise<string> {
    const cal = icalGenerator({
      name: 'Vault Calendar Export',
      timezone: timezone
    })

    events.forEach(event => {
      cal.createEvent({
        id: event.id,
        start: moment.tz(event.startTime, event.timezone || timezone),
        end: moment.tz(event.endTime, event.timezone || timezone),
        summary: event.title,
        description: event.description || '',
        location: event.location || '',
        allDay: event.allDay,
        sequence: event.sequence || 0
      })
    })

    return cal.toString()
  }

  static async importFromICal(icalData: string, userId: string): Promise<CalendarEvent[]> {
    try {
      const jcalData = ICAL.parse(icalData)
      const comp = new ICAL.Component(jcalData)
      const vevents = comp.getAllSubcomponents('vevent')

      const events: CalendarEvent[] = []

      for (const vevent of vevents) {
        const event = new ICAL.Event(vevent)
        
        const calendarEvent = await db.calendarEvent.create({
          data: {
            title: event.summary || 'Imported Event',
            description: event.description || '',
            startTime: event.startDate.toJSDate(),
            endTime: event.endDate.toJSDate(),
            allDay: event.startDate.isDate,
            location: event.location || '',
            timezone: event.startDate.zone?.tzid || 'UTC',
            uid: event.uid,
            sequence: event.sequence || 0,
            userId: userId,
            externalSource: 'ical'
          }
        })

        events.push(calendarEvent)
      }

      return events
    } catch (error) {
      console.error('Error importing iCal data:', error)
      throw error
    }
  }
}

// CSV Import/Export
export class CSVCalendarService {
  static async exportToCSV(events: CalendarEvent[], filePath: string): Promise<void> {
    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: 'title', title: 'Title' },
        { id: 'description', title: 'Description' },
        { id: 'startTime', title: 'Start Time' },
        { id: 'endTime', title: 'End Time' },
        { id: 'allDay', title: 'All Day' },
        { id: 'location', title: 'Location' },
        { id: 'timezone', title: 'Timezone' }
      ]
    })

    const records = events.map(event => ({
      title: event.title,
      description: event.description || '',
      startTime: event.startTime.toISOString(),
      endTime: event.endTime.toISOString(),
      allDay: event.allDay,
      location: event.location || '',
      timezone: event.timezone
    }))

    await csvWriter.writeRecords(records)
  }

  static async importFromCSV(filePath: string, userId: string): Promise<CalendarEvent[]> {
    return new Promise((resolve, reject) => {
      const events: CalendarEvent[] = []
      const results: any[] = []

      require('fs').createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
          try {
            for (const row of results) {
              const event = await db.calendarEvent.create({
                data: {
                  title: row.Title || row.title || 'Imported Event',
                  description: row.Description || row.description || '',
                  startTime: new Date(row['Start Time'] || row.startTime),
                  endTime: new Date(row['End Time'] || row.endTime),
                  allDay: row['All Day'] === 'true' || row.allDay === 'true',
                  location: row.Location || row.location || '',
                  timezone: row.Timezone || row.timezone || 'UTC',
                  userId: userId,
                  externalSource: 'csv'
                }
              })
              events.push(event)
            }
            resolve(events)
          } catch (error) {
            reject(error)
          }
        })
        .on('error', reject)
    })
  }
}

// Timezone Utilities
export class TimezoneService {
  static getSupportedTimezones(): string[] {
    return moment.tz.names()
  }

  static convertEventTimezone(event: CalendarEvent, targetTimezone: string): CalendarEvent {
    return {
      ...event,
      startTime: moment.tz(event.startTime, event.timezone).tz(targetTimezone).toDate(),
      endTime: moment.tz(event.endTime, event.timezone).tz(targetTimezone).toDate(),
      timezone: targetTimezone
    }
  }

  static isDaylightSavingTime(date: Date, timezone: string): boolean {
    return moment.tz(date, timezone).isDST()
  }

  static getTimezoneOffset(timezone: string, date?: Date): number {
    return moment.tz(date || new Date(), timezone).utcOffset()
  }
}

// Main Calendar Sync Service
export class CalendarSyncService {
  static async syncIntegration(integrationId: string): Promise<SyncResult> {
    const integration = await db.integration.findUnique({
      where: { id: integrationId },
      include: { user: true }
    })

    if (!integration) {
      throw new Error('Integration not found')
    }

    const result: SyncResult = {
      imported: 0,
      exported: 0,
      updated: 0,
      errors: []
    }

    try {
      switch (integration.type) {
        case 'GOOGLE_CALENDAR':
          await this.syncGoogleCalendar(integration, result)
          break
        case 'OUTLOOK_CALENDAR':
          await this.syncOutlookCalendar(integration, result)
          break
        default:
          throw new Error(`Unsupported integration type: ${integration.type}`)
      }

      // Update integration sync status
      await db.integration.update({
        where: { id: integrationId },
        data: {
          lastSync: new Date(),
          syncStatus: 'success',
          errorLog: null
        }
      })
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown error')
      
      await db.integration.update({
        where: { id: integrationId },
        data: {
          syncStatus: 'error',
          errorLog: error instanceof Error ? error.message : 'Unknown error'
        }
      })
    }

    return result
  }

  private static async syncGoogleCalendar(integration: Integration & { user: User }, result: SyncResult): Promise<void> {
    const config = integration.config as any
    const credentials = integration.credentials as any
    
    const googleIntegration = new GoogleCalendarIntegration(config, credentials)
    const calendarIds = (integration.calendarIds as string[]) || ['primary']

    for (const calendarId of calendarIds) {
      // Import events from Google Calendar
      if (integration.syncDirection === 'import' || integration.syncDirection === 'bidirectional') {
        const externalEvents = await googleIntegration.getEvents(calendarId)
        
        for (const externalEvent of externalEvents) {
          const existingEvent = await db.calendarEvent.findFirst({
            where: {
              externalId: externalEvent.id,
              externalSource: 'google',
              userId: integration.userId
            }
          })

          if (existingEvent) {
            // Update existing event
            await db.calendarEvent.update({
              where: { id: existingEvent.id },
              data: {
                title: externalEvent.title,
                description: externalEvent.description,
                startTime: externalEvent.startTime,
                endTime: externalEvent.endTime,
                allDay: externalEvent.allDay,
                location: externalEvent.location,
                timezone: externalEvent.timezone || 'UTC',
                lastSyncAt: new Date()
              }
            })
            result.updated++
          } else {
            // Create new event
            await db.calendarEvent.create({
              data: {
                title: externalEvent.title,
                description: externalEvent.description,
                startTime: externalEvent.startTime,
                endTime: externalEvent.endTime,
                allDay: externalEvent.allDay,
                location: externalEvent.location,
                timezone: externalEvent.timezone || 'UTC',
                externalId: externalEvent.id,
                externalSource: 'google',
                uid: externalEvent.uid,
                userId: integration.userId,
                lastSyncAt: new Date()
              }
            })
            result.imported++
          }
        }
      }

      // Export events to Google Calendar
      if (integration.syncDirection === 'export' || integration.syncDirection === 'bidirectional') {
        const localEvents = await db.calendarEvent.findMany({
          where: {
            userId: integration.userId,
            externalSource: null // Only sync local events
          }
        })

        for (const localEvent of localEvents) {
          try {
            const externalId = await googleIntegration.createEvent(calendarId, localEvent)
            
            await db.calendarEvent.update({
              where: { id: localEvent.id },
              data: {
                externalId,
                externalSource: 'google',
                lastSyncAt: new Date()
              }
            })
            result.exported++
          } catch (error) {
            result.errors.push(`Failed to export event "${localEvent.title}": ${error}`)
          }
        }
      }
    }
  }

  private static async syncOutlookCalendar(integration: Integration & { user: User }, result: SyncResult): Promise<void> {
    const config = integration.config as any
    const credentials = integration.credentials as any
    
    const outlookIntegration = new OutlookCalendarIntegration(config, credentials.accessToken)
    const calendarIds = (integration.calendarIds as string[]) || [undefined] // Default calendar

    for (const calendarId of calendarIds) {
      // Import events from Outlook
      if (integration.syncDirection === 'import' || integration.syncDirection === 'bidirectional') {
        const externalEvents = await outlookIntegration.getEvents(calendarId)
        
        for (const externalEvent of externalEvents) {
          const existingEvent = await db.calendarEvent.findFirst({
            where: {
              externalId: externalEvent.id,
              externalSource: 'outlook',
              userId: integration.userId
            }
          })

          if (existingEvent) {
            await db.calendarEvent.update({
              where: { id: existingEvent.id },
              data: {
                title: externalEvent.title,
                description: externalEvent.description,
                startTime: externalEvent.startTime,
                endTime: externalEvent.endTime,
                allDay: externalEvent.allDay,
                location: externalEvent.location,
                timezone: externalEvent.timezone || 'UTC',
                lastSyncAt: new Date()
              }
            })
            result.updated++
          } else {
            await db.calendarEvent.create({
              data: {
                title: externalEvent.title,
                description: externalEvent.description,
                startTime: externalEvent.startTime,
                endTime: externalEvent.endTime,
                allDay: externalEvent.allDay,
                location: externalEvent.location,
                timezone: externalEvent.timezone || 'UTC',
                externalId: externalEvent.id,
                externalSource: 'outlook',
                userId: integration.userId,
                lastSyncAt: new Date()
              }
            })
            result.imported++
          }
        }
      }

      // Export events to Outlook
      if (integration.syncDirection === 'export' || integration.syncDirection === 'bidirectional') {
        const localEvents = await db.calendarEvent.findMany({
          where: {
            userId: integration.userId,
            externalSource: null
          }
        })

        for (const localEvent of localEvents) {
          try {
            const externalId = await outlookIntegration.createEvent(calendarId || '', localEvent)
            
            await db.calendarEvent.update({
              where: { id: localEvent.id },
              data: {
                externalId,
                externalSource: 'outlook',
                lastSyncAt: new Date()
              }
            })
            result.exported++
          } catch (error) {
            result.errors.push(`Failed to export event "${localEvent.title}": ${error}`)
          }
        }
      }
    }
  }
}