import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { OAuth2Client } from 'google-auth-library'
import {
  GoogleDriveCategoriesAdapter,
  resetCategoryListCache,
} from '@/lib/google-drive-categories-adapter'

// ---------------------------------------------------------------------------
// /api/categories was measured at 11.2-11.9 s against the real account while
// /api/content (already optimised) answered in ~1.5 s. The cause was the category list:
// one `files.list` per folder looking for its `_category.json`, plus a `files.get` per
// folder that had none - all sequential.
//
// These assertions pin the cost of the list, not only its output:
//   - a ten-folder vault asks Drive for its categories in TWO queries (folders + metadata),
//   - a second call inside the TTL asks Drive nothing at all,
//   - a category created here is visible on the next call (invalidation, not TTL expiry),
//   - the response shape is unchanged, `_count.contentItems` included.
//
// The mocked Drive deliberately behaves like the live one in the way that matters: it
// IGNORES the `q` mime filter, so the T092 mime guard has to do the work.
// ---------------------------------------------------------------------------

const FOLDER = 'application/vnd.google-apps.folder'
const JSON_MIME = 'application/json'
const EDITORS_DOC = 'application/vnd.google-apps.document'
const VAULT_ID = 'vault-1'

type Params = { q?: string; fileId?: string; alt?: string; fields?: string }

const { mockDrive } = vi.hoisted(() => ({
  mockDrive: {
    files: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('googleapis', () => ({
  google: { drive: () => mockDrive },
}))

const oauth2Client = new OAuth2Client('test-client-id', 'test-client-secret')

interface FakeFolder {
  id: string
  name: string
  createdTime: string
  modifiedTime: string
  mimeType: string
}

interface FakeMetadataFile {
  id: string
  name: string
  mimeType: string
  parents: string[]
}

let vaultFolders: FakeFolder[]
let metadataFiles: FakeMetadataFile[]
let media: Record<string, string>
let createShouldReturn: { id: string; name: string }

const CREATED = '2026-01-01T00:00:00.000Z'
const MODIFIED = '2026-01-02T00:00:00.000Z'

function folder(id: string, name: string): FakeFolder {
  return { id, name, createdTime: CREATED, modifiedTime: MODIFIED, mimeType: FOLDER }
}

function categoryMetadata(id: string, name: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id,
    name,
    color: '#000000',
    isSystem: false,
    level: 1,
    createdAt: CREATED,
    updatedAt: MODIFIED,
    children: [],
    _count: { contentItems: 0 },
    ...extra,
  })
}

/** `q` -> the files Drive would answer, in the shape the adapter asked for. */
function listResult(params: Params): { data: { files: unknown[] } } {
  const q = params.q ?? ''

  // The per-folder metadata probe (`'<folder>' in parents`) - mutation paths only now.
  if (q.includes("name='_category.json'") && q.includes(' in parents')) {
    const parentId = /'([^']+)' in parents/.exec(q)?.[1] ?? ''
    return { data: { files: metadataFiles.filter((file) => file.parents.includes(parentId)) } }
  }

  // The one account-wide metadata query. The mocked Drive ignores the mime filter.
  if (q.includes("name='_category.json'")) {
    return { data: { files: metadataFiles } }
  }

  // findFolderByName('Vault', null) inside initialize() without an explicit id.
  if (q.includes("name='Vault'")) {
    return { data: { files: [{ id: VAULT_ID, name: 'Vault' }] } }
  }

  // findOrCreateFolder(name, ...) probe inside createCategory().
  if (q.includes(`name='${createShouldReturn.name}'`)) {
    return { data: { files: [] } }
  }

  // The vault's own folder listing: every folder is a category (T092).
  if (q.includes(`mimeType='${FOLDER}'`)) {
    if (q.includes(`'${VAULT_ID}' in parents`)) {
      return { data: { files: vaultFolders } }
    }
    // deleteCategory()'s "does this category have children?" check, and any other parent.
    return { data: { files: [] } }
  }

  return { data: { files: [] } }
}

