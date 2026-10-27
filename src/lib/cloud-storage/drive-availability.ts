// ADR-008 D1-D4: the single Drive-availability predicate and the shared failure contract.
// Server-only: must never be imported from a 'use client' module.
import { NextResponse } from 'next/server'
import type { OAuth2Client } from 'google-auth-library'
import {
  getActiveGoogleIntegration,
  getGoogleDriveTokensForUser,
  buildGoogleOAuthClient,
} from './google-integration'
import {
  DRIVE_CONNECT_URL,
  DRIVE_GRANT_INVALID,
  DRIVE_NOT_CONNECTED,
  DRIVE_UNAVAILABLE_STATUS,
  type DriveUnavailableCode,
} from './drive-error-codes'

export interface DriveUnavailableBody {
  error: string
  message: string
  code: DriveUnavailableCode
  connectUrl: string
}

export type DriveAccess =
  | { ok: true; userId: string; client: OAuth2Client }
  | { ok: false; status: typeof DRIVE_UNAVAILABLE_STATUS; body: DriveUnavailableBody }

export function driveNotConnectedBody(): DriveUnavailableBody {
  return {
    error: 'Google Drive not configured',
    message: 'Connect Google Drive from Settings > Cloud Storage to use this feature.',
    code: DRIVE_NOT_CONNECTED,
    connectUrl: DRIVE_CONNECT_URL,
  }
}

export function driveGrantInvalidBody(): DriveUnavailableBody {
  return {
    error: 'Google Drive access expired or was revoked',
    message: 'Reconnect Google Drive from Settings > Cloud Storage to continue.',
    code: DRIVE_GRANT_INVALID,
    connectUrl: DRIVE_CONNECT_URL,
  }
}

// The one availability predicate (ADR-008 D1): an active CloudIntegration row for
// provider 'google'. `session.user.accessToken` is never an input.
export async function checkDriveConnection(userId: string) {
  const integration = await getActiveGoogleIntegration(userId)
  return integration
    ? { connected: true as const, integration }
    : { connected: false as const }
}

// The one gate every Drive-dependent route calls (ADR-008 D2). A caller cannot obtain a
// client without having passed the gate, and cannot invent a different failure body.
export async function requireDriveAccess(userId: string): Promise<DriveAccess> {
  const tokens = await getGoogleDriveTokensForUser(userId)
  if (!tokens || !tokens.accessToken) {
    return { ok: false, status: DRIVE_UNAVAILABLE_STATUS, body: driveNotConnectedBody() }
  }
  // buildGoogleOAuthClient returns the googleapis auth.OAuth2 instance; the annotation
  // keeps the DriveAccess client field exact, without an unsafe cast.
  const client: OAuth2Client = await buildGoogleOAuthClient(tokens)
  return { ok: true, userId, client }
}

// The subset of a thrown googleapis/Drive error this module classifies. Reading the error
// through this shape avoids an unsafe cast while accepting anything a caller may throw.
interface DriveErrorShape {
  code?: unknown
  status?: unknown
  message?: unknown
  response?: { status?: unknown; data?: { error?: unknown; error_description?: unknown } }
  errors?: Array<{ reason?: unknown }>
}

function asDriveErrorShape(error: unknown): DriveErrorShape {
  return error as DriveErrorShape
}

function driveErrorStatus(error: unknown): number | undefined {
  const e = asDriveErrorShape(error)
  if (typeof e?.code === 'number') return e.code
  if (typeof e?.status === 'number') return e.status
  if (typeof e?.response?.status === 'number') return e.response.status
  return undefined
}

// ADR-008 D4. A 403 for quota/rate-limit (userRateLimitExceeded) is deliberately NOT a
// grant error: mislabelling it would push the user to re-consent for nothing.
export function isDriveGrantError(error: unknown): boolean {
  const e = asDriveErrorShape(error)
  if (driveErrorStatus(error) === 401) return true
  const text = [
    e?.message,
    e?.code,
    e?.response?.data?.error,
    e?.response?.data?.error_description,
    e?.errors?.[0]?.reason,
  ]
    .map((value) => String(value ?? ''))
    .join(' ')
  return /invalid_grant|invalid_credentials|insufficient authentication scopes|insufficient[_ ]permissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT|authError/i.test(
    text
  )
}

// Replaces the inner/outer `catch (driveError) { ... 500 ... }` bodies. Returns 403 with
// DRIVE_GRANT_INVALID for a dead grant, and the route's existing 500 body otherwise.
export function driveErrorResponse(error: unknown, fallbackMessage: string): NextResponse {
  if (isDriveGrantError(error)) {
    return NextResponse.json(driveGrantInvalidBody(), { status: DRIVE_UNAVAILABLE_STATUS })
  }
  const details = error instanceof Error ? error.message : String(error ?? 'Unknown error')
  return NextResponse.json({ error: fallbackMessage, details }, { status: 500 })
}
