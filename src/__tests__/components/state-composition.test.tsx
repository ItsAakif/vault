import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The tag manager renders inside the app shell; the toast surface is the only app provider it
// touches on these paths (its failure toasts), so it is mocked and the rest is left real.
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

import { ErrorState } from '@/components/ui/error-state'
import { DriveRequiredNotice } from '@/components/drive/drive-required-notice'
import { TagManager } from '@/components/tags/tag-manager'

// The exact body the server emits for a Drive-less session (driveNotConnectedBody(), ADR-008 D3).
const DRIVE_NOT_CONNECTED_BODY = {
  error: 'Google Drive not configured',
  message: 'Connect Google Drive from Settings > Cloud Storage to use this feature.',
  code: 'DRIVE_NOT_CONNECTED',
  connectUrl: '/settings/cloud-storage',
}

// Minimal stand-in for the subset of Response the components read.
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

function expectPlainCopy(text: string) {
  expect(text).not.toMatch(/Oops/i)
  expect(text).not.toContain('!')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the empty/error vocabulary is one vocabulary (ADR-011 D3, ADR-008 D5)', () => {
  it('composes the Drive notice inside ErrorState: one block, one CTA, no retry', () => {
    const { container } = render(
      <ErrorState>
        <DriveRequiredNotice message="Connect Google Drive." />
      </ErrorState>
    )

    const state = container.querySelector('[data-slot="error-state"]')
    expect(state).not.toBeNull()

    // The notice renders *as* the error state's content.
    expect(within(state as HTMLElement).getByText('Google Drive is not connected')).toBeInTheDocument()
    expect(within(state as HTMLElement).getByText('Connect Google Drive.')).toBeInTheDocument()

    // The composition seam: no default title, because `children` replaces it.
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()

    // Exactly one action - the connect CTA. A retry next to a reconnect CTA would be two competing
    // remedies for one failure (ADR-008 D5).
    const buttons = within(state as HTMLElement).getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveTextContent('Connect Google Drive')
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()

    expectPlainCopy(container.textContent ?? '')
  })

  it('renders the generic error state with a working retry', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()

    const { container } = render(
      <ErrorState title="Could not load projects" onRetry={onRetry} />
    )

    expect(screen.getByText('Could not load projects')).toBeInTheDocument()

    // The generic branch never borrows the Drive vocabulary: this failure is not a connect problem.
    expect(screen.queryByText('Google Drive is not connected')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Connect Google Drive' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
    expectPlainCopy(container.textContent ?? '')
  })

  // TagManager is the surface chosen for the real-surface case: it fetches a single endpoint, has
  // no browser-only API beyond `fetch`, and its empty state is one card rather than a page. The
  // other four would each drag in more of the shell (useSearchParams, the app store, tabs).
  it('renders a real surface empty state with exactly one primary action', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, [])))

    const { container } = render(<TagManager />)

    expect(await screen.findByText('No tags yet')).toBeInTheDocument()

    const emptyState = container.querySelector('[data-slot="empty-state"]')
    expect(emptyState).not.toBeNull()

    // Exactly one primary action inside the empty state, and it names what it does.
    const actions = within(emptyState as HTMLElement).getAllByRole('button')
    expect(actions).toHaveLength(1)
    expect(actions[0]).toHaveTextContent('New tag')

    // The old conflation is gone: the no-search and no-results states are different sentences.
    expect(screen.queryByText('No tags match that search')).not.toBeInTheDocument()

    expectPlainCopy(container.textContent ?? '')
  })

  it('renders the Drive notice, not the empty list, for a Drive-coded failure on a real surface', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, DRIVE_NOT_CONNECTED_BODY)))

    const { container } = render(<TagManager />)

    expect(await screen.findByText('Google Drive is not connected')).toBeInTheDocument()

    // The notice is composed inside ErrorState on a real surface too, not only in the unit case.
    const state = container.querySelector('[data-slot="error-state"]')
    expect(state).not.toBeNull()
    expect(within(state as HTMLElement).getByText('Google Drive is not connected')).toBeInTheDocument()

    // One action: the connect CTA. No `Retry` beside it.
    const buttons = within(state as HTMLElement).getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveTextContent('Connect Google Drive')

    // And the empty state must not claim the user has no tags.
    expect(screen.queryByText('No tags yet')).not.toBeInTheDocument()

    expectPlainCopy(container.textContent ?? '')
  })
})
