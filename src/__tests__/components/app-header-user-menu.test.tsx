import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// vi.hoisted keeps these reachable from the hoisted vi.mock factories.
const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('next-auth/react', () => ({
  useSession: mocks.useSession,
  signOut: mocks.signOut,
}))

// useAuth() calls useRouter(); one stable router object so its effect does not
// re-run on every render of a component that never navigates itself.
const router = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}))

import { AppHeader } from '@/components/shell/app-header'

const EMAIL = 'test@example.com'

function signedIn(overrides: Record<string, unknown> = {}) {
  mocks.useSession.mockReturnValue({
    data: {
      user: { id: 'user-1', name: 'Test User', email: EMAIL, image: null, ...overrides },
      expires: '2099-12-31',
    },
    status: 'authenticated',
  })
}

beforeEach(() => {
  mocks.useSession.mockReset()
  mocks.signOut.mockReset()
  signedIn()
})

describe('AppHeader account menu', () => {
  it('opens from the account trigger and shows the session email', async () => {
    const user = userEvent.setup()
    render(<AppHeader />)

    // The trigger is a button whose accessible name identifies the account, and
    // the email is not on screen until the menu opens.
    const trigger = screen.getByRole('button', { name: `Account menu for ${EMAIL}` })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(EMAIL)).toBeNull()

    await user.click(trigger)

    expect(await screen.findByRole('menu')).toBeInTheDocument()
    expect(screen.getByText(EMAIL)).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('opens from the keyboard alone', async () => {
    const user = userEvent.setup()
    render(<AppHeader />)

    // The trigger is a real button in the tab order, and Enter opens the menu,
    // so the control is operable without a pointer.
    const trigger = screen.getByRole('button', { name: `Account menu for ${EMAIL}` })
    trigger.focus()
    expect(trigger).toHaveFocus()

    await user.keyboard('{Enter}')

    expect(await screen.findByRole('menu')).toBeInTheDocument()
    expect(screen.getByText(EMAIL)).toBeInTheDocument()
  })

  it('signs out through next-auth with the sign-in callback', async () => {
    const user = userEvent.setup()
    render(<AppHeader />)

    await user.click(screen.getByRole('button', { name: `Account menu for ${EMAIL}` }))
    await user.click(await screen.findByRole('menuitem', { name: /sign out/i }))

    expect(mocks.signOut).toHaveBeenCalledTimes(1)
    expect(mocks.signOut).toHaveBeenCalledWith({ callbackUrl: '/auth/signin' })
    // Nothing hand-rolled: the only navigation is the one signOut performs.
    expect(router.push).not.toHaveBeenCalled()
  })

  it('closes on Escape without signing out', async () => {
    const user = userEvent.setup()
    render(<AppHeader />)

    const trigger = screen.getByRole('button', { name: `Account menu for ${EMAIL}` })
    await user.click(trigger)
    expect(await screen.findByRole('menu')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows a neutral label when the session has no email', async () => {
    const user = userEvent.setup()
    signedIn({ email: null })
    render(<AppHeader />)

    const trigger = screen.getByRole('button', { name: 'Account menu' })
    await user.click(trigger)

    expect(await screen.findByRole('menu')).toBeInTheDocument()
    expect(screen.getByText('Signed-in account')).toBeInTheDocument()
  })
})
