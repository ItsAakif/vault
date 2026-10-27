import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import jwt from 'jsonwebtoken'
import { OAuth2Client } from 'google-auth-library'

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
)

interface GoogleTokenPayload {
  sub: string
  email: string
  name: string
  picture?: string
  email_verified: boolean
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { accessToken, idToken } = body

    if (!accessToken || !idToken) {
      return NextResponse.json(
        { error: 'Access token and ID token are required' },
        { status: 400 }
      )
    }

    // Verify the Google ID token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    })

    const payload = ticket.getPayload() as GoogleTokenPayload

    if (!payload || !payload.email_verified) {
      return NextResponse.json(
        { error: 'Invalid or unverified Google token' },
        { status: 401 }
      )
    }

    // Check if user exists or create new user
    let user = await db.user.findUnique({
      where: { email: payload.email }
    })

    if (!user) {
      // Create new user
      user = await db.user.create({
        data: {
          email: payload.email,
          name: payload.name,
          avatar: payload.picture,
          emailVerified: true,
          isActive: true
        }
      })

      // Create default user preferences
      await db.userPreferences.create({
        data: {
          userId: user.id,
          theme: 'system',
          language: 'en',
          timezone: 'UTC'
        }
      })
    } else {
      // Update existing user info
      user = await db.user.update({
        where: { id: user.id },
        data: {
          name: payload.name,
          avatar: payload.picture,
          lastLoginAt: new Date(),
          lastActive: new Date()
        }
      })
    }

    // Store Google tokens for Drive access
    await db.cloudIntegration.upsert({
      where: {
        userId_provider: {
          userId: user.id,
          provider: 'google'
        }
      },
      update: {
        accessToken,
        isActive: true,
        updatedAt: new Date()
      },
      create: {
        userId: user.id,
        provider: 'google',
        accessToken,
        tokenType: 'Bearer',
        scopes: JSON.stringify([
          'openid',
          'profile',
          'email',
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/drive.file'
        ]),
        isActive: true
      }
    })

    // Generate Vault JWT token
    const jwtSecret = process.env.NEXTAUTH_SECRET
    if (!jwtSecret) {
      throw new Error('JWT secret not configured')
    }

    const vaultToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name
      },
      jwtSecret,
      { expiresIn: '7d' }
    )

    // Log successful authentication
    await db.activity.create({
      data: {
        userId: user.id,
        type: 'LOGIN',
        action: 'google_oauth_login',
        entityType: 'user',
        entityId: user.id,
        metadata: {
          provider: 'google',
          timestamp: new Date().toISOString()
        }
      }
    })

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar
      },
      token: vaultToken,
      driveEnabled: true
    })

  } catch (error) {
    console.error('Google OAuth error:', error)
    
    return NextResponse.json(
      { 
        error: 'Authentication failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// GET endpoint to check authentication status
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const jwtSecret = process.env.NEXTAUTH_SECRET

    if (!jwtSecret) {
      throw new Error('JWT secret not configured')
    }

    const decoded = jwt.verify(token, jwtSecret) as any
    
    const user = await db.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        isActive: true
      }
    })

    if (!user || !user.isActive) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    return NextResponse.json({
      authenticated: true,
      user
    })

  } catch (error) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
}