// @vitest-environment node
/**
 * T102 - opening a note cost four SEQUENTIAL Drive round-trips, measured at ~900 ms each.
 *
 * The measured sequence on the pre-T102 route was:
 *
 *   1. `files.get`          - the file's own `parents`, to learn its category folder id
 *   2. `files.get`          - that folder id -> its name (T094's `findFolderNameById`)
 *   3. `files.list`         - the category folder, to find the file whose id we already had
 *   4. `files.get alt=media` - the body
 *
 * Steps 2 and 3 exist only to work out WHICH category the note is in, and both answers are already
 * available elsewhere:
 *
 *   - T098 writes `vault-category` into the file's `appProperties`, so ONE metadata get names the
 *     category without a second call;
 *   - T101 caches recent listings (folder id -> rows with properties), so a note the page has just
 *     listed needs NO metadata call at all.
 *
 * The sequence this file pins:
 *
 *   | item's category already known | calls |
 *   |------------------------------|-------|
 *   | from a cached listing row     | 1 (the media read)                    |
 *   | from the file's properties    | 2 (one metadata get + the media read) |
 *   | legacy file, no properties    | 3 (+ one category-folder discovery)   |
 *
 * And the two things that must NOT change: the editor gets the real BODY (never the list preview
 * excerpt), and a miss stays a 404 (a missing id, an editors file, a non-markdown file, markdown
 * outside the vault's category folders, or a file this process has deleted).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { OAuth2Client } from 'google-auth-library'
import {
  GoogleDriveBackendService,
  buildContentExcerpt,
  encodeContentListProperties,
  rememberDeletedContentFile,
  resetContentListingCache,
  resetVaultStructureCache,
} from '@/lib/google-drive-backend'
import { GoogleDriveContentAdapter } from '@/lib/google-drive-content-adapter'
import { GET } from '@/app/api/content/[id]/route'

const MARKDOWN = 'text/markdown'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document'
const VAULT_ID = 'vault-1'
const NOTES_ID = 'folder-Notes'
/** A custom category, so "the category" is not simply the default. */
const POETRY_ID = 'folder-Poetry'
const DEFAULT_CATEGORIES = ['Notes', 'Resources', 'Poetry', 'Jobs', 'Projects', 'Daily', 'Archive']

/** The note under test: long enough that the preview excerpt cuts off its tail. */
const BODY = [
  'First line of the real note.',
  '',
  ...Array.from({ length: 12 }, (_, index) => `Filler paragraph ${index + 1} of the body.`),
  '',
  'The real tail: TAIL-MARKER.',
].join('\n')

type Params = {
  fileId?: string
  alt?: string
  fields?: string
  q?: string
  pageSize?: number
}

interface FakeFile {
  id: string
  name: string
  mimeType: string
  parentId: string
  body?: string
  appProperties?: Record<string, string>
  trashed?: boolean
}

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

// Only the session and the Drive gate are stubbed; the adapter, the backend and the route handler
// under test are the real ones, driven by `mockDrive`.
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(() => Promise.resolve({ user: { id: 'user-1' } })),
}))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/cloud-storage/drive-availability', async () => {
  const { NextResponse } = await import('next/server')
  return {
    requireDriveAccess: vi.fn(() => Promise.resolve({ ok: true, userId: 'user-1', client: {} })),
    // Deliberately the "untranslated" 500: a miss that reached this would be a 500, which is the
    // regression this file forbids.
    driveErrorResponse: vi.fn((error: unknown, fallbackMessage: string) =>
      NextResponse.json({ error: fallbackMessage, details: String(error) }, { status: 500 })
    ),
  }
})

let folders: Array<{ id: string; name: string; parentId: string | null }> = []
let files: FakeFile[] = []
let listCalls: string[] = []
let metadataGets: Array<{ fileId: string; fields: string }> = []
let mediaReads: string[] = []
/** Every call in the order Drive received it - that order IS the latency being measured. */
let callLog: Array<'list' | 'get' | 'media'> = []

function resetCounters(): void {
  listCalls = []
  metadataGets = []
  mediaReads = []
  callLog = []
  mockDrive.files.list.mockClear()
  mockDrive.files.get.mockClear()
  mockDrive.files.create.mockClear()
  mockDrive.files.update.mockClear()
  mockDrive.files.delete.mockClear()
}

