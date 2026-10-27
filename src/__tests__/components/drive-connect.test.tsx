import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'

// The notice's real component tree is rendered inside app providers; keep the render shallow and
// provider-free by mocking the only auth surface the tree could touch.
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  SessionProvider: ({ children }: { children: ReactNode }) => children,
}))

import { startGoogleDriveConnect, parseDriveFailure, DRIVE_CONNECT_URL } from '@/lib/drive-client'
import { DriveRequiredNotice } from '@/components/drive/drive-required-notice'
import { useDriveConnection } from '@/hooks/use-drive-connection'

// Minimal stand-in for the subset of Response the client modules read.
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

// jsdom refuses real navigation and window.location's own href is non-configurable, but the
// global `location` binding IS configurable under vitest's jsdom environment (and `window` is
// `globalThis` there), so stubbing it intercepts `window.location.href = ...` exactly.
function stubLocation() {
  vi.stubGlobal('location', { href: '' })
}

function readAssignedHref(): string {
  return (window.location as unknown as { href: string }).href
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('startGoogleDriveConnect', () => {
  beforeEach(() => {
    stubLocation()
  })

  it('follows the authUrl and reports ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { authUrl: '/api/drive/callback?code=x' }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await startGoogleDriveConnect()

    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/drive/auth')
    expect(readAssignedHref()).toBe('/api/drive/callback?code=x')
  })

  it('maps the credential-free 500 discriminator to its documented message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { error: 'Server error' })))

    const result = await startGoogleDriveConnect()

    expect(result).toEqual({
      ok: false,
      message: 'Google Drive is not configured on this server',
    })
    expect(readAssignedHref()).toBe('')
  })

  it('maps any other non-ok response to the generic authorization message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, { error: 'Forbidden' })))

    const result = await startGoogleDriveConnect()

    expect(result).toEqual({
      ok: false,
      message: 'Failed to start Google Drive authorization',
    })
    expect(readAssignedHref()).toBe('')
  })

  it('reports a missing authUrl instead of navigating', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, {})))

    const result = await startGoogleDriveConnect()

    expect(result).toEqual({
      ok: false,
      message: 'Google Drive did not return an authorization URL',
    })
    expect(readAssignedHref()).toBe('')
  })

  it('never throws when fetch rejects, and surfaces the error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    await expect(startGoogleDriveConnect()).resolves.toEqual({
      ok: false,
      message: 'network down',
    })
  })

  it('never throws when fetch rejects with a non-Error value', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('boom'))

    await expect(startGoogleDriveConnect()).resolves.toEqual({
      ok: false,
      message: 'Failed to connect Google Drive',
    })
  })
})

describe('parseDriveFailure', () => {
  it('reads both Drive codes, keeping the server message and connectUrl', () => {
    expect(
      parseDriveFailure({
        code: 'DRIVE_NOT_CONNECTED',
        message: 'Connect Google Drive from Settings > Cloud Storage to use this feature.',
        connectUrl: '/settings/cloud-storage',
      })
    ).toEqual({
      code: 'DRIVE_NOT_CONNECTED',
      message: 'Connect Google Drive from Settings > Cloud Storage to use this feature.',
      connectUrl: '/settings/cloud-storage',
    })

    expect(
      parseDriveFailure({
        code: 'DRIVE_GRANT_INVALID',
        message: 'Reconnect Google Drive from Settings > Cloud Storage to continue.',
        connectUrl: '/settings/cloud-storage',
      })
    ).toEqual({
      code: 'DRIVE_GRANT_INVALID',
      message: 'Reconnect Google Drive from Settings > Cloud Storage to continue.',
      connectUrl: '/settings/cloud-storage',
    })
  })

  it('defaults the message and the connectUrl when the body omits them', () => {
    const failure = parseDriveFailure({ code: 'DRIVE_NOT_CONNECTED' })

    expect(failure).not.toBeNull()
    expect(failure?.code).toBe('DRIVE_NOT_CONNECTED')
    expect(failure?.message).toBe(
      'Connect Google Drive from Settings > Cloud Storage to use this feature.'
    )
    expect(failure?.message).not.toBeUndefined()
    expect(failure?.connectUrl).toBe(DRIVE_CONNECT_URL)

    expect(parseDriveFailure({ code: 'DRIVE_GRANT_INVALID' })?.message).toBe(
      'Reconnect Google Drive from Settings > Cloud Storage to continue.'
    )
  })

  it('returns null for anything that is not one of the two Drive codes', () => {
    expect(parseDriveFailure(null)).toBeNull()
    expect(parseDriveFailure(undefined)).toBeNull()
    expect(parseDriveFailure({})).toBeNull()
    expect(parseDriveFailure({ code: 'INTERNAL_ERROR' })).toBeNull()
    // A generic 500 body: no code at all.
    expect(parseDriveFailure({ error: 'Failed to fetch content', details: 'boom' })).toBeNull()
    // Not an object at all.
    expect(parseDriveFailure('DRIVE_NOT_CONNECTED')).toBeNull()
  })
})

