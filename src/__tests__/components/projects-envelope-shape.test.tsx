import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The two surfaces only need the toast provider on their failure paths.
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

import { useAppStore } from '@/store'
import { ProjectDashboard } from '@/components/projects/project-dashboard'
import { SearchPage } from '@/components/search/search-page'

/**
 * T091: `/api/projects` is the ONLY content route that answers with an envelope -
 * `{ success: true, data: [...] }`. `/api/jobs`, `/api/tags`, `/api/content` and `/api/calendar`
 * answer with bare arrays. Every earlier test (and every manual check) ran with Drive
 * disconnected, which takes the 403 branch, so the success path - and therefore the envelope -
 * was never rendered. These tests feed the envelope on purpose.
 */

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    clone: () => jsonResponse(status, body),
  } as Response
}

// The route's real shape. `success` is part of the body the server sends, so it is part of the
// fixture: a consumer that only handled `{ data }` would still be wrong about the real response.
function envelope<T>(data: T) {
  return { success: true, data }
}

function project(overrides: Record<string, unknown> = {}) {
  return {
    id: 'project-1',
    title: 'Ship the launch',
    description: 'The launch project',
    status: 'ACTIVE',
    priority: 'HIGH',
    progress: 40,
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-06-01T00:00:00.000Z',
    userId: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

// The search page reads four collections in one Promise.all; only the projects slot is the
// envelope, so the other three stay bare arrays exactly as their routes answer.
function searchFetch(projectsBody: unknown) {
  return vi.fn(async (input: unknown) => {
    const url = String(input)
    if (url.includes('/api/projects')) return jsonResponse(200, projectsBody)
    return jsonResponse(200, [])
  })
}

const MALFORMED_BODIES: Array<[string, unknown]> = [
  ['an object without data', { success: true }],
  ['null', null],
  ['a string', 'not a list'],
  ['a data field that is not a list', { success: true, data: 'not a list' }],
  ['an array of things that are not projects', { success: true, data: [null, 42, {}] }],
]

beforeEach(() => {
  // The search page publishes into the shared store; keep one test's list out of the next.
  useAppStore.setState({ projects: [], contentItems: [], jobs: [], calendarEvents: [], calendarEventsLoaded: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the projects envelope is unwrapped at every parse site', () => {
  it('GET: ProjectDashboard renders the list from { success, data }', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, envelope([project(), project({ id: 'p2', title: 'Second project', status: 'COMPLETED' })])))
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(<ProjectDashboard />)

    expect(await screen.findByText('Ship the launch')).toBeInTheDocument()
    expect(screen.getByText('Second project')).toBeInTheDocument()

    // The original crash site: `projects.filter(...)` running on the envelope object.
    const totalCard = screen.getByText('Total Projects').closest('[data-slot="card"]') as HTMLElement
    const inProgressCard = screen.getByText('In Progress').closest('[data-slot="card"]') as HTMLElement
    const completedCard = screen.getByText('Completed').closest('[data-slot="card"]') as HTMLElement
    expect(within(totalCard).getByText('2')).toBeInTheDocument()
    expect(within(inProgressCard).getByText('1')).toBeInTheDocument()
    expect(within(completedCard).getByText('1')).toBeInTheDocument()

    // A list was rendered, so neither the empty state nor the Drive notice may stand in for it.
    expect(screen.queryByText('No projects yet')).not.toBeInTheDocument()
    expect(screen.queryByText('Google Drive is not connected')).not.toBeInTheDocument()
    expect(container.textContent).not.toContain('[object Object]')
  })

  it('POST: the create path inserts the unwrapped project, not its envelope', async () => {
    const user = userEvent.setup()
    const created = project({ id: 'project-new', title: 'Fresh project' })
    const fetchMock = vi.fn(async (_input: unknown, init?: { method?: string }) => {
      if (init?.method === 'POST') return jsonResponse(201, envelope(created))
      return jsonResponse(200, [])
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ProjectDashboard />)

    // Empty to start with, so the created row is the only one on screen afterwards.
    expect(await screen.findByText('No projects yet')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'New Project' }))
    await user.type(await screen.findByLabelText('Title'), 'Fresh project')
    await user.click(screen.getByRole('button', { name: 'Create Project' }))

    expect(await screen.findByText('Fresh project')).toBeInTheDocument()

    // One project card, readable fields: an envelope prepended into the list would have produced
    // a card with no title and thrown on `project.status.replace(...)` instead.
    expect(screen.getAllByRole('button', { name: 'View Details' })).toHaveLength(1)
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
    expect(screen.queryByText('No projects yet')).not.toBeInTheDocument()

    const inProgressCard = screen.getByText('In Progress').closest('[data-slot="card"]') as HTMLElement
    expect(within(inProgressCard).getByText('1')).toBeInTheDocument()
  })

  it('search: SearchPage publishes and renders projects from the same envelope', async () => {
    vi.stubGlobal('fetch', searchFetch(envelope([project({ title: 'Searchable launch' })])))

    render(<SearchPage />)

    expect(await screen.findByText(/Found 1 result/)).toBeInTheDocument()
    expect(screen.getByText('Searchable launch')).toBeInTheDocument()
    expect(screen.getByText('Projects (1)')).toBeInTheDocument()

    // The envelope itself must not appear as a result row.
    expect(screen.queryByText('Search across everything')).not.toBeInTheDocument()
    expect(screen.queryByText('Google Drive is not connected')).not.toBeInTheDocument()
  })
})

describe('a malformed body degrades to an empty list instead of throwing', () => {
  it.each(MALFORMED_BODIES)('ProjectDashboard: %s', async (_label, body) => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, body)))

    const { container } = render(<ProjectDashboard />)

    expect(await screen.findByText('No projects yet')).toBeInTheDocument()
    expect(within(screen.getByText('Total Projects').closest('[data-slot="card"]') as HTMLElement).getByText('0')).toBeInTheDocument()
    // A readable empty state, not a Drive claim, and no serialised object leaking into the DOM.
    expect(screen.queryByText('Google Drive is not connected')).not.toBeInTheDocument()
    expect(container.textContent).not.toContain('[object Object]')
  })

  it.each(MALFORMED_BODIES)('SearchPage: %s', async (_label, body) => {
    vi.stubGlobal('fetch', searchFetch(body))

    const { container } = render(<SearchPage />)

    expect(await screen.findByText(/Found 0 results/)).toBeInTheDocument()
    expect(screen.getByText('Search across everything')).toBeInTheDocument()
    expect(screen.getByText('Projects (0)')).toBeInTheDocument()
    expect(screen.queryByText('Google Drive is not connected')).not.toBeInTheDocument()
    expect(container.textContent).not.toContain('[object Object]')
  })
})