function addFolder(id: string, name: string, parentId: string | null): void {
  folders.push({ id, name, parentId })
}

function seedVault(): void {
  addFolder(VAULT_ID, 'Vault', null)
  for (const name of DEFAULT_CATEGORIES) addFolder(`folder-${name}`, name, VAULT_ID)
}

/** The list metadata a note written by this app carries (T098). */
function modernProperties(
  fileId: string,
  overrides: { title?: string; categoryName?: string; content?: string } = {}
): Record<string, string> {
  const content = overrides.content ?? BODY
  return encodeContentListProperties({
    id: fileId,
    title: overrides.title ?? 'A real note',
    type: 'NOTE',
    status: 'DRAFT',
    priority: 'MEDIUM',
    tags: ['one'],
    categoryId: undefined,
    categoryName: overrides.categoryName ?? 'Notes',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    excerpt: content,
  })
}

function markdownBody(fileId: string, title = 'A real note', content = BODY): string {
  return [
    '---',
    `id: ${fileId}`,
    `title: ${title}`,
    'type: NOTE',
    'status: DRAFT',
    'priority: MEDIUM',
    'createdAt: 2026-01-01T00:00:00.000Z',
    'updatedAt: 2026-01-02T00:00:00.000Z',
    '---',
    '',
    content,
    '',
  ].join('\n')
}

/** A note written by T098+ : it states its own category in `appProperties`. */
function addModernNote(
  id: string,
  options: { parentId?: string; categoryName?: string; title?: string } = {}
): FakeFile {
  const parentId = options.parentId ?? NOTES_ID
  const title = options.title ?? 'A real note'
  const file: FakeFile = {
    id,
    name: `${title}_2026-01-01.md`,
    mimeType: MARKDOWN,
    parentId,
    body: markdownBody(id, title),
    appProperties: modernProperties(id, {
      title,
      categoryName: options.categoryName ?? 'Notes',
    }),
  }
  files.push(file)
  return file
}

/** A note written before T098: markdown, no properties. */
function addLegacyNote(id: string, parentId = NOTES_ID): FakeFile {
  const file: FakeFile = {
    id,
    name: `${id}.md`,
    mimeType: MARKDOWN,
    parentId,
    body: markdownBody(id, id),
  }
  files.push(file)
  return file
}

/** `vault-excerpt` plus its `-1`, `-2`, ... chunks, i.e. the preview the list row renders. */
function readExcerpt(appProperties: Record<string, string> | undefined): string {
  if (!appProperties) return ''

  let value = appProperties['vault-excerpt'] ?? ''
  for (let index = 1; index <= 20; index += 1) {
    const chunk = appProperties[`vault-excerpt-${index}`]
    if (chunk === undefined) break
    value += chunk
  }
  return value
}

function parentIdsFrom(q: string): string[] {
  return Array.from(q.matchAll(/'([^']+)' in parents/g)).map((match) => match[1])
}

function listResult(input: Params): { data: { files: Array<Record<string, unknown>> } } {
  const q = input.q ?? ''
  const fields = input.fields ?? ''
  const wantsProperties = fields.includes('appProperties')

  if (q.includes(`mimeType='${MARKDOWN}'`)) {
    const parents = parentIdsFrom(q)
    return {
      data: {
        files: files
          .filter(
            (file) => file.mimeType === MARKDOWN && !file.trashed && parents.includes(file.parentId)
          )
          .map((file) => ({
            id: file.id,
            name: file.name,
            createdTime: '2026-01-01T00:00:00.000Z',
            mimeType: file.mimeType,
            ...(wantsProperties && file.appProperties
              ? { appProperties: file.appProperties }
              : {}),
          })),
      },
    }
  }

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
    return {
      data: {
        files: folders
          .filter(
            (candidate) =>
              candidate.parentId !== null && parents.includes(candidate.parentId)
          )
          .map(({ id, name }) => ({ id, name, mimeType: FOLDER_MIME })),
      },
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
    const file = files.find((candidate) => candidate.id === fileId)
    if (!file || file.body === undefined) throw notFound(fileId)
    return { data: file.body }
  }

  const folder = folders.find((candidate) => candidate.id === fileId)
  if (folder) return { data: { id: folder.id, name: folder.name, mimeType: FOLDER_MIME } }

  const file = files.find((candidate) => candidate.id === fileId)
  if (!file) throw notFound(fileId)

  // A real Drive metadata get answers exactly the fields that were asked for.
  const asked = input.fields ?? ''
  return {
    data: {
      id: file.id,
      ...(asked.includes('name') ? { name: file.name } : {}),
      ...(asked.includes('mimeType') ? { mimeType: file.mimeType } : {}),
      ...(asked.includes('parents') ? { parents: [file.parentId] } : {}),
      ...(asked.includes('trashed') ? { trashed: file.trashed === true } : {}),
      ...(asked.includes('appProperties') && file.appProperties
        ? { appProperties: file.appProperties }
        : {}),
    },
  }
}

