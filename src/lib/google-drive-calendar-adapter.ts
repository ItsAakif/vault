import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { isAppOwnedFile, readDriveMediaText } from './google-drive-media'

export interface CalendarEventData {
  id: string
  title: string
  description?: string
  startDate: Date
  endDate: Date
  location?: string
  attendees?: string[]
  reminders?: number[] // minutes before
  isAllDay: boolean
  recurrence?: string // iCal recurrence rule
  color?: string
  createdAt: Date
  updatedAt: Date
}

export class GoogleDriveCalendarAdapter {
  private drive: any
  private oauth2Client: OAuth2Client
  private userId: string
  private vaultFolderId: string | null = null
  private calendarFolderId: string | null = null

  constructor(oauth2Client: OAuth2Client, userId: string) {
    this.oauth2Client = oauth2Client
    this.drive = google.drive({ version: 'v3', auth: oauth2Client })
    this.userId = userId
  }

  async initialize(vaultFolderId?: string) {
    if (vaultFolderId) {
      this.vaultFolderId = vaultFolderId
    } else {
      const vaultFolder = await this.findFolderByName('Vault', null)
      if (!vaultFolder) {
        throw new Error('Vault folder not found')
      }
      this.vaultFolderId = vaultFolder.id
    }

    const calendarFolder = await this.findOrCreateFolder('Calendar', this.vaultFolderId)
    this.calendarFolderId = calendarFolder.id
  }

  async listEvents(): Promise<CalendarEventData[]> {
    if (!this.calendarFolderId) {
      throw new Error('Adapter not initialized')
    }

    try {
      // T092: only the app's own `.event.json` sidecars are events. `mimeType='application/json'`
      // keeps Google Docs editors files (which have no binary content and 403 on alt=media) out of
      // the collection entirely.
      const response = await this.drive.files.list({
        q: `'${this.calendarFolderId}' in parents and name contains '.event.json' and mimeType='application/json' and trashed=false`,
        spaces: 'drive',
        fields: 'files(id, name, mimeType)',
        pageSize: 100
      })

      const events: CalendarEventData[] = []
      for (const file of (response.data.files || []).filter(isAppOwnedFile)) {
        const event = await this.readEventData(file.id, file.mimeType)
        if (event) {
          events.push(event)
        }
      }

      return events.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    } catch (error) {
      console.error('Error listing calendar events:', error)
      throw error
    }
  }