function getResult(params: Params): { data: unknown } {
  if (params.alt === 'media') {
    return { data: media[params.fileId ?? ''] ?? '' }
  }
  return {
    data: {
      id: params.fileId,
      name: 'folder',
      createdTime: CREATED,
      modifiedTime: MODIFIED,
      mimeType: FOLDER,
    },
  }
}

/** Every Drive request the mocked client received. */
function driveCalls(): Params[] {
  return [
    ...mockDrive.files.list.mock.calls.map((call) => call[0] as Params),
    ...mockDrive.files.get.mock.calls.map((call) => call[0] as Params),
  ]
}

/** The `files.list` queries only, i.e. what the brief counts as "queries". */
function listQueries(): Params[] {
  return mockDrive.files.list.mock.calls.map((call) => call[0] as Params)
}

function mediaReads(): Params[] {
  return mockDrive.files.get.mock.calls
    .map((call) => call[0] as Params)
    .filter((params) => params.alt === 'media')
}

function tenFoldersWithMetadata(): void {
  vaultFolders = Array.from({ length: 10 }, (_, index) => folder(`folder-${index}`, `Cat${index}`))
  metadataFiles = vaultFolders.map((entry) => ({
    id: `meta-${entry.id}`,
    name: '_category.json',
    mimeType: JSON_MIME,
    parents: [entry.id],
  }))
  media = {}
  for (const entry of vaultFolders) {
    media[`meta-${entry.id}`] = categoryMetadata(entry.id, entry.name, {
      color: '#123456',
      description: `${entry.name} description`,
      icon: 'folder',
    })
  }
}

function tenFoldersWithoutMetadata(): void {
  vaultFolders = Array.from({ length: 10 }, (_, index) => folder(`folder-${index}`, `Cat${index}`))
  metadataFiles = []
  media = {}
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  // The category list cache is module-level by design, so each test starts cold.
  resetCategoryListCache()

  vaultFolders = []
  metadataFiles = []
  media = {}
  createShouldReturn = { id: 'cat-new', name: 'NewCat' }

  mockDrive.files.list.mockReset()
  mockDrive.files.get.mockReset()
  mockDrive.files.create.mockReset()
  mockDrive.files.update.mockReset()

  mockDrive.files.list.mockImplementation((params: Params) => Promise.resolve(listResult(params)))
  mockDrive.files.get.mockImplementation((params: Params) => Promise.resolve(getResult(params)))
  mockDrive.files.create.mockImplementation(
    (params: { resource?: { name?: string; mimeType?: string } }) => {
      if (params.resource?.mimeType === FOLDER) {
        const created = { id: createShouldReturn.id, name: createShouldReturn.name }
        // The live Drive makes the folder a child of the vault immediately.
        vaultFolders = [...vaultFolders, folder(created.id, created.name)]
        return Promise.resolve({ data: created })
      }
      // The `_category.json` create inside writeCategoryMetadata().
      return Promise.resolve({ data: { id: 'meta-created', name: '_category.json' } })
    }
  )
  mockDrive.files.update.mockImplementation(() => Promise.resolve({ data: { id: 'updated' } }))

  // The skip paths log on purpose; keep the run readable.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
})

