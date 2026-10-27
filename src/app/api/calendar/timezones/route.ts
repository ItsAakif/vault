import { NextRequest, NextResponse } from 'next/server'
import { TimezoneService } from '@/lib/calendar-integrations'

// GET /api/calendar/timezones - Get supported timezones
export async function GET() {
  try {
    const timezones = TimezoneService.getSupportedTimezones()
    
    // Group timezones by region for better UX
    const groupedTimezones = timezones.reduce((acc: any, tz: string) => {
      const parts = tz.split('/')
      const region = parts[0]
      const city = parts.slice(1).join('/')
      
      if (!acc[region]) {
        acc[region] = []
      }
      
      acc[region].push({
        value: tz,
        label: city ? `${city.replace(/_/g, ' ')}` : tz,
        offset: TimezoneService.getTimezoneOffset(tz)
      })
      
      return acc
    }, {})

    // Sort regions and cities
    Object.keys(groupedTimezones).forEach(region => {
      groupedTimezones[region].sort((a: any, b: any) => a.label.localeCompare(b.label))
    })

    return NextResponse.json({
      timezones: groupedTimezones,
      total: timezones.length
    })
  } catch (error) {
    console.error('Error fetching timezones:', error)
    return NextResponse.json(
      { error: 'Failed to fetch timezones' },
      { status: 500 }
    )
  }
}

// POST /api/calendar/timezones/convert - Convert event timezone
export async function POST(request: NextRequest) {
  try {
    const { eventId, targetTimezone } = await request.json()
    
    if (!eventId || !targetTimezone) {
      return NextResponse.json(
        { error: 'Event ID and target timezone are required' },
        { status: 400 }
      )
    }

    // This would typically be used in the frontend to convert display times
    // For now, just return the timezone info
    const offset = TimezoneService.getTimezoneOffset(targetTimezone)
    const isDST = TimezoneService.isDaylightSavingTime(new Date(), targetTimezone)

    return NextResponse.json({
      timezone: targetTimezone,
      offset,
      isDST,
      message: 'Use this information to convert event times in the frontend'
    })
  } catch (error) {
    console.error('Error converting timezone:', error)
    return NextResponse.json(
      { error: 'Failed to convert timezone' },
      { status: 500 }
    )
  }
}