// @vitest-environment node
/**
 * T095 - the note that was listed and then 404'd.
 *
 * T094 made `GET /api/content` list every category folder and made a save land in the category the
 * user picked. `src/app/api/content/[id]/route.ts` was still hard-coded to `'Notes'` for GET and
 * DELETE (and trusted `body.categoryId` for PATCH), so a note kept in `Vault/Ideas` or
 * `Vault/Poetry` appeared in the list and then 404'd the moment it was opened - a dead end created
 * by fixing the listing.
 *
 * These tests drive the REAL route handler over a small in-memory Drive (folders by parent, files
 * by parent, file metadata with `parents`, media by file id), so the category is resolved the same
 * way the deployed route resolves it: from the file's own metadata, with no category in the request.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import { NextRequest } from 'next/server'
import { OAuth2Client } from 'google-auth-library'
import { GoogleDriveBackendService, resetVaultStructureCache } from '@/lib/google-drive-backend'
import { GoogleDriveContentAdapter } from '@/lib/google-drive-content-adapter'
import { GET, PATCH, DELETE } from '@/app/api/content/[id]/route'

const MARKDOWN = 'text/markdown'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const VAULT_ID = 'vault-1'
/** A real Drive folder id: 28 chars, mixed case, digits. `Ideas` is NOT a default category. */
const IDEAS_ID = '1GNp50lnbq11hlDeB7suqJiEwHrgi3Sp4'

type Params = {
  fileId?: string
  alt?: string
  fields?: string
  q?: string
  pageSize?: number
  resource?: { name?: string; mimeType?: string; parents?: string[] }
  media?: { mimeType?: string; body?: string }
}
type DriveEntry = { id: string; name: string; mimeType?: string; createdTime?: string }
type FolderEntry = { id: string; name: string; parentId: string | null }

const { mockDrive } = vi.hoisted(() => ({
  mockDrive: {
    files: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

vi.mock('googleapis', () => ({
  google: { drive: () => mockDrive },
}))

const oauth2Client = new OAuth2Client('test-client-id', 'test-client-secret')

// The route's own dependencies. Only the gate is stubbed (its behaviour is pinned by
// `smoke/drive-disconnected-routes.test.ts`, which this change does not touch); the adapter and the
// backend under test are the real ones, driven by `mockDrive`.
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(() => Promise.resolve({ user: { id: 'user-1' } })),
}))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/cloud-storage/drive-availability', async () => {
  const { NextResponse } = await import('next/server')
  return {
    requireDriveAccess: vi.fn(() =>
      Promise.resolve({ ok: true, userId: 'user-1', client: oauth2Client })
    ),
    // Deliberately the "untranslated" 500: a miss that reached this would be a 500, which is the
    // regression these tests forbid.
    driveErrorResponse: vi.fn((error: unknown, fallbackMessage: string) =>
      NextResponse.json({ error: fallbackMessage, details: String(error) }, { status: 500 })
    ),
  }
})

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(`http://localhost${path}`, init)
}

function jsonRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Next 15 hands a dynamic route handler its `params` as a Promise (ADR-002 item 2). */
function params(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

let folders: FolderEntry[] = []
let filesByParent: Record<string, DriveEntry[]> = {}
let fileParent: Record<string, string> = {}
let bodies: Record<string, string> = {}
let listQueries: string[] = []
let createdFolders: Array<{ name: string; parents: string[] }> = []
let createdFiles: Array<{ name: string; parents: string[] }> = []
let updatedBodies: Array<{ fileId: string; body: string }> = []
let deletedFiles: string[] = []
let nextId = 0

function addFolder(id: string, name: string, parentId: string | null): void {
  folders.push({ id, name, parentId })
}

/** The vault as `initializeVaultStructure` expects to find it: Vault + its seven default folders. */
function seedVault(): void {
  addFolder(VAULT_ID, 'Vault', null)
  for (const name of ['Notes', 'Resources', 'Poetry', 'Jobs', 'Projects', 'Daily', 'Archive']) {
    addFolder(`folder-${name}`, name, VAULT_ID)
  }
}

/** A note an earlier write already put in `folderId` - the state that must be reachable by id. */
function addContentFile(
  folderId: string,
  id: string,
  meta: { title: string; type: string; status?: string; categoryId?: string }
): void {
  const entry: DriveEntry = {
    id,
    name: `${meta.title}_2026-01-01.md`,
    mimeType: MARKDOWN,
    createdTime: '2026-01-01T00:00:00.000Z',
  }
  filesByParent[folderId] = [...(filesByParent[folderId] ?? []), entry]
  fileParent[id] = folderId
  bodies[id] = [
    '---',
    `id: ${id}`,
    `title: ${meta.title}`,
    `type: ${meta.type}`,
    `status: ${meta.status ?? 'DRAFT'}`,
    'createdAt: 2026-01-01T00:00:00.000Z',
    'updatedAt: 2026-01-02T00:00:00.000Z',
    ...(meta.categoryId ? [`categoryId: ${meta.categoryId}`] : []),
    '---',
    '',
    `Body of ${meta.title}.`,
    '',
  ].join('\n')
}

/** `'a' in parents or 'b' in parents` -> ['a', 'b'] */
function parentIdsFrom(q: string): string[] {
  return Array.from(q.matchAll(/'([^']+)' in parents/g)).map((match) => match[1])
}

function listResult(input: Params): { data: { files: DriveEntry[] } } {
  const q = input.q ?? ''
  listQueries.push(q)

  // Content listings (listCategoryFiles / listMarkdownFilesIn / listAllContentFiles).
  if (q.includes(`mimeType='${MARKDOWN}'`)) {
    const files = parentIdsFrom(q).flatMap((parent) => filesByParent[parent] ?? [])
    return { data: { files } }
  }

  // Folder lookups (findOrCreateFolder / findCategoryFolderId / listChildFolders).
  if (q.includes(`mimeType='${FOLDER_MIME}'`)) {
    const nameMatch = /name='([^'\\]*)'/.exec(q)
    if (nameMatch) {
      const parentId = parentIdsFrom(q)[0]
      const folder = folders.find(
        (candidate) =>
          candidate.name === nameMatch[1] &&
          (parentId === undefined || candidate.parentId === parentId)
      )
      return { data: { files: folder ? [{ id: folder.id, name: folder.name }] : [] } }
    }

    const parents = parentIdsFrom(q)
    const children = folders.filter(
      (candidate) => candidate.parentId !== null && parents.includes(candidate.parentId)
    )
    return {
      data: { files: children.map(({ id, name }) => ({ id, name, mimeType: FOLDER_MIME })) },
    }
  }

  return { data: { files: [] } }
}

function notFound(fileId: string): Error {
  return new Error(JSON.stringify({ error: { code: 404, message: `File not found: ${fileId}` } }))
}

function getResult(input: Params): { data: unknown } {
  const fileId = input.fileId ?? ''

  if (input.alt === 'media') {
    const body = bodies[fileId]
    if (body === undefined) throw notFound(fileId)
    return { data: body }
  }

  const folder = folders.find((candidate) => candidate.id === fileId)
  if (folder) {
    return { data: { id: folder.id, name: folder.name, mimeType: FOLDER_MIME } }
  }

  // A content file: metadata includes `parents`, which is the whole point of T095.
  const parent = fileParent[fileId]
  if (parent === undefined) throw notFound(fileId)
  return {
    data: {
      id: fileId,
      name: `${fileId}.md`,
      mimeType: MARKDOWN,
      parents: [parent],
    },
  }
}

function createResult(input: Params): { data: Record<string, string> } {
  const resource = input.resource ?? {}
  const parents = resource.parents ?? []

  if (resource.mimeType === FOLDER_MIME) {
    const id = `created-folder-${nextId++}`
    createdFolders.push({ name: resource.name ?? '', parents })
    folders.push({ id, name: resource.name ?? '', parentId: parents[0] ?? null })
    return { data: { id, name: resource.name ?? '' } }
  }

  const id = `created-file-${nextId++}`
  createdFiles.push({ name: resource.name ?? '', parents })
  for (const parent of parents) {
    filesByParent[parent] = [
      ...(filesByParent[parent] ?? []),
      { id, name: resource.name ?? '', mimeType: resource.mimeType ?? MARKDOWN },
    ]
    fileParent[id] = parent
  }
  bodies[id] = input.media?.body ?? ''
  return { data: { id, webViewLink: `https://drive.example/${id}`, webContentLink: '' } }
}

function updateResult(input: Params): { data: { id: string } } {
  const fileId = input.fileId ?? ''
  const body = input.media?.body
  if (typeof body === 'string') {
    bodies[fileId] = body
    updatedBodies.push({ fileId, body })
  }
  return { data: { id: fileId } }
}

function deleteResult(input: Params): { data: string } {
  const fileId = input.fileId ?? ''
  deletedFiles.push(fileId)
  const parent = fileParent[fileId]
  if (parent !== undefined) {
    filesByParent[parent] = (filesByParent[parent] ?? []).filter((entry) => entry.id !== fileId)
    delete fileParent[fileId]
  }
  delete bodies[fileId]
  return { data: '' }
}

let consoleError: ReturnType<typeof vi.spyOn>
// Restored by hand: `vi.restoreAllMocks()` would also wipe the module-level `vi.fn()` gate stubs.
let resolverSpy: MockInstance | null = null