let consoleError: ReturnType<typeof vi.spyOn>
let consoleInfo: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  folders = []
  files = []
  resetCounters()

  // T097/T101: the structure, the folder listings and the delete tombstones are module-level by
  // design, so a test that measures a cold process says so.
  resetVaultStructureCache()
  resetContentListingCache()

  mockDrive.files.list.mockReset()
  mockDrive.files.get.mockReset()
  mockDrive.files.create.mockReset()
  mockDrive.files.update.mockReset()
  mockDrive.files.delete.mockReset()

  mockDrive.files.list.mockImplementation(async (input: Params) => {
    listCalls.push(input.q ?? '')
    callLog.push('list')
    return listResult(input)
  })
  mockDrive.files.get.mockImplementation(async (input: Params) => {
    if (input.alt === 'media') {
      mediaReads.push(input.fileId ?? '')
      callLog.push('media')
    } else {
      metadataGets.push({ fileId: input.fileId ?? '', fields: input.fields ?? '' })
      callLog.push('get')
    }
    return getResult(input)
  })

  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
  consoleInfo.mockRestore()
})

function request(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/content/${id}`)
}

function params(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

/** The structure (Vault + its category folders) is cached for five minutes; warm it first, so the
 *  numbers below are the cost of opening a note and not the cost of the first request of the day. */
async function warmStructure(): Promise<GoogleDriveBackendService> {
  const backend = new GoogleDriveBackendService(oauth2Client, 'user-1')
  await backend.initializeVaultStructure()
  return backend
}

/** The page's list request: the one that leaves rows in the T101 cache. */
async function listNotes(backend: GoogleDriveBackendService, category = 'Notes'): Promise<void> {
  await backend.listCategoryFiles(category)
}

/** Every Drive call this test has made, in the order the mock saw them. */
function sequence(): string[] {
  return [...callLog]
}

function driveCalls(): number {
  return (
    mockDrive.files.list.mock.calls.length +
    mockDrive.files.get.mock.calls.length +
    mockDrive.files.create.mock.calls.length +
    mockDrive.files.update.mock.calls.length +
    mockDrive.files.delete.mock.calls.length
  )
}

async function warmAdapter(userId = 'user-1'): Promise<GoogleDriveContentAdapter> {
  const adapter = new GoogleDriveContentAdapter(oauth2Client, userId)
  await adapter.initialize()
  return adapter
}

// ---------------------------------------------------------------------------------------------
// 0. The BEFORE sequence, reproduced against the same primitives the pre-T102 route used.
// ---------------------------------------------------------------------------------------------
describe('T102 - before: locating an item by listing its category folder', () => {
  it('costs four sequential steps - five Drive calls - for a note whose id the caller has', async () => {
    seedVault()
    addModernNote('note-1')
    await warmStructure()

    const adapter = await warmAdapter()
    resetCounters()

    // Exactly what the pre-T102 route did, in order:
    const category = await adapter.resolveCategoryForFile('note-1') // 1: parents, 2: folder name
    const listed = await adapter.listCategoryContent(category ?? 'Notes') // 3: the listing
    const located = listed.find((item) => item.id === 'note-1')
    expect(located).toBeDefined()
    await adapter.getContent(located!.id, category ?? 'Notes') // 4: the media read

    expect(category).toBe('Notes')
    // Four sequential STEPS, and five requests: the media step cost two, because the route did not
    // pass the mime type it had just listed and the read guard therefore asked for it again.
    expect(sequence()).toEqual(['get', 'get', 'list', 'get', 'media'])
    expect(driveCalls()).toBe(5)
  })
})

// ---------------------------------------------------------------------------------------------
// 1. AFTER: the call counts, one row per source of the category.
// ---------------------------------------------------------------------------------------------
describe('T102 - after: opening a note by id', () => {
  it('is ONE media read when the listing cache already holds the row', async () => {
    seedVault()
    addModernNote('note-1')
    const backend = await warmStructure()

    // The page listed the vault a moment ago (T101): the row is cached, properties included.
    await listNotes(backend)
    expect(mockDrive.files.list).toHaveBeenCalled()

    resetCounters()
    const response = await GET(request('note-1'), params('note-1'))

    expect(response.status).toBe(200)
    expect(driveCalls()).toBe(1)
    expect(sequence()).toEqual(['media'])
    expect(mediaReads).toEqual(['note-1'])
  })

  it('is TWO calls (metadata + media) when no listing is cached', async () => {
    seedVault()
    addModernNote('note-1')
    await warmStructure()

    resetCounters()
    const response = await GET(request('note-1'), params('note-1'))

    expect(response.status).toBe(200)
    expect(driveCalls()).toBe(2)
    expect(sequence()).toEqual(['get', 'media'])
    expect(metadataGets).toHaveLength(1)
    // The one metadata get asks for the category itself, so no folder-name query follows it.
    expect(metadataGets[0].fields).toContain('appProperties')
    expect(metadataGets[0].fields).toContain('parents')
    expect(mediaReads).toEqual(['note-1'])
    // The category folder is never listed to find a file id we already have.
    expect(listCalls).toEqual([])
  })

  it('is THREE calls for a legacy note in a custom category: metadata, discovery, media', async () => {
    seedVault()
    addFolder('folder-Ideas', 'Ideas', VAULT_ID)
    addLegacyNote('legacy-1', 'folder-Ideas')
    await warmStructure()

    resetCounters()
    const response = await GET(request('legacy-1'), params('legacy-1'))

    expect(response.status).toBe(200)
    expect(mediaReads).toEqual(['legacy-1'])
    // No properties -> the parent folder has to be checked against the vault's categories. That is
    // one folder-discovery query, and it is cached on the structure afterwards.
    expect(listCalls).toHaveLength(1)
    expect(listCalls[0]).toContain(`'${VAULT_ID}' in parents`)
    expect(sequence()).toEqual(['get', 'list', 'media'])
    expect(driveCalls()).toBe(3)
  })

  it('is TWO calls for a legacy note in a category the structure already knows', async () => {
    seedVault()
    addLegacyNote('legacy-1')
    await warmStructure()

    resetCounters()
    const response = await GET(request('legacy-1'), params('legacy-1'))

    expect(response.status).toBe(200)
    expect(sequence()).toEqual(['get', 'media'])
    expect(driveCalls()).toBe(2)
  })

  it('does not list the category folder even when the row was never cached', async () => {
    seedVault()
    addModernNote('note-1', { parentId: POETRY_ID, categoryName: 'Poetry' })
    await warmStructure()

    resetCounters()
    const response = await GET(request('note-1'), params('note-1'))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: 'note-1' })
    expect(listCalls).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------
// 2. Which source named the category, and that it is the cheapest available one.
// ---------------------------------------------------------------------------------------------
describe('T102 - the category source, cheapest first', () => {
  it('uses the cached listing row when there is one, and the file properties otherwise', async () => {
    seedVault()
    addModernNote('note-1')
    await warmStructure()

    const reader = await warmAdapter()

    // No listing yet: the file's own properties answer, for the price of one metadata get.
    resetCounters()
    const cold = await reader.locateContentById('note-1')
    expect(cold).toEqual({ categoryName: 'Notes', mimeType: MARKDOWN, source: 'file-properties' })
    expect(sequence()).toEqual(['get'])

    // List the category once (T101 caches the rows), then the same question costs NO call.
    await reader.listCategoryContent('Notes')
    resetCounters()
    const warm = await reader.locateContentById('note-1')
    expect(warm).toEqual({ categoryName: 'Notes', mimeType: MARKDOWN, source: 'listing-cache' })
    expect(sequence()).toEqual([])
  })

  it('still derives the category from the parent folder for a file with no properties', async () => {
    seedVault()
    addLegacyNote('legacy-1')
    await warmStructure()

    const reader = await warmAdapter()
    expect(await reader.locateContentById('legacy-1')).toEqual({
      categoryName: 'Notes',
      mimeType: MARKDOWN,
      source: 'parent-folder',
    })
  })
})

// ---------------------------------------------------------------------------------------------
// 3. The body, never the preview.
// ---------------------------------------------------------------------------------------------
describe('T102 - the editor gets the body, not the list preview', () => {
  it('returns the full markdown even though the file states a bounded excerpt', async () => {
    seedVault()
    const note = addModernNote('note-1')
    await warmStructure()

    const excerpt = readExcerpt(note.appProperties)
    expect(excerpt).toBeDefined()
    expect(excerpt).toBe(buildContentExcerpt(BODY))
    // The preview really is cut: its tail marker is not in it.
    expect(excerpt).not.toContain('TAIL-MARKER')

    for (const warm of [false, true]) {
      resetCounters()
      if (warm) {
        const backend = new GoogleDriveBackendService(oauth2Client, 'user-1')
        await backend.initializeVaultStructure()
        await listNotes(backend)
        resetCounters()
      }

      const response = await GET(request('note-1'), params('note-1'))
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.content).toBe(BODY)
      expect(json.content).toContain('TAIL-MARKER')
      expect(json.content).toContain('\n\n')
      expect(json.content).not.toBe(excerpt)
      expect(json.title).toBe('A real note')
      expect(mediaReads).toEqual(['note-1'])
    }
  })
})

// ---------------------------------------------------------------------------------------------
// 4. The miss contract: 404, with no body read, on every kind of "not a note".
// ---------------------------------------------------------------------------------------------
describe('T102 - a miss is still the existing 404', () => {
  it('returns 404 for an unknown id without reading any media', async () => {
    seedVault()
    await warmStructure()

    resetCounters()
    const response = await GET(request('missing-1'), params('missing-1'))

    expect(response.status).toBe(404)
    expect(response.status).not.toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Content item not found' })
    expect(mediaReads).toEqual([])
  })

  it('does not serve a Google editors file, even though its id exists', async () => {
    seedVault()
    files.push({
      id: 'google-doc-1',
      name: 'A Google Doc',
      mimeType: GOOGLE_DOC_MIME,
      parentId: NOTES_ID,
    })
    await warmStructure()

    resetCounters()
    const response = await GET(request('google-doc-1'), params('google-doc-1'))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Content item not found' })
    expect(mediaReads).toEqual([])
  })

  it('does not serve a non-markdown file in a category folder', async () => {
    seedVault()
    files.push({
      id: 'plain-1',
      name: 'notes.txt',
      mimeType: 'text/plain',
      parentId: NOTES_ID,
      body: 'not a note of ours',
    })
    await warmStructure()

    resetCounters()
    const response = await GET(request('plain-1'), params('plain-1'))

    expect(response.status).toBe(404)
    expect(mediaReads).toEqual([])
  })

  it('does not serve markdown that lives outside the vault category folders', async () => {
    seedVault()
    addFolder('personal-folder', 'Personal', null)
    addLegacyNote('foreign-1', 'personal-folder')
    await warmStructure()

    resetCounters()
    const response = await GET(request('foreign-1'), params('foreign-1'))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Content item not found' })
    expect(mediaReads).toEqual([])
  })

  it('does not serve a trashed note, which every listing excludes', async () => {
    seedVault()
    const note = addModernNote('note-1')
    note.trashed = true
    await warmStructure()

    resetCounters()
    const response = await GET(request('note-1'), params('note-1'))

    expect(response.status).toBe(404)
    expect(mediaReads).toEqual([])
  })

  it('does not serve a file this process has deleted, even from a cached row', async () => {
    seedVault()
    addModernNote('note-1')
    await warmStructure()

    // A cached row that still contains the file (the delete landed after the listing).
    const backend = await warmStructure()
    await listNotes(backend)
    rememberDeletedContentFile('user-1', 'note-1')

    resetCounters()
    const response = await GET(request('note-1'), params('note-1'))

    expect(response.status).toBe(404)
    expect(mediaReads).toEqual([])
  })
})
