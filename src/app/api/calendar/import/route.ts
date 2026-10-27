import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { ICalService, CSVCalendarService } from '@/lib/calendar-integrations'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { z } from 'zod'

const importSchema = z.object({
  format: z.enum(['ical', 'csv']),
  data: z.string().optional(),
  timezone: z.string().default('UTC')
})

// POST /api/calendar/import - Import calendar events
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

    const formData = await request.formData()
    const file = formData.get('file') as File
    const format = formData.get('format') as string
    const timezone = (formData.get('timezone') as string) || 'UTC'

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }

    if (!['ical', 'csv'].includes(format)) {
      return NextResponse.json({ error: 'Invalid format. Must be ical or csv' }, { status: 400 })
    }

    // Save uploaded file temporarily
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const tempFilePath = join('/tmp', `import-${Date.now()}-${file.name}`)
    await writeFile(tempFilePath, buffer)

    let importedEvents: any[] = []

    try {
      if (format === 'ical') {
        const fileContent = buffer.toString('utf-8')
        importedEvents = await ICalService.importFromICal(fileContent, user.id)
      } else if (format === 'csv') {
        importedEvents = await CSVCalendarService.importFromCSV(tempFilePath, user.id)
      }

      // Clean up temp file
      await unlink(tempFilePath)

      return NextResponse.json({
        message: 'Calendar events imported successfully',
        imported: importedEvents.length,
        events: importedEvents.map(event => ({
          id: event.id,
          title: event.title,
          startTime: event.startTime,
          endTime: event.endTime
        }))
      })
    } catch (importError) {
      // Clean up temp file on error
      try {
        await unlink(tempFilePath)
      } catch (unlinkError) {
        console.error('Error cleaning up temp file:', unlinkError)
      }
      throw importError
    }
  } catch (error) {
    console.error('Error importing calendar events:', error)
    return NextResponse.json(
      { 
        error: 'Failed to import calendar events',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}