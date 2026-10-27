// @vitest-environment node
/**
 * T094 - the note that vanished, and the default view that showed nothing.
 *
 * Part 1: the page posts `selectedCategory?.id`, an opaque Drive folder id such as
 * `1GNp50lnbq11hlDeB7suqJiEwHrgi3Sp4`. The backend looked that string up in a map keyed by
 * lowercase category NAME, missed, and called `createCategoryFolder(id)` - which created a folder
 * named after the id and wrote the note inside it, where no listing could ever find it.
 *
 * Part 2: `GET /api/content` without a `categoryId` (the dashboard's default view) asked Drive for
 * `name contains '*'`, a literal substring match that no file name satisfies, while every note
 * lives one level down inside a category folder.
 *
 * The Drive below is a small in-memory model of the real one - folders by parent, files by parent,
 * media by file id - so a save, the folder it lands in, and the next listing are all observable.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { OAuth2Client } from 'google-auth-library'
import { GoogleDriveBackendService, resetVaultStructureCache } from '@/lib/google-drive-backend'
import { GoogleDriveContentAdapter } from '@/lib/google-drive-content-adapter'

const MARKDOWN = 'text/markdown'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const VAULT_ID = 'vault-1'

/** A real Drive folder id: 28 chars, mixed case, digits - the shape the page posts. */
const IDEAS_ID = '1GNp50lnbq11hlDeB7suqJiEwHrgi3Sp4'
/** A stale selection: same shape, no folder behind it. */
const STALE_ID = '9ZzYyXxWwVvUuTtSsRrQqPpOoNnMm7'

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
let mediaErrors: Record<string, Error> = {}
let listQueries: string[] = []
let createdFolders: Array<{ name: string; parents: string[] }> = []
let createdFiles: Array<{ name: string; parents: string[]; mimeType: string }> = []
let nextId = 0

function addFolder(id: string, name: string, parentId: string | null): void {
  folders.push({ id, name, parentId })
}

/** The vault as `initializeVaultStructure` expects to find it: Vault + its default categories. */
function seedVault(): void {
  addFolder(VAULT_ID, 'Vault', null)
  for (const name of ['Notes', 'Resources', 'Poetry', 'Jobs', 'Projects', 'Daily', 'Archive']) {
    addFolder(`folder-${name}`, name, VAULT_ID)
  }
}

/** A note that an earlier write already put in `folderId`. */
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

function listResult(params: Params): { data: { files: DriveEntry[] } } {
  const q = params.q ?? ''
  listQueries.push(q)

  // Content: listCategoryFiles / listMarkdownFilesIn / listAllContentFiles.
  if (q.includes(`mimeType='${MARKDOWN}'`)) {
    const files = parentIdsFrom(q).flatMap((parent) => filesByParent[parent] ?? [])
    return { data: { files } }
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

  // T094: `findFolderNameById` - a folder id resolves to its name, anything else is a 404.
  const folder = folders.find((candidate) => candidate.id === fileId)
  if (!folder) {
    throw new Error(JSON.stringify({ error: { code: 404, message: 'File not found' } }))
  }
  return { data: { id: folder.id, name: folder.name, mimeType: FOLDER_MIME } }
}

function createResult(params: Params): { data: Record<string, string> } {
  const resource = params.resource ?? {}
  const parents = resource.parents ?? []

  if (resource.mimeType === FOLDER_MIME) {
    const id = `created-folder-${nextId++}`
    createdFolders.push({ name: resource.name ?? '', parents })
    folders.push({ id, name: resource.name ?? '', parentId: parents[0] ?? null })
    return { data: { id, name: resource.name ?? '' } }
  }

  const id = `created-file-${nextId++}`
  createdFiles.push({
    name: resource.name ?? '',
    parents,
    mimeType: resource.mimeType ?? '',
  })
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
  return { data: { id, webViewLink: `https://drive.example/${id}`, webContentLink: '' } }
}

function contentBody(overrides: Record<string, unknown> = {}) {
  return {
    title: 'An idea',
    content: 'The idea itself.',
    type: 'IDEA',
    status: 'DRAFT',
    priority: 'MEDIUM',
    tags: [],
    ...overrides,
  }
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  folders = []
  filesByParent = {}
  bodies = {}
  mediaErrors = {}
  listQueries = []
  createdFolders = []
  createdFiles = []
  nextId = 0

  // T097: the vault structure is cached at MODULE level (that is what makes it survive a request),
  // so each test starts by dropping it - otherwise a structure built against the previous test's
  // Drive would answer this one.
  resetVaultStructureCache()

  mockDrive.files.list.mockReset()
  mockDrive.files.get.mockReset()
  mockDrive.files.create.mockReset()
  mockDrive.files.update.mockReset()
  mockDrive.files.delete.mockReset()

  mockDrive.files.list.mockImplementation((params: Params) =>
    Promise.resolve(listResult(params))
  )
  mockDrive.files.get.mockImplementation((params: Params) => {
    const failure = params.alt === 'media' ? mediaErrors[params.fileId ?? ''] : undefined
    if (failure) return Promise.reject(failure)
    try {
      return Promise.resolve(getResult(params))
    } catch (error) {
      return Promise.reject(error)
    }
  })
  mockDrive.files.create.mockImplementation((params: Params) =>
    Promise.resolve(createResult(params))
  )
  mockDrive.files.update.mockImplementation(() => Promise.resolve({ data: { id: 'updated-file' } }))
  mockDrive.files.delete.mockImplementation(() => Promise.resolve({ data: '' }))

  // Every path under test logs the skipped item / the fallback on purpose; keep the run readable.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
})

