import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { OutlookCalendarIntegration } from '@/lib/calendar-integrations'

// GET /api/calendar/auth/outlook - Get Outlook OAuth URL
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const config = {
      clientId: process.env.OUTLOOK_CLIENT_ID!,
      clientSecret: process.env.OUTLOOK_CLIENT_SECRET!,
      redirectUri: process.env.OUTLOOK_REDIRECT_URI!,
      scopes: ['https://graph.microsoft.com/Calendars.ReadWrite']
    }

    const outlookIntegration = new OutlookCalendarIntegration(config)
    const authUrl = await outlookIntegration.getAuthUrl()

    return NextResponse.json({ authUrl })
  } catch (error) {
    console.error('Error generating Outlook auth URL:', error)
    return NextResponse.json(
      { error: 'Failed to generate auth URL' },
      { status: 500 }
    )
  }
}

// POST /api/calendar/auth/outlook - Exchange code for tokens
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { code } = await request.json()
    if (!code) {
      return NextResponse.json({ error: 'Authorization code required' }, { status: 400 })
    }

    // Exchange code for access token using Microsoft Graph
    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: process.env.OUTLOOK_CLIENT_ID!,
        client_secret: process.env.OUTLOOK_CLIENT_SECRET!,
        code,
        redirect_uri: process.env.OUTLOOK_REDIRECT_URI!,
        grant_type: 'authorization_code',
        scope: 'https://graph.microsoft.com/Calendars.ReadWrite'
      })
    })

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for tokens')
    }

    const tokens = await tokenResponse.json()

    // Get available calendars
    const outlookIntegration = new OutlookCalendarIntegration({
      clientId: process.env.OUTLOOK_CLIENT_ID!,
      clientSecret: process.env.OUTLOOK_CLIENT_SECRET!,
      redirectUri: process.env.OUTLOOK_REDIRECT_URI!,
      scopes: []
    }, tokens.access_token)

    const calendars = await outlookIntegration.getCalendars()

    return NextResponse.json({
      tokens,
      calendars: calendars.map(cal => ({
        id: cal.id,
        name: cal.name,
        description: cal.description,
        canEdit: cal.canEdit,
        canShare: cal.canShare,
        canViewPrivateItems: cal.canViewPrivateItems
      }))
    })
  } catch (error) {
    console.error('Error exchanging Outlook auth code:', error)
    return NextResponse.json(
      { error: 'Failed to exchange authorization code' },
      { status: 500 }
    )
  }
}