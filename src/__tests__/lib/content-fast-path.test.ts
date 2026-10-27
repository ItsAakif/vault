// @vitest-environment node
/**
 * T097 - the latency of the content read path, measured in Drive calls.
 *
 * The reported numbers, against the real account: `GET /api/content` 11,617 ms and
 * `GET /api/content?categoryId=...` 6,172 ms for a vault with ONE note. Almost all of it was
 * `initializeVaultStructure()`: eight sequential `files.list` calls (Vault, then one per default
 * category) recomputed on every request, because the adapter is constructed per request.
 *
 * Wall-clock cannot be measured here - this machine has no access to the user's Drive - so the
 * mechanism is pinned the way it can be: by counting the Drive requests. Each `it` below states the
 * count it observed, and the numbers are collected in `.planning/progress/T097.md`.
 *
 * The Drive is a small in-memory model (folders by parent, files by parent, media by file id) with
 * three instruments on it: a per-query log, in-flight counters, and a way to make a listing of a
 * deleted folder answer 404.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { OAuth2Client } from 'google-auth-library'
import {
  GoogleDriveBackendService,
  resetVaultStructureCache,
} from '@/lib/google-drive-backend'
import { GoogleDriveContentAdapter } from '@/lib/google-drive-content-adapter'

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

let folders: FolderEntry[] = []
let filesByParent: Record<string, DriveEntry[]> = {}
let bodies: Record<string, string> = {}
/** Folder ids that Drive now answers 404 for - a folder deleted while the cache was warm. */
let staleParents: Set<string> = new Set()
let listQueries: string[] = []
let createdFolders: Array<{ id: string; name: string; parents: string[] }> = []
let createdFiles: Array<{ id: string; name: string; parents: string[] }> = []
let nextId = 0

/** Runs before every `files.list`, if a test installs one (the concurrency barrier). */
let listGate: ((params: Params) => Promise<void>) | null = null
/** Runs before every `alt=media` read, if a test installs one (the read-cap probe). */
let mediaGate: (() => Promise<void>) | null = null

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
  meta: { title: string; type: string; body?: string; categoryId?: string }
): string {
  return [
    '---',
    `id: ${id}`,
    `title: ${meta.title}`,
    `type: ${meta.type}`,
    'status: DRAFT',
    'createdAt: 2026-01-01T00:00:00.000Z',
    'updatedAt: 2026-01-02T00:00:00.000Z',
    ...(meta.categoryId ? [`categoryId: ${meta.categoryId}`] : []),
    '---',
    '',
    meta.body ?? `Body of ${meta.title}.`,
    '',
  ].join('\n')
}

