// @vitest-environment node
/**
 * Smoke test (T047 / ADR-008 D2 + D4, spec AC-6): THE bug-catcher for the reported data-loss
 * defect. A Google session whose JWT carries `accessToken` + `refreshToken` but which was granted
 * NO Drive scope (so no canonical `CloudIntegration` row was written) must get the actionable 403
 * `DRIVE_NOT_CONNECTED` body from every content handler - never a raw 500, never a 401 - and must
 * never construct an OAuth2 client or an adapter.
 *
 * Every `getServerSession` (both specifier variants), `@/lib/auth`, `@/lib/db`, `googleapis` and
 * the content adapter module are mocked, so no DB, no Google client and no network are touched.
 *
 * SHARED SCAFFOLDING: `setSession`, the `googleAuth` / `adapterMock` handles and the request
 * helpers are deliberately module-scope so T048, T049, T050 and T051 can extend this file with
 * their own families (each adds one more adapter `vi.mock`).
 *
 * TRAP - two independent `getServerSession` mocks live behind the two specifiers
 * (`next-auth` and `next-auth/next`). A route whose spy was never configured gets `undefined`
 * from `await`, treats it as "no session" and returns 401 - which would look like a bug in the
 * converted code. `setSession()` configures BOTH spies together; never configure one alone.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { getServerSession as sessionFromNextAuth } from 'next-auth'
import { getServerSession as sessionFromNextAuthNext } from 'next-auth/next'
import { db } from '@/lib/db'

import * as content from '@/app/api/content/route'
import * as contentById from '@/app/api/content/[id]/route'
import * as mobileLink from '@/app/api/mobile-link/generate/route'
import * as driveConnection from '@/app/api/drive/connection/route'
import * as calendar from '@/app/api/calendar/route'
import * as calendarById from '@/app/api/calendar/[id]/route'
import * as projects from '@/app/api/projects/route'
import * as projectById from '@/app/api/projects/[projectId]/route'
import * as jobs from '@/app/api/jobs/route'
import * as jobsById from '@/app/api/jobs/[id]/route'
import * as categories from '@/app/api/categories/route'
import * as categoriesById from '@/app/api/categories/[id]/route'
import * as tags from '@/app/api/tags/route'
import * as tagsById from '@/app/api/tags/[id]/route'

// Shared handle on the mocked `google.auth.OAuth2` constructor (hoisted: factories run first).
// The mock's own call count records construction, so "no client was built" is assertable.
const googleAuth = vi.hoisted(() => {
  const setCredentials = vi.fn()
  const OAuth2 = vi.fn(function MockOAuth2() {
    return { setCredentials }
  })
  return { setCredentials, OAuth2 }
})

// Shared handle on the mocked `GoogleDriveContentAdapter` class. The constructor records
// construction via the `vi.fn()` and returns one shared instance whose methods are configured per
// test, so a test can both "assert it was never constructed" and "make it reject".
const adapterMock = vi.hoisted(() => {
  const instance = {
    initialize: vi.fn(),
    listCategoryContent: vi.fn(),
    searchContent: vi.fn(),
    createContent: vi.fn(),
    getContent: vi.fn(),
    updateContent: vi.fn(),
    deleteContent: vi.fn(),
  }
  const GoogleDriveContentAdapter = vi.fn(function MockGoogleDriveContentAdapter() {
    return instance
  })
  return { instance, GoogleDriveContentAdapter }
})

vi.mock('next-auth/next', () => ({ getServerSession: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({
  db: {
    cloudIntegration: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    mobileToken: { create: vi.fn(), deleteMany: vi.fn() },
  },
}))
vi.mock('googleapis', () => ({ google: { auth: { OAuth2: googleAuth.OAuth2 } } }))
vi.mock('@/lib/google-drive-content-adapter', () => ({
  GoogleDriveContentAdapter: adapterMock.GoogleDriveContentAdapter,
}))

// T049: shared handle on the mocked `GoogleDriveCalendarAdapter`. Same shared-instance pattern as
// the content adapter (a bare `vi.fn()` returns an object with no methods under `new`, so a
// rejection could not be expressed). The constructor records construction; the instance's methods
// are configured per test so the grant-error translation path is exercisable.
const calendarAdapterMock = vi.hoisted(() => {
  const instance = {
    initialize: vi.fn(),
    listEvents: vi.fn(),
    createEvent: vi.fn(),
    getEvent: vi.fn(),
    updateEvent: vi.fn(),
    deleteEvent: vi.fn(),
  }
  const GoogleDriveCalendarAdapter = vi.fn(function MockGoogleDriveCalendarAdapter() {
    return instance
  })
  return { instance, GoogleDriveCalendarAdapter }
})
vi.mock('@/lib/google-drive-calendar-adapter', () => ({
  GoogleDriveCalendarAdapter: calendarAdapterMock.GoogleDriveCalendarAdapter,
}))

// T050: shared handles on the mocked projects and jobs adapters (same pattern).
const projectsAdapterMock = vi.hoisted(() => {
  const instance = {
    initialize: vi.fn(),
    listProjects: vi.fn(),
    createProject: vi.fn(),
    getProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
  }
  const GoogleDriveProjectsAdapter = vi.fn(function MockGoogleDriveProjectsAdapter() {
    return instance
  })
  return { instance, GoogleDriveProjectsAdapter }
})
vi.mock('@/lib/google-drive-projects-adapter', () => ({
  GoogleDriveProjectsAdapter: projectsAdapterMock.GoogleDriveProjectsAdapter,
}))

const jobsAdapterMock = vi.hoisted(() => {
  const instance = {
    initialize: vi.fn(),
    listJobs: vi.fn(),
    createJob: vi.fn(),
    getJob: vi.fn(),
    updateJob: vi.fn(),
    deleteJob: vi.fn(),
  }
  const GoogleDriveJobsAdapter = vi.fn(function MockGoogleDriveJobsAdapter() {
    return instance
  })
  return { instance, GoogleDriveJobsAdapter }
})
vi.mock('@/lib/google-drive-jobs-adapter', () => ({
  GoogleDriveJobsAdapter: jobsAdapterMock.GoogleDriveJobsAdapter,
}))

// T048: shared handles on the mocked categories and tags adapters (same shared-instance pattern -
// a bare `vi.fn()` returns an object with no methods under `new`, so the grant-invalid path could
// not be expressed). The constructor records construction; the single returned instance's methods
// are configured per test.
const categoriesAdapterMock = vi.hoisted(() => {
  const instance = {
    initialize: vi.fn(),
    listCategories: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
  }
  const GoogleDriveCategoriesAdapter = vi.fn(function MockGoogleDriveCategoriesAdapter() {
    return instance
  })
  return { instance, GoogleDriveCategoriesAdapter }
})
vi.mock('@/lib/google-drive-categories-adapter', () => ({
  GoogleDriveCategoriesAdapter: categoriesAdapterMock.GoogleDriveCategoriesAdapter,
}))

const tagsAdapterMock = vi.hoisted(() => {
  const instance = {
    initialize: vi.fn(),
    listTags: vi.fn(),
    createTag: vi.fn(),
    updateTag: vi.fn(),
    deleteTag: vi.fn(),
    mergeTags: vi.fn(),
  }
  const GoogleDriveTagsAdapter = vi.fn(function MockGoogleDriveTagsAdapter() {
    return instance
  })
  return { instance, GoogleDriveTagsAdapter }
})
vi.mock('@/lib/google-drive-tags-adapter', () => ({
  GoogleDriveTagsAdapter: tagsAdapterMock.GoogleDriveTagsAdapter,
}))

function setSession(session: unknown) {
  vi.mocked(sessionFromNextAuth).mockResolvedValue(session as never)
  vi.mocked(sessionFromNextAuthNext).mockResolvedValue(session as never)
}

// The exact production condition: a Google session whose JWT carries tokens but which was granted
// no Drive scope, so no canonical `CloudIntegration` row was written (ADR-008 context section 2).
const JWT_ONLY_SESSION = {
  user: {
    id: 'u1',
    email: 'demo@vault.com',
    accessToken: 'jwt-access',
    refreshToken: 'jwt-refresh',
  },
}
const AUTH_401 = { error: 'Unauthorized' }
const NOT_CONNECTED = {
  error: 'Google Drive not configured',
  message: 'Connect Google Drive from Settings > Cloud Storage to use this feature.',
  code: 'DRIVE_NOT_CONNECTED',
  connectUrl: '/settings/cloud-storage',
}
const GRANT_INVALID = {
  error: 'Google Drive access expired or was revoked',
  message: 'Reconnect Google Drive from Settings > Cloud Storage to continue.',
  code: 'DRIVE_GRANT_INVALID',
  connectUrl: '/settings/cloud-storage',
}
// Google's real reply for a scope-less token.
const INSUFFICIENT_SCOPE_ERROR = {
  code: 403,
  message: 'Request had insufficient authentication scopes.',
}

const ACTIVE_ROW = {
  id: 'ci-1',
  userId: 'u1',
  provider: 'google',
  accessToken: 'db-access',
  refreshToken: 'db-refresh',
  tokenType: 'Bearer',
  expiresAt: new Date(1_893_456_000_000),
  scopes: '[]',
  isActive: true,
}

const CONTENT_ITEM = {
  id: 'c1',
  title: 'Note',
  type: 'NOTE',
  archived: false,
  updatedAt: '2026-10-18T00:00:00.000Z',
}

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(`http://localhost${path}`, init)
}

function jsonRequest(method: string, path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Next 15 hands a dynamic route handler its `params` as a Promise (ADR-002 item 2).
function params(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

const CONTENT_BODY = { title: 'Note', content: '# Note', type: 'NOTE' }

/** Every exported content handler, in the order the task file names them. */
const handlers: Array<[string, () => Promise<Response>]> = [
  ['content GET', () => content.GET(request('/api/content'))],
  ['content POST', () => content.POST(jsonRequest('POST', '/api/content', CONTENT_BODY))],
  ['content/[id] GET', () => contentById.GET(request('/api/content/c1'), params('c1'))],
  [
    'content/[id] PATCH',
    () =>
      contentById.PATCH(jsonRequest('PATCH', '/api/content/c1', { title: 'x' }), params('c1')),
  ],
  [
    'content/[id] DELETE',
    () => contentById.DELETE(request('/api/content/c1', { method: 'DELETE' }), params('c1')),
  ],
]

