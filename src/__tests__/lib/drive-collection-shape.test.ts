import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OAuth2Client } from 'google-auth-library'
import {
  GoogleDriveCategoriesAdapter,
  resetCategoryListCache,
} from '@/lib/google-drive-categories-adapter'
import { GoogleDriveTagsAdapter } from '@/lib/google-drive-tags-adapter'

// ---------------------------------------------------------------------------
// T060 - the adapters' PUBLIC output must be a total shape.
//
// These assertions deliberately run against the adapter's public methods
// (listCategories / createCategory / updateCategory / listTags / createTag /
// updateTag) and NOT against the module-scope normaliser, because a test of the
// helper would still pass while the adapter returned a raw shape.
//
// The mocked Drive is one that OMITS `children` and `_count` - which is exactly
// what the live `GET /api/categories` payload did before this fix.
// ---------------------------------------------------------------------------

type Params = {
  q?: string
  alt?: string
  fields?: string
  fileId?: string
}

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

let categoryMetaFiles: Array<{ id: string }> = []
let categoryFolders: Array<{ id: string; name: string }> = []
let tagFiles: Array<{ id: string; name: string }> = []
let mediaById: Record<string, string> = {}
let folderInfoById: Record<
  string,
  { id: string; name: string; createdTime: string; modifiedTime: string }
> = {}

function listResult(params: Params): { data: { files: unknown[] } } {
  const q = params.q ?? ''

  // tags: listTags() query
  if (q.includes("name~'\\.tag\\.json$'")) {
    return { data: { files: tagFiles } }
  }
  // categories: readCategoryMetadata / writeCategoryMetadata probe
  if (q.includes("name='_category.json'")) {
    return { data: { files: categoryMetaFiles } }
  }
  // tags: findOrCreateFolder('Tags', ...) probe inside initialize()
  if (q.includes("name='Tags'")) {
    return { data: { files: [{ id: 'tags-folder', name: 'Tags' }] } }
  }
  // categories: findOrCreateFolder('NewCat', ...) inside createCategory()
  if (q.includes("name='NewCat'")) {
    return { data: { files: [{ id: 'cat-new', name: 'NewCat' }] } }
  }
  // tags: updateTag() file lookup
  if (q.includes("name='A.tag.json'")) {
    return { data: { files: [{ id: 'tag-file-1' }] } }
  }
  // categories: listCategories() folder listing
  if (q.includes('application/vnd.google-apps.folder')) {
    return { data: { files: categoryFolders } }
  }
  return { data: { files: [] } }
}

function getResult(params: Params): { data: unknown } {
  if (params.alt === 'media') {
    return { data: mediaById[params.fileId ?? ''] }
  }
  return { data: folderInfoById[params.fileId ?? ''] }
}

function expectTotalShape(value: { children?: unknown; _count?: { contentItems?: unknown } }) {
  expect(Array.isArray(value.children)).toBe(true)
  expect(typeof value._count?.contentItems).toBe('number')
}

beforeEach(() => {
  // The category list cache is module-level by design (it has to survive a request), so each test
  // starts cold.
  resetCategoryListCache()

  categoryMetaFiles = []
  categoryFolders = []
  tagFiles = []
  mediaById = {}
  folderInfoById = {}

  mockDrive.files.list.mockReset()
  mockDrive.files.get.mockReset()
  mockDrive.files.create.mockReset()
  mockDrive.files.update.mockReset()

  mockDrive.files.list.mockImplementation((params: Params) =>
    Promise.resolve(listResult(params))
  )
  mockDrive.files.get.mockImplementation((params: Params) => Promise.resolve(getResult(params)))
  mockDrive.files.create.mockImplementation(() =>
    Promise.resolve({ data: { id: 'created-file', name: 'created' } })
  )
  mockDrive.files.update.mockImplementation(() => Promise.resolve({ data: { id: 'updated-file' } }))
})

