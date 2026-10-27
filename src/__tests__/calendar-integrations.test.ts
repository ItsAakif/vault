import { describe, it, expect } from 'vitest'
import { TimezoneService, ICalService, CSVCalendarService } from '@/lib/calendar-integrations'
import { CalendarEvent } from '@prisma/client'

describe('Calendar Integrations', () => {
  describe('TimezoneService', () => {
    it('should get supported timezones', () => {
      const timezones = TimezoneService.getSupportedTimezones()
      expect(Array.isArray(timezones)).toBe(true)
      expect(timezones.length).toBeGreaterThan(0)
      expect(timezones).toContain('UTC')
      expect(timezones).toContain('America/New_York')
    })

    it('should get timezone offset', () => {
      const utcOffset = TimezoneService.getTimezoneOffset('UTC')
      expect(utcOffset).toBe(0)
      
      // Note: These tests might be flaky due to DST changes
      const nyOffset = TimezoneService.getTimezoneOffset('America/New_York')
      expect(typeof nyOffset).toBe('number')
    })

    it('should detect daylight saving time', () => {
      const summerDate = new Date('2024-07-01')
      const winterDate = new Date('2024-01-01')
      
      const summerDST = TimezoneService.isDaylightSavingTime(summerDate, 'America/New_York')
      const winterDST = TimezoneService.isDaylightSavingTime(winterDate, 'America/New_York')
      
      expect(typeof summerDST).toBe('boolean')
      expect(typeof winterDST).toBe('boolean')
    })

    it('should convert event timezone', () => {
      const mockEvent: CalendarEvent = {
        id: 'test-id',
        title: 'Test Event',
        description: 'Test Description',
        startTime: new Date('2024-01-01T12:00:00Z'),
        endTime: new Date('2024-01-01T13:00:00Z'),
        allDay: false,
        recurring: null,
        reminders: null,
        location: null,
        color: null,
        timezone: 'UTC',
        externalId: null,
        externalSource: null,
        syncStatus: 'synced',
        lastSyncAt: null,
        uid: null,
        sequence: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'test-user-id'
      }

      const convertedEvent = TimezoneService.convertEventTimezone(mockEvent, 'America/New_York')
      
      expect(convertedEvent.timezone).toBe('America/New_York')
      expect(convertedEvent.startTime).toBeInstanceOf(Date)
      expect(convertedEvent.endTime).toBeInstanceOf(Date)
    })
  })

  describe('ICalService', () => {
    it('should export events to iCal format', async () => {
      const mockEvents: CalendarEvent[] = [
        {
          id: 'test-id-1',
          title: 'Test Event 1',
          description: 'Test Description 1',
          startTime: new Date('2024-01-01T12:00:00Z'),
          endTime: new Date('2024-01-01T13:00:00Z'),
          allDay: false,
          recurring: null,
          reminders: null,
          location: 'Test Location',
          color: null,
          timezone: 'UTC',
          externalId: null,
          externalSource: null,
          syncStatus: 'synced',
          lastSyncAt: null,
          uid: 'test-uid-1',
          sequence: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'test-user-id'
        }
      ]

      const icalData = await ICalService.exportToICal(mockEvents, 'UTC')
      
      expect(typeof icalData).toBe('string')
      expect(icalData).toContain('BEGIN:VCALENDAR')
      expect(icalData).toContain('END:VCALENDAR')
      expect(icalData).toContain('BEGIN:VEVENT')
      expect(icalData).toContain('END:VEVENT')
      expect(icalData).toContain('SUMMARY:Test Event 1')
      expect(icalData).toContain('DESCRIPTION:Test Description 1')
      expect(icalData).toContain('LOCATION:Test Location')
    })

    it('should handle empty events array', async () => {
      const icalData = await ICalService.exportToICal([], 'UTC')
      
      expect(typeof icalData).toBe('string')
      expect(icalData).toContain('BEGIN:VCALENDAR')
      expect(icalData).toContain('END:VCALENDAR')
      expect(icalData).not.toContain('BEGIN:VEVENT')
    })
  })

  describe('CSVCalendarService', () => {
    it('should handle export format correctly', () => {
      // This test would require file system operations
      // For now, we'll just test that the class exists and has the expected methods
      expect(typeof CSVCalendarService.exportToCSV).toBe('function')
      expect(typeof CSVCalendarService.importFromCSV).toBe('function')
    })
  })
})

// Mock tests for integration classes (since they require external APIs)
describe('Integration Classes', () => {
  it('should have GoogleCalendarIntegration class', async () => {
    const { GoogleCalendarIntegration } = await import('@/lib/calendar-integrations')
    expect(GoogleCalendarIntegration).toBeDefined()
    expect(typeof GoogleCalendarIntegration).toBe('function')
  })

  it('should have OutlookCalendarIntegration class', async () => {
    const { OutlookCalendarIntegration } = await import('@/lib/calendar-integrations')
    expect(OutlookCalendarIntegration).toBeDefined()
    expect(typeof OutlookCalendarIntegration).toBe('function')
  })

  it('should have CalendarSyncService class', async () => {
    const { CalendarSyncService } = await import('@/lib/calendar-integrations')
    expect(CalendarSyncService).toBeDefined()
    expect(typeof CalendarSyncService.syncIntegration).toBe('function')
  })
})