describe('smoke: Drive-dependent content routes degrade on a Drive-less session (T047 / AC-6)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    // Every route logs caught errors; keep the test output clean.
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // The adapter is armed to reject with Google's scope error, so a gate leak cannot be
    // mistaken for the not-connected 403 (the body would be DRIVE_GRANT_INVALID instead).
    adapterMock.instance.initialize.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    adapterMock.instance.listCategoryContent.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    adapterMock.instance.searchContent.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    adapterMock.instance.createContent.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    adapterMock.instance.getContent.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    adapterMock.instance.updateContent.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    adapterMock.instance.deleteContent.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  describe('a JWT-only session with no canonical row: 403 DRIVE_NOT_CONNECTED, no Drive call', () => {
    for (const [name, invoke] of handlers) {
      it(`${name} returns 403 with the DRIVE_NOT_CONNECTED body (not 500, not 401)`, async () => {
        setSession(JWT_ONLY_SESSION)
        vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(null as never)

        const response = await invoke()
        const json = await response.json()

        expect(response.status).toBe(403)
        expect(response.status).not.toBe(500)
        expect(response.status).not.toBe(401)
        expect(json).toEqual(NOT_CONNECTED)
        expect(googleAuth.OAuth2).not.toHaveBeenCalled()
        expect(adapterMock.GoogleDriveContentAdapter).not.toHaveBeenCalled()
      })
    }

    it('gates on the canonical row, never on the JWT accessToken', async () => {
      setSession(JWT_ONLY_SESSION)
      vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(null as never)

      await content.GET(request('/api/content'))

      expect(vi.mocked(db.cloudIntegration.findFirst)).toHaveBeenCalledWith({
        where: { userId: 'u1', provider: 'google', isActive: true },
      })
    })
  })

  describe('no session: 401 { error: "Unauthorized" }', () => {
    for (const [name, invoke] of handlers) {
      it(`${name} returns 401 with the uniform auth body`, async () => {
        setSession(null)

        const response = await invoke()

        expect(response.status).toBe(401)
        expect(response.status).not.toBe(500)
        await expect(response.json()).resolves.toEqual(AUTH_401)
      })
    }
  })

  describe('an active row whose grant was revoked: 403 DRIVE_GRANT_INVALID, never 500', () => {
    const grantCases: Array<[string, () => Promise<Response>]> = [
      ['content GET', () => content.GET(request('/api/content'))],
      ['content POST', () => content.POST(jsonRequest('POST', '/api/content', CONTENT_BODY))],
    ]

    for (const [name, invoke] of grantCases) {
      it(`${name} translates Google's insufficient-scope error to the D3 body`, async () => {
        setSession(JWT_ONLY_SESSION)
        vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(ACTIVE_ROW as never)

        const response = await invoke()

        expect(response.status).toBe(403)
        expect(response.status).not.toBe(500)
        await expect(response.json()).resolves.toEqual(GRANT_INVALID)
        // The gate passed, so the adapter WAS constructed and the failing call reached Google's
        // thrown error - which is exactly the case the D4 safety net must translate.
        expect(adapterMock.GoogleDriveContentAdapter).toHaveBeenCalledTimes(1)
        expect(googleAuth.OAuth2).toHaveBeenCalledTimes(1)
      })
    }
  })

  describe('positive control: a connected session still serves content (200)', () => {
    it('content GET with an active row and a working adapter resolves 200', async () => {
      setSession(JWT_ONLY_SESSION)
      vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(ACTIVE_ROW as never)
      adapterMock.instance.initialize.mockResolvedValue(undefined)
      adapterMock.instance.searchContent.mockResolvedValue([CONTENT_ITEM])

      const response = await content.GET(request('/api/content'))

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual([CONTENT_ITEM])
      expect(adapterMock.GoogleDriveContentAdapter).toHaveBeenCalledTimes(1)
      expect(adapterMock.instance.initialize).toHaveBeenCalledTimes(1)
      expect(adapterMock.instance.searchContent).toHaveBeenCalledWith('*')
    })
  })
})

