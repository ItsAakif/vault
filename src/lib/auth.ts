import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { createAuthAdapter } from '@/lib/auth-adapter'
import { JWT } from 'next-auth/jwt'
import { Session } from 'next-auth'
import { getGoogleDriveTokensForUser, buildGoogleOAuthClient } from '@/lib/cloud-storage/google-integration'
import { persistSignInDriveTokens } from '@/lib/cloud-storage/google-signin'

export const authOptions: NextAuthOptions = {
  // ADR-007 D2: the wrapper maps NextAuth's normalized profile onto this schema; every other
  // method stays stock PrismaAdapter.
  adapter: createAuthAdapter(),
  providers: [
    // Google OAuth Provider - the only identity provider (ADR-007 D1).
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      // ADR-007 D8: linking onto an existing local row by email is allowed ONLY because the
      // signIn callback below refuses any profile whose email Google has not verified.
      // Do not remove the gate while keeping this flag.
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          scope: [
            'openid',
            'profile',
            'email',
            'https://www.googleapis.com/auth/drive'
          ].join(' ')
        }
      }
    })
  ],

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60 // 30 days
  },

  callbacks: {
    // ADR-007 D8: this gate is the only thing that makes `allowDangerousEmailAccountLinking`
    // safe. It refuses any Google profile whose email Google has not verified, so a link onto an
    // existing row can never be based on an unverified email claim. Removing it while keeping the
    // flag is an account-takeover path and a security regression.
    async signIn({ profile }: any) {
      // The raw Google profile (not the normalized one) carries email_verified
      // (next-auth/core/routes/callback.js:78-82 passes OAuthProfile).
      return profile?.email_verified === true
    },

    async jwt({ token, user, account, profile }: any) {
      // User just signed in
      if (user) {
        token.id = user.id
      }

      // Google OAuth first sign in
      if (account && account.provider === 'google') {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        token.expiresAt = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + 3600 * 1000
      }

      // ADR-007 D3: sign-in also grants Drive. `user` is present only on the initial sign-in,
      // which is exactly when NextAuth supplies `account`. This runs AFTER callbackHandler, so
      // `user.id` is the database id (signIn runs before, and has no user row for a first login).
      if (account?.provider === 'google' && user?.id) {
        try {
          const result = await persistSignInDriveTokens({ userId: user.id, account })
          if (result === 'skipped') {
            console.warn(
              '[auth] Google sign-in did not grant https://www.googleapis.com/auth/drive; ' +
                'Drive stays disconnected. Connect it from Settings > Cloud Storage.'
            )
          }
        } catch (error) {
          // Sign-in MUST NOT fail because Drive persistence failed (ADR-007 D3). A throw here
          // would escape callbacks.jwt and turn into /error?error=Callback with no cookie.
          console.error('[auth] Failed to persist Google Drive tokens at sign-in:', error)
        }
      }

      // Check if token is still valid (with 1 minute buffer)
      if (token.expiresAt && Date.now() < token.expiresAt - 60000) {
        return token
      }

      // Token needs refresh
      if (token.refreshToken) {
        return await refreshAccessToken(token)
      }

      return token
    },

    async session({ session, token }: any) {
      if (token.error) {
        // Token refresh failed
        return {
          ...session,
          user: {
            ...session.user,
            error: token.error
          }
        } as Session
      }

      return {
        ...session,
        user: {
          ...session.user,
          id: token.id || token.sub || '',
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          expiresAt: token.expiresAt
        }
      } as Session
    }
  },

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error'
  }
}

/**
 * Refresh Google OAuth Token
 */
async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken || ''
      })
    })

    const refreshedToken = await response.json()

    if (!response.ok) {
      throw refreshedToken
    }

    return {
      ...token,
      accessToken: refreshedToken.access_token,
      expiresAt: Date.now() + (refreshedToken.expires_in - 60) * 1000,
      refreshToken: refreshedToken.refresh_token ?? token.refreshToken
    }
  } catch (error) {
    console.error('Error refreshing access token:', error)

    return {
      ...token,
      error: 'RefreshAccessTokenError'
    }
  }
}

/**
 * Helper function to get valid OAuth2 client from session
 * Use this in API routes to get an authenticated Google Drive client
 */
export async function getGoogleDriveClient(session: Session) {
  // ADR-006 D1: the active CloudIntegration row is canonical; the JWT tokens are a
  // read-only fallback so the 14 JWT-gated domain routes keep working unchanged.
  const tokens = session?.user?.id ? await getGoogleDriveTokensForUser(session.user.id) : null
  if (tokens) return buildGoogleOAuthClient(tokens)

  if (session?.user?.accessToken) {
    return buildGoogleOAuthClient({
      accessToken: session.user.accessToken,
      refreshToken: session.user.refreshToken,
      expiresAt: session.user.expiresAt ? new Date(session.user.expiresAt) : null,
    })
  }

  throw new Error('No Google Drive authorization available')
}