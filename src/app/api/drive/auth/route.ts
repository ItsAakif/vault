import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { google } from 'googleapis';
import { db } from '@/lib/db';
import { createOAuthState } from '@/lib/cloud-storage/oauth-state';

// GET /api/drive/auth - Get Google Drive OAuth URL
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return NextResponse.json(
        { success: false, error: 'Google Drive integration not configured' },
        { status: 500 }
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXTAUTH_URL}/api/drive/callback`
    );

    const scopes = [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.metadata.readonly'
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: createOAuthState(userId), // Signed, session-bound nonce verified by the callback
      prompt: 'consent' // Force consent to get refresh token
    });

    return NextResponse.json({
      success: true,
      authUrl
    });
  } catch (error) {
    console.error('Google Drive auth URL generation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate auth URL' },
      { status: 500 }
    );
  }
}

// POST /api/drive/auth - Exchange code for tokens
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const { code } = await request.json();

    if (!code) {
      return NextResponse.json(
        { success: false, error: 'Authorization code required' },
        { status: 400 }
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXTAUTH_URL}/api/drive/callback`
    );

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.access_token) {
      return NextResponse.json(
        { success: false, error: 'Failed to obtain access token' },
        { status: 400 }
      );
    }

    // Store tokens in database
    await db.cloudIntegration.upsert({
      where: {
        userId_provider: {
          userId,
          provider: 'google'
        }
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        tokenType: 'Bearer',
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        scopes: JSON.stringify([
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/drive.file',
          'https://www.googleapis.com/auth/drive.metadata.readonly'
        ]),
        isActive: true,
        updatedAt: new Date()
      },
      create: {
        userId,
        provider: 'google',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        tokenType: 'Bearer',
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        scopes: JSON.stringify([
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/drive.file',
          'https://www.googleapis.com/auth/drive.metadata.readonly'
        ]),
        isActive: true
      }
    });

    // Log the integration
    await db.activity.create({
      data: {
        userId,
        type: 'CREATE',
        action: 'google_drive_connected',
        entityType: 'integration',
        entityId: 'google-drive',
        metadata: {
          provider: 'google',
          scopes: [
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/drive.metadata.readonly'
          ]
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Google Drive connected successfully'
    });
  } catch (error) {
    console.error('Google Drive token exchange error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to connect Google Drive' },
      { status: 500 }
    );
  }
}

// DELETE /api/drive/auth - Disconnect Google Drive
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    // Deactivate the integration
    await db.cloudIntegration.updateMany({
      where: {
        userId,
        provider: 'google'
      },
      data: {
        isActive: false,
        updatedAt: new Date()
      }
    });

    // Log the disconnection
    await db.activity.create({
      data: {
        userId,
        type: 'DELETE',
        action: 'google_drive_disconnected',
        entityType: 'integration',
        entityId: 'google-drive',
        metadata: {
          provider: 'google'
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Google Drive disconnected successfully'
    });
  } catch (error) {
    console.error('Google Drive disconnect error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to disconnect Google Drive' },
      { status: 500 }
    );
  }
}