// -------------------------------------------------------------------------------------------
// T051 / ADR-008 D5: the last JWT-gated route (mobile-link generation) plus the cheap
// connection probe the UI calls on mount.
// -------------------------------------------------------------------------------------------
describe('smoke: mobile-link generation is gated on the canonical Drive row (T051)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('returns 403 with the DRIVE_NOT_CONNECTED body and writes no MobileToken row when there is no canonical row', async () => {
    // JWT_ONLY_SESSION carries BOTH accessToken and refreshToken, so the pre-fix guard
    // (`if (!session.user.accessToken || !session.user.refreshToken)`) sailed straight past it
    // and minted a shareable link whose tokens no Drive call accepts.
    setSession(JWT_ONLY_SESSION)
    vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(null as never)

    const response = await mobileLink.POST(
      request('/api/mobile-link/generate', { method: 'POST' })
    )

    expect(response.status).toBe(403)
    expect(response.status).not.toBe(500)
    await expect(response.json()).resolves.toEqual(NOT_CONNECTED)
    expect(vi.mocked(db.mobileToken.create)).not.toHaveBeenCalled()
  })

  it('stores the canonical row tokens when an active row exists', async () => {
    setSession(JWT_ONLY_SESSION)
    vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(ACTIVE_ROW as never)

    const response = await mobileLink.POST(
      request('/api/mobile-link/generate', { method: 'POST' })
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ success: true })
    )
    expect(vi.mocked(db.mobileToken.create)).toHaveBeenCalledWith({
      data: expect.objectContaining({
        googleAccessToken: 'db-access',
        googleRefreshToken: 'db-refresh',
        userId: 'u1',
        token: expect.any(String),
        expiresAt: expect.any(Date),
      }),
    })
  })

  it('coerces a null canonical refreshToken to an empty string', async () => {
    setSession(JWT_ONLY_SESSION)
    vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue({
      ...ACTIVE_ROW,
      refreshToken: null,
    } as never)

    const response = await mobileLink.POST(
      request('/api/mobile-link/generate', { method: 'POST' })
    )

    expect(response.status).toBe(201)
    expect(vi.mocked(db.mobileToken.create)).toHaveBeenCalledWith({
      data: expect.objectContaining({ googleRefreshToken: '' }),
    })
  })
})

