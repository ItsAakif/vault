// ADR-008 D5: the client-safe half of the Drive failure vocabulary.
//
// Imported by 'use client' components, so it may import ONLY
// `@/lib/cloud-storage/drive-error-codes` (which imports nothing). The sibling availability
// module in that directory is server-only - it pulls in `next/server`, the Google auth library and
// the Prisma-backed integration store - so a value import of it here would leak server code into
// the browser bundle.
import {
  DRIVE_CONNECT_URL,
  DRIVE_GRANT_INVALID,
  DRIVE_NOT_CONNECTED,
  isDriveUnavailableCode,
  type DriveUnavailableCode,
} from '@/lib/cloud-storage/drive-error-codes'

// Re-exported so every UI surface imports one module for both the CTA target and the parser.
export { DRIVE_CONNECT_URL }

export interface DriveFailure {
  code: DriveUnavailableCode
  message: string
  connectUrl: string
}

// The server's own default copy for each code (driveNotConnectedBody() / driveGrantInvalidBody()),
// restated here so a body that omits `message` still renders actionable text instead of undefined.
const DEFAULT_MESSAGES: Record<DriveUnavailableCode, string> = {
  [DRIVE_NOT_CONNECTED]: 'Connect Google Drive from Settings > Cloud Storage to use this feature.',
  [DRIVE_GRANT_INVALID]: 'Reconnect Google Drive from Settings > Cloud Storage to continue.',
}

/**
 * The one place the "Connect Google Drive" action lives: GET /api/drive/auth, then follow the
 * returned `authUrl`. The /settings/cloud-storage page uses the same sequence, so the page and
 * the notice CTA cannot drift.
 *
 * Never throws: every failure is reported as `{ ok: false, message }`.
 */
export async function startGoogleDriveConnect(): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const response = await fetch('/api/drive/auth')

    // A 500 from this route is the "Google Drive integration not configured" discriminator
    // (GOOGLE_CLIENT_ID is empty on the server).
    if (response.status === 500) {
      return { ok: false, message: 'Google Drive is not configured on this server' }
    }

    if (!response.ok) {
      return { ok: false, message: 'Failed to start Google Drive authorization' }
    }

    const data = (await response.json()) as { authUrl?: unknown } | null
    const authUrl = data?.authUrl
    if (typeof authUrl !== 'string' || !authUrl) {
      return { ok: false, message: 'Google Drive did not return an authorization URL' }
    }

    window.location.href = authUrl
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.message ? error.message : 'Failed to connect Google Drive',
    }
  }
}

/**
 * Reads a Drive failure out of any response body. Returns null for anything that is not one of
 * the two Drive codes, so a generic 500 (or a 403 for quota/rate limit) never renders the
 * connect CTA.
 */
export function parseDriveFailure(body: unknown): DriveFailure | null {
  if (!body || typeof body !== 'object') return null

  const candidate = body as { code?: unknown; message?: unknown; connectUrl?: unknown }
  const code = candidate.code
  if (!isDriveUnavailableCode(code)) return null

  return {
    code,
    message:
      typeof candidate.message === 'string' && candidate.message
        ? candidate.message
        : DEFAULT_MESSAGES[code],
    connectUrl:
      typeof candidate.connectUrl === 'string' && candidate.connectUrl
        ? candidate.connectUrl
        : DRIVE_CONNECT_URL,
  }
}