// -------------------------------------------------------------------------------------------
// Part 1 - an id is resolved to the category's name, never used as a folder name.
// -------------------------------------------------------------------------------------------
describe('T094 part 1 - saving resolves the category id to the category that exists', () => {
  it('writes into the folder the id names, and the note is in the next listing for that id', async () => {
    seedVault()
    addFolder(IDEAS_ID, 'Ideas', VAULT_ID)

    const adapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await adapter.initialize()

    const fileId = await adapter.createContent(
      IDEAS_ID,
      contentBody({ categoryId: IDEAS_ID })
    )

    // The note went into the EXISTING `Vault/Ideas` folder...
    expect(createdFiles).toHaveLength(1)
    expect(createdFiles[0].parents).toEqual([IDEAS_ID])
    // ...and no folder was created at all - above all not one named after the id.
    expect(createdFolders).toEqual([])
    expect(createdFolders.map((folder) => folder.name)).not.toContain(IDEAS_ID)

    // The round trip: a FRESH adapter (i.e. the next request) still finds the note by the same id.
    const reader = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await reader.initialize()
    const listed = await reader.listCategoryContent(IDEAS_ID)

    expect(listed.map((item) => item.id)).toEqual([fileId])
    expect(listed[0].title).toBe('An idea')
    expect(listed[0].type).toBe('IDEA')
    expect(listed[0].categoryId).toBe(IDEAS_ID)
  })

  it('still accepts a category NAME, including lowercase, and creates nothing', async () => {
    seedVault()
    addFolder(IDEAS_ID, 'Ideas', VAULT_ID)

    const adapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await adapter.initialize()

    await adapter.createContent('Ideas', contentBody({ title: 'By name' }))
    await adapter.createContent('notes', contentBody({ title: 'By lowercase name' }))

    expect(createdFolders).toEqual([])
    expect(createdFiles.map((file) => file.parents)).toEqual([[IDEAS_ID], ['folder-Notes']])
  })

  it('falls back to the default folder for an unknown id, and creates no id-named folder', async () => {
    seedVault()

    const adapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await adapter.initialize()

    await adapter.createContent(STALE_ID, contentBody({ title: 'Stale selection' }))

    expect(createdFolders).toEqual([])
    expect(createdFolders.map((folder) => folder.name)).not.toContain(STALE_ID)
    expect(createdFiles).toHaveLength(1)
    expect(createdFiles[0].parents).toEqual(['folder-Notes'])
    // The fallback is reported, not silent.
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('Unknown category id'))
  })

  it('the backend refuses to create a folder whose name is an id, even if a caller tries', async () => {
    seedVault()

    const backend = new GoogleDriveBackendService(oauth2Client, 'user-1')
    await backend.initializeVaultStructure()

    await expect(backend.createCategoryFolder(STALE_ID)).rejects.toThrow(
      /Refusing to create a category folder named like a Drive id/
    )
    expect(createdFolders).toEqual([])
  })

  it('a custom category that is only known by its folder id is still writable', async () => {
    seedVault()
    // `Ideas` is not one of the seven default categories, so the adapter's map does not know it.
    addFolder(IDEAS_ID, 'Ideas', VAULT_ID)

    const adapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await adapter.initialize()

    expect(await adapter.resolveCategory(IDEAS_ID)).toBe('Ideas')
    expect(await adapter.resolveCategory('Ideas')).toBe('Ideas')
    // An unknown name is a name, not an id: it is left to the backend to find or create.
    expect(await adapter.resolveCategory('Philosophy')).toBe('Philosophy')
    expect(await adapter.resolveCategory(null)).toBe('Notes')
  })
})