describe('smoke: drive connection probe never performs a Drive call (T051 / ADR-008 D5)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('returns 401 { error: "Unauthorized" } with no session', async () => {
    setSession(null)

    const response = await driveConnection.GET()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual(AUTH_401)
  })

  it('returns 200 exactly the disconnected body with no canonical row, and builds no client', async () => {
    setSession(JWT_ONLY_SESSION)
    vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(null as never)

    const response = await driveConnection.GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      connected: false,
      code: 'DRIVE_NOT_CONNECTED',
      message: 'Connect Google Drive from Settings > Cloud Storage to use this feature.',
      connectUrl: '/settings/cloud-storage',
    })
    expect(googleAuth.OAuth2).not.toHaveBeenCalled()
  })

  it('returns 200 { connected: true } with an active row, and still builds no client', async () => {
    setSession(JWT_ONLY_SESSION)
    vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(ACTIVE_ROW as never)

    const response = await driveConnection.GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ connected: true })
    expect(googleAuth.OAuth2).not.toHaveBeenCalled()
  })
})

// -------------------------------------------------------------------------------------------
// T049 / ADR-008 D2: the calendar family. This is the surface that rendered its header with an
// empty content area in the reported bug. Each handler has a SINGLE outer try/catch, so the
// grant-error translation happens in that catch.
// -------------------------------------------------------------------------------------------
const CALENDAR_BODY = {
  title: 'Standup',
  startTime: '2026-10-19T09:00:00.000Z',
  endTime: '2026-10-19T09:30:00.000Z',
}

