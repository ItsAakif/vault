// @vitest-environment node
/**
 * T098 - a list is built from Drive file properties, not from file bodies.
 *
 * The measurement this task starts from: after T097 the cache removed folder discovery, and what
 * was left was WAVES of Drive round-trips, one wave per listing and one per note, because the title,
 * type, status, priority, tags and timestamps all live in the markdown frontmatter. A scoped listing
 * of one note was 1 listing + 1 media read = 2 waves of ~940 ms.
 *
 * Wall-clock cannot be measured here (no access to the account), so the mechanism is pinned the way
 * it can be: by counting the Drive requests on a mocked client. Three instruments:
 *
 *   - `mediaReads()` - the `alt=media` gets. This is the number the change has to drive to ZERO.
 *   - `listCalls` - every `files.list`, with the `fields` selector it used, so a listing that
 *     forgets to ask for `appProperties` is caught (the mock then behaves like real Drive and
 *     returns no properties, and the body-read count goes back up).
 *   - `appPropertiesById` - the mocked Drive's property map, so the wire format is visible and a
 *     "legacy" file is simply a file with no entry.
 *
 * The route-level test at the end opens a note through the REAL `GET /api/content/[id]`, because
 * "properties are a list cache, not a content store" is only true if opening still reads the file.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { OAuth2Client } from 'google-auth-library'
import {
  GoogleDriveBackendService,
  CONTENT_EXCERPT_MAX_CHARS,
  LIST_METADATA_VERSION,
  LIST_METADATA_VERSION_KEY,
  MAX_PROPERTY_ENTRY_BYTES,
  buildContentExcerpt,
  decodeContentListProperties,
  decodeTagList,
  encodeContentListProperties,
  maxPropertyValueBytes,
  resetContentListingCache,
  resetVaultStructureCache,
} from '@/lib/google-drive-backend'
import { GoogleDriveContentAdapter } from '@/lib/google-drive-content-adapter'
import { GET } from '@/app/api/content/[id]/route'

const MARKDOWN = 'text/markdown'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const VAULT_ID = 'vault-1'
const DEFAULT_CATEGORIES = [
  'Notes',
  'Resources',
  'Poetry',
  'Jobs',
  'Projects',
  'Daily',
  'Archive',
]
/**
 * Drive's documented ceiling for one `appProperties` ENTRY, in UTF-8 bytes: the key and the value
 * counted TOGETHER. Reading this as a value-only cap is exactly the bug that made every create with
 * a note-length body fail, so the mock below enforces it the way Drive does and the assertions
 * below measure it the same way.
 */
const DRIVE_PROPERTY_ENTRY_LIMIT = MAX_PROPERTY_ENTRY_BYTES

type Params = {
  fileId?: string
  alt?: string
  fields?: string
  q?: string
  pageSize?: number
  resource?: {
    name?: string
    mimeType?: string
    parents?: string[]
    appProperties?: Record<string, string>
  }
  requestBody?: { appProperties?: Record<string, string> }
  media?: { mimeType?: string; body?: string }
}
type DriveEntry = {
  id: string
  name: string
  mimeType?: string
  createdTime?: string
  appProperties?: Record<string, string>
}
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

// The route's dependencies, as `content-by-id-category.test.ts` stubs them: only the gate and the
// session are fake; the adapter and the backend under test are the real ones.
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(() => Promise.resolve({ user: { id: 'user-1' } })),
}))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/cloud-storage/drive-availability', async () => {
  const { NextResponse } = await import('next/server')
  return {
    // The adapter only hands this client to `google.drive()`, which is mocked - so the gate's
    // client can be an empty object here without weakening what is under test.
    requireDriveAccess: vi.fn(() =>
      Promise.resolve({ ok: true, userId: 'user-1', client: {} })
    ),
    driveErrorResponse: vi.fn((error: unknown, fallbackMessage: string) =>
      NextResponse.json({ error: fallbackMessage, details: String(error) }, { status: 500 })
    ),
  }
})

const oauth2Client = new OAuth2Client('test-client-id', 'test-client-secret')

let folders: FolderEntry[] = []
let filesByParent: Record<string, DriveEntry[]> = {}
let bodies: Record<string, string> = {}
/** The mocked Drive's `appProperties` per file id - the one thing this task adds to the model. */
let appPropertiesById: Record<string, Record<string, string>> = {}
let listCalls: Array<{ q: string; fields: string }> = []
let createdFiles: Array<{ id: string; name: string; parents: string[] }> = []
let nextId = 0

function addFolder(id: string, name: string, parentId: string | null): void {
  folders.push({ id, name, parentId })
}

/** The vault as `initializeVaultStructure` expects to find it: Vault + its seven default folders. */
function seedVault(): void {
  addFolder(VAULT_ID, 'Vault', null)
  for (const name of DEFAULT_CATEGORIES) {
    addFolder(`folder-${name}`, name, VAULT_ID)
  }
}

function markdownBody(
  id: string,
  meta: { title: string; type: string; body?: string; tags?: string[] }
): string {
  return [
    '---',
    `id: ${id}`,
    `title: ${meta.title}`,
    `type: ${meta.type}`,
    'status: DRAFT',
    'createdAt: 2026-01-01T00:00:00.000Z',
    'updatedAt: 2026-01-02T00:00:00.000Z',
    ...(meta.tags && meta.tags.length > 0 ? [`tags: ${JSON.stringify(meta.tags)}`] : []),
    '---',
    '',
    meta.body ?? `Body of ${meta.title}.`,
    '',
  ].join('\n')
}

/**
 * A note written BEFORE T098: a body and no `appProperties`. This is the legacy shape the fallback
 * must still list, and nothing here writes properties for it.
 */
function addLegacyContentFile(
  folderId: string,
  id: string,
  meta: { title: string; type: string; body?: string; tags?: string[] }
): void {
  const entry: DriveEntry = {
    id,
    name: `${meta.title}_2026-01-01.md`,
    mimeType: MARKDOWN,
    createdTime: '2026-01-01T00:00:00.000Z',
  }
  filesByParent[folderId] = [...(filesByParent[folderId] ?? []), entry]
  bodies[id] = markdownBody(id, meta)
}

/** `'a' in parents or 'b' in parents` -> ['a', 'b'] */
function parentIdsFrom(q: string): string[] {
  return Array.from(q.matchAll(/'([^']+)' in parents/g)).map((match) => match[1])
}

/**
 * Real Drive returns ONLY the fields the request selected. The mock does the same, which is why the
 * counts below discriminate: drop `appProperties` from the listing's `fields` and every file comes
 * back legacy, and the media reads reappear.
 */
