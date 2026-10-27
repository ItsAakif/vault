// @vitest-environment node
/**
 * T101 - the list request became the slow one, and this file is the evidence for the fix.
 *
 * Measured against the real account after T097/T098: a warm `GET /api/content` was still 3,998 ms
 * for a vault with one note. The cost did not grow with the number of notes - it grew with the
 * number of Drive ENDPOINTS walked: one discovery query, one listing per category folder (ten), and
 * a second discovery level, at ~900 ms per call. With `DRIVE_READ_CONCURRENCY = 6` the ten listings
 * took two waves, so the request was four sequential round-trips.
 *
 * Three changes, and each one is pinned here:
 *
 *   1. a folder's listing is cached for 15 s (module level, keyed by account + folder). A warm list
 *      makes ZERO Drive calls.
 *   2. folder listings run at `DRIVE_LIST_CONCURRENCY = 10`, so the ten folders of the measured
 *      vault are ONE wave.
 *   3. the child-folder discovery is cached with the structure, so a listing stops re-querying it.
 *
 * And the two ways this goes wrong, which are the point of half the tests below:
 *
 *   - a stale cache hiding the user's own change -> every write path invalidates (create, update,
 *     delete, category create), and a note saved inside the TTL is visible on the very next list;
 *   - a deleted note resurrecting -> the delete both invalidates AND tombstones the id, so a listing
 *     that has not caught up (or one already in flight) still cannot return it, and the merge rule
 *     the page uses cannot re-add an item the user removed.
 *
 * Wall-clock cannot be measured on this box (no access to the account), so what is measured is the
 * cause: Drive calls and sequential round-trip waves, counted on a mocked Drive.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { OAuth2Client } from 'google-auth-library'
import {
  GoogleDriveBackendService,
  CONTENT_LISTING_TTL_MS,
  DRIVE_LIST_CONCURRENCY,
  resetContentListingCache,
  resetVaultStructureCache,
} from '@/lib/google-drive-backend'
import { GoogleDriveContentAdapter } from '@/lib/google-drive-content-adapter'
import { mergeRecentSaves, type RecentSave } from '@/lib/content-list-merge'
import { GET } from '@/app/api/content/[id]/route'

const MARKDOWN = 'text/markdown'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const VAULT_ID = 'vault-1'
const DEFAULT_CATEGORIES = ['Notes', 'Resources', 'Poetry', 'Jobs', 'Projects', 'Daily', 'Archive']
/** The three extra category folders that make the measured vault's ten. */
const EXTRA_CATEGORIES = ['Ideas', 'Health', 'Travel']

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

// The route's dependencies, stubbed as `content-list-properties.test.ts` does: only the gate and the
// session are fake; the adapter and the backend under test are the real ones.
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(() => Promise.resolve({ user: { id: 'user-1' } })),
}))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/cloud-storage/drive-availability', async () => {
  const { NextResponse } = await import('next/server')
  return {
    requireDriveAccess: vi.fn(() => Promise.resolve({ ok: true, userId: 'user-1', client: {} })),
    driveErrorResponse: vi.fn((error: unknown, fallbackMessage: string) =>
      NextResponse.json({ error: fallbackMessage, details: String(error) }, { status: 500 })
    ),
  }
})

const oauth2Client = new OAuth2Client('test-client-id', 'test-client-secret')

let folders: FolderEntry[] = []
let filesByParent: Record<string, DriveEntry[]> = {}
let bodies: Record<string, string> = {}
let appPropertiesById: Record<string, Record<string, string>> = {}
let listCalls: Array<{ q: string; fields: string }> = []
let mediaReads: string[] = []
let createdFolders: Array<{ id: string; name: string; parents: string[] }> = []
let createdFiles: Array<{ id: string; name: string; parents: string[] }> = []
let deletedIds: string[] = []
/** "Drive's listing has not caught up yet": these files are written but not listed. */
let hiddenFromListing: Set<string> = new Set()
/** "Drive's listing still returns the deleted file": the delete is not reflected yet. */
let keepDeletedInListing = false
let nextId = 0

// ---- wave instrumentation -------------------------------------------------------------------

let activeList = 0
let maxActiveList = 0
/** Runs before a list call resolves, if a test installs one (the one-wave barrier). */
let listGate: ((params: Params) => Promise<void>) | null = null