const calendarHandlers: Array<[string, () => Promise<Response>]> = [
  ['calendar GET', () => calendar.GET()],
  ['calendar POST', () => calendar.POST(jsonRequest('POST', '/api/calendar', CALENDAR_BODY))],
  ['calendar/[id] GET', () => calendarById.GET(request('/api/calendar/e1'), params('e1'))],
  [
    'calendar/[id] PATCH',
    () =>
      calendarById.PATCH(jsonRequest('PATCH', '/api/calendar/e1', { title: 'x' }), params('e1')),
  ],
  [
    'calendar/[id] DELETE',
    () => calendarById.DELETE(request('/api/calendar/e1', { method: 'DELETE' }), params('e1')),
  ],
]

describe('smoke: Drive-dependent calendar routes degrade on a Drive-less session (T049)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    calendarAdapterMock.instance.initialize.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    calendarAdapterMock.instance.listEvents.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    calendarAdapterMock.instance.createEvent.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    calendarAdapterMock.instance.getEvent.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    calendarAdapterMock.instance.updateEvent.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    calendarAdapterMock.instance.deleteEvent.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  describe('a JWT-only session with no canonical row: 403 DRIVE_NOT_CONNECTED, no Drive call', () => {
    for (const [name, invoke] of calendarHandlers) {
      it(`${name} returns 403 with the DRIVE_NOT_CONNECTED body (not 500, not 401)`, async () => {
        // Before the fix: GET /api/calendar returned 500 { error: 'Internal server error' } - this
        // is the direct regression guard for the empty calendar page.
        setSession(JWT_ONLY_SESSION)
        vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(null as never)

        const response = await invoke()
        const json = await response.json()

        expect(response.status).toBe(403)
        expect(response.status).not.toBe(500)
        expect(response.status).not.toBe(401)
        expect(json).toEqual(NOT_CONNECTED)
        expect(googleAuth.OAuth2).not.toHaveBeenCalled()
        expect(calendarAdapterMock.GoogleDriveCalendarAdapter).not.toHaveBeenCalled()
      })
    }
  })

  describe('no session: 401 { error: "Unauthorized" }', () => {
    for (const [name, invoke] of calendarHandlers) {
      it(`${name} returns 401 with the uniform auth body`, async () => {
        setSession(null)

        const response = await invoke()

        expect(response.status).toBe(401)
        expect(response.status).not.toBe(500)
        await expect(response.json()).resolves.toEqual(AUTH_401)
      })
    }
  })

  describe('an active row whose grant was revoked: 403 DRIVE_GRANT_INVALID, never 500', () => {
    it("calendar GET translates Google's insufficient-scope error to the D3 body", async () => {
      setSession(JWT_ONLY_SESSION)
      vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(ACTIVE_ROW as never)

      const response = await calendar.GET()

      expect(response.status).toBe(403)
      expect(response.status).not.toBe(500)
      await expect(response.json()).resolves.toEqual(GRANT_INVALID)
      expect(calendarAdapterMock.GoogleDriveCalendarAdapter).toHaveBeenCalledTimes(1)
      expect(googleAuth.OAuth2).toHaveBeenCalledTimes(1)
    })

    it('calendar GET maps a generic failure to the route 500 body with details', async () => {
      setSession(JWT_ONLY_SESSION)
      vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(ACTIVE_ROW as never)
      calendarAdapterMock.instance.initialize.mockRejectedValue(new Error('boom'))

      const response = await calendar.GET()

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({
        error: 'Internal server error',
        details: 'boom',
      })
    })
  })
})

