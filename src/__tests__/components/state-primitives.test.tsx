import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'

describe('EmptyState', () => {
  it('renders the title and description and calls the action handler', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    render(
      <EmptyState
        title="No notes yet"
        description="Notes you save to Drive appear here."
        action={{ label: 'Add a note', onClick }}
      />
    )

    expect(screen.getByText('No notes yet')).toBeInTheDocument()
    expect(screen.getByText('Notes you save to Drive appear here.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add a note' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders one link action when the action carries an href', () => {
    render(
      <EmptyState
        title="Storage is not configured"
        action={{ label: 'Open settings', href: '/settings/cloud-storage' }}
      />
    )

    const link = screen.getByRole('link', { name: 'Open settings' })
    expect(link).toHaveAttribute('href', '/settings/cloud-storage')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders no button and no anchor when no action is given', () => {
    const { container } = render(
      <EmptyState
        title="Nothing here"
        description="This surface has no items yet."
      />
    )

    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
  })
})

describe('ErrorState', () => {
  it('renders the default title and retries when Retry is clicked', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()

    render(<ErrorState onRetry={onRetry} />)

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders no retry button when onRetry is absent', () => {
    render(<ErrorState description="This list could not be loaded." />)

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders children instead of the default body', () => {
    render(
      <ErrorState>
        <p>Connect Google Drive</p>
      </ErrorState>
    )

    expect(screen.getByText('Connect Google Drive')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('uses plain, blameless copy', () => {
    const { container } = render(
      <ErrorState description="This list could not be loaded." onRetry={vi.fn()} />
    )

    const text = container.textContent ?? ''
    expect(text).not.toMatch(/Oops/i)
    expect(text).not.toContain('!')
  })
})