function resetCounters(): void {
  listCalls = []
  mediaReads = []
  mockDrive.files.list.mockClear()
  mockDrive.files.get.mockClear()
  mockDrive.files.create.mockClear()
  mockDrive.files.update.mockClear()
  mockDrive.files.delete.mockClear()
  activeList = 0
  maxActiveList = 0
}

// ---- the Drive model ------------------------------------------------------------------------

function addFolder(id: string, name: string, parentId: string | null): void {
  folders.push({ id, name, parentId })
}

/** Vault + its seven default categories + three more, i.e. the measured vault's ten folders. */
function seedVault(): void {
  addFolder(VAULT_ID, 'Vault', null)
  for (const name of DEFAULT_CATEGORIES) addFolder(`folder-${name}`, name, VAULT_ID)
  for (const name of EXTRA_CATEGORIES) addFolder(`folder-${name}`, name, VAULT_ID)
}

function parentIdsFrom(q: string): string[] {
  return Array.from(q.matchAll(/'([^']+)' in parents/g)).map((match) => match[1])
}

function listResult(params: Params): { data: { files: DriveEntry[] } } {
  const q = params.q ?? ''
  const fields = params.fields ?? ''
  const wantsProperties = fields.includes('appProperties')

  if (q.includes(`mimeType='${MARKDOWN}'`)) {
    const entries = parentIdsFrom(q)
      .flatMap((parent) => filesByParent[parent] ?? [])
      .filter((entry) => !hiddenFromListing.has(entry.id))
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
  if (folder) return { data: { id: folder.id, name: folder.name, mimeType: FOLDER_MIME } }

  const parent = Object.keys(filesByParent).find((key) =>
    filesByParent[key].some((entry) => entry.id === fileId)
  )
  if (parent !== undefined) {
    return { data: { id: fileId, name: `${fileId}.md`, mimeType: MARKDOWN, parents: [parent] } }
  }
  if (fileId in bodies) return { data: { id: fileId, name: `${fileId}.md`, mimeType: MARKDOWN } }

  throw notFound(fileId)
}

function createResult(params: Params): { data: Record<string, string> } {
  const resource = params.resource ?? {}
  const parents = resource.parents ?? []

  if (resource.mimeType === FOLDER_MIME) {
    const id = `created-folder-${nextId++}`
    createdFolders.push({ id, name: resource.name ?? '', parents })
    addFolder(id, resource.name ?? '', parents[0] ?? null)
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

function updateResult(params: Params): { data: { id: string } } {
  const fileId = params.fileId ?? ''
  const body = params.media?.body
  if (typeof body === 'string') bodies[fileId] = body
  const appProperties = params.requestBody?.appProperties
  if (appProperties) {
    appPropertiesById[fileId] = { ...(appPropertiesById[fileId] ?? {}), ...appProperties }
  }
  return { data: { id: fileId } }
}

function contentBody(overrides: Record<string, unknown> = {}) {
  return {
    title: 'A note',
    content: 'The body of the note.',
    type: 'NOTE',
    status: 'DRAFT',
    priority: 'MEDIUM',
    tags: [],
    ...overrides,
  }
}

// ---- instruments ----------------------------------------------------------------------------

/** The markdown listings: one per folder, the query cost this task reduces. */
function markdownCalls(): Array<{ q: string; fields: string }> {
  return listCalls.filter((call) => call.q.includes(`mimeType='${MARKDOWN}'`))
}

/** Child-folder discovery: folders by parent, with no name in the query. */
function childFolderCalls(): Array<{ q: string; fields: string }> {
  return listCalls.filter(
    (call) => call.q.includes(`mimeType='${FOLDER_MIME}'`) && !call.q.includes("name='")
  )
}

/** Folder lookups that ask "does a folder with this NAME exist?" - the T097 walk. */
function discoveryCalls(): Array<{ q: string; fields: string }> {
  return listCalls.filter(
    (call) => call.q.includes(`mimeType='${FOLDER_MIME}'`) && call.q.includes("name='")
  )
}

function callCounts() {
  return {
    list: mockDrive.files.list.mock.calls.length,
    get: mockDrive.files.get.mock.calls.length,
    create: mockDrive.files.create.mock.calls.length,
    update: mockDrive.files.update.mock.calls.length,
    delete: mockDrive.files.delete.mock.calls.length,
  }
}

async function warmAdapter(userId = 'user-1'): Promise<GoogleDriveContentAdapter> {
  const adapter = new GoogleDriveContentAdapter(oauth2Client, userId)
  await adapter.initialize()
  return adapter
}

let consoleError: ReturnType<typeof vi.spyOn>
let consoleInfo: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  folders = []
  filesByParent = {}
  bodies = {}
  appPropertiesById = {}
  createdFolders = []
  createdFiles = []
  deletedIds = []
  hiddenFromListing = new Set()
  keepDeletedInListing = false
  nextId = 0
  listCalls = []
  mediaReads = []
  activeList = 0
  maxActiveList = 0
  listGate = null

  mockDrive.files.list.mockReset()
  mockDrive.files.get.mockReset()
  mockDrive.files.create.mockReset()
  mockDrive.files.update.mockReset()
  mockDrive.files.delete.mockReset()

  // T101: the structure, the folder listings and the delete tombstones are all module-level by
  // design - which is what makes them work - so every test starts from a cold process.
  resetVaultStructureCache()
  resetContentListingCache()

  mockDrive.files.list.mockImplementation(async (params: Params) => {
    listCalls.push({ q: params.q ?? '', fields: params.fields ?? '' })
    activeList += 1
    maxActiveList = Math.max(maxActiveList, activeList)
    // A test can hold every call open here - that is how "was this one wave?" is measured without
    // depending on timings: if the calls do not all overlap, the barrier never releases.
    if (listGate) await listGate(params)
    // One macrotask so parallel calls really overlap - otherwise "concurrent" would be
    // indistinguishable from "sequential" in the instrument.
    await new Promise((resolve) => setImmediate(resolve))
    activeList -= 1
    return listResult(params)
  })
  mockDrive.files.get.mockImplementation(async (params: Params) => {
    if (params.alt === 'media') mediaReads.push(params.fileId ?? '')
    return getResult(params)
  })
  mockDrive.files.create.mockImplementation(async (params: Params) => createResult(params))
  mockDrive.files.update.mockImplementation(async (params: Params) => updateResult(params))
  mockDrive.files.delete.mockImplementation(async (params: Params) => {
    const id = params.fileId ?? ''
    deletedIds.push(id)
    if (!keepDeletedInListing) {
      for (const parent of Object.keys(filesByParent)) {
        filesByParent[parent] = filesByParent[parent].filter((entry) => entry.id !== id)
      }
    }
    return { data: '' }
  })

  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
  consoleInfo.mockRestore()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------------------------
// 1. The call and wave counts - the primary evidence.
// ---------------------------------------------------------------------------------------------
describe('T101 - a warm listing walks no Drive endpoint at all', () => {
  it('cold: the same twelve calls in two waves; warm: zero calls', async () => {
    seedVault()
    const writer = await warmAdapter()
    await writer.createContent('Notes', contentBody({ title: 'One' }))
    await writer.createContent('Poetry', contentBody({ title: 'Two', type: 'POETRY' }))

    // ---- request 1: cold listing cache (the structure may already be warm) -------------------
    resetCounters()
    const coldAdapter = await warmAdapter()
    const coldItems = await coldAdapter.listAllContent()
    const cold = {
      childFolders: childFolderCalls().length,
      markdown: markdownCalls().length,
      calls: callCounts(),
      maxInFlight: maxActiveList,
    }

    expect(coldItems.map((item) => item.title).sort()).toEqual(['One', 'Two'])
    // 2 child-folder queries (Vault's children, then the level below) + 10 markdown listings.
    expect(cold.childFolders).toBe(2)
    expect(cold.markdown).toBe(10)
    expect(cold.calls.list).toBe(12)
    expect(cold.calls.get).toBe(0) // T098: rows come from properties, not bodies
    // Ten listings in flight at once, plus the discovery query that rides along with them. That is
    // the shape that makes this one wave instead of two: at the old cap of six only seven could be
    // open (see the barrier test below).
    expect(cold.maxInFlight).toBe(11)

    // ---- request 2: warm, within the 15 s TTL ----------------------------------------------
    resetCounters()
    const warm = await warmAdapter()
    const warmItems = await warm.listAllContent()

    expect(warmItems.map((item) => item.title).sort()).toEqual(['One', 'Two'])
    // The acceptance number: ZERO Drive calls, zero waves.
    expect(callCounts().list).toBe(0)
    expect(callCounts().get).toBe(0)
    expect(listCalls).toHaveLength(0)
    // Same rows, from the cache - and the listing is display metadata only, so this is safe.
    expect(warmItems).toHaveLength(coldItems.length)
  })

  it('issues the ten folder listings and the next discovery as ONE wave', async () => {
    seedVault()
    const adapter = await warmAdapter()

    // Every call except the first discovery level is held open until ELEVEN are open at once: ten
    // listings plus the nested-category query. Nothing else can release it, so a regression to the
    // old cap of six (seven open) or to a sequential walk (one open) fails by name, in a second,
    // instead of hanging the file.
    let opened = 0
    let release: (() => void) | null = null
    const allOpen = new Promise<void>((resolve) => {
      release = resolve
    })
    const isFirstLevel = (q: string): boolean =>
      q.includes(`mimeType='${FOLDER_MIME}'`) && q.includes(`'${VAULT_ID}' in parents`)

    listGate = async (params: Params) => {
      if (isFirstLevel(params.q ?? '')) return

      opened += 1
      if (opened >= 11 && release) release()

      await Promise.race([
        allOpen,
        new Promise<never>((_resolve, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  `the ten listings and the discovery were NOT one wave: only ${opened} calls were ` +
                    'open at once'
                )
              ),
            1000
          )
        }),
      ])
    }

    resetCounters()
    const items = await adapter.listAllContent()

    expect(items).toEqual([])
    expect(opened).toBe(11)
    expect(maxActiveList).toBe(11)
    // The number the design picked, stated where the barrier proves it is reachable.
    expect(DRIVE_LIST_CONCURRENCY).toBe(10)
    // And the ten markdown listings are all in there - not a subset.
    expect(markdownCalls()).toHaveLength(10)
  })

  it('keeps the listing cache per account: one account never sees another vault rows', async () => {
    seedVault()
    const writer = await warmAdapter('user-1')
    await writer.createContent('Notes', contentBody({ title: 'Mine' }))
    // Warm user-1's listing cache.
    expect((await (await warmAdapter('user-1')).listAllContent()).map((item) => item.title)).toEqual([
      'Mine',
    ])

    // A second account listing the same Drive walks it itself: the cache is keyed by account, so a
    // warm entry for user-1 is never served to user-2 (which would also be a data-leak shape).
    resetCounters()
    const other = await warmAdapter('user-2')
    await other.listAllContent()
    expect(markdownCalls()).toHaveLength(10)

    // user-1's cache is still warm and untouched by user-2's listing.
    resetCounters()
    const mine = await warmAdapter('user-1')
    expect((await mine.listAllContent()).map((item) => item.title)).toEqual(['Mine'])
    expect(listCalls).toHaveLength(0)
  })

  it('forgets a listing after the TTL, so a change made outside this process corrects itself', async () => {
    seedVault()
    const writer = await warmAdapter()
    await writer.createContent('Notes', contentBody({ title: 'Cached' }))

    const frozen = Date.now()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(frozen)

    resetCounters()
    const reader = await warmAdapter()
    await reader.listCategoryContent('Notes')
    expect(markdownCalls()).toHaveLength(1)

    // Still inside the window: no call.
    resetCounters()
    nowSpy.mockReturnValue(frozen + CONTENT_LISTING_TTL_MS - 1)
    await (await warmAdapter()).listCategoryContent('Notes')
    expect(markdownCalls()).toHaveLength(0)

    // Past it: Drive is asked again. This is the backstop for a write this process never saw.
    resetCounters()
    nowSpy.mockReturnValue(frozen + CONTENT_LISTING_TTL_MS + 1)
    await (await warmAdapter()).listCategoryContent('Notes')
    expect(markdownCalls()).toHaveLength(1)

    // The TTL is inside the task's 10-20 s window.
    expect(CONTENT_LISTING_TTL_MS).toBeGreaterThanOrEqual(10_000)
    expect(CONTENT_LISTING_TTL_MS).toBeLessThanOrEqual(20_000)
  })
})