describe('GoogleDriveCategoriesAdapter - total collection shape', () => {
  it('normalises the default-metadata branch (no _category.json exists)', async () => {
    // The live crash payload: the folder has no metadata file, so the adapter
    // builds default metadata with `_count` but no `children`.
    categoryMetaFiles = []
    categoryFolders = [{ id: 'folder-1', name: 'Notes' }]
    folderInfoById = {
      'folder-1': {
        id: 'folder-1',
        name: 'Notes',
        createdTime: '2026-01-01T00:00:00.000Z',
        modifiedTime: '2026-01-01T00:00:00.000Z',
      },
    }

    const adapter = new GoogleDriveCategoriesAdapter(oauth2Client, 'user-1')
    await adapter.initialize('vault-1')
    const categories = await adapter.listCategories()

    expect(categories).toHaveLength(1)
    for (const c of categories) {
      expectTotalShape(c)
    }
  })

  it('normalises the stored-metadata branch whose payload predates `children`', async () => {
    // A stored `_category.json` written before `children` existed: no
    // `children`, no `_count`. This is the exact production payload.
    categoryMetaFiles = [{ id: 'meta-1' }]
    categoryFolders = [{ id: 'folder-2', name: 'B' }]
    mediaById = {
      'meta-1': JSON.stringify({
        id: 'c2',
        name: 'B',
        color: '#000000',
        isSystem: false,
        level: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    }

    const adapter = new GoogleDriveCategoriesAdapter(oauth2Client, 'user-1')
    await adapter.initialize('vault-1')
    const categories = await adapter.listCategories()

    expect(categories).toHaveLength(1)
    for (const c of categories) {
      expectTotalShape(c)
    }
  })

  it('createCategory returns a total shape', async () => {
    categoryMetaFiles = []

    const adapter = new GoogleDriveCategoriesAdapter(oauth2Client, 'user-1')
    await adapter.initialize('vault-1')
    const created = await adapter.createCategory('NewCat')

    expectTotalShape(created)
  })

  it('updateCategory returns a total shape', async () => {
    categoryMetaFiles = [{ id: 'meta-c1' }]
    mediaById = {
      'meta-c1': JSON.stringify({
        id: 'cat-1',
        name: 'Original',
        color: '#111111',
        isSystem: false,
        level: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    }

    const adapter = new GoogleDriveCategoriesAdapter(oauth2Client, 'user-1')
    await adapter.initialize('vault-1')
    const updated = await adapter.updateCategory('cat-1', { name: 'Renamed' })

    expectTotalShape(updated)
  })
})

describe('GoogleDriveTagsAdapter - total collection shape', () => {
  it('listTags(true) and listTags(false) both return a total shape', async () => {
    tagFiles = [{ id: 'tag-file-1', name: 'A.tag.json' }]
    mediaById = {
      'tag-file-1': JSON.stringify({
        id: 'tag-1',
        name: 'A',
        color: '#8B5CF6',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    }

    const adapter = new GoogleDriveTagsAdapter(oauth2Client, 'user-1')
    await adapter.initialize('vault-1')

    const withUsage = await adapter.listTags(true)
    const withoutUsage = await adapter.listTags(false)

    expect(withUsage).toHaveLength(1)
    expect(withoutUsage).toHaveLength(1)
    for (const t of [...withUsage, ...withoutUsage]) {
      expectTotalShape(t)
    }
  })

  it('createTag returns a total shape', async () => {
    tagFiles = []

    const adapter = new GoogleDriveTagsAdapter(oauth2Client, 'user-1')
    await adapter.initialize('vault-1')
    const created = await adapter.createTag('NewTag')

    expectTotalShape(created)
  })

  it('updateTag returns a total shape', async () => {
    tagFiles = [{ id: 'tag-file-1', name: 'A.tag.json' }]
    mediaById = {
      'tag-file-1': JSON.stringify({
        id: 'tag-1',
        name: 'A',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    }

    const adapter = new GoogleDriveTagsAdapter(oauth2Client, 'user-1')
    await adapter.initialize('vault-1')
    const updated = await adapter.updateTag('tag-1', { name: 'Renamed' })

    expectTotalShape(updated)
  })
})
