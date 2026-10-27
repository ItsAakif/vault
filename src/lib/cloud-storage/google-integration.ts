// Canonical Google Drive token store for the web path (ADR-006 D1).
// The active `CloudIntegration` row for provider 'google' is authoritative; the JWT
// `session.user.accessToken` is demoted to a read-only fallback in `@/lib/auth`.
// Server-only: must never be imported from a 'use client' module.
import { db } from '@/lib/db'

export interface GoogleDriveTokens {
  accessToken: string
  refreshToken?: string | null
  expiresAt?: Date | null
}

// The canonical Drive authorization record for the web path.
export async function getActiveGoogleIntegration(userId: string) {
  return db.cloudIntegration.findFirst({
    where: { userId, provider: 'google', isActive: true },
  })
}

export async function getGoogleDriveTokensForUser(userId: string): Promise<GoogleDriveTokens | null> {
  const row = await getActiveGoogleIntegration(userId)
  if (!row) return null
  return { accessToken: row.accessToken, refreshToken: row.refreshToken, expiresAt: row.expiresAt }
}

export async function buildGoogleOAuthClient(tokens: GoogleDriveTokens) {
  const { google } = await import('googleapis')
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/drive/callback`
  )
  oauth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken ?? undefined,
    expiry_date: tokens.expiresAt ? new Date(tokens.expiresAt).getTime() : undefined,
  })
  return oauth2Client
}