describe('category listing - Drive cost', () => {
  it('lists a ten-folder vault with two queries and no per-folder metadata probe', async () => {
    tenFoldersWithoutMetadata()

    const adapter = new GoogleDriveCategoriesAdapter(oauth2Client, 'user-1')
    await adapter.initialize(VAULT_ID)
    const categories = await adapter.listCategories()

    expect(categories).toHaveLength(10)
    // BEFORE this change the same fixture cost 1 folder listing + 10 metadata probes + 10
    // `files.get` fallbacks = 21 sequential round-trips (the measured ~11.5 s).
    expect(driveCalls()).toHaveLength(2)
    expect(listQueries()).toHaveLength(2)

    const [folderQuery, metadataQuery] = listQueries()
    expect(folderQuery.q).toContain(`'${VAULT_ID}' in parents`)
    expect(folderQuery.q).toContain(`mimeType='${FOLDER}'`)
    // ONE metadata query for the whole account, not one per folder.
    expect(metadataQuery.q).toContain("name='_category.json'")
    expect(metadataQuery.q).toContain(`mimeType='${JSON_MIME}'`)
    expect(metadataQuery.q).not.toContain(' in parents')
    // Nothing is asked per folder: no folder-scoped query, no metadata get.
    expect(mediaReads()).toHaveLength(0)
  })

  it('reads every _category.json body once, in parallel, for a vault that has them', async () => {
    tenFoldersWithMetadata()

    const adapter = new GoogleDriveCategoriesAdapter(oauth2Client, 'user-1')
    await adapter.initialize(VAULT_ID)
    const categories = await adapter.listCategories()

    expect(categories).toHaveLength(10)
    // Two queries + ten body reads (a body is not a query; Drive has no multi-file media read).
    expect(listQueries()).toHaveLength(2)
    expect(mediaReads()).toHaveLength(10)
    // The stored metadata is what reached the response, not the folder defaults.
    expect(categories.map((category) => category.color)).toEqual(Array(10).fill('#123456'))
    expect(categories[0].description).toBe(`${vaultFolders[0].name} description`)
  })

  it('makes no Drive call at all on a second listing inside the TTL', async () => {
    tenFoldersWithMetadata()

    const first = new GoogleDriveCategoriesAdapter(oauth2Client, 'user-1')
    await first.initialize(VAULT_ID)
    const firstList = await first.listCategories()
    const callsAfterFirst = driveCalls().length
    expect(callsAfterFirst).toBeGreaterThan(0)

    // A second request constructs its own adapter, exactly as the route does per request.
    const second = new GoogleDriveCategoriesAdapter(oauth2Client, 'user-1')
    await second.initialize(VAULT_ID)
    const secondList = await second.listCategories()

    expect(driveCalls()).toHaveLength(callsAfterFirst)
    expect(secondList).toEqual(firstList)
  })

  it('resolves the Vault folder once per account instead of on every request', async () => {
    tenFoldersWithoutMetadata()

    // No explicit id: this is the production route path (adapter.initialize()).
    const first = new GoogleDriveCategoriesAdapter(oauth2Client, 'user-1')
    await first.initialize()
    await first.listCategories()
    expect(listQueries().filter((params) => params.q?.includes("name='Vault'"))).toHaveLength(1)
    const callsAfterFirst = driveCalls().length

    // A second request builds its own adapter, exactly as the route does per request.
    const second = new GoogleDriveCategoriesAdapter(oauth2Client, 'user-1')
    await second.initialize()
    await second.listCategories()

    // Neither the Vault lookup nor the list is repeated inside the TTL: the warm path is free.
    expect(driveCalls()).toHaveLength(callsAfterFirst)
  })
})

