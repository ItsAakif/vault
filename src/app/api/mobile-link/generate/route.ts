import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getGoogleDriveTokensForUser } from '@/lib/cloud-storage/google-integration'
import { driveNotConnectedBody } from '@/lib/cloud-storage/drive-availability'
import { DRIVE_UNAVAILABLE_STATUS } from '@/lib/cloud-storage/drive-error-codes'
import crypto from 'crypto'

/**
 * POST /api/mobile-link/generate
 * Generate a mobile link token for authenticating mobile app with web app's Google Drive
 * Link format: https://yourdomain.com/mobile-sync?token=XXX
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

    // ADR-008 D1/D5: the canonical CloudIntegration row is the only Drive gate. A Google
    // session whose JWT carries tokens but which was granted no Drive scope has no row, and the
    // old JWT-token gate minted a link whose tokens no Drive call accepts.
    const tokens = await getGoogleDriveTokensForUser(session.user.id)
    if (!tokens || !tokens.accessToken) {
      return NextResponse.json(driveNotConnectedBody(), { status: DRIVE_UNAVAILABLE_STATUS })
    }

    // Generate random token
    const token = crypto.randomBytes(32).toString('hex')

    // Calculate expiry (24 hours from now)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    // Store token in database (tokens are encrypted in production)
  const mobileToken = await (db as any).mobileToken.create({
      data: {
        token,
        googleAccessToken: tokens.accessToken,
        googleRefreshToken: tokens.refreshToken ?? '',
        expiresAt,
        userId: session.user.id
      }
    })

    // Generate shareable link
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const mobileLink = `${baseUrl}/mobile-sync?token=${token}`

    return NextResponse.json(
      {
        success: true,
        message: 'Mobile link generated successfully',
        data: {
          link: mobileLink,
          token,
          expiresIn: '24 hours',
          expiresAt: expiresAt.toISOString(),
          instructions: 'Share this link with your mobile app. User has 24 hours to use it.'
        }
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error generating mobile link:', error)

    return NextResponse.json(
      {
        error: 'Failed to generate mobile link',
        details: error.message || 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/mobile-link/[token]
 * Revoke a mobile link token
 */
export async function DELETE(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const params = await props.params
    const token = params.token

    // Revoke token - simply delete it
  await (db as any).mobileToken.deleteMany({
      where: {
        token,
        userId: session.user.id
      }
    })

    return NextResponse.json(
      {
        success: true,
        message: 'Mobile link revoked successfully'
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Error revoking mobile link:', error)

    return NextResponse.json(
      {
        error: 'Failed to revoke mobile link',
        details: error.message || 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}
