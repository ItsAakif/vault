import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { google } from 'googleapis';
import { db } from '@/lib/db';
import { verifyOAuthState } from '@/lib/cloud-storage/oauth-state';

// GET /api/drive/callback - Handle Google Drive OAuth callback
export async function GET(request: NextRequest) {
  try {
    // The callback is authenticated: the session is read FIRST, and without a valid session no
    // Google call is made and no token is written (ADR-006 D4b).
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/settings/integrations?error=not_authenticated&provider=google`
      );
    }
    // ADR-006 D4b: the user is taken from the session, NEVER from `state`.
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle OAuth errors
    if (error) {
      console.error('Google Drive OAuth error:', error);
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/settings/integrations?error=oauth_error&provider=google`
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/settings/integrations?error=missing_params&provider=google`
      );
    }

    // `state` is a signed, session-bound nonce; reject anything unsigned, tampered, expired or
    // bound to a different user before exchanging the code.
    const verifiedState = verifyOAuthState(state);
    if (!verifiedState || verifiedState.userId !== userId) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/settings/integrations?error=invalid_state&provider=google`
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
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/settings/integrations?error=token_exchange&provider=google`
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

    // Test the connection by getting user info
    try {
      oauth2Client.setCredentials(tokens);
      const drive = google.drive({ version: 'v3', auth: oauth2Client });
      const about = await drive.about.get({ fields: 'user' });

      // CloudIntegration has no metadata column, so the fetched profile is only
      // used to verify the connection here (there is nowhere to persist it).
      console.log('Google Drive connection verified for', about.data.user?.emailAddress);
    } catch (testError) {
      console.warn('Failed to test Google Drive connection:', testError);
      // Continue anyway, the tokens might still be valid
    }

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

    // Redirect to success page
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings/integrations?success=google_connected`
    );
  } catch (error) {
    console.error('Google Drive callback error:', error);
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings/integrations?error=callback_error&provider=google`
    );
  }
}