function listResult(params: Params): { data: { files: DriveEntry[] } } {
  const q = params.q ?? ''
  const fields = params.fields ?? ''
  listCalls.push({ q, fields })
  const wantsProperties = fields.includes('appProperties')

  // Content listings: listCategoryFiles / listMarkdownFilesIn / listAllContentFiles.
  if (q.includes(`mimeType='${MARKDOWN}'`)) {
    const entries = parentIdsFrom(q).flatMap((parent) => filesByParent[parent] ?? [])
    return {
      data: {
        files: entries.map((entry) => ({
          id: entry.id,
          name: entry.name,
          createdTime: entry.createdTime,
          mimeType: entry.mimeType,
          ...(wantsProperties && appPropertiesById[entry.id]
            ? { appProperties: appPropertiesById[entry.id] }
            : {}),
        })),
      },
    }
  }

  // Folder lookups: findOrCreateFolder / findCategoryFolderId / listChildFolders.
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

function getResult(params: Params): { data: unknown } {
  const fileId = params.fileId ?? ''

  if (params.alt === 'media') {
    const body = bodies[fileId]
    if (body === undefined) throw notFound(fileId)
    return { data: body }
  }

  const folder = folders.find((candidate) => candidate.id === fileId)
  if (folder) {
    return { data: { id: folder.id, name: folder.name, mimeType: FOLDER_MIME } }
  }

  const parent = Object.keys(filesByParent).find((key) =>
    filesByParent[key].some((entry) => entry.id === fileId)
  )
  if (parent !== undefined) {
    return { data: { id: fileId, name: `${fileId}.md`, mimeType: MARKDOWN, parents: [parent] } }
  }
  if (fileId in bodies) {
    return { data: { id: fileId, name: `${fileId}.md`, mimeType: MARKDOWN } }
  }

  throw notFound(fileId)
}

/**
 * The entries that would be rejected by Drive, with their byte arithmetic, so a failure names the
 * offending pair instead of just "expected 112 to be <= 124".
 */
function illegalPropertyEntries(properties: Record<string, string>): string[] {
  return Object.entries(properties)
    .map(([key, value]) => ({
      key,
      keyBytes: Buffer.byteLength(key, 'utf8'),
      valueBytes: Buffer.byteLength(value, 'utf8'),
    }))
    .filter((entry) => entry.keyBytes + entry.valueBytes > DRIVE_PROPERTY_ENTRY_LIMIT)
    .map((entry) => `${entry.key}: ${entry.keyBytes} + ${entry.valueBytes} bytes`)
}

/**
 * Real Drive refuses a file whose `appProperties` break the key+value cap, with exactly the message
 * this task started from. The mock does the same, so "the create succeeded" means what it means
 * against the real API - a chunking rule that only satisfies a local assertion would still fail
 * here.
 */
function assertDrivePropertyLimits(properties: Record<string, string>): void {
  const illegal = illegalPropertyEntries(properties)
  if (illegal.length === 0) return

  throw new Error(
    JSON.stringify({
      error: {
        code: 400,
        message: `Properties and app properties are limited to 124 bytes in UTF-8 encoding, counting both the key and the value. Over limit: ${illegal.join('; ')}`,
      },
    })
  )
}

function createResult(params: Params): { data: Record<string, string> } {
  const resource = params.resource ?? {}
  const parents = resource.parents ?? []

  if (resource.appProperties) assertDrivePropertyLimits(resource.appProperties)

  if (resource.mimeType === FOLDER_MIME) {
    const id = `created-folder-${nextId++}`
    folders.push({ id, name: resource.name ?? '', parentId: parents[0] ?? null })
    return { data: { id, name: resource.name ?? '' } }
  }

  const id = `created-file-${nextId++}`
  createdFiles.push({ id, name: resource.name ?? '', parents })
  const entry: DriveEntry = {
    id,
    name: resource.name ?? '',
    mimeType: resource.mimeType,
    createdTime: '2026-01-01T00:00:00.000Z',
  }
  for (const parent of parents) {
    filesByParent[parent] = [...(filesByParent[parent] ?? []), entry]
  }
  bodies[id] = params.media?.body ?? ''
  if (resource.appProperties) appPropertiesById[id] = { ...resource.appProperties }
  return { data: { id, webViewLink: `https://drive.example/${id}`, webContentLink: '' } }
}

/**
 * `files.update` carries the body AND the list metadata in ONE multipart request. The mock applies
 * both, like Drive does, so a test can list the file afterwards and see what an update wrote.
 */
function updateResult(params: Params): { data: { id: string } } {
  const fileId = params.fileId ?? ''
  const body = params.media?.body
  if (typeof body === 'string') bodies[fileId] = body

  const appProperties = params.requestBody?.appProperties
  if (appProperties) {
    assertDrivePropertyLimits(appProperties)
    appPropertiesById[fileId] = { ...(appPropertiesById[fileId] ?? {}), ...appProperties }
  }

  return { data: { id: fileId } }
}

function contentBody(overrides: Record<string, unknown> = {}) {
  return {
    title: 'A note',
    content: 'The body.',
    type: 'NOTE',
    status: 'DRAFT',
    priority: 'MEDIUM',
    tags: [],
    ...overrides,
  }
}

// ---- instruments ---------------------------------------------------------------------------

/** The `alt=media` gets: the wave this task removes from the listing path. */
function mediaReads(): Params[] {
  return mockDrive.files.get.mock.calls
    .map((call) => call[0] as Params)
    .filter((call) => call.alt === 'media')
}

function listCallsMatching(predicate: (q: string) => boolean): Array<{ q: string; fields: string }> {
  return listCalls.filter((call) => predicate(call.q))
}

/** The markdown listings (one per folder), as opposed to folder lookups. */
function markdownListCalls(): Array<{ q: string; fields: string }> {
  return listCallsMatching((q) => q.includes(`mimeType='${MARKDOWN}'`))
}

/** The folder lookups that ask "does a folder with this NAME exist?" - the T097 walk's cost. */
function discoveryCalls(): Array<{ q: string; fields: string }> {
  return listCallsMatching(
    (q) => q.includes(`mimeType='${FOLDER_MIME}'`) && q.includes("name='")
  )
}

interface CallCounts {
  list: number
  get: number
  create: number
  update: number
  delete: number
  total: number
}

function callCounts(): CallCounts {
  const list = mockDrive.files.list.mock.calls.length
  const get = mockDrive.files.get.mock.calls.length
  const create = mockDrive.files.create.mock.calls.length
  const update = mockDrive.files.update.mock.calls.length
  const del = mockDrive.files.delete.mock.calls.length
  return { list, get, create, update, delete: del, total: list + get + create + update + del }
}

function resetCounters(): void {
  listCalls = []
  mockDrive.files.list.mockClear()
  mockDrive.files.get.mockClear()
  mockDrive.files.create.mockClear()
  mockDrive.files.update.mockClear()
  mockDrive.files.delete.mockClear()
}

let consoleError: ReturnType<typeof vi.spyOn>
let consoleInfo: ReturnType<typeof vi.spyOn>
let consoleWarn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  folders = []
  filesByParent = {}
  bodies = {}
  appPropertiesById = {}
  listCalls = []
  createdFiles = []
  nextId = 0

  mockDrive.files.list.mockReset()
  mockDrive.files.get.mockReset()
  mockDrive.files.create.mockReset()
  mockDrive.files.update.mockReset()
  mockDrive.files.delete.mockReset()

  // T097's structure cache is module-level by design; every test starts cold and says so.
  resetVaultStructureCache()

  mockDrive.files.list.mockImplementation(async (params: Params) => listResult(params))
  mockDrive.files.get.mockImplementation(async (params: Params) => getResult(params))
  mockDrive.files.create.mockImplementation(async (params: Params) => createResult(params))
  mockDrive.files.update.mockImplementation(async (params: Params) => updateResult(params))
  mockDrive.files.delete.mockImplementation(async () => ({ data: '' }))

  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
  consoleInfo.mockRestore()
  consoleWarn.mockRestore()
})

