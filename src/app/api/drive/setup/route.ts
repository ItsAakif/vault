import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions, getGoogleDriveClient } from '@/lib/auth'
import { getActiveGoogleIntegration } from '@/lib/cloud-storage/google-integration'
import GoogleDriveBackendService from '@/lib/google-drive-backend'

/**
 * POST /api/drive/setup
 * Initialize Google Drive vault structure for the user
 * Creates /Vault folder and all default category subfolders
 */
export async function POST(request: NextRequest) {
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
        { error: 'Google Drive access required. Connect Google Drive first.' },
        { status: 403 }
      )
    }

    // Get authenticated Google Drive client
    const oauth2Client = await getGoogleDriveClient(session)

    // Initialize Google Drive backend service
    const driveService = new GoogleDriveBackendService(oauth2Client, session.user.id)

    // Default categories to create
    const defaultCategories = [
      'Notes',
      'Resources',
      'Poetry',
      'Projects',
      'Jobs',
      'Calendar',
      'Tags',
      'Archive'
    ]

    // Initialize vault structure
    const structure = await driveService.initializeVaultStructure(defaultCategories)

    return NextResponse.json(
      {
        success: true,
        message: 'Vault structure initialized successfully',
        data: {
          vaultFolderId: structure.vaultFolderId,
          categories: structure.folders,
          createdAt: new Date().toISOString()
        }
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Error setting up Google Drive vault:', error)

    return NextResponse.json(
      {
        error: 'Failed to initialize vault',
        details: error.message || 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}
