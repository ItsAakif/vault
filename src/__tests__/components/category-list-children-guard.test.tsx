import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// T062 (ADR-009 D2): the renderer tolerates a collection field that is absent, null, or omitted at
// a NESTED level. T060 fixed the producer at the adapter boundary; this pins the consumer's
// defence in depth, so a payload this component did not construct cannot white-screen the surface.
//
// `useToast` is mocked so the assertions are about the rendered surface (the real hook renders
// nothing without a <Toaster />); `vi.hoisted` keeps the spy out of the factory's temporal dead
// zone. Everything else (the zustand store, the Radix dialogs mounted closed) is left real, which
// is the arrangement T055 already proved works under jsdom.
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }),
}))

import { CategoryList } from '@/components/categories/category-list'

// Minimal stand-in for the subset of Response the component reads.
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

// Common fields for a category that reached the client from `GET /api/categories`.
const baseCategory = {
  description: null,
  color: '#3B82F6',
  icon: null,
  isSystem: false,
  level: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  _count: { contentItems: 0 },
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  toastSpy.mockClear()
})

describe('CategoryList tolerates a non-array collection field (ADR-009 D2, T062)', () => {
  it('renders the live production payload - a category with NO children key - without throwing', async () => {
    // The EXACT shape GET /api/categories produced live (ADR-009 section 3): an array whose
    // elements carry no `children` key at all. The absence is the point of this fixture - nothing
    // here asserts a children value.
    const productionPayload = [
      {
        id: 'c1',
        name: 'Notes',
        parentId: null,
        ...baseCategory,
      },
    ]
    // Guard the fixture itself: if a future edit "helpfully" adds `children: []`, this test stops
    // reproducing the reported crash and becomes worthless.
    expect('children' in productionPayload[0]).toBe(false)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, productionPayload)))

    // UNGUARDED: renderCategory reads `category.children.length`, `children` is undefined, and
    // React throws `TypeError: Cannot read properties of undefined (reading 'length')` - the crash
    // the user reported. GUARDED: the read degrades to 0 and the row renders.
    render(<CategoryList />)

    expect(await screen.findByText('Notes')).toBeInTheDocument()
    // The list chrome is intact; the surface degraded to a list without a nested row, not to a
    // white screen.
    expect(screen.getByText('All Items')).toBeInTheDocument()
    expect(toastSpy).not.toHaveBeenCalled()
  })

  it('renders a category with children: null without throwing', async () => {
    const payload = [{ id: 'c1', name: 'Notes', parentId: null, children: null, ...baseCategory }]
    expect((payload[0] as { children: unknown }).children).toBeNull()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, payload)))

    render(<CategoryList />)

    expect(await screen.findByText('Notes')).toBeInTheDocument()
    expect(screen.getByText('All Items')).toBeInTheDocument()
    expect(toastSpy).not.toHaveBeenCalled()
  })

  it('renders a nested element that lacks its own children key, and drops it when the parent is collapsed', async () => {
    // The nested path: the parent's collection is an array, so `renderCategory` descends into the
    // child; the CHILD has no `children` key, so the same guard must hold one level down.
    const payload = [
      {
        id: 'c1',
        name: 'Parent',
        parentId: null,
        children: [{ id: 'c2', name: 'Child', parentId: 'c1', ...baseCategory }],
        ...baseCategory,
      },
    ]
    const nestedChild = payload[0].children[0] as Record<string, unknown>
    expect('children' in nestedChild).toBe(false)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, payload)))

    render(<CategoryList />)

    // Root categories are expanded by default, so the nested child IS rendered - that is what
    // exercises the guard at depth. UNGUARDED this line is where the TypeError is thrown.
    expect(await screen.findByText('Parent')).toBeInTheDocument()
    expect(screen.getByText('Child')).toBeInTheDocument()
    expect(toastSpy).not.toHaveBeenCalled()

    // Collapse the parent. The child disappears, and (the point of the guard) nothing threw while
    // the nested `children`-less element was mounted.
    const parentRow = screen.getByText('Parent').parentElement?.parentElement as HTMLElement
    fireEvent.click(parentRow.querySelector('button') as HTMLButtonElement)

    expect(screen.queryByText('Child')).not.toBeInTheDocument()
    expect(screen.getByText('Parent')).toBeInTheDocument()
  })
})