/** A warm adapter: `initialize()` costs nothing (the T097 structure cache), so counts are the list. */
async function warmAdapter(): Promise<GoogleDriveContentAdapter> {
  const adapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
  await adapter.initialize()
  return adapter
}

// -------------------------------------------------------------------------------------------
// 1. The call counts - the primary evidence.
// -------------------------------------------------------------------------------------------
describe('T098 - the listing asks for properties, so three notes cost one call and no reads', () => {
  it('lists three property-bearing notes with 1 listing call and 0 media reads', async () => {
    seedVault()

    // Written through the REAL create path, so the properties are the ones production writes.
    const writer = await warmAdapter()
    const titles = ['Alpha', 'Bravo', 'Charlie']
    const ids: string[] = []
    for (const title of titles) {
      ids.push(await writer.createContent('Notes', contentBody({ title, tags: ['x'] })))
    }

    // The create path really put the list metadata on the file.
    for (const id of ids) {
      expect(appPropertiesById[id]?.[LIST_METADATA_VERSION_KEY]).toBe(LIST_METADATA_VERSION)
    }

    resetCounters()
    const reader = await warmAdapter()
    expect(discoveryCalls()).toHaveLength(0) // T097's cache: no folder discovery

    // ---- after T098: one listing wave, no read wave -------------------------------------
    const items = await reader.listCategoryContent('Notes')
    const after = {
      listings: markdownListCalls().length,
      calls: callCounts(),
      reads: mediaReads().length,
    }

    expect(items.map((item) => item.title)).toEqual(titles)
    expect(items.map((item) => item.id)).toEqual(ids)
    expect(after.listings).toBe(1)
    expect(after.reads).toBe(0)
    expect(after.calls.total).toBe(1)
    // And the listing asked Drive for the properties at all - the selector is the mechanism.
    expect(markdownListCalls()[0].fields).toContain('appProperties')
    expect(reader.lastListingStats).toEqual({ items: 3, fromProperties: 3, fromBody: 0 })

    // ---- before T098: the same three files, with no properties ---------------------------
    // This is not an assumption: it is the same vault with the property map removed, i.e. exactly
    // what a file written before this change looks like.
    for (const id of ids) delete appPropertiesById[id]

    // T101: the folder listing is cached for 15 s, so the "before" measurement has to start from a
    // cold listing cache too - otherwise the rows (and their properties) would be the ones cached a
    // moment ago, and this comparison would measure nothing.
    resetContentListingCache()

    resetCounters()
    const legacyReader = await warmAdapter()
    const legacyItems = await legacyReader.listCategoryContent('Notes')
    const before = {
      listings: markdownListCalls().length,
      calls: callCounts(),
      reads: mediaReads().length,
    }

    expect(legacyItems.map((item) => item.title)).toEqual(titles)
    expect(before.listings).toBe(1)
    expect(before.reads).toBe(3) // 1 + N, the shape this task removes
    expect(legacyReader.lastListingStats).toEqual({ items: 3, fromProperties: 0, fromBody: 3 })
  })

  it('lists the whole vault with no media reads at all', async () => {
    seedVault()
    addFolder('folder-Ideas', 'Ideas', VAULT_ID)

    const writer = await warmAdapter()
    await writer.createContent('Notes', contentBody({ title: 'One', type: 'NOTE' }))
    await writer.createContent('Poetry', contentBody({ title: 'Two', type: 'POETRY' }))
    await writer.createContent('Ideas', contentBody({ title: 'Three', type: 'IDEA' }))

    resetCounters()
    const reader = await warmAdapter()
    const items = await reader.listAllContent()

    expect(items.map((item) => item.title).sort()).toEqual(['One', 'Three', 'Two'])
    expect(mediaReads()).toHaveLength(0)
    // 1 (Vault's child folders) + 8 (one markdown listing per folder incl. Ideas) + 1 (nested
    // discovery) - and not one read. `initialize()` and the folder map cost nothing (T097).
    expect(markdownListCalls().length).toBe(8)
    expect(callCounts().list).toBe(10)
    expect(callCounts().get).toBe(0)
    expect(callCounts().total).toBe(10)
    expect(reader.lastListingStats).toEqual({ items: 3, fromProperties: 3, fromBody: 0 })
  })
})

// -------------------------------------------------------------------------------------------
// 2. The legacy fallback: one body read per file without properties, reported.
// -------------------------------------------------------------------------------------------
describe('T098 - a file written before this change still lists', () => {
  it('reads exactly one body for the legacy file and none for the property file', async () => {
    seedVault()

    const writer = await warmAdapter()
    const propertyFileId = await writer.createContent(
      'Notes',
      contentBody({ title: 'Written after T098', tags: ['new'] })
    )
    addLegacyContentFile('folder-Notes', 'legacy-1', {
      title: 'Written before T098',
      type: 'NOTE',
      body: 'The old body.',
      tags: ['old'],
    })

    resetCounters()
    const reader = await warmAdapter()
    const items = await reader.listCategoryContent('Notes')

    expect(items.map((item) => item.title)).toEqual(['Written after T098', 'Written before T098'])

    // Exactly one media read: the legacy file. The property file cost nothing.
    expect(mediaReads()).toHaveLength(1)
    expect(mediaReads()[0].fileId).toBe('legacy-1')
    expect(reader.lastListingStats).toEqual({ items: 2, fromProperties: 1, fromBody: 1 })

    // The fallback is the pre-T098 result, body and all, so nothing about a legacy row changes.
    const legacy = items.find((item) => item.id === 'legacy-1')
    expect(legacy?.content).toBe('The old body.')
    expect(legacy?.tags).toEqual(['old'])

    // And the fallback was reported, not silent.
    expect(consoleInfo).toHaveBeenCalledWith(
      expect.stringContaining('1 from a body read (no list properties - written before T098)')
    )

    // The property file is not a legacy file: it never reached a body read.
    expect(mediaReads().map((call) => call.fileId)).not.toContain(propertyFileId)
  })

  it('does not require a migration: a legacy file lists on every request, unchanged', async () => {
    seedVault()
    addLegacyContentFile('folder-Notes', 'legacy-1', { title: 'Old note', type: 'NOTE' })

    const first = await warmAdapter()
    expect((await first.listCategoryContent('Notes')).map((item) => item.title)).toEqual(['Old note'])

    const second = await warmAdapter()
    expect((await second.listCategoryContent('Notes')).map((item) => item.title)).toEqual([
      'Old note',
    ])
    // Nothing was written back to make it "migrated".
    expect(mockDrive.files.update).not.toHaveBeenCalled()
    expect(appPropertiesById['legacy-1']).toBeUndefined()
  })
})