// -------------------------------------------------------------------------------------------
// T050 / ADR-008 D2: the projects and jobs families. Projects used to gate on the WRONG key
// (`session.user.email`) so a partial-consent Google user got a misleading 401, and its 500 body
// carries `success: false` (hence the explicit isDriveGrantError branch rather than
// driveErrorResponse).
// -------------------------------------------------------------------------------------------
function projectParams(projectId: string): { params: Promise<{ projectId: string }> } {
  return { params: Promise.resolve({ projectId }) }
}

const PROJECTS_500 = { success: false, error: 'Internal server error' }

const projectsAndJobsHandlers: Array<[string, () => Promise<Response>]> = [
  ['projects GET', () => projects.GET()],
  ['projects POST', () => projects.POST(jsonRequest('POST', '/api/projects', { title: 'P' }))],
  [
    'projects/[projectId] GET',
    () => projectById.GET(request('/api/projects/p1'), projectParams('p1')),
  ],
  [
    'projects/[projectId] PATCH',
    () =>
      projectById.PATCH(jsonRequest('PATCH', '/api/projects/p1', { title: 'x' }), projectParams('p1')),
  ],
  [
    'projects/[projectId] DELETE',
    () => projectById.DELETE(request('/api/projects/p1', { method: 'DELETE' }), projectParams('p1')),
  ],
  ['jobs GET', () => jobs.GET()],
  ['jobs POST', () => jobs.POST(jsonRequest('POST', '/api/jobs', { title: 'J', company: 'C' }))],
  ['jobs/[id] GET', () => jobsById.GET(request('/api/jobs/j1'), params('j1'))],
  [
    'jobs/[id] PATCH',
    () => jobsById.PATCH(jsonRequest('PATCH', '/api/jobs/j1', { title: 'x' }), params('j1')),
  ],
  [
    'jobs/[id] DELETE',
    () => jobsById.DELETE(request('/api/jobs/j1', { method: 'DELETE' }), params('j1')),
  ],
]