describe('category listing - invalidation', () => {
  it('shows a category created here on the very next call, and that call asks Drive', async () => {
    tenFoldersWithoutMetadata()

    const adapter = new GoogleDriveCategoriesAdapter(oauth2Client, 'user-1')
    await adapter.initialize(VAULT_ID)
    const before = await adapter.listCategories()
    expect(before.map((category) => category.name)).not.toContain('NewCat')

    const callsBeforeCreate = driveCalls().length
    await adapter.createCategory('NewCat')
    expect(driveCalls().length).toBeGreaterThan(callsBeforeCreate)

    const callsBeforeList = driveCalls().length
    const after = await adapter.listCategories()

    expect(after.map((category) => category.name)).toContain('NewCat')
    // Invalidation, not TTL expiry or a lucky cache read: the listing went back to Drive.
    expect(driveCalls().length).toBeGreaterThan(callsBeforeList)
  })

  it('invalidation is per account: another account keeps its own cached list', async () => {
    tenFoldersWithoutMetadata()

    const mine = new GoogleDriveCategoriesAdapter(oauth2Client, 'user-1')
    await mine.initialize(VAULT_ID)
    await mine.listCategories()

    const theirs = new GoogleDriveCategoriesAdapter(oauth2Client, 'user-2')
    await theirs.initialize(VAULT_ID)
    await theirs.listCategories()

    const callsBeforeCreate = driveCalls().length
    await mine.createCategory('NewCat')

    // user-2's entry survives: only its own account is invalidated.
    const callsBeforeTheirList = driveCalls().length
    await theirs.listCategories()
    expect(driveCalls()).toHaveLength(callsBeforeTheirList)
    expect(callsBeforeCreate).toBeLessThan(callsBeforeTheirList)
  })

  it('shows a rename on the next call instead of after the TTL', async () => {
    tenFoldersWithoutMetadata()

    const target = vaultFolders[0]
    metadataFiles = [
      { id: 'meta-0', name: '_category.json', mimeType: JSON_MIME, parents: [target.id] },
    ]
    media = { 'meta-0': categoryMetadata(target.id, target.name) }

    const adapter = new GoogleDriveCategoriesAdapter(oauth2Client, 'user-1')
    await adapter.initialize(VAULT_ID)
    await adapter.listCategories()

    // The live Drive renames the folder and the adapter rewrites the sidecar.
    mockDrive.files.update.mockImplementation((params: { fileId?: string; resource?: { name?: string } }) => {
      if (params.resource?.name) {
        vaultFolders = vaultFolders.map((entry) =>
          entry.id === params.fileId ? { ...entry, name: params.resource?.name ?? entry.name } : entry
        )
        media['meta-0'] = categoryMetadata(target.id, params.resource.name)
      }
      return Promise.resolve({ data: { id: params.fileId ?? 'updated' } })
    })

    const callsBefore = driveCalls().length
    await adapter.updateCategory(target.id, { name: 'Renamed' })

    const after = await adapter.listCategories()
    expect(after.map((category) => category.name)).toContain('Renamed')
    expect(driveCalls().length).toBeGreaterThan(callsBefore)
  })

  it('drops a deleted category on the next call', async () => {
    vaultFolders = [folder('folder-0', 'Keep'), folder('folder-1', 'Doomed')]
    metadataFiles = [
      { id: 'meta-0', name: '_category.json', mimeType: JSON_MIME, parents: ['folder-0'] },
      { id: 'meta-1', name: '_category.json', mimeType: JSON_MIME, parents: ['folder-1'] },
    ]
    media = {
      'meta-0': categoryMetadata('folder-0', 'Keep'),
      'meta-1': categoryMetadata('folder-1', 'Doomed'),
    }

    const adapter = new GoogleDriveCategoriesAdapter(oauth2Client, 'user-1')
    await adapter.initialize(VAULT_ID)
    await adapter.listCategories()

    mockDrive.files.update.mockImplementation(() => {
      vaultFolders = vaultFolders.filter((entry) => entry.id !== 'folder-1')
      return Promise.resolve({ data: { id: 'folder-1' } })
    })

    await adapter.deleteCategory('folder-1')

    const after = await adapter.listCategories()
    expect(after.map((category) => category.name)).toEqual(['Keep'])
  })
})