// -------------------------------------------------------------------------------------------
// 3. Properties are a list cache, never a content store.
// -------------------------------------------------------------------------------------------
describe('T098 - properties never serve a body', () => {
  it('builds the row from properties with the body preview, and opening the note reads the file', async () => {
    seedVault()
    const writer = await warmAdapter()
    const fileId = await writer.createContent(
      'Notes',
      contentBody({ title: 'A note', content: 'The real body.\n\nWith a second   paragraph.' })
    )

    resetCounters()
    const adapter = await warmAdapter()
    const [listed] = await adapter.listCategoryContent('Notes')

    // The row is complete...
    expect(listed.title).toBe('A note')
    expect(listed.type).toBe('NOTE')
    expect(listed.status).toBe('DRAFT')
    expect(listed.priority).toBe('MEDIUM')
    // ...and carries the PREVIEW only: 0 media reads were made, and no body was shaped out of
    // properties. T100 - `content` is the display line, collapsed to single spaces.
    expect(mediaReads()).toHaveLength(0)
    expect(listed.content).toBe('The real body. With a second paragraph.')

    // Opening the note is what reads it - and it returns the markdown, not the preview.
    resetCounters()
    const opened = await adapter.getContent(fileId, 'Notes')
    expect(opened.content).toBe('The real body.\n\nWith a second   paragraph.')
    expect(mediaReads()).toHaveLength(1)
    expect(mediaReads()[0].fileId).toBe(fileId)
  })

  it('keeps the response shape: the same keys as a row read from the body', async () => {
    seedVault()
    const writer = await warmAdapter()
    await writer.createContent('Notes', contentBody({ title: 'From properties', tags: ['a'] }))
    addLegacyContentFile('folder-Notes', 'legacy-1', { title: 'From the body', type: 'NOTE' })

    const adapter = await warmAdapter()
    const items = await adapter.listCategoryContent('Notes')
    const fromProperties = items.find((item) => item.title === 'From properties')
    const fromBody = items.find((item) => item.title === 'From the body')

    expect(fromProperties).toBeDefined()
    expect(fromBody).toBeDefined()
    expect(Object.keys(fromProperties ?? {}).sort()).toEqual(Object.keys(fromBody ?? {}).sort())
    expect(Object.keys(fromProperties ?? {}).sort()).toEqual([
      'attachments',
      'categoryId',
      'content',
      'createdAt',
      'id',
      'priority',
      'status',
      'tags',
      'title',
      'type',
      'updatedAt',
    ])
    expect(fromProperties?.createdAt).toBeInstanceOf(Date)
    expect(fromProperties?.updatedAt).toBeInstanceOf(Date)
    expect(fromProperties?.attachments).toEqual([])
    expect(fromProperties?.categoryId).toBeUndefined()
  })

  it('serves the body through the real GET /api/content/[id], not the property map', async () => {
    seedVault()
    const writer = await warmAdapter()
    const fileId = await writer.createContent(
      'Notes',
      contentBody({ title: 'Opened later', content: 'The body the app wrote.' })
    )

    resetCounters()
    const response = await GET(
      new NextRequest(`http://localhost/api/content/${fileId}`),
      { params: Promise.resolve({ id: fileId }) }
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.id).toBe(fileId)
    expect(json.title).toBe('Opened later')
    expect(json.content).toBe('The body the app wrote.')
    // The body came from a media read, and opening the note did not list a category folder to find
    // the id it was handed: T102 - one metadata get (which carries the category) plus the read.
    expect(mediaReads().map((call) => call.fileId)).toEqual([fileId])
    expect(markdownListCalls()).toEqual([])
    expect(mockDrive.files.get).toHaveBeenCalledTimes(2)
  })
})

// -------------------------------------------------------------------------------------------
// 4. Update writes the properties too, or the list row goes stale.
// -------------------------------------------------------------------------------------------
describe('T098 - an edited note cannot leave a stale list row', () => {
  it('reflects a new title, status, priority and tags in the next list with no body read', async () => {
    seedVault()
    const writer = await warmAdapter()
    const fileId = await writer.createContent(
      'Poetry',
      contentBody({ title: 'First line', type: 'POETRY', tags: ['one', 'two'] })
    )

    resetCounters()
    await writer.updateContent(fileId, 'Poetry', {
      title: 'Revised line',
      status: 'DONE',
      priority: 'HIGH',
      tags: ['one', 'two', 'three'],
    })

    // One multipart update carried the body AND the properties - no second round-trip.
    expect(mockDrive.files.update).toHaveBeenCalledTimes(1)
    expect(mockDrive.files.update.mock.calls[0][0].requestBody.appProperties).toBeDefined()

    // The file is still self-describing: the frontmatter says the same thing.
    expect(bodies[fileId]).toContain('title: Revised line')
    expect(bodies[fileId]).toContain('status: DONE')

    // And the next list is built from the properties: no body read, new values.
    resetCounters()
    const reader = await warmAdapter()
    const [row] = await reader.listCategoryContent('Poetry')

    expect(mediaReads()).toHaveLength(0)
    expect(reader.lastListingStats).toEqual({ items: 1, fromProperties: 1, fromBody: 0 })
    expect(row.title).toBe('Revised line')
    expect(row.status).toBe('DONE')
    expect(row.priority).toBe('HIGH')
    expect(row.tags).toEqual(['one', 'two', 'three'])
  })

  it('follows the resolved category name when the note is written under another one', async () => {
    seedVault()
    const writer = await warmAdapter()
    const fileId = await writer.createContent('Notes', contentBody({ title: 'A mover' }))

    // `updateContent` addresses the file by id - this app never re-parents a note - so the file
    // stays in Notes while the caller's resolved category is Poetry. That is exactly the case where
    // a stale list row would be born: the frontmatter and the properties must both say Poetry, and
    // the row must be built from the properties.
    await writer.updateContent(fileId, 'Poetry', { content: 'Moved.' })

    resetCounters()
    const reader = await warmAdapter()
    const [row] = await reader.listCategoryContent('Notes')

    expect(mediaReads()).toHaveLength(0)
    expect(appPropertiesById[fileId]['vault-category']).toBe('Poetry')
    expect(bodies[fileId]).toContain('categoryName: Poetry')
    expect(row.categoryId).toBeUndefined()
  })

  it('gives a legacy file properties the first time it is edited, so it stops costing a read', async () => {
    seedVault()
    addLegacyContentFile('folder-Notes', 'legacy-1', { title: 'Old note', type: 'NOTE' })

    const writer = await warmAdapter()
    const before = await writer.listCategoryContent('Notes')
    expect(before[0].content).toBe('Body of Old note.')
    expect(writer.lastListingStats).toEqual({ items: 1, fromProperties: 0, fromBody: 1 })

    // An ordinary edit. Nothing migrates a file on a read; the write does it.
    await writer.updateContent('legacy-1', 'Notes', { title: 'Old note, edited' })

    resetCounters()
    const reader = await warmAdapter()
    const [row] = await reader.listCategoryContent('Notes')

    expect(mediaReads()).toHaveLength(0)
    expect(reader.lastListingStats).toEqual({ items: 1, fromProperties: 1, fromBody: 0 })
    expect(row.title).toBe('Old note, edited')
    // T100: the preview, not the body - and for this one-line note the two texts are the same.
    expect(row.content).toBe('Body of Old note.')
  })
})

