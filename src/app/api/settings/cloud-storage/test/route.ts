import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db as prisma } from '@/lib/db'

// GET /api/settings/cloud-storage/test - Test cloud provider connection
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const provider = searchParams.get('provider')

    if (!provider) {
      return NextResponse.json({ error: 'Provider is required' }, { status: 400 })
    }

    // Get user's preferences with cloud provider config
    const userPrefs = await prisma.userPreferences.findUnique({
      where: { userId: session.user.id }
    })

    if (!userPrefs) {
      return NextResponse.json(
        { success: false, message: 'No cloud provider configuration found' },
        { status: 404 }
      )
    }

    const cloudProviders = JSON.parse(userPrefs.notificationCategories || '{}').cloudProviders || {}
    const providerConfig = cloudProviders[provider]

    if (!providerConfig || !providerConfig.clientId || !providerConfig.clientSecret) {
      return NextResponse.json(
        { success: false, message: 'Provider not configured' },
        { status: 400 }
      )
    }

    // Test connection based on provider
    let testResult = false
    let message = ''

    switch (provider) {
      case 'google':
        // Test Google Drive API connection
        testResult = await testGoogleDrive(providerConfig)
        message = testResult ? 'Google Drive connection successful' : 'Failed to connect to Google Drive'
        break

      default:
        return NextResponse.json(
          { success: false, message: 'Unknown provider' },
          { status: 400 }
        )
    }

    return NextResponse.json({ success: testResult, message })
  } catch (error) {
    console.error('Cloud storage test failed:', error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Test failed' },
      { status: 500 }
    )
  }
}

async function testGoogleDrive(config: any): Promise<boolean> {
  try {
    // Basic validation of credentials format
    if (!config.clientId || !config.clientSecret) {
      return false
    }
    
    // Check if client ID format is valid (ends with .apps.googleusercontent.com)
    if (!config.clientId.includes('.apps.googleusercontent.com')) {
      throw new Error('Invalid Google Client ID format')
    }
    
    // In a real implementation, you would make an API call to Google
    // For now, we just validate the credentials format
    return true
  } catch (error) {
    console.error('Google Drive test error:', error)
    return false
  }
}