  async createEvent(
    title: string,
    startDate: Date,
    endDate: Date,
    description?: string,
    location?: string,
    attendees?: string[],
    reminders?: number[],
    isAllDay?: boolean,
    recurrence?: string,
    color?: string
  ): Promise<CalendarEventData> {
    if (!this.calendarFolderId) {
      throw new Error('Adapter not initialized')
    }

    try {
      const eventId = `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      const event: CalendarEventData = {
        id: eventId,
        title,
        description,
        startDate,
        endDate,
        location,
        attendees,
        reminders,
        isAllDay: isAllDay || false,
        recurrence,
        color,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const fileName = `${title}.event.json`
      await this.drive.files.create({
        resource: {
          name: fileName,
          mimeType: 'application/json',
          parents: [this.calendarFolderId]
        },
        media: {
          mimeType: 'application/json',
          body: JSON.stringify(event, null, 2)
        },
        fields: 'id'
      })

      return event
    } catch (error) {
      console.error('Error creating calendar event:', error)
      throw error
    }
  }

  async getEvent(eventId: string): Promise<CalendarEventData | null> {
    try {
      const response = await this.drive.files.list({
        q: `'${this.calendarFolderId}' in parents and name contains '.event.json' and mimeType='application/json' and trashed=false`,
        spaces: 'drive',
        fields: 'files(id, name, mimeType)',
        pageSize: 100
      })

      for (const file of (response.data.files || []).filter(isAppOwnedFile)) {
        const event = await this.readEventData(file.id, file.mimeType)
        if (event && event.id === eventId) {
          return event
        }
      }

      return null
    } catch (error) {
      console.error('Error getting calendar event:', error)
      return null
    }
  }

  async updateEvent(eventId: string, updates: Partial<CalendarEventData>): Promise<CalendarEventData> {
    try {
      const event = await this.getEvent(eventId)
      if (!event) {
        throw new Error('Calendar event not found')
      }

      const updated: CalendarEventData = {
        ...event,
        ...updates,
        updatedAt: new Date()
      }

      // Find file
      const response = await this.drive.files.list({
        q: `'${this.calendarFolderId}' in parents and name contains '.event.json' and mimeType='application/json' and trashed=false`,
        spaces: 'drive',
        fields: 'files(id, name, mimeType)',
        pageSize: 100
      })

      let fileId: string | null = null
      for (const file of (response.data.files || []).filter(isAppOwnedFile)) {
        const data = await this.readEventData(file.id, file.mimeType)
        if (data && data.id === eventId) {
          fileId = file.id
          break
        }
      }

      if (!fileId) {
        throw new Error('Calendar event file not found')
      }

      const newFileName = `${updated.title}.event.json`
      await this.drive.files.update({
        fileId,
        resource: { name: newFileName },
        media: {
          mimeType: 'application/json',
          body: JSON.stringify(updated, null, 2)
        }
      })

      return updated
    } catch (error) {
      console.error('Error updating calendar event:', error)
      throw error
    }
  }

  async deleteEvent(eventId: string): Promise<boolean> {
    try {
      const event = await this.getEvent(eventId)
      if (!event) {
        throw new Error('Calendar event not found')
      }

      const response = await this.drive.files.list({
        q: `'${this.calendarFolderId}' in parents and name contains '.event.json' and mimeType='application/json' and trashed=false`,
        spaces: 'drive',
        fields: 'files(id, name, mimeType)',
        pageSize: 100
      })

      for (const file of (response.data.files || []).filter(isAppOwnedFile)) {
        const data = await this.readEventData(file.id, file.mimeType)
        if (data && data.id === eventId) {
          await this.drive.files.update({
            fileId: file.id,
            resource: { trashed: true }
          })
          return true
        }
      }

      throw new Error('Calendar event file not found')
    } catch (error) {
      console.error('Error deleting calendar event:', error)
      throw error
    }
  }

  /**
   * T092 failure boundary: a refused editors file, a 403, or a corrupt body returns null rather
   * than throwing, and every caller skips a null. One unreadable event never fails `listEvents`;
   * the caller receives the events that did read.
   */
  private async readEventData(fileId: string, mimeType?: string | null): Promise<CalendarEventData | null> {
    try {
      const body = await readDriveMediaText(this.drive, fileId, mimeType)

      const data = JSON.parse(body)
      return {
        ...data,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt)
      } as CalendarEventData
    } catch (error) {
      console.error('Error reading calendar event data:', error)
      return null
    }
  }

  private async findOrCreateFolder(
    folderName: string,
    parentFolderId: string
  ): Promise<{ id: string; name: string }> {
    try {
      const query = `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed=false`

      const response = await this.drive.files.list({
        q: query,
        spaces: 'drive',
        fields: 'files(id, name)',
        pageSize: 1
      })

      if (response.data.files && response.data.files.length > 0) {
        return response.data.files[0]
      }

      const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId]
      }

      const createResponse = await this.drive.files.create({
        resource: fileMetadata,
        fields: 'id, name'
      })

      return createResponse.data
    } catch (error) {
      console.error('Error finding or creating folder:', error)
      throw error
    }
  }

  private async findFolderByName(
    folderName: string,
    parentFolderId: string | null
  ): Promise<{ id: string; name: string } | null> {
    try {
      let query = `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
      if (parentFolderId) {
        query += ` and '${parentFolderId}' in parents`
      }

      const response = await this.drive.files.list({
        q: query,
        spaces: 'drive',
        fields: 'files(id, name)',
        pageSize: 1
      })

      if (response.data.files && response.data.files.length > 0) {
        return response.data.files[0]
      }

      return null
    } catch (error) {
      console.error('Error finding folder:', error)
      return null
    }
  }
}