// -------------------------------------------------------------------------------------------
// 5. The encoding: strings on the wire, chunked under Drive's 124-byte cap, tags JSON.
// -------------------------------------------------------------------------------------------
describe('T098 - the property encoding survives the Drive round trip', () => {
  it('writes the documented schema and reports the values as strings', async () => {
    seedVault()
    const writer = await warmAdapter()
    const fileId = await writer.createContent(
      'Poetry',
      contentBody({ title: 'A poem', type: 'POETRY', status: 'PUBLISHED', priority: 'LOW', tags: ['verse'] })
    )

    const properties = appPropertiesById[fileId]
    expect(properties[LIST_METADATA_VERSION_KEY]).toBe('1')
    expect(properties['vault-title']).toBe('A poem')
    expect(properties['vault-type']).toBe('POETRY')
    expect(properties['vault-status']).toBe('PUBLISHED')
    expect(properties['vault-priority']).toBe('LOW')
    expect(properties['vault-category']).toBe('Poetry')
    expect(properties['vault-tags']).toBe('["verse"]')
    expect(properties['vault-created']).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(properties['vault-updated']).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    // Every value is a string, and every entry fits Drive's key+value limit.
    for (const value of Object.values(properties)) {
      expect(typeof value).toBe('string')
    }
    expect(illegalPropertyEntries(properties)).toEqual([])
  })

  it('decodes tags exactly, and degrades a malformed value to [] instead of throwing', () => {
    // The encoded form is JSON, so it survives a map of strings.
    expect(decodeTagList('["one","two"]')).toEqual(['one', 'two'])
    expect(decodeTagList('[]')).toEqual([])

    // Malformed is a list with no tags, never an exception: a note must stay listable.
    expect(decodeTagList('not json')).toEqual([])
    expect(decodeTagList('{"one":true}')).toEqual([])
    expect(decodeTagList('["one",2,null]')).toEqual(['one'])
    expect(decodeTagList('')).toEqual([])
    expect(decodeTagList(null)).toEqual([])
    expect(decodeTagList(undefined)).toEqual([])
  })

  it('degrades a malformed tag property on a real file to [] and still lists it without a read', async () => {
    seedVault()
    const writer = await warmAdapter()
    const fileId = await writer.createContent('Notes', contentBody({ title: 'Tagged', tags: ['one'] }))
    expect(appPropertiesById[fileId]['vault-tags']).toBe('["one"]')

    // Someone (a script, an older client) wrote something that is not JSON into the tag property.
    appPropertiesById[fileId]['vault-tags'] = 'one,two'

    resetCounters()
    const reader = await warmAdapter()
    const [row] = await reader.listCategoryContent('Notes')

    expect(row.tags).toEqual([])
    expect(mediaReads()).toHaveLength(0)
    expect(reader.lastListingStats).toEqual({ items: 1, fromProperties: 1, fromBody: 0 })
  })

  it('chunks a long title and a long tag list, and reassembles them exactly', async () => {
    seedVault()
    const longTitle = `${'A very long title with an emoji \u{1F4DD} in it. '.repeat(4)}end`
    const longTags = Array.from({ length: 8 }, (_value, index) => `tag-${index}-${'x'.repeat(30)}`)
    expect(Buffer.byteLength(longTitle, 'utf8')).toBeGreaterThan(DRIVE_PROPERTY_ENTRY_LIMIT)

    const writer = await warmAdapter()
    const fileId = await writer.createContent(
      'Notes',
      contentBody({ title: longTitle, tags: longTags })
    )

    const properties = appPropertiesById[fileId]
    // Chunked, every chunk legal against ITS OWN key, and never split mid-character.
    expect(properties['vault-title-1']).toBeDefined()
    expect(properties['vault-tags-1']).toBeDefined()
    expect(illegalPropertyEntries(properties)).toEqual([])

    resetCounters()
    const reader = await warmAdapter()
    const [row] = await reader.listCategoryContent('Notes')

    expect(mediaReads()).toHaveLength(0)
    expect(row.title).toBe(longTitle)
    expect(row.tags).toEqual(longTags)
  })

  it('round-trips the metadata through encode/decode, and rejects what it cannot trust', () => {
    const metadata = {
      id: 'content_1',
      title: 'Round trip',
      type: 'NOTE',
      status: 'DRAFT',
      priority: 'HIGH',
      categoryId: 'folder-Notes',
      categoryName: 'Notes',
      tags: ['a', 'b'],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    }
    const encoded = encodeContentListProperties(metadata)

    expect(decodeContentListProperties(encoded)).toEqual(metadata)

    // Anything that is not a complete, versioned map is "no properties" - which means one body
    // read, not a wrong row.
    expect(decodeContentListProperties(undefined)).toBeNull()
    expect(decodeContentListProperties(null)).toBeNull()
    expect(decodeContentListProperties([])).toBeNull()
    expect(decodeContentListProperties({})).toBeNull()
    expect(decodeContentListProperties({ ...encoded, [LIST_METADATA_VERSION_KEY]: '2' })).toBeNull()
    expect(decodeContentListProperties({ ...encoded, 'vault-title': undefined })).toBeNull()
    expect(decodeContentListProperties({ ...encoded, 'vault-created': 'not a date' })).toBeNull()
    expect(decodeContentListProperties({ ...encoded, 'vault-type': 42 })).toBeNull()
  })
})

// -------------------------------------------------------------------------------------------
// 6. The backend surface the adapter depends on.
// -------------------------------------------------------------------------------------------
describe('T098 - the listing entry carries the properties and the frontmatter still does', () => {
  it('returns appProperties from listCategoryFiles and keeps the markdown self-describing', async () => {
    seedVault()
    const adapter = await warmAdapter()
    const fileId = await adapter.createContent(
      'Notes',
      contentBody({ title: 'Both places', tags: ['both'] })
    )

    // The file still says everything in its frontmatter, so it is readable outside this app.
    expect(bodies[fileId]).toContain('title: Both places')
    expect(bodies[fileId]).toContain('tags: ["both"]')
    expect(bodies[fileId]).toContain('categoryName: Notes')

    // And the listing brings the same facts back as properties.
    const backend = new GoogleDriveBackendService(oauth2Client, 'user-1')
    await backend.initializeVaultStructure()
    const entries = await backend.listCategoryFiles('Notes')
    const entry = entries.find((candidate) => candidate.id === fileId)

    expect(entry?.appProperties?.['vault-title']).toBe('Both places')
  })
})

