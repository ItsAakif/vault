import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// T088: `DriveRequiredNotice` gained a NARROW form for the 224px navigation rail. These tests pin
// both shapes: the default must be the card every wide caller already renders (byte-identical
// markup, asserted structurally here and diffed against HEAD in .planning/progress/T088.md), and
// the compact form must be a different shape - no full-size button, an inline link, text-xs type,
// 8px padding - so a 180-224px container does not get a card that eats its height.
//
// `useToast` is mocked because `CategoryList` imports the real hook (which holds a process-wide
// listener list and would leak between tests); nothing here asserts a toast.
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }),
}))

import { DriveRequiredNotice } from '@/components/drive/drive-required-notice'
import { CategoryList } from '@/components/categories/category-list'
import { DRIVE_CONNECT_URL } from '@/lib/drive-client'

const DEFAULT_TITLE = 'Google Drive is not connected'
const DEFAULT_MESSAGE = 'Connect Google Drive from Settings > Cloud Storage to use this feature.'

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 403 ? 'Forbidden' : 'OK',
    json: async () => body,
  } as Response
}

// The exact body ADR-008 D3 defines for a Drive-less session (same fixture as
// calendar-view-drive-notice.test.tsx).
const DRIVE_NOT_CONNECTED_BODY = {
  error: 'Google Drive not configured',
  message: DEFAULT_MESSAGE,
  code: 'DRIVE_NOT_CONNECTED',
  connectUrl: '/settings/cloud-storage',
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  toastSpy.mockClear()
})

describe('DriveRequiredNotice - default variant is unchanged (T088)', () => {
  it('is still the Card: p-4 border-line surface, centred py-8 stack, full-size button and settings link', () => {
    vi.stubGlobal('fetch', vi.fn())

    const { container } = render(<DriveRequiredNotice />)

    // The Card primitive (data-slot="card") and its own elevation/padding tokens.
    const card = container.querySelector('[data-slot="card"]')
    expect(card).not.toBeNull()
    expect(card).toHaveClass('bg-card', 'border-line', 'p-4', 'rounded-lg')

    // The centred stack the compact form deliberately does not use: 32px gap-4 column, py-8.
    const content = container.querySelector('[data-slot="card-content"]')
    expect(content).toHaveClass('flex', 'flex-col', 'items-center', 'gap-4', 'py-8', 'text-center')

    // The full-size CTA is still a Button, and the secondary link still says "Cloud Storage settings".
    expect(screen.getByRole('button', { name: 'Connect Google Drive' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cloud Storage settings' })).toHaveAttribute(
      'href',
      DRIVE_CONNECT_URL
    )

    // Same copy, and no compact marker anywhere.
    expect(screen.getByText(DEFAULT_TITLE)).toBeInTheDocument()
    expect(screen.getByText(DEFAULT_MESSAGE)).toBeInTheDocument()
    expect(container.querySelector('[data-variant="compact"]')).toBeNull()
  })
})

describe('DriveRequiredNotice - compact variant (T088)', () => {
  it('drops the full-size button for an inline link, at text-xs with 8px padding and no Card', () => {
    vi.stubGlobal('fetch', vi.fn())

    const { container } = render(<DriveRequiredNotice compact />)

    const root = container.querySelector('[data-variant="compact"]')
    expect(root).not.toBeNull()
    expect(root).toHaveClass('text-xs', 'p-2', 'border-line', 'bg-surface-sunken', 'rounded-md')

    // No Card, and therefore no 24px horizontal padding inside a 224px rail.
    expect(container.querySelector('[data-slot="card"]')).toBeNull()

    // No button at all: the one CTA is a text link to the same target the settings link used.
    expect(screen.queryByRole('button')).toBeNull()
    const link = screen.getByRole('link', { name: 'Connect Google Drive' })
    expect(link).toHaveAttribute('href', DRIVE_CONNECT_URL)
    expect(link).toHaveClass('underline')

    // The copy is not shortened: the user still learns what is wrong and what fixes it.
    expect(screen.getByText(DEFAULT_TITLE)).toBeInTheDocument()
    expect(screen.getByText(DEFAULT_MESSAGE)).toBeInTheDocument()

    // Rendering it still starts no connect attempt and no probe.
    expect(fetch).not.toHaveBeenCalled()
  })

  it('honours a caller-supplied title and message', () => {
    render(<DriveRequiredNotice compact title="Reconnect needed" message="The grant expired." />)

    expect(screen.getByText('Reconnect needed')).toBeInTheDocument()
    expect(screen.getByText('The grant expired.')).toBeInTheDocument()
    expect(screen.queryByText(DEFAULT_TITLE)).toBeNull()
  })
})

describe('CategoryList - which notice the two densities get (T088)', () => {
  it('renders the COMPACT notice when the list is compact (the rail) and Drive is disconnected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, DRIVE_NOT_CONNECTED_BODY)))

    const { container } = render(<CategoryList compact />)

    expect(await screen.findByText(DEFAULT_TITLE)).toBeInTheDocument()
    expect(container.querySelector('[data-variant="compact"]')).not.toBeNull()
    // The wide form's CTA button is absent; the compact inline link is the only connect affordance.
    expect(screen.queryByRole('button', { name: 'Connect Google Drive' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Connect Google Drive' })).toHaveAttribute(
      'href',
      DRIVE_CONNECT_URL
    )
    expect(toastSpy).not.toHaveBeenCalled()
  })

  it('still renders the DEFAULT card notice when the list is not compact', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, DRIVE_NOT_CONNECTED_BODY)))

    const { container } = render(<CategoryList />)

    // The default notice's own markers: the full-size button and the settings link.
    expect(
      await screen.findByRole('button', { name: 'Connect Google Drive' })
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cloud Storage settings' })).toHaveAttribute(
      'href',
      DRIVE_CONNECT_URL
    )
    expect(container.querySelector('[data-variant="compact"]')).toBeNull()
  })
})