// ---------------------------------------------------------------------------------------------
// 2. Every write path invalidates.
// ---------------------------------------------------------------------------------------------
describe('T101 - every write invalidates the listing', () => {
  it('create: a note saved after a cached listing appears on the very next list', async () => {
    seedVault()
    const writer = await warmAdapter()
    await writer.createContent('Notes', contentBody({ title: 'First' }))

    // Warm the cache with a listing that does NOT contain the next note.
    expect((await (await warmAdapter()).listCategoryContent('Notes')).map((i) => i.title)).toEqual([
      'First',
    ])

    resetCounters()
    await writer.createContent('Notes', contentBody({ title: 'Second' }))
    // The write itself is the only call so far.
    expect(markdownCalls()).toHaveLength(0)

    resetCounters()
    const items = await (await warmAdapter()).listCategoryContent('Notes')

    expect(items.map((item) => item.title)).toEqual(['First', 'Second'])
    // It had to ask Drive again: the cached answer predates the save.
    expect(markdownCalls()).toHaveLength(1)
  })

  it('update: an edited note shows its new title on the very next list', async () => {
    seedVault()
    const writer = await warmAdapter()
    const fileId = await writer.createContent('Notes', contentBody({ title: 'Before' }))

    expect((await (await warmAdapter()).listCategoryContent('Notes'))[0].title).toBe('Before')

    resetCounters()
    await writer.updateContent(fileId, 'Notes', { title: 'After', status: 'DONE' })

    resetCounters()
    const [row] = await (await warmAdapter()).listCategoryContent('Notes')

    expect(row.title).toBe('After')
    expect(row.status).toBe('DONE')
    expect(markdownCalls()).toHaveLength(1) // re-asked, not served from the cached row
    expect(mediaReads).toHaveLength(0) // the update carried the properties with the body
  })

  it('delete: the list is re-asked and the deleted note is gone', async () => {
    seedVault()
    const writer = await warmAdapter()
    const fileId = await writer.createContent('Notes', contentBody({ title: 'Doomed' }))

    expect(await (await warmAdapter()).listCategoryContent('Notes')).toHaveLength(1)

    resetCounters()
    await writer.deleteContent(fileId)

    resetCounters()
    const items = await (await warmAdapter()).listCategoryContent('Notes')

    expect(items).toEqual([])
    expect(markdownCalls()).toHaveLength(1) // invalidated, not a cached row set
  })

  it('category create: the new folder is walked on the very next list', async () => {
    seedVault()
    const adapter = await warmAdapter()

    // Warm both the structure and the children discovery.
    expect(await adapter.listAllContent()).toEqual([])
    resetCounters()

    await adapter.createCategory('Philosophy')
    expect(createdFolders.map((folder) => folder.name)).toEqual(['Philosophy'])
    const philosophyFolderId = createdFolders[0].id

    resetCounters()
    const items = await (await warmAdapter()).listAllContent()

    expect(items).toEqual([])
    // The new folder is listed by name, so the walk really saw it...
    expect(markdownCalls().some((call) => call.q.includes(`'${philosophyFolderId}' in parents`))).toBe(
      true
    )
    // ...and the Vault-level discovery was NOT re-run: the created folder was registered in the
    // structure's own discovery cache, so only the level below Vault's children costs a query.
    expect(childFolderCalls()).toHaveLength(1)
    expect(discoveryCalls()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------------------------
// 3. A save inside the TTL is visible - invalidation and the merge together.
// ---------------------------------------------------------------------------------------------
describe('T101 - a note saved inside the TTL still appears', () => {
  it('is on the next list even when Drive has not caught up yet', async () => {
    seedVault()
    const writer = await warmAdapter()
    await writer.createContent('Notes', contentBody({ title: 'Older' }))

    // Warm the listing cache, then save - and hold the new file back from Drive's listing, which is
    // the eventually-consistent case T097's merge exists for.
    const warm = await warmAdapter()
    const before = await warm.listCategoryContent('Notes')
    await writer.createContent('Notes', contentBody({ title: 'Just saved' }))
    const savedId = createdFiles[createdFiles.length - 1].id
    hiddenFromListing = new Set([savedId])

    const incoming = await (await warmAdapter()).listCategoryContent('Notes')
    // The server answer really is missing it - the cache was invalidated, this is Drive lagging.
    expect(incoming.map((item) => item.title)).toEqual(['Older'])

    // What the page does with that answer: the save is in the grace window and still on screen, so
    // merge-by-id keeps it. (The page's wiring is pinned by T097's page test; this is the rule.)
    const savedItem = { id: savedId, title: 'Just saved' }
    const recentSaves = new Map<string, RecentSave<{ id: string; title: string }>>([
      [savedId, { item: savedItem, savedAt: Date.now() }],
    ])
    const previous = [savedItem, ...before.map((item) => ({ id: item.id, title: item.title }))]
    const merged = mergeRecentSaves(incoming, previous, recentSaves, Date.now())

    expect(merged.map((item) => item.id)).toContain(savedId)
    expect(merged.map((item) => item.title)).toEqual(['Just saved', 'Older'])
  })
})

// ---------------------------------------------------------------------------------------------
// 4. A deleted note must not resurrect.
// ---------------------------------------------------------------------------------------------
describe('T101 - a deleted note does not come back', () => {
  it('is filtered out even when Drive still lists it (a stale page cannot resurrect it)', async () => {
    seedVault()
    const writer = await warmAdapter()
    const fileId = await writer.createContent('Notes', contentBody({ title: 'Deleted' }))

    expect(await (await warmAdapter()).listCategoryContent('Notes')).toHaveLength(1)

    // The delete succeeds, but Drive's listing keeps returning the file for a while - exactly the
    // lag that makes a deleted note reappear.
    keepDeletedInListing = true
    await writer.deleteContent(fileId)
    expect(mockDrive.files.delete).toHaveBeenCalledTimes(1)

    resetCounters()
    const items = await (await warmAdapter()).listCategoryContent('Notes')

    expect(items).toEqual([])
    // It really did ask Drive (the cache was invalidated) and Drive really did answer with the file
    // - so the reason it is absent is the tombstone, not the cache.
    expect(markdownCalls()).toHaveLength(1)
    expect(filesByParent['folder-Notes']?.map((entry) => entry.id)).toEqual([fileId])
  })

  it('cannot be resurrected by the merge, because the user is no longer looking at it', async () => {
    seedVault()
    const writer = await warmAdapter()
    const fileId = await writer.createContent('Notes', contentBody({ title: 'Deleted' }))

    // A save moments before the delete is still inside the grace window.
    const recentSaves = new Map<string, RecentSave<{ id: string; title: string }>>([
      [fileId, { item: { id: fileId, title: 'Deleted' }, savedAt: Date.now() }],
    ])

    await writer.deleteContent(fileId)
    const afterDelete = await (await warmAdapter()).listCategoryContent('Notes')
    expect(afterDelete).toEqual([])

    // The page removed the item from the list when the delete succeeded, so the merge's
    // "still on screen" condition is false and the save cannot put it back.
    const merged = mergeRecentSaves([], [], recentSaves, Date.now())
    expect(merged).toEqual([])
  })

  it('does not hide a different, later note: a failed delete records nothing', async () => {
    seedVault()
    const writer = await warmAdapter()
    const fileId = await writer.createContent('Notes', contentBody({ title: 'Still here' }))

    mockDrive.files.delete.mockImplementationOnce(async () => {
      throw new Error('403 insufficientFilePermissions')
    })

    await expect(writer.deleteContent(fileId)).rejects.toThrow(/insufficientFilePermissions/)

    const items = await (await warmAdapter()).listCategoryContent('Notes')
    expect(items.map((item) => item.title)).toEqual(['Still here'])
  })
})

// ---------------------------------------------------------------------------------------------
// 5. Opening a note is unchanged: the body is read from Drive, never from the cached row.
// ---------------------------------------------------------------------------------------------
describe('T101 - a cached row never serves a body', () => {
  it('opens the note with exactly one media read and the real text', async () => {
    seedVault()
    const writer = await warmAdapter()
    const body = 'The real note.\n\nSecond paragraph, with   spacing.'
    const fileId = await writer.createContent(
      'Notes',
      contentBody({ title: 'Openable', content: body })
    )

    resetCounters()
    const reader = await warmAdapter()
    const [row] = await reader.listCategoryContent('Notes')
    // The row is metadata + preview, and the listing made no calls beyond the one folder listing.
    expect(callCounts()).toEqual({ list: 1, get: 0, create: 0, update: 0, delete: 0 })
    expect(row.content).not.toBe(body)

    // A second list inside the TTL, then open: the cached row must not answer the open.
    resetCounters()
    await (await warmAdapter()).listCategoryContent('Notes')
    expect(callCounts().list).toBe(0)

    const opened = await reader.getContent(fileId, 'Notes')
    expect(opened.content).toBe(body)
    expect(mediaReads).toEqual([fileId])
  })

  it('serves the body through the real GET /api/content/[id] while the listing is cached', async () => {
    seedVault()
    const writer = await warmAdapter()
    const body = 'The body the app wrote.'
    const fileId = await writer.createContent(
      'Notes',
      contentBody({ title: 'Opened later', content: body })
    )

    // Warm the listing, so locating the file costs nothing.
    const backend = new GoogleDriveBackendService(oauth2Client, 'user-1')
    await backend.initializeVaultStructure()
    await backend.listCategoryFiles('Notes')

    resetCounters()
    const response = await GET(new NextRequest(`http://localhost/api/content/${fileId}`), {
      params: Promise.resolve({ id: fileId }),
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.content).toBe(body)
    expect(mediaReads).toEqual([fileId])
  })
})