// -------------------------------------------------------------------------------------------
// 7. T100 - the preview line: a bounded excerpt in the properties, and no way into the editor.
//
// T098 removed the body from a listed row, which also removed the preview line `ContentItemList`
// renders under each title. Restoring it by reading bodies would undo T098, so the excerpt travels
// in the properties that are already written and already requested: 0 reads, preview back.
// -------------------------------------------------------------------------------------------
describe('T100 - the list row carries a preview excerpt, never a body', () => {
  /** A body long enough that the preview has to cut it, with whitespace to collapse. */
  const LONG_BODY = [
    'Opening line of a long note.',
    '',
    'A second paragraph,   with extra spaces, that is long enough to push the preview past the',
    'stated maximum all on its own, because a preview line is short and a note is not.',
    '',
    'END OF THE NOTE.',
  ].join('\n')

  const collapsed = LONG_BODY.replace(/\s+/g, ' ').trim()

  /** The preview rule, under the name the expectations read best with. */
  const expectedExcerpt = buildContentExcerpt

  it('shows the excerpt on a property-built row, and the listing still makes 0 body reads', async () => {
    seedVault()
    const writer = await warmAdapter()
    const fileId = await writer.createContent(
      'Notes',
      contentBody({ title: 'Previewed', content: LONG_BODY })
    )

    resetCounters()
    const reader = await warmAdapter()
    const [row] = await reader.listCategoryContent('Notes')

    // Zero reads, one listing: the preview costs nothing extra because the value was already there.
    expect(mediaReads()).toHaveLength(0)
    expect(callCounts()).toEqual({ list: 1, get: 0, create: 0, update: 0, delete: 0, total: 1 })
    expect(reader.lastListingStats).toEqual({ items: 1, fromProperties: 1, fromBody: 0 })

    // The card's three lines: title, type, date - and now the preview under them.
    expect(row.id).toBe(fileId)
    expect(row.title).toBe('Previewed')
    expect(row.content).not.toBe('')
    expect(row.content).toBe(expectedExcerpt(LONG_BODY))
    expect(row.content.startsWith('Opening line of a long note.')).toBe(true)
    // Whitespace collapsed, like the preview line renders it: one line, no newlines.
    expect(row.content).not.toContain('\n')
    expect(row.content).not.toContain('  ')
    expect(Buffer.byteLength(LONG_BODY, 'utf8')).toBeGreaterThan(CONTENT_EXCERPT_MAX_CHARS)
    expect(Array.from(row.content).length).toBeLessThanOrEqual(CONTENT_EXCERPT_MAX_CHARS)
    expect(Array.from(row.content).length).toBeGreaterThan(CONTENT_EXCERPT_MAX_CHARS - 2)
  })

  it('cuts an over-long note at the stated maximum, chunked under Drive\'s value limit', async () => {
    seedVault()
    const writer = await warmAdapter()
    const longBody = 'word'.repeat(300)
    const fileId = await writer.createContent(
      'Notes',
      contentBody({ title: 'Over long', content: longBody })
    )

    // The property is bounded at the write, not merely truncated by the reader...
    const properties = appPropertiesById[fileId]
    expect(properties['vault-excerpt']).toBeDefined()
    // ...and 180 characters do not fit one entry beside a 13-byte key, so it is chunked.
    expect(properties['vault-excerpt-1']).toBeDefined()
    expect(illegalPropertyEntries(properties)).toEqual([])

    resetCounters()
    const reader = await warmAdapter()
    const [row] = await reader.listCategoryContent('Notes')

    expect(mediaReads()).toHaveLength(0)
    expect(Array.from(row.content)).toHaveLength(CONTENT_EXCERPT_MAX_CHARS)
    expect(row.content).toBe(expectedExcerpt(longBody))
    // A preview is not an ever-growing string: the 1000-character note is not in it.
    expect(row.content.length).toBeLessThan(longBody.length)

    // Astral characters are counted as characters: 180, never 90 and never half an emoji.
    const emojiBody = '\u{1F4DD}'.repeat(300)
    const emojiId = await writer.createContent(
      'Notes',
      contentBody({ title: 'Emoji note', content: emojiBody })
    )
    const emojiExcerpt = '\u{1F4DD}'.repeat(CONTENT_EXCERPT_MAX_CHARS)
    expect(decodeContentListProperties(appPropertiesById[emojiId])?.excerpt).toBe(emojiExcerpt)
    const emojiRow = (await reader.listCategoryContent('Notes')).find(
      (item) => item.id === emojiId
    )
    expect(emojiRow?.content).toBe(emojiExcerpt)
  })

  it('leaves a legacy file (no properties) exactly as before: full body, one read, no write', async () => {
    seedVault()
    addLegacyContentFile('folder-Notes', 'legacy-1', {
      title: 'Old note',
      type: 'NOTE',
      body: LONG_BODY,
    })

    resetCounters()
    const reader = await warmAdapter()
    const items = await reader.listCategoryContent('Notes')

    expect(items).toHaveLength(1)
    // The pre-T098 path, unchanged: one media read, and the whole body as a legacy row's content.
    expect(mediaReads()).toHaveLength(1)
    expect(mediaReads()[0].fileId).toBe('legacy-1')
    expect(items[0].content).toBe(LONG_BODY)
    expect(items[0].content).not.toBe(expectedExcerpt(LONG_BODY))
    expect(reader.lastListingStats).toEqual({ items: 1, fromProperties: 0, fromBody: 1 })

    // A read never migrates: nothing was written back to give the file properties.
    expect(mockDrive.files.update).not.toHaveBeenCalled()
    expect(appPropertiesById['legacy-1']).toBeUndefined()
  })

  it('cannot reach the editor: opening reads the real body, and a save keeps it', async () => {
    seedVault()
    const writer = await warmAdapter()
    const fileId = await writer.createContent(
      'Notes',
      contentBody({ title: 'Long note', content: LONG_BODY })
    )

    resetCounters()
    const adapter = await warmAdapter()
    const [row] = await adapter.listCategoryContent('Notes')
    expect(mediaReads()).toHaveLength(0)
    // The preview is a prefix of the note and stops before it ends - it is not the note.
    expect(row.content).not.toContain('END OF THE NOTE.')

    // (a) The adapter's open path is the file, not the property.
    const opened = await adapter.getContent(fileId, 'Notes')
    expect(opened.content).toBe(LONG_BODY)
    expect(opened.content).toContain('END OF THE NOTE.')
    expect(opened.content).not.toBe(row.content)

    // (b) And the route the editor actually calls answers the same way.
    resetCounters()
    const response = await GET(
      new NextRequest(`http://localhost/api/content/${fileId}`),
      { params: Promise.resolve({ id: fileId }) }
    )
    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.content).toBe(LONG_BODY)
    expect(json.content).not.toBe(row.content)

    // (c) A save that does not touch the body keeps the real note, and the preview is re-derived
    // from the content written - the list value is never an input to the write.
    resetCounters()
    await writer.updateContent(fileId, 'Notes', { title: 'Long note, retitled' })
    expect(bodies[fileId]).toContain('END OF THE NOTE.')
    // The excerpt lives in properties only: it is nowhere in the markdown.
    expect(bodies[fileId]).not.toContain('vault-excerpt')
    expect(bodies[fileId]).not.toContain('excerpt:')
    expect(decodeContentListProperties(appPropertiesById[fileId])?.excerpt).toBe(
      expectedExcerpt(LONG_BODY)
    )

    resetCounters()
    const after = await warmAdapter()
    const [afterRow] = await after.listCategoryContent('Notes')
    expect(mediaReads()).toHaveLength(0)
    expect(afterRow.title).toBe('Long note, retitled')
    expect(afterRow.content).toBe(row.content)
  })

  it('treats a missing or malformed excerpt as absent, never as a rejected row', () => {
    const metadata = {
      id: 'content_1',
      title: 'Round trip',
      type: 'NOTE',
      status: 'DRAFT',
      tags: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      excerpt: 'The first line.',
    }
    const encoded = encodeContentListProperties(metadata)

    expect(decodeContentListProperties(encoded)?.excerpt).toBe('The first line.')

    // Absent: no preview, and the row is still a row.
    const withoutExcerpt = { ...encoded }
    delete withoutExcerpt['vault-excerpt']
    expect(decodeContentListProperties(withoutExcerpt)?.excerpt).toBeUndefined()
    expect(decodeContentListProperties(withoutExcerpt)?.title).toBe('Round trip')

    // Malformed: absent, not fatal. A non-string value and a bad chunk are both "no preview".
    expect(decodeContentListProperties({ ...encoded, 'vault-excerpt': 42 })?.excerpt).toBeUndefined()
    expect(
      decodeContentListProperties({ ...encoded, 'vault-excerpt-1': 42 })?.excerpt
    ).toBeUndefined()
    expect(decodeContentListProperties({ ...encoded, 'vault-excerpt': 42 })?.title).toBe(
      'Round trip'
    )

    // An over-long value is bounded on the way in as well as on the way out.
    const unbounded = 'x'.repeat(CONTENT_EXCERPT_MAX_CHARS * 3)
    expect(
      Array.from(decodeContentListProperties({ ...encoded, 'vault-excerpt': unbounded })?.excerpt ?? '')
    ).toHaveLength(CONTENT_EXCERPT_MAX_CHARS)
    expect(decodeContentListProperties(encodeContentListProperties({ ...metadata, excerpt: unbounded }))?.excerpt).toBe(
      unbounded.slice(0, CONTENT_EXCERPT_MAX_CHARS)
    )

    // And the round trip is exact for a well-formed value, including a chunked one.
    const chunked = encodeContentListProperties({ ...metadata, excerpt: collapsed })
    expect(chunked['vault-excerpt-1']).toBeDefined()
    expect(decodeContentListProperties(chunked)?.excerpt).toBe(expectedExcerpt(LONG_BODY))
  })
})