describe('category listing - response shape', () => {
  it('returns the same CategoryData keys, children and _count as before', async () => {
    vaultFolders = [folder('folder-0', 'Notes')]
    metadataFiles = [
      { id: 'meta-0', name: '_category.json', mimeType: JSON_MIME, parents: ['folder-0'] },
    ]
    media = {
      'meta-0': categoryMetadata('folder-0', 'Notes', {
        isSystem: true,
        level: 0,
        description: 'Everything else',
        icon: 'book',
        parentId: null,
      }),
    }

    const adapter = new GoogleDriveCategoriesAdapter(oauth2Client, 'user-1')
    await adapter.initialize(VAULT_ID)
    const [category] = await adapter.listCategories()

    // Exactly the shape ADR-009 pins: no field added, none dropped.
    expect(Object.keys(category).sort()).toEqual(
      [
        '_count',
        'children',
        'color',
        'createdAt',
        'description',
        'icon',
        'id',
        'isSystem',
        'level',
        'name',
        'parentId',
        'updatedAt',
      ].sort()
    )
    expect(category.children).toEqual([])
    expect(category._count).toEqual({ contentItems: 0 })
    // The optional fields the sidecar carries are passed through untouched.
    expect(category.description).toBe('Everything else')
    expect(category.icon).toBe('book')
    expect(category.isSystem).toBe(true)
    expect(category.level).toBe(0)
    // JSON the route sends: the same keys survive serialisation.
    expect(Object.keys(JSON.parse(JSON.stringify(category))).sort()).toEqual(
      Object.keys(category).sort()
    )
  })

  it('builds the default metadata from the folder listing, not from a per-folder get', async () => {
    vaultFolders = [folder('folder-0', 'Notes')]
    metadataFiles = []

    const adapter = new GoogleDriveCategoriesAdapter(oauth2Client, 'user-1')
    await adapter.initialize(VAULT_ID)
    const [category] = await adapter.listCategories()

    expect(category.name).toBe('Notes')
    expect(category.color).toBe('#3B82F6')
    expect(category.isSystem).toBe(false)
    expect(category.level).toBe(1)
    expect(category.createdAt).toEqual(new Date(CREATED))
    expect(category.updatedAt).toEqual(new Date(MODIFIED))
    // `_count.contentItems` is a static zero in this model (nothing counts content items here),
    // and this change must not turn it into one query per category.
    expect(category._count).toEqual({ contentItems: 0 })
    expect(mockDrive.files.get).not.toHaveBeenCalled()
  })
})

describe('category listing - the T092 guard and the per-item boundary survive', () => {
  it('never offers an editors file as metadata, even when Drive ignores the mime filter', async () => {
    vaultFolders = [folder('cat-a', 'A'), folder('cat-b', 'B')]
    metadataFiles = [
      { id: 'meta-doc', name: '_category.json', mimeType: EDITORS_DOC, parents: ['cat-a'] },
      { id: 'meta-b', name: '_category.json', mimeType: JSON_MIME, parents: ['cat-b'] },
    ]
    media = { 'meta-b': categoryMetadata('cat-b', 'B') }

    const adapter = new GoogleDriveCategoriesAdapter(oauth2Client, 'user-1')
    await adapter.initialize(VAULT_ID)
    const categories = await adapter.listCategories()

    // cat-a is skipped: its only metadata is an editors object, which cannot be read.
    expect(categories.map((category) => category.id)).toEqual(['cat-b'])
    // The refusal happens before any alt=media request for the editors file.
    expect(mediaReads().map((params) => params.fileId)).toEqual(['meta-b'])
    // The query still constrains the mime type, as T092 requires.
    const metadataQuery = listQueries().find((params) => params.q?.includes("name='_category.json'"))
    expect(metadataQuery?.q).toContain(`mimeType='${JSON_MIME}'`)
  })

  it('skips one unreadable folder without failing the whole list', async () => {
    vaultFolders = [folder('cat-a', 'A'), folder('cat-b', 'B')]
    metadataFiles = [
      { id: 'meta-a', name: '_category.json', mimeType: JSON_MIME, parents: ['cat-a'] },
      { id: 'meta-b', name: '_category.json', mimeType: JSON_MIME, parents: ['cat-b'] },
    ]
    // 'meta-a' answers a body that is not JSON at all.
    media = { 'meta-a': 'not json {', 'meta-b': categoryMetadata('cat-b', 'B') }

    const adapter = new GoogleDriveCategoriesAdapter(oauth2Client, 'user-1')
    await adapter.initialize(VAULT_ID)
    const categories = await adapter.listCategories()

    expect(categories.map((category) => category.id)).toEqual(['cat-b'])
  })
})