beforeEach(() => {
  folders = []
  filesByParent = {}
  fileParent = {}
  bodies = {}
  listQueries = []
  createdFolders = []
  createdFiles = []
  updatedBodies = []
  deletedFiles = []
  nextId = 0

  // T097: the vault structure is cached at module level, so a test that wants a cold path says so.
  resetVaultStructureCache()

  mockDrive.files.list.mockReset()
  mockDrive.files.get.mockReset()
  mockDrive.files.create.mockReset()
  mockDrive.files.update.mockReset()
  mockDrive.files.delete.mockReset()

  mockDrive.files.list.mockImplementation((input: Params) => Promise.resolve(listResult(input)))
  mockDrive.files.get.mockImplementation((input: Params) => {
    try {
      return Promise.resolve(getResult(input))
    } catch (error) {
      return Promise.reject(error)
    }
  })
  mockDrive.files.create.mockImplementation((input: Params) =>
    Promise.resolve(createResult(input))
  )
  mockDrive.files.update.mockImplementation((input: Params) =>
    Promise.resolve(updateResult(input))
  )
  mockDrive.files.delete.mockImplementation((input: Params) =>
    Promise.resolve(deleteResult(input))
  )

  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
  resolverSpy?.mockRestore()
  resolverSpy = null
})

// -------------------------------------------------------------------------------------------
// GET - a note in a category other than 'Notes' is served by id alone.
// -------------------------------------------------------------------------------------------
describe('T095 - GET /api/content/[id] finds the item in its own category', () => {
  it('serves a note kept in a CUSTOM category (Vault/Ideas) with no category in the request', async () => {
    seedVault()
    addFolder(IDEAS_ID, 'Ideas', VAULT_ID)
    addContentFile(IDEAS_ID, 'idea-1', { title: 'An idea', type: 'IDEA' })

    const response = await GET(request('/api/content/idea-1'), params('idea-1'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.id).toBe('idea-1')
    expect(json.title).toBe('An idea')
    expect(json.type).toBe('IDEA')
    // The pre-fix route listed exactly one folder: Notes. This item was never in it.
    expect(filesByParent['folder-Notes'] ?? []).toEqual([])
  })

  it('serves a note kept in a NON-DEFAULT default folder (Vault/Poetry) too', async () => {
    seedVault()
    addContentFile('folder-Poetry', 'poem-1', { title: 'A poem', type: 'POETRY' })

    const response = await GET(request('/api/content/poem-1'), params('poem-1'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ id: 'poem-1', title: 'A poem' })
  })

  it('derives the category from the file metadata (one metadata get), never from the request', async () => {
    seedVault()
    addFolder(IDEAS_ID, 'Ideas', VAULT_ID)
    addContentFile(IDEAS_ID, 'idea-1', { title: 'An idea', type: 'IDEA' })

    const response = await GET(request('/api/content/idea-1'), params('idea-1'))
    expect(response.status).toBe(200)

    // The file's OWN metadata answered the question: `parents` on the content file id...
    const metadataGets = mockDrive.files.get.mock.calls
      .map((call) => call[0] as Params)
      .filter((call) => String(call.fields ?? '').includes('parents'))
    expect(metadataGets).toHaveLength(1)
    expect(metadataGets[0].fileId).toBe('idea-1')
    expect(metadataGets[0].alt).toBeUndefined()

    // T102: and its category folder was NOT listed to find the id this request already carried.
    // (This legacy fixture carries no list properties, so the parent id is matched against the
    // vault's own folders instead - one discovery query, no content listing.)
    expect(listQueries.some((q) => q.includes('name contains'))).toBe(false)
    expect(listQueries.some((q) => q.includes(`mimeType='${MARKDOWN}'`))).toBe(false)
    expect(
      listQueries.some(
        (q) => q.includes(`mimeType='${FOLDER_MIME}'`) && q.includes(`'${VAULT_ID}' in parents`)
      )
    ).toBe(true)
  })

  it('opens by id without re-resolving the folder name - T094 keeps the only id -> name code', async () => {
    seedVault()
    addFolder(IDEAS_ID, 'Ideas', VAULT_ID)
    addContentFile(IDEAS_ID, 'idea-1', { title: 'An idea', type: 'IDEA' })

    // T094's id -> name resolver is still the one implementation, and the adapter's T095
    // composition still goes through it...
    resolverSpy = vi.spyOn(GoogleDriveBackendService.prototype, 'findFolderNameById')

    const adapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await adapter.initialize()

    expect(await adapter.resolveCategoryForFile('idea-1')).toBe('Ideas')
    expect(resolverSpy).toHaveBeenCalledWith(IDEAS_ID)
    expect(resolverSpy).toHaveBeenCalledTimes(1)

    // ...while T102's by-id read no longer needs it: the metadata get already carries `parents`,
    // and the vault's own folder map names the category. One resolver, zero extra calls.
    const resolvedBefore = resolverSpy.mock.calls.length
    const response = await GET(request('/api/content/idea-1'), params('idea-1'))
    expect(response.status).toBe(200)
    expect(resolverSpy.mock.calls.length).toBe(resolvedBefore)
  })
})

// -------------------------------------------------------------------------------------------
// PATCH - same resolution, and it does not move the file or trust a stale hint.
// -------------------------------------------------------------------------------------------
describe('T095 - PATCH /api/content/[id] updates the item in its own category', () => {
  it('updates a note in Vault/Poetry by id alone and leaves it in Poetry', async () => {
    seedVault()
    addContentFile('folder-Poetry', 'poem-1', { title: 'First line', type: 'POETRY' })

    const response = await PATCH(
      jsonRequest('/api/content/poem-1', { title: 'Revised line' }),
      params('poem-1')
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.id).toBe('poem-1')
    expect(json.title).toBe('Revised line')
    expect(updatedBodies).toHaveLength(1)
    expect(updatedBodies[0].fileId).toBe('poem-1')
    // Still in Poetry: the update addressed the file by id and created/moved nothing.
    expect(filesByParent['folder-Poetry'].map((entry) => entry.id)).toEqual(['poem-1'])
    expect(createdFiles).toEqual([])
    expect(createdFolders).toEqual([])
  })

  it('does not trust a caller-supplied categoryId: a wrong hint still finds the item', async () => {
    seedVault()
    addFolder(IDEAS_ID, 'Ideas', VAULT_ID)
    addContentFile(IDEAS_ID, 'idea-1', { title: 'An idea', type: 'IDEA' })

    // The page sends `selectedCategory?.id`, which may name a category the note is NOT in (a move
    // target, or a stale selection). The note's own metadata wins.
    const response = await PATCH(
      jsonRequest('/api/content/idea-1', { status: 'DONE', categoryId: 'folder-Notes' }),
      params('idea-1')
    )

    expect(response.status).toBe(200)
    expect(updatedBodies).toHaveLength(1)
    expect(updatedBodies[0].fileId).toBe('idea-1')
    expect(filesByParent[IDEAS_ID].map((entry) => entry.id)).toEqual(['idea-1'])
    expect(await response.json()).toMatchObject({ id: 'idea-1', status: 'DONE' })
  })
})

// -------------------------------------------------------------------------------------------
// DELETE - same resolution.
// -------------------------------------------------------------------------------------------
describe('T095 - DELETE /api/content/[id] deletes the item from its own category', () => {
  it('deletes a note kept in a custom category by id alone', async () => {
    seedVault()
    addFolder(IDEAS_ID, 'Ideas', VAULT_ID)
    addContentFile(IDEAS_ID, 'idea-1', { title: 'An idea', type: 'IDEA' })

    const response = await DELETE(
      request('/api/content/idea-1', { method: 'DELETE' }),
      params('idea-1')
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: 'Content deleted successfully',
    })
    expect(deletedFiles).toEqual(['idea-1'])
    expect(filesByParent[IDEAS_ID]).toEqual([])
  })
})