/** A note that an earlier write already put in `folderId`. */
function addContentFile(
  folderId: string,
  id: string,
  meta: { title: string; type: string; body?: string; categoryId?: string }
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

function notFound(fileId: string): Error {
  return new Error(JSON.stringify({ error: { code: 404, message: `File not found: ${fileId}` } }))
}

function listResult(params: Params): { data: { files: DriveEntry[] } } {
  const q = params.q ?? ''
  listQueries.push(q)

  // Content: listCategoryFiles / listMarkdownFilesIn / listAllContentFiles.
  if (q.includes(`mimeType='${MARKDOWN}'`)) {
    const parents = parentIdsFrom(q)
    // A listing scoped to a folder that no longer exists is a not-found, not an empty page: this is
    // how the stale-cache retry is driven.
    for (const parent of parents) {
      if (staleParents.has(parent)) throw notFound(parent)
    }
    return { data: { files: parents.flatMap((parent) => filesByParent[parent] ?? []) } }
  }

  // Folders: findOrCreateFolder / findCategoryFolderId / listChildFolders.
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

function getResult(params: Params): { data: unknown } {
  const fileId = params.fileId ?? ''

  if (params.alt === 'media') {
    return { data: bodies[fileId] ?? '' }
  }

  // `findFolderNameById` / the folder probes: a folder id resolves to its name.
  const folder = folders.find((candidate) => candidate.id === fileId)
  if (folder) {
    return { data: { id: folder.id, name: folder.name, mimeType: FOLDER_MIME } }
  }

  // A content file's own metadata: the media guard's `fields: 'id, mimeType'` probe (issued when a
  // caller reads without a listing mimeType, e.g. `updateContent`) and `findParentFolderId`.
  const parent = Object.keys(filesByParent).find((key) =>
    filesByParent[key].some((entry) => entry.id === fileId)
  )
  if (parent !== undefined) {
    return {
      data: { id: fileId, name: `${fileId}.md`, mimeType: MARKDOWN, parents: [parent] },
    }
  }
  if (fileId in bodies) {
    return { data: { id: fileId, name: `${fileId}.md`, mimeType: MARKDOWN } }
  }

  throw notFound(fileId)
}

function createResult(params: Params): { data: Record<string, string> } {
  const resource = params.resource ?? {}
  const parents = resource.parents ?? []
  const id = `created-folder-${nextId++}`

  if (resource.mimeType === FOLDER_MIME) {
    createdFolders.push({ id, name: resource.name ?? '', parents })
    folders.push({ id, name: resource.name ?? '', parentId: parents[0] ?? null })
    return { data: { id, name: resource.name ?? '' } }
  }

  const fileId = `created-file-${nextId++}`
  createdFiles.push({ id: fileId, name: resource.name ?? '', parents })
  const entry: DriveEntry = {
    id: fileId,
    name: resource.name ?? '',
    mimeType: resource.mimeType,
    createdTime: '2026-01-01T00:00:00.000Z',
  }
  for (const parent of parents) {
    filesByParent[parent] = [...(filesByParent[parent] ?? []), entry]
  }
  bodies[fileId] = params.media?.body ?? ''
  return { data: { id: fileId, webViewLink: `https://drive.example/${fileId}`, webContentLink: '' } }
}

function updateResult(params: Params): { data: { id: string } } {
  const fileId = params.fileId ?? ''
  const body = params.media?.body
  if (typeof body === 'string') bodies[fileId] = body
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

/** Folder lookups that ask Drive "does a folder with this NAME exist?" - the walk's cost. */
function discoveryQueries(): string[] {
  return listQueries.filter(
    (q) => q.includes(`mimeType='${FOLDER_MIME}'`) && q.includes("name='")
  )
}

function markdownQueries(): string[] {
  return listQueries.filter((q) => q.includes(`mimeType='${MARKDOWN}'`))
}

function childFolderQueries(): string[] {
  return listQueries.filter(
    (q) => q.includes(`mimeType='${FOLDER_MIME}'`) && !q.includes("name='")
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
  listQueries = []
  mockDrive.files.list.mockClear()
  mockDrive.files.get.mockClear()
  mockDrive.files.create.mockClear()
  mockDrive.files.update.mockClear()
  mockDrive.files.delete.mockClear()
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  folders = []
  filesByParent = {}
  bodies = {}
  staleParents = new Set()
  listQueries = []
  createdFolders = []
  createdFiles = []
  nextId = 0
  listGate = null
  mediaGate = null

  mockDrive.files.list.mockReset()
  mockDrive.files.get.mockReset()
  mockDrive.files.create.mockReset()
  mockDrive.files.update.mockReset()
  mockDrive.files.delete.mockReset()

  // T097: the vault structure is cached at MODULE level - that is what makes it survive a request -
  // so every test starts cold and says so.
  resetVaultStructureCache()

  mockDrive.files.list.mockImplementation(async (params: Params) => {
    if (listGate) await listGate(params)
    return listResult(params)
  })
  mockDrive.files.get.mockImplementation(async (params: Params) => {
    if (params.alt === 'media' && mediaGate) await mediaGate()
    return getResult(params)
  })
  mockDrive.files.create.mockImplementation((params: Params) =>
    Promise.resolve(createResult(params))
  )
  mockDrive.files.update.mockImplementation((params: Params) =>
    Promise.resolve(updateResult(params))
  )
  mockDrive.files.delete.mockImplementation(() => Promise.resolve({ data: '' }))

  // Every path under test logs on purpose; keep the run readable.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
})

// -------------------------------------------------------------------------------------------
// 1-2. The call counts: cold vs warm, before vs after.
// -------------------------------------------------------------------------------------------
describe('T097 part 1 - the folder walk is paid once, not on every request', () => {
  it('cold pays eight folder-discovery calls; the next request within the TTL pays none', async () => {
    seedVault()
    addContentFile('folder-Notes', 'note-1', { title: 'A note', type: 'NOTE' })

    // ---- request 1: cold -------------------------------------------------------------------
    const coldAdapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await coldAdapter.initialize()
    const coldItems = await coldAdapter.searchContent('*')

    const cold = {
      discovery: discoveryQueries().length,
      markdown: markdownQueries().length,
      childFolders: childFolderQueries().length,
      calls: callCounts(),
    }

    expect(coldItems.map((item) => item.title)).toEqual(['A note'])
    // Vault + the seven default categories. Sequential before T097, concurrent now - but still
    // eight calls, because a cold process really does have to ask.
    expect(cold.discovery).toBe(8)
    // 1 (Vault's children) + 7 (one markdown listing per default category) + 1 (the nested-category
    // discovery this listing has done since T094).
    expect(cold.childFolders).toBe(2)
    expect(cold.markdown).toBe(7)

    // ---- request 2: warm, and a NEW adapter - exactly what the route builds per request ------
    resetCounters()
    const warmAdapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await warmAdapter.initialize()
    expect(discoveryQueries()).toHaveLength(0)

    const warmItems = await warmAdapter.searchContent('*')
    const warm = {
      discovery: discoveryQueries().length,
      markdown: markdownQueries().length,
      childFolders: childFolderQueries().length,
      calls: callCounts(),
    }

    // Same answer, none of the setup.
    expect(warmItems.map((item) => item.title)).toEqual(['A note'])
    expect(warm.discovery).toBe(0)
    // T101: the two discovery levels and the seven folder listings are cached for 15 s, so a warm
    // list walks no Drive endpoint at all. What is left is the one body read for this legacy file
    // (the fixture carries no `appProperties`, so it takes T098's fallback).
    expect(warm.childFolders).toBe(0)
    expect(warm.markdown).toBe(0)

    // Before T097/T101 every request looked like `cold`: 8 discovery calls + 2 discovery queries +
    // 7 listings + 1 body read. Warm is now that total minus all of the listing work.
    expect(warm.calls.total).toBe(1)
    expect(cold.calls.total - warm.calls.total).toBe(
      cold.discovery + cold.childFolders + cold.markdown
    )
  })

  it('a warm scoped listing is one list and one read - two Drive calls for one note', async () => {
    seedVault()
    addContentFile('folder-Notes', 'note-1', { title: 'A note', type: 'NOTE' })

    const coldAdapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await coldAdapter.initialize()
    await coldAdapter.listCategoryContent('Notes')
    const cold = callCounts()

    resetCounters()
    const warmAdapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await warmAdapter.initialize()
    const items = await warmAdapter.listCategoryContent('Notes')
    const warm = callCounts()

    expect(items.map((item) => item.title)).toEqual(['A note'])
    // `initialize()` asked Drive nothing: the structure came from the cache.
    // T101: so did the folder listing - a warm scoped list makes no `files.list` call at all. The
    // one remaining call is the body read for this legacy fixture (no `appProperties`).
    expect(warm.list).toBe(0)
    expect(warm.get).toBe(1)
    expect(warm.total).toBe(1)
    expect(warm.total).toBeLessThan(cold.total)
    expect(discoveryQueries()).toHaveLength(0)
  })
})

// -------------------------------------------------------------------------------------------
// 3. The seven category lookups are concurrent.
// -------------------------------------------------------------------------------------------
describe('T097 part 1 - the cold path parallelises the category lookups', () => {
  it('has all seven category lookups in flight at the same time', async () => {
    seedVault()

    const isCategoryLookup = (params: Params): boolean => {
      const q = params.q ?? ''
      return (
        q.includes(`mimeType='${FOLDER_MIME}'`) &&
        q.includes("name='") &&
        q.includes(`'${VAULT_ID}' in parents`)
      )
    }

    let started = 0
    let active = 0
    let maxActive = 0
    let release: (() => void) | null = null
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })

    listGate = async (params: Params) => {
      if (!isCategoryLookup(params)) return

      started += 1
      active += 1
      maxActive = Math.max(maxActive, active)
      if (started >= DEFAULT_CATEGORIES.length && release) release()

      // If the lookups were sequential this would never resolve; fail in a second instead of
      // hanging the file, with a message that names the regression.
      await Promise.race([
        barrier,
        new Promise<never>((_resolve, reject) => {
          setTimeout(
            () => reject(new Error('the seven category lookups were NOT concurrent')),
            1000
          )
        }),
      ])
      active -= 1
    }

    const adapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')

    // Resolves only because all seven lookups are open at once.
    await adapter.initialize()

    expect(started).toBe(7)
    expect(maxActive).toBe(7)
  })
})

// -------------------------------------------------------------------------------------------
// 4. Content is never cached.
// -------------------------------------------------------------------------------------------
describe('T097 part 1 - only the structure is cached', () => {
  it('returns the body Drive has now, not the one the first request read', async () => {
    seedVault()
    addContentFile('folder-Notes', 'note-1', { title: 'A note', type: 'NOTE', body: 'First body.' })

    const first = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await first.initialize()
    expect((await first.listCategoryContent('Notes'))[0].content).toBe('First body.')

    // Someone edits the file in Drive between the two requests.
    bodies['note-1'] = markdownBody('note-1', {
      title: 'A note',
      type: 'NOTE',
      body: 'Second body.',
    })

    const second = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await second.initialize()
    expect((await second.listCategoryContent('Notes'))[0].content).toBe('Second body.')
  })
})

// -------------------------------------------------------------------------------------------
// 5. A created category is immediately visible.
// -------------------------------------------------------------------------------------------
describe('T097 part 1 - a new category is visible to the next request', () => {
  it('invalidates and re-seeds the cached structure, so the folder is not invisible for the TTL', async () => {
    seedVault()

    // Warm the cache first: this is the state that made a new folder invisible for five minutes.
    const first = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await first.initialize()

    await first.createCategory('Philosophy')
    expect(createdFolders.map((folder) => folder.name)).toEqual(['Philosophy'])
    const philosophyFolderId = createdFolders[0].id

    // A new request - a new adapter - must not walk the tree to find it.
    resetCounters()
    const writer = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await writer.initialize()
    expect(discoveryQueries()).toHaveLength(0)

    await writer.createContent('Philosophy', contentBody({ title: 'On virtue' }))

    // The write landed in the folder that was just created...
    expect(createdFiles.map((file) => file.parents)).toEqual([[philosophyFolderId]])

    // ...and the next request can list it back, still without a walk.
    const reader = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await reader.initialize()
    const listed = await reader.listCategoryContent('Philosophy')

    expect(listed.map((item) => item.title)).toEqual(['On virtue'])
    expect(markdownQueries().some((q) => q.includes(`'${philosophyFolderId}' in parents`))).toBe(true)
  })
})

// -------------------------------------------------------------------------------------------
// 6. A stale cached folder id does not become a 500.
// -------------------------------------------------------------------------------------------
describe('T097 part 1 - a stale cached folder id', () => {
  it('invalidates the cache and retries once, instead of surfacing the error', async () => {
    seedVault()
    addContentFile('folder-Notes', 'note-1', { title: 'Before the move', type: 'NOTE' })

    // Warm the structure, so the next request holds `folder-Notes` in its map.
    const warm = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await warm.initialize()

    // The folder is deleted and recreated with a new id (the Drive UI, or a sync client), and the
    // note moved with it. Drive now answers 404 for the id the cache still holds.
    folders = folders.filter((folder) => folder.id !== 'folder-Notes')
    addFolder('folder-Notes-2', 'Notes', VAULT_ID)
    filesByParent['folder-Notes-2'] = filesByParent['folder-Notes'] ?? []
    delete filesByParent['folder-Notes']
    staleParents = new Set(['folder-Notes'])

    resetCounters()
    const next = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await next.initialize()
    expect(discoveryQueries()).toHaveLength(0) // still the warm cache - the stale id

    // Must resolve: before this, the 404 reached the route as a 500.
    const items = await next.listCategoryContent('Notes')

    expect(items.map((item) => item.title)).toEqual(['Before the move'])
    // Rebuilt and retried exactly once: Vault + the seven categories, no more.
    expect(discoveryQueries()).toHaveLength(8)
    expect(markdownQueries().some((q) => q.includes("'folder-Notes-2' in parents"))).toBe(true)
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('rebuilding the Vault structure and retrying once')
    )

    // The retry is capped at one: the cache now holds the good id, so the next request is free.
    resetCounters()
    const after = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await after.initialize()
    expect(discoveryQueries()).toHaveLength(0)
  })

  it('still fails when Drive is broken twice: the retry does not become a loop', async () => {
    seedVault()
    addContentFile('folder-Notes', 'note-1', { title: 'A note', type: 'NOTE' })
    const warm = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await warm.initialize()

    // Every Notes folder is gone, and the rebuilt walk creates a fresh one whose listing also 404s.
    folders = folders.filter((folder) => folder.id !== 'folder-Notes')
    delete filesByParent['folder-Notes']
    staleParents = new Set(['folder-Notes'])
    mockDrive.files.create.mockImplementation((params: Params) => {
      const resource = params.resource ?? {}
      if (resource.mimeType === FOLDER_MIME) {
        // Rebuilt folder reports itself as not-found too.
        const id = `created-folder-${nextId++}`
        staleParents.add(id)
        folders.push({ id, name: resource.name ?? '', parentId: (resource.parents ?? [])[0] ?? null })
        return Promise.resolve({ data: { id, name: resource.name ?? '' } })
      }
      return Promise.resolve(createResult(params))
    })

    const next = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await next.initialize()

    await expect(next.listCategoryContent('Notes')).rejects.toThrow(/not found/i)
    // Not 8 + 8 + 8...: one rebuild.
    expect(discoveryQueries().length).toBeLessThanOrEqual(16)
  })
})

