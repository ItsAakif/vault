import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// The page is a client component that reads its own data over fetch, so the only ambient
// dependencies to neutralise are navigation and the toast store.
//
// `next/navigation` is mocked because the page imports `useRouter` and a real router is
// unavailable outside the Next runtime. `@/hooks/use-toast` is mocked because its module holds a
// process-wide listener list: leaving it real would leak toast state between tests.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}))

import CloudStorageSettings from '@/app/(app)/settings/cloud-storage/page'

// Minimal stand-in for the subset of Response the page reads.
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

// The narrowed T064 contract: one provider descriptor.
const PROVIDERS_BODY = {
  providers: [
    { id: 'google', name: 'Google Drive', enabled: true, configured: true, status: 'connected' },
  ],
}

const CONNECTED_STATUS = {
  isConnected: true,
  data: {
    userEmail: 'a@b.c',
    userName: 'A',
    vaultFolderId: 'folder-1234567890',
    categories: [],
    setupPercentage: 100,
    lastChecked: '2026-01-01T00:00:00.000Z',
  },
}

const DISCONNECTED_STATUS = { isConnected: false }

function stubFetch(driveStatus: unknown) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/settings/cloud-storage')) return jsonResponse(200, PROVIDERS_BODY)
    if (url.includes('/api/drive/status')) return jsonResponse(200, driveStatus)
    throw new Error(`unexpected fetch: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('CloudStorageSettings - Google only', () => {
  it('renders one Google Drive provider and none of the removed providers', async () => {
    stubFetch(CONNECTED_STATUS)
    const { container } = render(<CloudStorageSettings />)

    await screen.findByText('Connected to Google Drive', undefined, { timeout: 5000 })

    expect(screen.getAllByText('Google Drive').length).toBeGreaterThan(0)

    // No tab strip at all: one provider does not need tabs (ADR-012 D1, ADR-011 D2).
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(screen.queryByRole('tablist')).toBeNull()

    const text = container.textContent ?? ''
    expect(text).not.toMatch(/onedrive/i)
    expect(text).not.toMatch(/dropbox/i)
    expect(text).not.toMatch(/local/i)
    expect(text).not.toContain('/api/dropbox/callback')

    // The credential-entry form has no consumer: credentials live on the server (ADR-007).
    expect(text).not.toContain('Client ID')
    expect(text).not.toContain('Client Secret')
    expect(text).not.toContain('App Key')
    expect(text).not.toContain('App Secret')
    expect(screen.queryByLabelText(/client id/i)).toBeNull()

    // The connect CTA only renders while disconnected.
    expect(screen.queryByRole('button', { name: 'Connect to Google Drive' })).toBeNull()
  })

  it('offers the connect action while disconnected, with no removed provider copy', async () => {
    stubFetch(DISCONNECTED_STATUS)
    const { container } = render(<CloudStorageSettings />)

    const connect = await screen.findByRole('button', { name: 'Connect to Google Drive' }, { timeout: 5000 })
    expect(connect).toBeInTheDocument()

    const text = container.textContent ?? ''
    expect(text).not.toMatch(/onedrive/i)
    expect(text).not.toMatch(/dropbox/i)
    expect(text).not.toMatch(/local/i)
    expect(text).not.toContain('Client ID')
    expect(text).not.toContain('Client Secret')
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
  })

  it('uses token-derived surfaces instead of raw palette literals', async () => {
    stubFetch(DISCONNECTED_STATUS)
    const { container } = render(<CloudStorageSettings />)

    await screen.findByRole('button', { name: 'Connect to Google Drive' }, { timeout: 5000 })

    const html = container.innerHTML
    const bannedLiterals = [
      'bg-white',
      'bg-slate-900',
      'bg-blue-50',
      'bg-purple-50',
      'border-blue-',
      'border-purple-',
      'text-blue-',
      'text-purple-',
      'text-green-',
      'text-red-',
    ]
    for (const literal of bannedLiterals) {
      expect(html).not.toContain(literal)
    }

    // The replacement tokens are actually on the surface that carried the literals: the provider
    // card is a `Card`, whose border is `border-line` rather than `border-blue-*`.
    expect(html).toContain('border-line')

    // T088: RE-ANCHORED. This used to assert `bg-surface-sunken`, which is the page-level <Alert>
    // ("This is a self-hosted instance") - rendered whether or not Drive is connected, so it
    // proved nothing about the disconnected state and would have stayed green through any
    // regression of it. The disconnected state IS the "Not Connected" pill in the provider card
    // header, so assert the pill itself: it is present, it is the Badge primitive
    // (`data-slot="badge"`), it carries the token-derived `secondary` surface (never a palette
    // literal), and the connected branch is absent in this render.
    const pill = screen.getByText('Not Connected')
    expect(pill.closest('[data-slot="badge"]')).not.toBeNull()
    expect(pill.closest('[data-slot="badge"]')).toHaveClass('bg-secondary')
    expect(screen.queryByText('Connected')).toBeNull()
  })
})
