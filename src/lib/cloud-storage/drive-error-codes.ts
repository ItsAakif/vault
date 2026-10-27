// Shared Google Drive failure vocabulary (ADR-008 D3). Importable from server and client
// modules alike: this file MUST import nothing.
export const DRIVE_NOT_CONNECTED = 'DRIVE_NOT_CONNECTED' as const
export const DRIVE_GRANT_INVALID = 'DRIVE_GRANT_INVALID' as const
export type DriveUnavailableCode = typeof DRIVE_NOT_CONNECTED | typeof DRIVE_GRANT_INVALID
export const DRIVE_CONNECT_URL = '/settings/cloud-storage' as const
export const DRIVE_UNAVAILABLE_STATUS = 403 as const

export function isDriveUnavailableCode(code: unknown): code is DriveUnavailableCode {
  return code === DRIVE_NOT_CONNECTED || code === DRIVE_GRANT_INVALID
}
