// @vitest-environment node
/**
 * T103 - a note with no category lands in the folder for its type.
 *
 * The user's vault has folders named exactly like content types (`Ideas`, `Notes`, `Poetry`, ...).
 * They created an IDEA without picking a category and it appeared in `Vault/Notes`, while
 * `Vault/Ideas` stayed empty: the folder was chosen by CATEGORY, no category was chosen, and every
 * write fell back to `DEFAULT_CATEGORY_NAME`. The type never influenced the folder.
 *
 * The resolution order this file pins down:
 *
 *   1. an explicit category id,
 *   2. an explicit category name,
 *   3. the vault folder matching the content type (case-insensitively),
 *   4. the default category.
 *
 * Step 3 may only use a folder that already exists - saving a note must not create one - which is
 * why every test here asserts `createdFolders` stays empty.
 *
 * The Drive below is a small in-memory model of the real one: folders by parent, files by parent,
 * media by file id, so the folder a save lands in and the metadata it writes are both observable.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { OAuth2Client } from 'google-auth-library'
import {
  readCategoryNameProperty,
  resetVaultStructureCache,
} from '@/lib/google-drive-backend'
import { GoogleDriveContentAdapter } from '@/lib/google-drive-content-adapter'

const MARKDOWN = 'text/markdown'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const VAULT_ID = 'vault-1'

/** A real Drive folder id: 28 chars, mixed case, digits - the shape the page posts. */
const IDEAS_ID = '1GNp50lnbq11hlDeB7suqJiEwHrgi3Sp4'

