import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { checkDriveConnection, driveNotConnectedBody } from '@/lib/cloud-storage/drive-availability'

/**
 * GET /api/drive/connection
 * ADR-008 D5: a cheap, always-200-for-the-disconnected-case probe. It performs NO Drive call
 * (unlike /api/drive/status, which initialises the vault when a row exists), so pages can call
 * it on mount to learn "Drive is not connected" without a Drive round trip.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { connected } = await checkDriveConnection(session.user.id)
    if (connected) {
      return NextResponse.json({ connected: true })
    }

    const body = driveNotConnectedBody()
    return NextResponse.json({
      connected: false,
      code: body.code,
      message: body.message,
      connectUrl: body.connectUrl,
    })
  } catch (error) {
    console.error('Error checking Google Drive connection:', error)
    return NextResponse.json(
      {
        connected: false,
        code: 'INTERNAL_ERROR',
        message: 'Could not determine whether Google Drive is connected.',
      },
      { status: 500 }
    )
  }
}