// -------------------------------------------------------------------------------------------
// 8. The budget is 124 bytes of KEY + VALUE.
//
// The production failure this section pins: POST /api/content answered 500 with
//   "Properties and app properties are limited to 124 bytes in UTF-8 encoding,
//    counting both the key and the value."
// Nothing was written. A note with a ~30-character body worked, which is why it went unnoticed:
// the excerpt is capped at 180 characters but `vault-excerpt` is a 13-byte key, so the first chunk
// may hold 111 bytes and the old code wrote up to 120 of them - every note longer than a sentence
// lost its whole body to a list preview.
// -------------------------------------------------------------------------------------------
describe('the property budget is 124 bytes of key + value, measured in UTF-8', () => {
  /** The value a logical property was written as, reassembling `base`, `base-1`, `base-2`, ... */
  function writtenValue(properties: Record<string, string>, baseKey: string): string {
    let value = properties[baseKey] ?? ''
    for (let index = 1; index <= 200; index += 1) {
      const chunk = properties[`${baseKey}-${index}`]
      if (chunk === undefined) break
      value += chunk
    }
    return value
  }

  /** The key a chunk was written under: `base`, then `base-1`, `base-2`, ... */
  function chunkKey(baseKey: string, index: number): string {
    return index === 0 ? baseKey : `${baseKey}-${index}`
  }

  /**
   * A UTF-8 round trip is the corruption test that needs no assumptions: a lone surrogate (half a
   * cut character) encodes as U+FFFD and does not come back. A chunk containing one fails this.
   */
  function survivesUtf8RoundTrip(value: string): boolean {
    return Buffer.from(value, 'utf8').toString('utf8') === value
  }

  it('derives every chunk limit from that chunk\'s own final key, never from a fixed 124', () => {
    expect(MAX_PROPERTY_ENTRY_BYTES).toBe(DRIVE_PROPERTY_ENTRY_LIMIT)
    // 13 bytes of key leave 111 of value - not 120, and certainly not 124.
    expect(maxPropertyValueBytes('vault-excerpt')).toBe(111)
    // The suffix is part of the key, so a later chunk gets less room, not the same room.
    expect(maxPropertyValueBytes('vault-excerpt-1')).toBe(109)
    expect(maxPropertyValueBytes('vault-excerpt-9')).toBe(109)
    expect(maxPropertyValueBytes('vault-excerpt-10')).toBe(108)
    expect(maxPropertyValueBytes('vault-title-1')).toBe(111)
    // A key that could carry nothing is what makes a property unchunkable (see the drop test).
    expect(maxPropertyValueBytes('x'.repeat(124))).toBe(0)
    expect(maxPropertyValueBytes('x'.repeat(125))).toBe(-1)
  })

  it('creates a 400+ character body with an emoji and accents, every entry legal', async () => {
    seedVault()
    // Deliberately over 400 characters, with non-ASCII text early enough that the 180-character
    // excerpt is non-ASCII too: the case that failed against the real account.
    const body = [
      'Café, crème brûlée and déjà vu — naïve résumé, written in one sitting.',
      '',
      'A paragraph with an emoji \u{1F4DD} and a rocket \u{1F680} in the middle of a sentence.',
      'The quick brown fox jumps over the lazy dog. '.repeat(8),
    ].join('\n')
    expect(Array.from(body).length).toBeGreaterThanOrEqual(400)
    expect(Buffer.byteLength(body, 'utf8')).toBeGreaterThan(400)

    const writer = await warmAdapter()
    // Before the fix this threw Drive's 124-byte error and nothing was written at all.
    const fileId = await writer.createContent(
      'Notes',
      contentBody({ title: 'A long note', content: body })
    )

    expect(createdFiles.map((file) => file.id)).toContain(fileId)
    expect(bodies[fileId]).toContain('Café, crème brûlée')
    expect(bodies[fileId]).toContain('\u{1F4DD}')
    // Nothing was rejected, retried or logged: the request never saw a Drive error.
    expect(consoleError).not.toHaveBeenCalled()
    expect(consoleWarn).not.toHaveBeenCalled()

    const properties = appPropertiesById[fileId]
    // The excerpt needs two chunks (111 + the rest), and its first one is inside the budget.
    expect(properties['vault-excerpt']).toBeDefined()
    expect(properties['vault-excerpt-1']).toBeDefined()
    expect(Buffer.byteLength(properties['vault-excerpt'], 'utf8')).toBeLessThanOrEqual(111)
    expect(Buffer.byteLength(properties['vault-excerpt-1'], 'utf8')).toBeLessThanOrEqual(109)

    // The rule, stated exactly as Drive states it, for every property written.
    for (const [key, value] of Object.entries(properties)) {
      expect(
        Buffer.byteLength(key, 'utf8') + Buffer.byteLength(value, 'utf8')
      ).toBeLessThanOrEqual(DRIVE_PROPERTY_ENTRY_LIMIT)
    }
    expect(illegalPropertyEntries(properties)).toEqual([])

    // The excerpt is intact and the listing still costs zero body reads.
    expect(decodeContentListProperties(properties)?.excerpt).toBe(buildContentExcerpt(body))
    resetCounters()
    const reader = await warmAdapter()
    const [row] = await reader.listCategoryContent('Notes')
    expect(mediaReads()).toHaveLength(0)
    expect(row.content).toBe(buildContentExcerpt(body))
    expect(reader.lastListingStats).toEqual({ items: 1, fromProperties: 1, fromBody: 0 })

    // The same bodies through the UPDATE path, which writes properties in a `files.update`.
    resetCounters()
    await writer.updateContent(fileId, 'Notes', { content: `${body}\n\nOne more paragraph: ü.` })
    expect(illegalPropertyEntries(appPropertiesById[fileId])).toEqual([])
    expect(decodeContentListProperties(appPropertiesById[fileId])?.excerpt).toBe(
      buildContentExcerpt(`${body}\n\nOne more paragraph: ü.`)
    )
    expect(bodies[fileId]).toContain('One more paragraph: ü.')
  })

  it('chunks a very long non-ASCII title legally, and reassembles it exactly', async () => {
    seedVault()
    const longTitle = `${'\u{1F4DA} Émile Zola — Germinal, chapter by chapter. '.repeat(10)}fin`
    expect(Buffer.byteLength(longTitle, 'utf8')).toBeGreaterThan(3 * DRIVE_PROPERTY_ENTRY_LIMIT)

    const writer = await warmAdapter()
    const fileId = await writer.createContent(
      'Notes',
      contentBody({ title: longTitle, content: 'Short body.' })
    )

    const properties = appPropertiesById[fileId]
    expect(properties['vault-title']).toBeDefined()
    expect(properties['vault-title-1']).toBeDefined()
    expect(properties['vault-title-2']).toBeDefined()
    expect(illegalPropertyEntries(properties)).toEqual([])

    // Every chunk is inside ITS OWN key's budget and as full as it can legally be: the next
    // character of the title would not have fitted, so no byte was needlessly left behind.
    const chunks: string[] = []
    for (let index = 0; chunks.length === index; index += 1) {
      const value = properties[chunkKey('vault-title', index)]
      if (value === undefined) break
      chunks.push(value)
    }
    expect(chunks.length).toBeGreaterThan(2)
    for (let index = 0; index < chunks.length; index += 1) {
      const capacity = maxPropertyValueBytes(chunkKey('vault-title', index))
      const bytes = Buffer.byteLength(chunks[index], 'utf8')
      expect(bytes).toBeLessThanOrEqual(capacity)
      expect(survivesUtf8RoundTrip(chunks[index])).toBe(true)
      if (index < chunks.length - 1) {
        const nextFirstCharacter = Array.from(chunks[index + 1])[0]
        expect(bytes + Buffer.byteLength(nextFirstCharacter, 'utf8')).toBeGreaterThan(capacity)
      }
    }

    // Exact, character for character, through the reader production uses.
    expect(writtenValue(properties, 'vault-title')).toBe(longTitle)
    expect(decodeContentListProperties(properties)?.title).toBe(longTitle)

    resetCounters()
    const reader = await warmAdapter()
    const [row] = await reader.listCategoryContent('Notes')
    expect(mediaReads()).toHaveLength(0)
    expect(row.title).toBe(longTitle)
  })

  it('round-trips a non-ASCII excerpt exactly, with no character cut at a boundary', async () => {
    seedVault()
    // 180 characters of emoji, accents and ideographs: several hundred UTF-8 bytes, so the excerpt
    // is split across chunks whose boundaries land inside multi-byte text, not between ASCII bytes.
    const body = `${'\u{1F4DD}'.repeat(40)}é${'\u{1F680}'.repeat(40)}ü${'naïve '.repeat(20)}${'漢字'.repeat(200)}`
    const excerpt = buildContentExcerpt(body)
    expect(Array.from(excerpt).length).toBe(CONTENT_EXCERPT_MAX_CHARS)
    expect(Buffer.byteLength(excerpt, 'utf8')).toBeGreaterThan(3 * DRIVE_PROPERTY_ENTRY_LIMIT)

    const writer = await warmAdapter()
    const fileId = await writer.createContent(
      'Notes',
      contentBody({ title: 'Unicode preview', content: body })
    )

    const properties = appPropertiesById[fileId]
    expect(properties['vault-excerpt']).toBeDefined()
    expect(properties['vault-excerpt-1']).toBeDefined()
    expect(illegalPropertyEntries(properties)).toEqual([])

    // No chunk ends in half a character: each one is valid UTF-8 on its own, which a split
    // surrogate pair would not be.
    const excerptChunks = Object.entries(properties)
      .filter(([key]) => key === 'vault-excerpt' || /^vault-excerpt-\d+$/.test(key))
      .map(([, value]) => value)
    expect(excerptChunks.length).toBeGreaterThan(1)
    for (const chunk of excerptChunks) {
      expect(survivesUtf8RoundTrip(chunk)).toBe(true)
      expect(chunk).not.toContain('\uFFFD')
    }

    // And the reassembled value is byte-for-byte the preview, not a repaired approximation of it.
    expect(writtenValue(properties, 'vault-excerpt')).toBe(excerpt)
    expect(Buffer.from(writtenValue(properties, 'vault-excerpt'), 'utf8')).toEqual(
      Buffer.from(excerpt, 'utf8')
    )
    expect(decodeContentListProperties(properties)?.excerpt).toBe(excerpt)

    resetCounters()
    const reader = await warmAdapter()
    const [row] = await reader.listCategoryContent('Notes')
    expect(mediaReads()).toHaveLength(0)
    expect(row.content).toBe(excerpt)
  })

  it('drops a property that cannot be chunked at all, and saves the note anyway', async () => {
    seedVault()
    // `readPropertyChunks` walks at most 200 chunks, and a chunk holds ~109 bytes, so a value past
    // ~21 KB cannot be chunked into a value this app can read back. 30,000 characters is that case.
    const enormousTitle = 'T'.repeat(30_000)
    const writer = await warmAdapter()
    const fileId = await writer.createContent(
      'Notes',
      contentBody({ title: enormousTitle, content: 'The body is what matters.' })
    )

    // The save happened: the file exists, with the body and the full title in its frontmatter.
    expect(createdFiles.map((file) => file.id)).toContain(fileId)
    expect(bodies[fileId]).toContain('The body is what matters.')
    expect(bodies[fileId]).toContain(enormousTitle)
    expect(consoleError).not.toHaveBeenCalled()

    // The impossible property is absent - not half-written, and not over the limit.
    const properties = appPropertiesById[fileId]
    expect(properties['vault-title']).toBeUndefined()
    expect(Object.keys(properties).filter((key) => key.startsWith('vault-title'))).toEqual([])
    expect(illegalPropertyEntries(properties)).toEqual([])

    // Everything that could be written still was.
    expect(properties[LIST_METADATA_VERSION_KEY]).toBe(LIST_METADATA_VERSION)
    expect(properties['vault-type']).toBe('NOTE')
    expect(properties['vault-excerpt']).toBe('The body is what matters.')

    // Dropping it was reported, not silent.
    expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('vault-title'))

    // And the note still lists - from its body, because a row with no title is not a row.
    resetCounters()
    const reader = await warmAdapter()
    const items = await reader.listCategoryContent('Notes')
    expect(items.map((item) => item.title)).toEqual([enormousTitle])
    expect(items).toHaveLength(1)
    expect(mediaReads()).toHaveLength(1)
    expect(reader.lastListingStats).toEqual({ items: 1, fromProperties: 0, fromBody: 1 })
  })
})