type Params = {
  fileId?: string
  alt?: string
  fields?: string
  q?: string
  pageSize?: number
  addParents?: string
  removeParents?: string
  resource?: {
    name?: string
    mimeType?: string
    parents?: string[]
    appProperties?: Record<string, string>
  }
  media?: { mimeType?: string; body?: string }
  requestBody?: {
    name?: string
    appProperties?: Record<string, string>
    parents?: string[]
  }
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
let createdFolders: Array<{ name: string; parents: string[] }> = []
let createdFiles: Array<{
  name: string
  parents: string[]
  mimeType: string
  appProperties?: Record<string, string>
  body?: string
}> = []
let updateCalls: Params[] = []
let nextId = 0

function addFolder(id: string, name: string, parentId: string | null): void {
  folders.push({ id, name, parentId })
}

/**
 * The user's vault: the seven default categories `initializeVaultStructure` creates, PLUS the
 * folders they named after content types that are not defaults (`Ideas`, `Calendar`, `Tags`).
 */
function seedVault(): void {
  addFolder(VAULT_ID, 'Vault', null)
  for (const name of [
    'Notes',
    'Resources',
    'Poetry',
    'Jobs',
    'Projects',
    'Daily',
    'Archive',
    'Calendar',
    'Tags',
  ]) {
    addFolder(`folder-${name}`, name, VAULT_ID)
  }
  // A real Drive id, not a synthetic `folder-...` one - this is the folder the page would post.
  addFolder(IDEAS_ID, 'Ideas', VAULT_ID)
}

/** A note that an earlier write already put in `folderId`. */
function addContentFile(
  folderId: string,
  id: string,
  meta: { title: string; type: string; categoryName?: string }
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
    'status: DRAFT',
    'createdAt: 2026-01-01T00:00:00.000Z',
    'updatedAt: 2026-01-02T00:00:00.000Z',
    ...(meta.categoryName ? [`categoryName: ${meta.categoryName}`] : []),
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

  // `findFolderNameById` - a folder id resolves to its name, anything else is a 404.
  const folder = folders.find((candidate) => candidate.id === fileId)
  if (folder) {
    return { data: { id: folder.id, name: folder.name, mimeType: FOLDER_MIME } }
  }

  // A content file: the metadata get `readDriveMediaText` makes to learn the mime type, and the
  // `parents`/`appProperties` a by-id read uses.
  for (const [parentId, entries] of Object.entries(filesByParent)) {
    const file = entries.find((candidate) => candidate.id === fileId)
    if (file) {
      return {
        data: {
          id: file.id,
          name: file.name,
          mimeType: file.mimeType ?? MARKDOWN,
          parents: [parentId],
          trashed: false,
        },
      }
    }
  }

  throw new Error(JSON.stringify({ error: { code: 404, message: 'File not found' } }))
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
    appProperties: resource.appProperties,
    body: params.media?.body,
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

function updateResult(params: Params): { data: Record<string, string> } {
  updateCalls.push(params)
  const fileId = params.fileId ?? ''
  if (params.media?.body !== undefined) bodies[fileId] = params.media.body
  return { data: { id: fileId } }
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

async function warmAdapter(): Promise<GoogleDriveContentAdapter> {
  const adapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
  await adapter.initialize()
  return adapter
}

let consoleError: ReturnType<typeof vi.spyOn>
let consoleInfo: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  folders = []
  filesByParent = {}
  bodies = {}
  createdFolders = []
  createdFiles = []
  updateCalls = []
  nextId = 0

  // The vault structure is cached at MODULE level, so each test starts cold.
  resetVaultStructureCache()

  mockDrive.files.list.mockReset()
  mockDrive.files.get.mockReset()
  mockDrive.files.create.mockReset()
  mockDrive.files.update.mockReset()
  mockDrive.files.delete.mockReset()

  mockDrive.files.list.mockImplementation((params: Params) => Promise.resolve(listResult(params)))
  mockDrive.files.get.mockImplementation((params: Params) => {
    try {
      return Promise.resolve(getResult(params))
    } catch (error) {
      return Promise.reject(error)
    }
  })
  mockDrive.files.create.mockImplementation((params: Params) => Promise.resolve(createResult(params)))
  mockDrive.files.update.mockImplementation((params: Params) => Promise.resolve(updateResult(params)))
  mockDrive.files.delete.mockImplementation(() => Promise.resolve({ data: '' }))

  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
  consoleInfo.mockRestore()
})

// -------------------------------------------------------------------------------------------
// Requirement 1 - one test per type: the folder that already exists and matches it.
// -------------------------------------------------------------------------------------------
describe('T103 - no category chosen: the note goes to its type folder', () => {
  const TYPE_FOLDERS: Array<[string, string, string]> = [
    ['IDEA', 'Ideas', IDEAS_ID],
    ['NOTE', 'Notes', 'folder-Notes'],
    ['POETRY', 'Poetry', 'folder-Poetry'],
    ['RESOURCE', 'Resources', 'folder-Resources'],
    ['PROJECT', 'Projects', 'folder-Projects'],
    ['JOB', 'Jobs', 'folder-Jobs'],
    ['DAILY', 'Daily', 'folder-Daily'],
    ['ARCHIVE', 'Archive', 'folder-Archive'],
  ]

  it.each(TYPE_FOLDERS)(
    '%s -> the existing Vault/%s folder',
    async (type, folderName, folderId) => {
      seedVault()
      const adapter = await warmAdapter()

      expect(await adapter.resolveCategory(null, type)).toBe(folderName)

      await adapter.createContent('', contentBody({ type }))

      expect(createdFiles).toHaveLength(1)
      expect(createdFiles[0].parents).toEqual([folderId])
      // Requirement 2: the folder was used, not made.
      expect(createdFolders).toEqual([])
    }
  )

  it('accepts a lowercase or padded type the same way', async () => {
    seedVault()
    const adapter = await warmAdapter()

    expect(await adapter.resolveCategory(undefined, ' idea ')).toBe('Ideas')
    expect(await adapter.resolveCategory('', 'poetry')).toBe('Poetry')
  })

  it('matches the vault folder case-insensitively and writes its real name', async () => {
    addFolder(VAULT_ID, 'Vault', null)
    for (const name of ['Notes', 'Resources', 'Poetry', 'Jobs', 'Projects', 'Daily', 'Archive']) {
      addFolder(`folder-${name}`, name, VAULT_ID)
    }
    // The user's own spelling - a folder query for `Ideas` would never have found it.
    addFolder('folder-ideas-lower', 'ideas', VAULT_ID)

    const adapter = await warmAdapter()

    expect(await adapter.resolveCategory(null, 'IDEA')).toBe('ideas')

    await adapter.createContent('', contentBody({ type: 'IDEA' }))

    expect(createdFiles[0].parents).toEqual(['folder-ideas-lower'])
    expect(createdFolders).toEqual([])
  })
})

// -------------------------------------------------------------------------------------------
// Requirement 3 - an explicit category still wins over the type.
// -------------------------------------------------------------------------------------------
describe('T103 - an explicit category outranks the type', () => {
  it('resolves an explicit name before consulting the type', async () => {
    seedVault()
    const adapter = await warmAdapter()

    expect(await adapter.resolveCategory('Poetry', 'IDEA')).toBe('Poetry')
    expect(await adapter.resolveCategory(IDEAS_ID, 'NOTE')).toBe('Ideas')
    expect(await adapter.resolveCategory(IDEAS_ID, 'CUSTOM')).toBe('Ideas')
  })

  it('writes into the explicit folder even when the type has a folder of its own', async () => {
    seedVault()
    const adapter = await warmAdapter()

    await adapter.createContent('Poetry', contentBody({ type: 'IDEA' }))

    expect(createdFiles[0].parents).toEqual(['folder-Poetry'])
    expect(createdFolders).toEqual([])
  })

  it('keeps the pre-existing resolver behaviour when no type is passed', async () => {
    seedVault()
    const adapter = await warmAdapter()

    expect(await adapter.resolveCategory(null)).toBe('Notes')
    expect(await adapter.resolveCategory(undefined)).toBe('Notes')
    expect(await adapter.resolveCategory(IDEAS_ID)).toBe('Ideas')
    // An unknown name is a name: the backend finds or creates it (unchanged behaviour).
    expect(await adapter.resolveCategory('Philosophy')).toBe('Philosophy')
  })
})

// -------------------------------------------------------------------------------------------
// Requirement 2 - a type with no matching folder falls back AND creates no folder.
// -------------------------------------------------------------------------------------------
describe('T103 - a type with no folder in the vault falls back to the default', () => {
  it('sends CUSTOM to Notes and creates no folder', async () => {
    seedVault()
    const adapter = await warmAdapter()

    expect(await adapter.resolveCategory(null, 'CUSTOM')).toBe('Notes')

    await adapter.createContent('', contentBody({ type: 'CUSTOM' }))

    expect(createdFiles[0].parents).toEqual(['folder-Notes'])
    expect(createdFolders).toEqual([])
    expect(consoleInfo).toHaveBeenCalledWith(
      expect.stringContaining('Content type CUSTOM has no category folder of its own')
    )
  })

  it('sends a type whose folder is missing to Notes and creates no folder', async () => {
    // A vault without `Ideas` - the folder was renamed or deleted by the user. (`Ideas` is not one
    // of the default categories, so `initializeVaultStructure` does not recreate it; the seven
    // defaults always exist by construction.)
    addFolder(VAULT_ID, 'Vault', null)
    for (const name of ['Notes', 'Resources', 'Poetry', 'Jobs', 'Projects', 'Daily', 'Archive']) {
      addFolder(`folder-${name}`, name, VAULT_ID)
    }

    const adapter = await warmAdapter()

    expect(await adapter.resolveCategory(null, 'IDEA')).toBe('Notes')

    await adapter.createContent('', contentBody({ type: 'IDEA' }))

    expect(createdFiles[0].parents).toEqual(['folder-Notes'])
    // The guarantee: the missing folder was NOT created as a side effect of saving a note.
    expect(createdFolders).toEqual([])
    expect(consoleInfo).toHaveBeenCalledWith(
      expect.stringContaining('The vault has no Ideas folder')
    )
  })

  it('sends an unknown type string to Notes', async () => {
    seedVault()
    const adapter = await warmAdapter()

    expect(await adapter.resolveCategory(null, 'EVENT')).toBe('Notes')
    expect(await adapter.resolveCategory(null, null)).toBe('Notes')
    expect(await adapter.resolveCategory(null, '')).toBe('Notes')
  })
})

// -------------------------------------------------------------------------------------------
// Requirement 4 - the resolved category is recorded on the file itself.
// -------------------------------------------------------------------------------------------
describe('T103 - the resolved category is written into the note metadata', () => {
  it('records the type folder in the frontmatter and in vault-category', async () => {
    seedVault()
    const adapter = await warmAdapter()

    await adapter.createContent('', contentBody({ title: 'God\'s Eye View', type: 'IDEA' }))

    const written = createdFiles[0]

    // Frontmatter: the file stays readable outside the app and says where it lives.
    expect(written.body).toContain('categoryName: Ideas')
    // appProperties: the listing reads it back with no body read.
    expect(readCategoryNameProperty(written.appProperties)).toBe('Ideas')
  })
})

// -------------------------------------------------------------------------------------------
// Requirement 5 - an update never moves a note.
// -------------------------------------------------------------------------------------------
describe('T103 - a PATCH without a category keeps the note where it is', () => {
  it('rewrites the file in place, with the category it already has', async () => {
    seedVault()
    addContentFile(IDEAS_ID, 'idea-1', {
      title: 'God\'s Eye View',
      type: 'IDEA',
      categoryName: 'Ideas',
    })

    const adapter = await warmAdapter()

    // Exactly what PATCH /api/content/[id] does: the file's OWN located category, no type.
    await adapter.updateContent('idea-1', 'Ideas', { title: 'God\'s Eye View (edited)' })

    expect(updateCalls).toHaveLength(1)
    const update = updateCalls[0]

    // No re-parenting of any kind: not via Drive's move arguments, not via the request body.
    expect(update.addParents).toBeUndefined()
    expect(update.removeParents).toBeUndefined()
    expect(update.requestBody?.parents).toBeUndefined()

    // The note is still where it was, and it still says so.
    expect(filesByParent[IDEAS_ID].map((file) => file.id)).toEqual(['idea-1'])
    expect(filesByParent['folder-Notes']).toBeUndefined()
    expect(String(update.media?.body)).toContain('categoryName: Ideas')
    expect(readCategoryNameProperty(update.requestBody?.appProperties)).toBe('Ideas')
  })
})

// -------------------------------------------------------------------------------------------
// The route - POST with no category uses the type's folder end to end.
// -------------------------------------------------------------------------------------------
describe('T103 - POST /api/content with no category', () => {
  it('writes an IDEA into Vault/Ideas and answers 201 with the item', async () => {
    seedVault()

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

    const response = await route.POST(
      new NextRequest('http://localhost/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'God\'s Eye View',
          content: 'Looking down at the city.',
          type: 'IDEA',
          tags: [],
        }),
      })
    )

    expect(response.status).toBe(201)

    const json = await response.json()
    expect(json.title).toBe('God\'s Eye View')
    expect(json.type).toBe('IDEA')
    expect(json.content).toBe('Looking down at the city.')

    // The note went to the folder that matches its type, and no folder was created.
    expect(createdFiles).toHaveLength(1)
    expect(createdFiles[0].parents).toEqual([IDEAS_ID])
    expect(createdFolders).toEqual([])

    // And it can answer "where do I live?" from its own metadata.
    expect(readCategoryNameProperty(createdFiles[0].appProperties)).toBe('Ideas')
    expect(createdFiles[0].body).toContain('categoryName: Ideas')
  })
})
