// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// A malformed request body is a CLIENT error. `POST /api/content` used to let `request.json()`
// throw into the handler's outer catch, which answered 500 "Failed to create content item" for a
// body the server never even read - and reported a server fault for the caller's mistake.
//
// This file pins the 400 for invalid JSON, the same 400 for a JSON body that is not an object, and
// the fact that neither path creates anything (no adapter, no Drive write). The last test is the
// control that keeps the fix honest: a well-formed body still creates and still answers 201.
const adapterMock = vi.hoisted(() => {
  const instance = {
    initialize: vi.fn(),
    listCategoryContent: vi.fn(),
    searchContent: vi.fn(),
    createContent: vi.fn(),
    getContent: vi.fn(),
    resolveCategory: vi.fn(),
  }
  const GoogleDriveContentAdapter = vi.fn(function MockGoogleDriveContentAdapter() {
    return instance
  })
  return { instance, GoogleDriveContentAdapter }
})

vi.mock('next-auth', () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ db: {}, ContentType: {}, ContentStatus: {}, Priority: {} }))
vi.mock('@/lib/cloud-storage/drive-availability', () => ({
  requireDriveAccess: vi.fn().mockResolvedValue({ ok: true, userId: 'user-1', client: {} }),
  driveErrorResponse: vi.fn(),
}))
vi.mock('@/lib/google-drive-content-adapter', () => ({
  GoogleDriveContentAdapter: adapterMock.GoogleDriveContentAdapter,
}))

import { POST } from '@/app/api/content/route'

function postRequest(body: string): NextRequest {
  return new NextRequest('http://localhost/api/content', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
}

describe('POST /api/content - malformed bodies answer 400', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('returns 400 (not 500) for invalid JSON, and creates nothing', async () => {
    const response = await POST(postRequest('{ "title": "broken", '))

    expect(response.status).toBe(400)
    expect(response.status).not.toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid JSON in request body' })

    // Nothing reached Drive: no adapter was built and no write was attempted.
    expect(adapterMock.GoogleDriveContentAdapter).not.toHaveBeenCalled()
    expect(adapterMock.instance.createContent).not.toHaveBeenCalled()
  })

  it('returns 400 for a JSON body that is not an object, and creates nothing', async () => {
    const response = await POST(postRequest('null'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Request body must be a JSON object' })
    expect(adapterMock.GoogleDriveContentAdapter).not.toHaveBeenCalled()
    expect(adapterMock.instance.createContent).not.toHaveBeenCalled()
  })

  it('returns 400 for an empty body, and creates nothing', async () => {
    const response = await POST(postRequest(''))

    expect(response.status).toBe(400)
    expect(response.status).not.toBe(500)
    expect(adapterMock.GoogleDriveContentAdapter).not.toHaveBeenCalled()
    expect(adapterMock.instance.createContent).not.toHaveBeenCalled()
  })

  it('still creates a well-formed body (201) - the fix did not break the write path', async () => {
    const created = { id: 'file-1', title: 'A note', content: '# A note', type: 'NOTE' }
    adapterMock.instance.initialize.mockResolvedValue(undefined)
    adapterMock.instance.resolveCategory.mockResolvedValue('Notes')
    adapterMock.instance.createContent.mockResolvedValue('file-1')
    adapterMock.instance.getContent.mockResolvedValue(created)

    const response = await POST(
      postRequest(JSON.stringify({ title: 'A note', content: '# A note', type: 'NOTE' }))
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual(created)
    expect(adapterMock.instance.createContent).toHaveBeenCalledTimes(1)
  })
})
