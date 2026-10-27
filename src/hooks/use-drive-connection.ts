'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DRIVE_CONNECT_URL,
  isDriveUnavailableCode,
  type DriveUnavailableCode,
} from '@/lib/cloud-storage/drive-error-codes'

export interface DriveConnectionState {
  loading: boolean
  connected: boolean | null // null = not known yet / could not be determined
  connectRequired: boolean // true ONLY for DRIVE_NOT_CONNECTED / DRIVE_GRANT_INVALID
  message: string | null
  connectUrl: string
  refresh: () => Promise<void>
}

// ADR-008 D5 edge case 7: "we could not check" is not "Drive is disconnected", so the hook must
// not claim disconnection and must not render the connect CTA for it.
const COULD_NOT_CHECK_MESSAGE = 'Could not determine whether Google Drive is connected.'

const DEFAULT_MESSAGES: Record<DriveUnavailableCode, string> = {
  DRIVE_NOT_CONNECTED: 'Connect Google Drive from Settings > Cloud Storage to use this feature.',
  DRIVE_GRANT_INVALID: 'Reconnect Google Drive from Settings > Cloud Storage to continue.',
}

interface ConnectionBody {
  connected?: unknown
  code?: unknown
  message?: unknown
  connectUrl?: unknown
}

/**
 * One `GET /api/drive/connection` probe on mount (and again on `refresh()`).
 *
 * Only the two DRIVE_* codes count as "connect required": a 401, the 500 INTERNAL_ERROR body and a
 * network failure all resolve to `connected: null, connectRequired: false`, so a page renders a
 * retry rather than a re-consent CTA for a problem re-consent cannot fix.
 */
export function useDriveConnection(): DriveConnectionState {
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [connectRequired, setConnectRequired] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [connectUrl, setConnectUrl] = useState<string>(DRIVE_CONNECT_URL)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/drive/connection')
      const body = (await response.json().catch(() => null)) as ConnectionBody | null

      if (response.ok && body?.connected === true) {
        setConnected(true)
        setConnectRequired(false)
        setMessage(null)
        return
      }

      const code = body?.code
      if (response.ok && body?.connected === false && isDriveUnavailableCode(code)) {
        setConnected(false)
        setConnectRequired(true)
        setMessage(
          typeof body.message === 'string' && body.message ? body.message : DEFAULT_MESSAGES[code]
        )
        setConnectUrl(
          typeof body.connectUrl === 'string' && body.connectUrl ? body.connectUrl : DRIVE_CONNECT_URL
        )
        return
      }

      // 401, the 500 INTERNAL_ERROR, a malformed body, or a network failure: unknown, not
      // disconnected.
      setConnected(null)
      setConnectRequired(false)
      setMessage(COULD_NOT_CHECK_MESSAGE)
    } catch {
      setConnected(null)
      setConnectRequired(false)
      setMessage(COULD_NOT_CHECK_MESSAGE)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { loading, connected, connectRequired, message, connectUrl, refresh }
}
