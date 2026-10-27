import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// vi.hoisted keeps this spy reachable from the hoisted vi.mock factory.
const { signInMock } = vi.hoisted(() => ({
  signInMock: vi.fn(),
}))

vi.mock('next-auth/react', () => ({
  signIn: signInMock,
}))

import SignInForm from '@/app/auth/signin/sign-in-form'

beforeEach(() => {
  signInMock.mockReset()
  signInMock.mockResolvedValue({ error: null, ok: true, status: 200, url: null })
})

describe('SignInForm', () => {
  it('renders exactly one Google action and no password surface', () => {
    render(<SignInForm googleEnabled />)

    const googleButtons = screen.getAllByRole('button', { name: /continue with google/i })
    expect(googleButtons).toHaveLength(1)

    expect(screen.queryByLabelText('Email')).toBeNull()
    expect(screen.queryByLabelText('Password')).toBeNull()
    expect(screen.queryByText(/forgot your password/i)).toBeNull()
    expect(screen.queryByText(/create a new account/i)).toBeNull()
  })

  it('starts Google sign-in exactly once when the button is clicked', async () => {
    const user = userEvent.setup()
    render(<SignInForm googleEnabled />)

    await user.click(screen.getByRole('button', { name: /continue with google/i }))

    expect(signInMock).toHaveBeenCalledTimes(1)
    expect(signInMock).toHaveBeenCalledWith('google', { callbackUrl: '/' })
  })

  it('never signs in with the removed credentials provider', async () => {
    const user = userEvent.setup()
    render(<SignInForm googleEnabled />)

    await user.click(screen.getByRole('button', { name: /continue with google/i }))

    expect(signInMock).not.toHaveBeenCalledWith('credentials', expect.anything())
  })

  it('renders the not-configured notice and no sign-in button when Google is disabled', () => {
    render(<SignInForm googleEnabled={false} />)

    expect(screen.getByText(/sign-in is not available/i)).toBeInTheDocument()
    expect(screen.getByText(/GOOGLE_CLIENT_ID/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('button', { name: /continue with google/i })).toBeNull()
  })
})
