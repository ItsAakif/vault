import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { ICalService, CSVCalendarService } from '@/lib/calendar-integrations'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { z } from 'zod'

const exportSchema = z.object({
  format: z.enum(['ical', 'csv']),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  timezone: z.string().default('UTC'),
  eventIds: z.array(z.string()).optional()
})

// POST /api/calendar/export - Export calendar events
export async function POST(request: NextRequest) {
  try {
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
    const validatedData = exportSchema.parse(body)

    // Build query filters
    const whereClause: any = {
      userId: user.id
    }

    if (validatedData.eventIds && validatedData.eventIds.length > 0) {
      whereClause.id = {
        in: validatedData.eventIds
      }
    } else {
      // Apply date range filter if no specific events selected
      if (validatedData.startDate || validatedData.endDate) {
        whereClause.startTime = {}
        if (validatedData.startDate) {
          whereClause.startTime.gte = new Date(validatedData.startDate)
        }
        if (validatedData.endDate) {
          whereClause.startTime.lte = new Date(validatedData.endDate)
        }
      }
    }

    const events = await db.calendarEvent.findMany({
      where: whereClause,
      orderBy: { startTime: 'asc' }
    })

    if (events.length === 0) {
      return NextResponse.json({ error: 'No events found to export' }, { status: 404 })
    }

    let exportData: string
    let contentType: string
    let filename: string

    if (validatedData.format === 'ical') {
      exportData = await ICalService.exportToICal(events, validatedData.timezone)
      contentType = 'text/calendar'
      filename = `vault-calendar-export-${new Date().toISOString().split('T')[0]}.ics`
    } else {
      // For CSV, we need to create a temporary file
      const tempFilePath = join('/tmp', `export-${Date.now()}.csv`)
      await CSVCalendarService.exportToCSV(events, tempFilePath)
      
      // Read the file content
      const fs = require('fs')
      exportData = fs.readFileSync(tempFilePath, 'utf-8')
      
      // Clean up temp file
      fs.unlinkSync(tempFilePath)
      
      contentType = 'text/csv'
      filename = `vault-calendar-export-${new Date().toISOString().split('T')[0]}.csv`
    }

    // Return the file as a download
    return new NextResponse(exportData, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': Buffer.byteLength(exportData, 'utf-8').toString()
      }
    })
  } catch (error) {
    console.error('Error exporting calendar events:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { 
        error: 'Failed to export calendar events',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}