// -------------------------------------------------------------------------------------------
// The miss contract: 404 with the existing body, never a 500, on every verb.
// -------------------------------------------------------------------------------------------
describe('T095 - a miss stays the existing 404', () => {
  it('returns 404 { error: "Content item not found" } for an unknown id on GET, PATCH and DELETE', async () => {
    seedVault()
    addFolder(IDEAS_ID, 'Ideas', VAULT_ID)
    addContentFile(IDEAS_ID, 'idea-1', { title: 'An idea', type: 'IDEA' })

    const responses = [
      await GET(request('/api/content/missing-1'), params('missing-1')),
      await PATCH(jsonRequest('/api/content/missing-1', { title: 'x' }), params('missing-1')),
      await DELETE(
        request('/api/content/missing-1', { method: 'DELETE' }),
        params('missing-1')
      ),
    ]

    for (const response of responses) {
      expect(response.status).toBe(404)
      expect(response.status).not.toBe(500)
      await expect(response.json()).resolves.toEqual({ error: 'Content item not found' })
    }

    // A miss must not be destructive on the way out.
    expect(deletedFiles).toEqual([])
    expect(updatedBodies).toEqual([])
  })

  it('does not serve a markdown file that is outside the vault\'s category folders', async () => {
    seedVault()
    // The user's own folder, not part of the vault: resolving its NAME must not find a category.
    addFolder('personal-folder', 'Personal', null)
    addContentFile('personal-folder', 'foreign-1', { title: 'Not app content', type: 'NOTE' })

    const response = await GET(request('/api/content/foreign-1'), params('foreign-1'))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Content item not found' })
  })
})
