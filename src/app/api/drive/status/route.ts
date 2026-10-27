import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions, getGoogleDriveClient } from '@/lib/auth'
import { getActiveGoogleIntegration } from '@/lib/cloud-storage/google-integration'
import GoogleDriveBackendService from '@/lib/google-drive-backend'

/**
 * GET /api/drive/status
 * Check if user's Google Drive vault is set up and connected
 * Returns vault status, connection info, and folder structure
 */
export async function GET(request: NextRequest) {
  try {
    // Get user session
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if the user has an active Google Drive integration (canonical store)
    const integration = await getActiveGoogleIntegration(session.user.id)

    if (!integration) {
      return NextResponse.json(
        {
          success: false,
          status: 'not_configured',
          message: 'Google Drive not connected. Connect Google Drive from Settings > Integrations.',
          isConnected: false,
          vaultExists: false
        },
        { status: 200 }
      )
    }

    try {
      // Get authenticated Google Drive client
      const oauth2Client = await getGoogleDriveClient(session)

      // Initialize Google Drive backend service
      const driveService = new GoogleDriveBackendService(oauth2Client, session.user.id)

      // Try to initialize vault structure (will find existing or create new)
      const vault = await driveService.initializeVaultStructure([
        'Notes',
        'Resources',
        'Poetry',
        'Projects',
        'Jobs',
        'Calendar',
        'Tags',
        'Archive'
      ])

      return NextResponse.json(
        {
          success: true,
          status: 'connected',
          message: 'Google Drive vault is configured',
          isConnected: true,
          vaultExists: true,
          data: {
            vaultFolderId: vault.vaultFolderId,
            categories: Object.keys(vault.folders),
            setupPercentage: 100,
            userEmail: session.user.email,
            userName: session.user.name,
            lastChecked: new Date().toISOString()
          }
        },
        { status: 200 }
      )
    } catch (driveError: any) {
      // Google Drive API error
      console.error('Google Drive API error:', driveError)

      return NextResponse.json(
        {
          success: false,
          status: 'error',
          message: 'Failed to connect to Google Drive',
          isConnected: false,
          vaultExists: false,
          error: driveError.message || 'Unknown error'
        },
        { status: 200 }
      )
    }
  } catch (error: any) {
    console.error('Error checking Google Drive status:', error)

    return NextResponse.json(
      {
        success: false,
        status: 'error',
        message: 'Failed to check vault status',
        isConnected: false,
        vaultExists: false,
        details: error.message || 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}