// -------------------------------------------------------------------------------------------
// Part 2 - the unfiltered listing enumerates every category folder.
// -------------------------------------------------------------------------------------------
describe('T094 part 2 - "all content" sees notes from more than one category folder', () => {
  it('returns a note from Vault/Notes and a note from Vault/Ideas', async () => {
    seedVault()
    addFolder(IDEAS_ID, 'Ideas', VAULT_ID)
    addContentFile('folder-Notes', 'note-1', { title: 'A note', type: 'NOTE' })
    addContentFile(IDEAS_ID, 'idea-1', { title: 'A lost idea', type: 'IDEA', categoryId: IDEAS_ID })

    const adapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await adapter.initialize()
    listQueries = []

    const items = await adapter.searchContent('*')

    expect(items.map((item) => item.title).sort()).toEqual(['A lost idea', 'A note'])

    // The old path: `name contains '*'` in the Vault root - a match no file name can satisfy.
    expect(listQueries.some((q) => q.includes('name contains'))).toBe(false)

    const markdownQueries = listQueries.filter((q) => q.includes(`mimeType='${MARKDOWN}'`))
    const folderQueries = listQueries.filter((q) => q.includes(`mimeType='${FOLDER_MIME}'`))

    // One markdown listing per category folder under Vault (7 defaults + Ideas) - and no more.
    expect(markdownQueries).toHaveLength(8)
    expect(markdownQueries.every((q) => q.includes(`mimeType='${MARKDOWN}'`))).toBe(true)
    expect(markdownQueries.some((q) => q.includes(`'${IDEAS_ID}' in parents`))).toBe(true)
    expect(markdownQueries.some((q) => q.includes("'folder-Notes' in parents"))).toBe(true)

    // 1 query for Vault's child folders + 1 nested-category discovery query for the level below.
    expect(folderQueries).toHaveLength(2)
  })

  it('skips a single unreadable file instead of failing the whole list', async () => {
    seedVault()
    addFolder(IDEAS_ID, 'Ideas', VAULT_ID)
    addContentFile('folder-Notes', 'note-bad', { title: 'Broken', type: 'NOTE' })
    addContentFile('folder-Notes', 'note-ok', { title: 'Fine', type: 'NOTE' })
    addContentFile(IDEAS_ID, 'idea-ok', { title: 'Also fine', type: 'IDEA' })
    mediaErrors = { 'note-bad': new Error('403 fileNotDownloadable') }

    const adapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await adapter.initialize()

    const items = await adapter.searchContent('*')

    expect(items.map((item) => item.title).sort()).toEqual(['Also fine', 'Fine'])
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Skipping unreadable content file note-bad'),
      expect.anything()
    )
  })

  it('keeps notes the pre-fix bug wrote into a folder named after an id visible', async () => {
    seedVault()
    // The junk folder the bug created, with the user's note inside it.
    addFolder(STALE_ID, STALE_ID, VAULT_ID)
    addContentFile(STALE_ID, 'orphan-1', { title: 'The vanished note', type: 'IDEA' })

    const adapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await adapter.initialize()

    const items = await adapter.searchContent('*')

    // Still the user's note. Deleting the junk folder is their call, not this code's.
    expect(items.map((item) => item.title)).toEqual(['The vanished note'])
  })
})

// -------------------------------------------------------------------------------------------
// The route: the type filter still applies over the unfiltered list, and the body stays an array.
// -------------------------------------------------------------------------------------------
describe('T094 - GET /api/content', () => {
  it('filters the unfiltered list by ?type=IDEA and keeps returning an array', async () => {
    seedVault()
    addFolder(IDEAS_ID, 'Ideas', VAULT_ID)
    addContentFile('folder-Notes', 'note-1', { title: 'A note', type: 'NOTE' })
    addContentFile(IDEAS_ID, 'idea-1', { title: 'A lost idea', type: 'IDEA', categoryId: IDEAS_ID })

    vi.doMock('next-auth', () => ({
      getServerSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
    }))
    vi.doMock('@/lib/auth', () => ({ authOptions: {} }))
    vi.doMock('@/lib/db', () => ({ db: {}, ContentType: {}, ContentStatus: {}, Priority: {} }))
    vi.doMock('@/lib/cloud-storage/drive-availability', () => ({
      requireDriveAccess: vi.fn().mockResolvedValue({
        ok: true,
        userId: 'user-1',
        client: oauth2Client,
      }),
      driveErrorResponse: vi.fn(),
    }))

    const route = await import('@/app/api/content/route')

    const all = await route.GET(new NextRequest('http://localhost/api/content'))
    const allItems = await all.json()
    expect(all.status).toBe(200)
    expect(Array.isArray(allItems)).toBe(true)
    expect(allItems.map((item: { type: string }) => item.type).sort()).toEqual(['IDEA', 'NOTE'])

    const ideas = await route.GET(new NextRequest('http://localhost/api/content?type=IDEA'))
    const ideaItems = await ideas.json()
    expect(ideas.status).toBe(200)
    expect(Array.isArray(ideaItems)).toBe(true)
    expect(ideaItems.map((item: { id: string }) => item.id)).toEqual(['idea-1'])
  })
})