// -------------------------------------------------------------------------------------------
// 7. Per-file reads are parallel and capped.
// -------------------------------------------------------------------------------------------
describe('T097 part 1 - the per-file reads are parallel and capped', () => {
  it('reads eight files with at most six in flight, in listing order', async () => {
    seedVault()
    const ids = Array.from({ length: 8 }, (_value, index) => `note-${index}`)
    for (const [index, id] of ids.entries()) {
      addContentFile('folder-Notes', id, { title: `Note ${index}`, type: 'NOTE' })
    }

    let active = 0
    let maxActive = 0
    mediaGate = async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
    }

    const adapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await adapter.initialize()
    const items = await adapter.listCategoryContent('Notes')

    expect(items).toHaveLength(8)
    // Order is the listing's order, not the completion order.
    expect(items.map((item) => item.id)).toEqual(ids)
    // Six at once (the cap), not eight (one request per file) and not one (serial).
    expect(maxActive).toBe(6)
  })
})

// -------------------------------------------------------------------------------------------
// 8-9. The category NAME in the frontmatter.
// -------------------------------------------------------------------------------------------
describe('T097 part 2 - the file says which category it lives in', () => {
  it('writes the resolved category name on create, next to the (empty) category id', async () => {
    seedVault()

    const adapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await adapter.initialize()

    // What the page posts when no category is picked: no categoryId at all.
    const fileId = await adapter.createContent('Poetry', contentBody({ title: 'A poem' }))

    const written = bodies[fileId]
    expect(written).toContain('categoryName: Poetry')
    expect(written).not.toContain('categoryId:')
    // The existing fields are untouched.
    expect(written).toContain('title: A poem')
    expect(written).toContain('type: NOTE')
    expect(written).toContain('status: DRAFT')
    // And the note really is in the Poetry folder.
    expect(createdFiles.map((file) => file.parents)).toEqual([['folder-Poetry']])
  })

  it('keeps the name on update, without dropping the fields already in the file', async () => {
    seedVault()
    addContentFile('folder-Poetry', 'poem-1', { title: 'First line', type: 'POETRY' })

    const adapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await adapter.initialize()
    await adapter.updateContent('poem-1', 'Poetry', { title: 'Revised line' })

    const written = bodies['poem-1']
    expect(written).toContain('categoryName: Poetry')
    expect(written).toContain('title: Revised line')
    expect(written).toContain('type: POETRY')
    expect(written).toContain('createdAt: 2026-01-01T00:00:00.000Z')
  })

  it('still parses a file written before the field existed', async () => {
    seedVault()
    // No `categoryName:` line anywhere: the file predates T097.
    addContentFile('folder-Notes', 'old-note', { title: 'An old note', type: 'NOTE' })

    const backend = new GoogleDriveBackendService(oauth2Client, 'user-1')
    await backend.initializeVaultStructure()
    const { metadata } = await backend.readMarkdownContent('old-note')

    expect(metadata.title).toBe('An old note')
    expect(metadata.categoryName).toBeUndefined()

    const adapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await adapter.initialize()
    const listed = await adapter.listCategoryContent('Notes')
    expect(listed.map((item) => item.title)).toEqual(['An old note'])
  })

  it('keeps a name such as "2024" a string when reading it back', async () => {
    seedVault()
    addFolder('folder-2024', '2024', VAULT_ID)

    const adapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await adapter.initialize()
    const fileId = await adapter.createContent('2024', contentBody({ title: 'A year' }))

    // The frontmatter parser coerces numeric-looking values; a category name must survive it.
    const backend = new GoogleDriveBackendService(oauth2Client, 'user-1')
    await backend.initializeVaultStructure()
    const { metadata } = await backend.readMarkdownContent(fileId)

    expect(bodies[fileId]).toContain('categoryName: 2024')
    expect(metadata.categoryName).toBe('2024')
  })
})
