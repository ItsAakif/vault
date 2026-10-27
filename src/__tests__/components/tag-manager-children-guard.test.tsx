import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// The tag manager renders inside the app shell; the only app provider it touches on these
// paths is the toast surface. Mock it and leave the rest real.
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

import { TagManager } from '@/components/tags/tag-manager'

// ---------------------------------------------------------------------------
// T063 - the confirmed production payload shape.
//
// `GET /api/tags?includeUsage=true` returned tag objects with NO `children` key and NO
// `_count` key (ADR-009 section 3). The pre-guard `renderTag` read `tag.children.length`
// unguarded, which is the white-screen crash captured in ADR-009. This test pins the guard:
// the production shape must render, not throw.
// ---------------------------------------------------------------------------
const PRODUCTION_TAG_PAYLOAD = [
  {
    id: 'tag-1',
    name: 'Research',
    description: 'Research notes',
    color: '#10B981',
    parentId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

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

describe('TagManager nested-collection guard (ADR-009 D2)', () => {
  it('renders a tag payload with no children/_count key without throwing', async () => {
    // Guard the premise: the payload really is the production shape.
    expect(PRODUCTION_TAG_PAYLOAD[0]).not.toHaveProperty('children')
    expect(PRODUCTION_TAG_PAYLOAD[0]).not.toHaveProperty('_count')

    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, PRODUCTION_TAG_PAYLOAD))
    vi.stubGlobal('fetch', fetchMock)

    // `renderTag` runs from the state update the fetch effect triggers. With the guard removed,
    // `tag.children.length` throws during that re-render (the confirmed production crash); with
    // it in place, the name renders. A regression therefore fails this assertion rather than
    // passing vacuously.
    render(<TagManager />)

    expect(await screen.findByText('Research')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/tags?includeUsage=true')
  })
})
