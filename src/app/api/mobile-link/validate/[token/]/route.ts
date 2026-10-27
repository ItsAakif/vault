import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * GET /api/mobile-link/validate/:token
 * Validate and exchange mobile link token for Google Drive access
 * Called by mobile app to authenticate with the same Google Drive as web app
 */
export async function GET(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  try {
    const params = await props.params
    const token = params.token

    if (!token) {
      return NextResponse.json(
        { error: 'Token required' },
        { status: 400 }
      )
    }

    // Find token in database
  const mobileToken = await (db as any).mobileToken.findUnique({
      where: { token },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      }
    })

    // Token not found
    if (!mobileToken) {
      return NextResponse.json(
        {
          error: 'Invalid token',
          message: 'The provided token is invalid or has expired'
        },
        { status: 404 }
      )
    }

    // Token expired
    if (new Date() > mobileToken.expiresAt) {
      // Delete expired token
  await (db as any).mobileToken.delete({
        where: { id: mobileToken.id }
      })

      return NextResponse.json(
        {
          error: 'Token expired',
          message: 'The link has expired. Please generate a new one.'
        },
        { status: 401 }
      )
    }

    // Mark token as used
  await (db as any).mobileToken.update({
      where: { id: mobileToken.id },
      data: {
        used: true,
        usedAt: new Date()
      }
    })

    // Return Google Drive tokens and user info
    return NextResponse.json(
      {
        success: true,
        message: 'Token validated successfully',
        data: {
          userId: mobileToken.user.id,
          userEmail: mobileToken.user.email,
          userName: mobileToken.user.name,
          googleAccessToken: mobileToken.googleAccessToken,
          googleRefreshToken: mobileToken.googleRefreshToken,
          expiresAt: mobileToken.expiresAt.toISOString()
        }
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Error validating mobile link:', error)

    return NextResponse.json(
      {
        error: 'Failed to validate token',
        details: error.message || 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}
