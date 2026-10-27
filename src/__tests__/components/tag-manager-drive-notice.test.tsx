import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// The tag manager renders inside the app shell; the toast surface is the only app provider it
// touches on these paths (its failure toasts), so it is mocked and the rest is left real.
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

import { TagManager } from '@/components/tags/tag-manager'

// The exact body the server emits for a Drive-less session (driveNotConnectedBody(), ADR-008 D3).
const DRIVE_NOT_CONNECTED_BODY = {
  error: 'Google Drive not configured',
  message: 'Connect Google Drive from Settings > Cloud Storage to use this feature.',
  code: 'DRIVE_NOT_CONNECTED',
  connectUrl: '/settings/cloud-storage',
}

// Minimal stand-in for the subset of Response the component reads.
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('TagManager Drive-disconnected degradation (ADR-008 D5)', () => {
  it('renders the Drive notice instead of the empty tag list for a DRIVE_NOT_CONNECTED 403', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(403, DRIVE_NOT_CONNECTED_BODY))
    vi.stubGlobal('fetch', fetchMock)

    render(<TagManager />)

    // The fetch resolves in an effect, so the notice appears asynchronously.
    expect(await screen.findByText('Google Drive is not connected')).toBeInTheDocument()
    expect(
      screen.getByText('Connect Google Drive from Settings > Cloud Storage to use this feature.')
    ).toBeInTheDocument()
    // The remedy is present: the compose-shared CTA, not a hand-rolled second button.
    expect(screen.getByRole('button', { name: 'Connect Google Drive' })).toBeInTheDocument()

    // The empty state must NOT claim there are no tags: that is the lie being fixed.
    expect(screen.queryByText('No tags yet')).not.toBeInTheDocument()

    expect(fetchMock).toHaveBeenCalledWith('/api/tags?includeUsage=true')
  })

  it('does not render the Drive notice for a non-Drive 500 failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(500, { error: 'Failed to fetch tags' }))
    vi.stubGlobal('fetch', fetchMock)

    render(<TagManager />)

    // The existing behaviour is preserved: the ordinary empty state.
    expect(await screen.findByText('No tags yet')).toBeInTheDocument()

    expect(screen.queryByText('Google Drive is not connected')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Connect Google Drive from Settings > Cloud Storage to use this feature.')
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Connect Google Drive' })).not.toBeInTheDocument()
  })
})