describe('smoke: Drive-dependent projects and jobs routes degrade on a Drive-less session (T050)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    projectsAdapterMock.instance.initialize.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    projectsAdapterMock.instance.listProjects.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    projectsAdapterMock.instance.createProject.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    projectsAdapterMock.instance.getProject.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    projectsAdapterMock.instance.updateProject.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    projectsAdapterMock.instance.deleteProject.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    jobsAdapterMock.instance.initialize.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    jobsAdapterMock.instance.listJobs.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    jobsAdapterMock.instance.createJob.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    jobsAdapterMock.instance.getJob.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    jobsAdapterMock.instance.updateJob.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    jobsAdapterMock.instance.deleteJob.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  describe('a JWT-only session with no canonical row: 403 DRIVE_NOT_CONNECTED, no Drive call', () => {
    for (const [name, invoke] of projectsAndJobsHandlers) {
      it(`${name} returns 403 with the DRIVE_NOT_CONNECTED body (not 500, not 401)`, async () => {
        // Pre-fix: projects returned 401 (it gated on session.user.email), jobs returned 500.
        setSession(JWT_ONLY_SESSION)
        vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(null as never)

        const response = await invoke()
        const json = await response.json()

        expect(response.status).toBe(403)
        expect(response.status).not.toBe(500)
        expect(response.status).not.toBe(401)
        expect(json).toEqual(NOT_CONNECTED)
        expect(googleAuth.OAuth2).not.toHaveBeenCalled()
        expect(projectsAdapterMock.GoogleDriveProjectsAdapter).not.toHaveBeenCalled()
        expect(jobsAdapterMock.GoogleDriveJobsAdapter).not.toHaveBeenCalled()
      })
    }
  })

  describe('no session: 401 { error: "Unauthorized" }', () => {
    for (const [name, invoke] of projectsAndJobsHandlers) {
      it(`${name} returns 401 with the uniform auth body`, async () => {
        setSession(null)

        const response = await invoke()

        expect(response.status).toBe(401)
        expect(response.status).not.toBe(500)
        await expect(response.json()).resolves.toEqual(AUTH_401)
      })
    }
  })

  describe('an active row whose grant was revoked: 403 DRIVE_GRANT_INVALID, never 500', () => {
    const grantCases: Array<[string, () => Promise<Response>]> = [
      ['projects GET', () => projects.GET()],
      ['jobs GET', () => jobs.GET()],
    ]

    for (const [name, invoke] of grantCases) {
      it(`${name} translates Google's insufficient-scope error to the D3 body`, async () => {
        setSession(JWT_ONLY_SESSION)
        vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(ACTIVE_ROW as never)

        const response = await invoke()

        expect(response.status).toBe(403)
        expect(response.status).not.toBe(500)
        await expect(response.json()).resolves.toEqual(GRANT_INVALID)
        // The gate passed, so the adapter WAS constructed and the failing call reached Google's
        // thrown error - the D4 safety net must translate it, not return a 500.
        expect(googleAuth.OAuth2).toHaveBeenCalledTimes(1)
      })
    }
  })

  describe('positive control: the projects 500 body keeps its exact shape', () => {
    it('projects GET with an active row and a generic error returns { success: false, error } with no details', async () => {
      setSession(JWT_ONLY_SESSION)
      vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(ACTIVE_ROW as never)
      projectsAdapterMock.instance.initialize.mockRejectedValue(new Error('boom'))

      const response = await projects.GET()

      expect(response.status).toBe(500)
      const json = await response.json()
      expect(json).toEqual(PROJECTS_500)
      expect(json).toHaveProperty('success', false)
      expect(json).not.toHaveProperty('details')
    })
  })
})

// -------------------------------------------------------------------------------------------
// T048 / ADR-008 D2: the categories and tags families - the data path behind the dashboard
// crash the user reported. Unlike the content family these four files keep the adapter call
// inside the handler's SINGLE outer try/catch, so the pre-fix failure mode was a raw 500 (or a
// 403 whose body carried only `{ error: 'Google Drive not configured' }` - no `code`, no
// `message`), never the actionable DRIVE_NOT_CONNECTED body.
// -------------------------------------------------------------------------------------------
const CATEGORY_BODY = { name: 'Ideas' }
const TAG_BODY = { name: 'urgent' }

/** Every exported categories/tags handler, in the order the T048 task file names them. */
const categoriesAndTagsHandlers: Array<[string, () => Promise<Response>]> = [
  ['categories GET', () => categories.GET(request('/api/categories'))],
  ['categories POST', () => categories.POST(jsonRequest('POST', '/api/categories', CATEGORY_BODY))],
  [
    'categories/[id] PUT',
    () =>
      categoriesById.PUT(
        jsonRequest('PUT', '/api/categories/c1', { name: 'x' }),
        params('c1')
      ),
  ],
  [
    'categories/[id] DELETE',
    () => categoriesById.DELETE(request('/api/categories/c1', { method: 'DELETE' }), params('c1')),
  ],
  ['tags GET', () => tags.GET(request('/api/tags'))],
  ['tags POST', () => tags.POST(jsonRequest('POST', '/api/tags', TAG_BODY))],
  [
    'tags/[id] PUT',
    () => tagsById.PUT(jsonRequest('PUT', '/api/tags/t1', { name: 'x' }), params('t1')),
  ],
  ['tags/[id] DELETE', () => tagsById.DELETE(request('/api/tags/t1', { method: 'DELETE' }), params('t1'))],
  [
    'tags/[id] POST',
    () =>
      tagsById.POST(jsonRequest('POST', '/api/tags/t1', { targetTagId: 't2' }), params('t1')),
  ],
]

