import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// vi.hoisted keeps these reachable from the hoisted vi.mock factories.
const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  push: vi.fn(),
  pathname: { value: '/' },
  searchParams: { value: new URLSearchParams() },
}))

vi.mock('next-auth/react', () => ({
  useSession: mocks.useSession,
}))

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname.value,
  useSearchParams: () => mocks.searchParams.value,
  useRouter: () => ({
    push: mocks.push,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

import { AppShell } from '@/components/shell/app-shell'
import { Workspace } from '@/components/shell/workspace'
import { useUIStore } from '@/store'

function authenticated() {
  mocks.useSession.mockReturnValue({
    data: { user: { id: 'user-1', name: 'Test User', email: 'test@example.com' } },
    status: 'authenticated',
  })
}

beforeEach(() => {
  mocks.useSession.mockReset()
  mocks.push.mockReset()
  authenticated()
  mocks.pathname.value = '/'
  mocks.searchParams.value = new URLSearchParams()

  // The mobile rail is a Sheet whose open state is `useUIStore().sidebarOpen`,
  // and that field defaults to `true` (the store predates its first consumer).
  // Tests pin it closed so the desktop rail is the single mounted copy and the
  // aria-current assertion is unambiguous.
  useUIStore.setState({ sidebarOpen: false })

  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => [],
  })) as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AppShell', () => {
  it('renders the shell chrome, the children and exactly one current nav item', async () => {
    render(
      <AppShell>
        <div data-testid="content">hello</div>
      </AppShell>
    )

    expect(screen.getByTestId('content')).toHaveTextContent('hello')
    expect(screen.getByText('Vault Command Center')).toBeInTheDocument()

    for (const label of ['Projects', 'Jobs', 'Calendar', 'Search']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }

    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1)

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/content-types'))
  })

  it('marks the item the ?type= search parameter names, not the bare path', async () => {
    mocks.pathname.value = '/'
    mocks.searchParams.value = new URLSearchParams('type=NOTE')

    render(
      <AppShell>
        <div data-testid="content">hello</div>
      </AppShell>
    )

    expect(screen.getByRole('link', { name: 'Notes' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Projects' })).not.toHaveAttribute('aria-current')

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
  })

  it('treats a bare / and /?type=all as the same state', async () => {
    mocks.pathname.value = '/'
    mocks.searchParams.value = new URLSearchParams('type=all')

    render(
      <AppShell>
        <div data-testid="content">hello</div>
      </AppShell>
    )

    expect(screen.getByRole('link', { name: 'All content' })).toHaveAttribute('aria-current', 'page')
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1)

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
  })

  it('marks a route-path item current on its own route', async () => {
    mocks.pathname.value = '/projects'

    render(
      <AppShell>
        <div data-testid="content">hello</div>
      </AppShell>
    )

    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Notes' })).not.toHaveAttribute('aria-current')

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
  })

  it('does not render children before the session is authenticated', () => {
    mocks.useSession.mockReturnValue({ data: null, status: 'unauthenticated' })

    render(
      <AppShell>
        <div data-testid="content">hello</div>
      </AppShell>
    )

    expect(screen.queryByTestId('content')).toBeNull()
    expect(screen.queryByText('hello')).toBeNull()
    expect(mocks.push).toHaveBeenCalledWith('/auth/signin')
  })
})

describe('Workspace', () => {
  it('renders the content and the aside, and takes its height from --app-header-h', () => {
    const { container } = render(
      <Workspace aside={<div>side</div>}>
        <div data-testid="content">body</div>
      </Workspace>
    )

    expect(screen.getByTestId('content')).toHaveTextContent('body')
    expect(screen.getByText('side')).toBeInTheDocument()

    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('h-[calc(100vh-var(--app-header-h))]')
    expect(shell.className).not.toMatch(/100vh-4rem|100vh-3\.5rem/)
  })

  it('renders the content alone when no aside is given', () => {
    const { container } = render(
      <Workspace>
        <div data-testid="content">body</div>
      </Workspace>
    )

    expect(screen.getByTestId('content')).toBeInTheDocument()
    expect(container.querySelector('aside')).toBeNull()
  })
})
