'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { startGoogleDriveConnect } from '@/lib/drive-client'
import { toastError } from '@/lib/toast'

/**
 * ADR-008 D5: the one-click "Connect Google Drive" call to action shared by every Drive-dependent
 * surface. It delegates to `startGoogleDriveConnect()` so the notice CTA and the
 * /settings/cloud-storage page perform exactly the same sequence.
 */
export function DriveConnectButton({ className, label }: { className?: string; label?: string }) {
  const [connecting, setConnecting] = useState(false)

  const handleClick = async () => {
    setConnecting(true)
    try {
      const result = await startGoogleDriveConnect()
      if (!result.ok) {
        toastError('Connection Failed', result.message)
      }
    } finally {
      setConnecting(false)
    }
  }

  return (
    <Button className={className} onClick={handleClick} disabled={connecting}>
      {connecting ? (
        <>
          <Loader2 className="animate-spin" />
          Connecting...
        </>
      ) : (
        label ?? 'Connect Google Drive'
      )}
    </Button>
  )
}
