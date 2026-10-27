// Sign-in grants Drive (ADR-007 D3). Signing in with Google writes the canonical
// CloudIntegration row (ADR-006 D1) so the separate connect step is no longer required.
// Server-only: must never be imported from a 'use client' module.
import { db } from '@/lib/db'

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

export interface GoogleSignInAccount {
  access_token?: string | null
  refresh_token?: string | null
  expires_at?: number | null
  scope?: string | null
}

export function grantedScopes(scope?: string | null): string[] {
  return (scope ?? '').split(/\s+/).filter(Boolean)
}

export function grantsDrive(scope?: string | null): boolean {
  return grantedScopes(scope).includes(DRIVE_SCOPE)
}

export type PersistResult = 'written' | 'skipped'

export async function persistSignInDriveTokens(params: {
  userId: string
  account: GoogleSignInAccount
}): Promise<PersistResult> {
  const { userId, account } = params
  // Never claim a Drive grant that was not observed (spec AC-7/AC-8).
  if (!grantsDrive(account.scope) || !account.access_token) return 'skipped'

  const scopes = JSON.stringify(grantedScopes(account.scope))
  const expiresAt =
    typeof account.expires_at === 'number' ? new Date(account.expires_at * 1000) : undefined

  // Google only re-issues a refresh token under specific conditions, so when the account has
  // none the key is omitted entirely: Prisma treats an absent field as "leave unchanged", and
  // nulling a working refresh token would break Drive (ADR-007 D3).
  const update = {
    accessToken: account.access_token,
    tokenType: 'Bearer',
    expiresAt,
    scopes,
    isActive: true,
    updatedAt: new Date(),
    ...(account.refresh_token ? { refreshToken: account.refresh_token } : {}),
  }

  await db.cloudIntegration.upsert({
    where: { userId_provider: { userId, provider: 'google' } },
    update,
    create: {
      userId,
      provider: 'google',
      accessToken: account.access_token,
      refreshToken: account.refresh_token ?? null,
      tokenType: 'Bearer',
      expiresAt,
      scopes,
      isActive: true,
    },
  })
  return 'written'
}