describe('smoke: Drive-dependent categories and tags routes degrade on a Drive-less session (T048)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Arm both adapters to reject with Google's scope error, so a gate leak would surface as
    // DRIVE_GRANT_INVALID rather than being mistaken for the not-connected 403.
    categoriesAdapterMock.instance.initialize.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    categoriesAdapterMock.instance.listCategories.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    categoriesAdapterMock.instance.createCategory.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    categoriesAdapterMock.instance.updateCategory.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    categoriesAdapterMock.instance.deleteCategory.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    tagsAdapterMock.instance.initialize.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    tagsAdapterMock.instance.listTags.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    tagsAdapterMock.instance.createTag.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    tagsAdapterMock.instance.updateTag.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    tagsAdapterMock.instance.deleteTag.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
    tagsAdapterMock.instance.mergeTags.mockRejectedValue(INSUFFICIENT_SCOPE_ERROR)
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  describe('a JWT-only session with no canonical row: 403 DRIVE_NOT_CONNECTED, no Drive call', () => {
    for (const [name, invoke] of categoriesAndTagsHandlers) {
      it(`${name} returns 403 with the DRIVE_NOT_CONNECTED body (not 500, not 401)`, async () => {
        // Pre-fix: a raw 500, or a 403 whose body lacked `code` and `message`.
        setSession(JWT_ONLY_SESSION)
        vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(null as never)

        const response = await invoke()
        const json = await response.json()

        expect(response.status).toBe(403)
        expect(response.status).not.toBe(500)
        expect(response.status).not.toBe(401)
        expect(json).toEqual(NOT_CONNECTED)
        expect(googleAuth.OAuth2).not.toHaveBeenCalled()
        expect(categoriesAdapterMock.GoogleDriveCategoriesAdapter).not.toHaveBeenCalled()
        expect(tagsAdapterMock.GoogleDriveTagsAdapter).not.toHaveBeenCalled()
      })
    }

    it('gates on the canonical row, never on the JWT accessToken', async () => {
      setSession(JWT_ONLY_SESSION)
      vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(null as never)

      await categories.GET(request('/api/categories'))

      expect(vi.mocked(db.cloudIntegration.findFirst)).toHaveBeenCalledWith({
        where: { userId: 'u1', provider: 'google', isActive: true },
      })
    })
  })

  describe('no session: 401 { error: "Unauthorized" }', () => {
    for (const [name, invoke] of categoriesAndTagsHandlers) {
      it(`${name} returns 401 with the uniform auth body`, async () => {
        setSession(null)

        const response = await invoke()

        expect(response.status).toBe(401)
        expect(response.status).not.toBe(500)
        await expect(response.json()).resolves.toEqual(AUTH_401)
      })
    }
  })

  describe('an active row whose grant was revoked: 403 DRIVE_GRANT_INVALID, never 500', () => {
    const grantCases: Array<[string, () => Promise<Response>]> = [
      ['categories GET', () => categories.GET(request('/api/categories'))],
      ['tags GET', () => tags.GET(request('/api/tags'))],
    ]

    for (const [name, invoke] of grantCases) {
      it(`${name} translates Google's insufficient-scope error to the D3 body`, async () => {
        setSession(JWT_ONLY_SESSION)
        vi.mocked(db.cloudIntegration.findFirst).mockResolvedValue(ACTIVE_ROW as never)

        const response = await invoke()

        expect(response.status).toBe(403)
        expect(response.status).not.toBe(500)
        await expect(response.json()).resolves.toEqual(GRANT_INVALID)
        // The gate passed, so the adapter WAS constructed and the failing call reached Google's
        // thrown error - the D4 safety net in the outer catch must translate it, not return a 500.
        expect(googleAuth.OAuth2).toHaveBeenCalledTimes(1)
      })
    }
  })
})