// Mounts the hook and lets the on-mount probe settle inside act, so the assertions read a
// flushed state and the run stays warning-free.
async function mountDriveConnectionHook() {
  const view = renderHook(() => useDriveConnection())
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return view
}

describe('useDriveConnection', () => {
  it('reports connected with no CTA when the probe says connected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { connected: true })))

    const { result } = await mountDriveConnectionHook()

    expect(result.current.loading).toBe(false)
    expect(result.current.connected).toBe(true)
    expect(result.current.connectRequired).toBe(false)
    expect(result.current.message).toBeNull()
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/drive/connection')
  })

  it('requires a connection only for the DRIVE_NOT_CONNECTED body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          connected: false,
          code: 'DRIVE_NOT_CONNECTED',
          message: 'Connect Google Drive from Settings > Cloud Storage to use this feature.',
          connectUrl: '/settings/cloud-storage',
        })
      )
    )

    const { result } = await mountDriveConnectionHook()

    expect(result.current.loading).toBe(false)
    expect(result.current.connected).toBe(false)
    expect(result.current.connectRequired).toBe(true)
    expect(result.current.message).toBe(
      'Connect Google Drive from Settings > Cloud Storage to use this feature.'
    )
    expect(result.current.connectUrl).toBe('/settings/cloud-storage')
  })

  it('requires a connection for a DRIVE_GRANT_INVALID body too', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { connected: false, code: 'DRIVE_GRANT_INVALID' }))
    )

    const { result } = await mountDriveConnectionHook()

    expect(result.current.connected).toBe(false)
    expect(result.current.connectRequired).toBe(true)
    expect(result.current.message).toBe(
      'Reconnect Google Drive from Settings > Cloud Storage to continue.'
    )
  })

  it('does NOT claim disconnection for the 500 INTERNAL_ERROR probe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(500, {
          connected: false,
          code: 'INTERNAL_ERROR',
          message: 'Could not determine whether Google Drive is connected.',
        })
      )
    )

    const { result } = await mountDriveConnectionHook()

    expect(result.current.connected).toBeNull()
    expect(result.current.connectRequired).toBe(false)
    expect(result.current.message).toBeTruthy()
  })

  it('does NOT claim disconnection for a 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { error: 'Unauthorized' })))

    const { result } = await mountDriveConnectionHook()

    expect(result.current.connected).toBeNull()
    expect(result.current.connectRequired).toBe(false)
    expect(result.current.message).toBeTruthy()
  })

  it('does NOT claim disconnection when the probe itself rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const { result } = await mountDriveConnectionHook()

    expect(result.current.connected).toBeNull()
    expect(result.current.connectRequired).toBe(false)
    expect(result.current.message).toBeTruthy()
  })

  it('re-checks the state on refresh', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { connected: false, code: 'INTERNAL_ERROR' }))
      .mockResolvedValueOnce(jsonResponse(200, { connected: true }))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = await mountDriveConnectionHook()
    expect(result.current.connected).toBeNull()

    await act(async () => {
      await result.current.refresh()
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.connected).toBe(true)
    expect(result.current.connectRequired).toBe(false)
    expect(result.current.message).toBeNull()
  })
})

describe('DriveRequiredNotice', () => {
  it('renders the default title, message, CTA button and settings link', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<DriveRequiredNotice />)

    expect(screen.getByText('Google Drive is not connected')).toBeInTheDocument()
    expect(
      screen.getByText('Connect Google Drive from Settings > Cloud Storage to use this feature.')
    ).toBeInTheDocument()

    const cta = screen.getByRole('button', { name: 'Connect Google Drive' })
    expect(cta).toBeInTheDocument()

    const link = screen.getByRole('link', { name: 'Cloud Storage settings' })
    expect(link).toHaveAttribute('href', DRIVE_CONNECT_URL)

    // Rendering the notice must not start a connect attempt or a probe by itself.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('renders a caller-supplied message and title', () => {
    render(<DriveRequiredNotice title="Reconnect needed" message="The grant expired." />)

    expect(screen.getByText('Reconnect needed')).toBeInTheDocument()
    expect(screen.getByText('The grant expired.')).toBeInTheDocument()
    expect(screen.queryByText('Google Drive is not connected')).toBeNull()
  })
})
