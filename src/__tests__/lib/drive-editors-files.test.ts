import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { OAuth2Client } from 'google-auth-library'
import { GoogleDriveBackendService, resetVaultStructureCache } from '@/lib/google-drive-backend'
import { GoogleDriveContentAdapter } from '@/lib/google-drive-content-adapter'
import { GoogleDriveJobsAdapter } from '@/lib/google-drive-jobs-adapter'
import { GoogleDriveCalendarAdapter } from '@/lib/google-drive-calendar-adapter'
import {
  GoogleDriveCategoriesAdapter,
  resetCategoryListCache,
} from '@/lib/google-drive-categories-adapter'
import { isEditorsFileMimeType } from '@/lib/google-drive-media'

// ---------------------------------------------------------------------------
// T092 - a Google Docs editors file is not one of this app's files.
//
// The live failure: /api/content, /api/jobs and /api/calendar returned 500 because the list path
// called `files.get({ fileId, alt: 'media' })` on a Google Doc, which can only answer
//   403 { reason: 'fileNotDownloadable', message: 'Only files with binary content can be
//         downloaded. Use Export with Docs Editors files.' }
//
// These assertions run against the adapters' PUBLIC methods, and they deliberately mock a Drive
// that IGNORES the `q` mime constraint (it returns the editors file anyway), because the point is
// that the collection survives even when the filter does not hold. Both defences are pinned:
//   - the listing asks for the app's own mime (query assertions), and
//   - the reader refuses an editors file before any alt=media request is made.
// ---------------------------------------------------------------------------

const EDITORS_DOC = 'application/vnd.google-apps.document'
const EDITORS_FOLDER = 'application/vnd.google-apps.folder'
const MARKDOWN = 'text/markdown'
const JSON_MIME = 'application/json'

type Params = { fileId?: string; alt?: string; fields?: string; q?: string }
type DriveFile = {
  id: string
  name?: string
  mimeType?: string
  createdTime?: string
  parents?: string[]
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

let categoryFiles: DriveFile[] = []
let jobFiles: DriveFile[] = []
let eventFiles: DriveFile[] = []
let categoryMetaByFolder: Record<string, DriveFile[]> = {}
let folderListResult: DriveFile[] | null = null
let media: Record<string, string> = {}
let mediaErrors: Record<string, Error> = {}
let mimeById: Record<string, string> = {}
let listQueries: string[] = []

/** The error the live server printed 33 times. */
function editors403(): Error {
  return new Error(
    JSON.stringify({
      error: {
        code: 403,
        message: 'Only files with binary content can be downloaded. Use Export with Docs Editors files.',
        reason: 'fileNotDownloadable',
      },
    })
  )
}

function listResult(params: Params): { data: { files: DriveFile[] } } {
  const q = params.q ?? ''
  listQueries.push(q)

  // Categories: ONE account-wide metadata query per listing (no `in parents`), plus the per-folder
  // probe the mutation paths still use.
  if (q.includes("name='_category.json'")) {
    if (!q.includes(' in parents')) {
      return { data: { files: Object.values(categoryMetaByFolder).flat() } }
    }
    const folderId = /'([^']+)' in parents/.exec(q)?.[1] ?? ''
    return { data: { files: categoryMetaByFolder[folderId] ?? [] } }
  }

  // Any folder lookup (initialize(), findOrCreateFolder(), listCategories()).
  if (q.includes(`mimeType='${EDITORS_FOLDER}'`)) {
    if (folderListResult) return { data: { files: folderListResult } }
    const name = /name='([^']+)'/.exec(q)?.[1] ?? 'Unknown'
    return { data: { files: [{ id: `folder-${name}`, name }] } }
  }

  // Content: listCategoryFiles() / searchFiles()
  if (q.includes(`mimeType='${MARKDOWN}'`)) {
    return { data: { files: categoryFiles } }
  }
  if (q.includes('.job.json')) {
    return { data: { files: jobFiles } }
  }
  if (q.includes('.event.json')) {
    return { data: { files: eventFiles } }
  }

  return { data: { files: [] } }
}

function getResult(params: Params): Promise<{ data: unknown }> {
  const fileId = params.fileId ?? ''

  if (params.alt === 'media') {
    const failure = mediaErrors[fileId]
    if (failure) return Promise.reject(failure)
    return Promise.resolve({ data: media[fileId] ?? '' })
  }

  // The guard's metadata probe (no alt=media).
  if (params.fields && params.fields.includes('mimeType')) {
    return Promise.resolve({ data: { id: fileId, mimeType: mimeById[fileId] } })
  }

  return Promise.resolve({
    data: {
      id: fileId,
      name: 'folder',
      createdTime: '2026-01-01T00:00:00.000Z',
      modifiedTime: '2026-01-01T00:00:00.000Z',
    },
  })
}

const markdownFixture = `---
id: content_1
title: Good
type: NOTE
status: DRAFT
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-02T00:00:00.000Z
---

The body the app wrote.
`

/** Every alt=media request the code made, in order. */
function mediaDownloads(): Params[] {
  return mockDrive.files.get.mock.calls
    .map((call) => call[0] as Params)
    .filter((params) => params.alt === 'media')
}

/** The single listing query that contains `fragment`. */
function queryWith(fragment: string): string {
  const match = listQueries.filter((q) => q.includes(fragment))
  expect(match.length, `no listing query contained ${fragment}`).toBeGreaterThan(0)
  return match[match.length - 1]
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  categoryFiles = []
  jobFiles = []
  eventFiles = []
  categoryMetaByFolder = {}
  folderListResult = null
  media = {}
  mediaErrors = {}
  mimeById = {}
  listQueries = []

  // T097: the vault structure cache is module-level by design, so each test starts cold.
  resetVaultStructureCache()
  // The categories adapter caches its assembled list for the same reason (it has to survive a
  // request), so the category tests start cold too.
  resetCategoryListCache()

  mockDrive.files.list.mockReset()
  mockDrive.files.get.mockReset()
  mockDrive.files.create.mockReset()
  mockDrive.files.update.mockReset()

  mockDrive.files.list.mockImplementation((params: Params) => Promise.resolve(listResult(params)))
  mockDrive.files.get.mockImplementation((params: Params) => getResult(params))
  mockDrive.files.create.mockImplementation(() =>
    Promise.resolve({ data: { id: 'created-file', name: 'created' } })
  )
  mockDrive.files.update.mockImplementation(() => Promise.resolve({ data: { id: 'updated-file' } }))

  // The paths under test log every skipped item on purpose; keep the run readable.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
})

describe('content collection - an unreadable item is skipped, not propagated', () => {
  it('returns the readable items and drops the one whose read fails', async () => {
    categoryFiles = [
      { id: 'md-good', name: 'Good_2026-01-01.md', mimeType: MARKDOWN },
      { id: 'md-bad', name: 'Bad_2026-01-01.md', mimeType: MARKDOWN },
    ]
    media = { 'md-good': markdownFixture }
    mediaErrors = { 'md-bad': editors403() }

    const adapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await adapter.initialize()

    // Must resolve: before T092 the same shape of failure reached the route as a 500.
    const items = await adapter.listCategoryContent('Notes')

    expect(items.map((item) => item.id)).toEqual(['md-good'])
    expect(items[0].title).toBe('Good')
    // Both were attempted; only the good one produced an item.
    expect(mediaDownloads().map((p) => p.fileId)).toEqual(['md-good', 'md-bad'])
  })

  it('keeps the readable items when the whole category is searched instead', async () => {
    categoryFiles = [
      { id: 'md-good', name: 'Good_2026-01-01.md', mimeType: MARKDOWN },
      { id: 'md-bad', name: 'Bad_2026-01-01.md', mimeType: MARKDOWN },
    ]
    media = { 'md-good': markdownFixture }
    mediaErrors = { 'md-bad': editors403() }

    const adapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await adapter.initialize()

    const items = await adapter.searchContent('*')

    expect(items.map((item) => item.id)).toEqual(['md-good'])
  })
})

describe('content collection - an editors file is never offered as content', () => {
  it('excludes it even though the mocked Drive returns it, and never downloads it', async () => {
    // The query asks for text/markdown, but this Drive ignores the filter - defence in depth.
    categoryFiles = [
      { id: 'doc-1', name: 'Meeting notes', mimeType: EDITORS_DOC },
      { id: 'bug-doc', name: 'Buy milk', mimeType: EDITORS_DOC },
      { id: 'md-good', name: 'Good_2026-01-01.md', mimeType: MARKDOWN },
    ]
    media = { 'md-good': markdownFixture }

    const adapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await adapter.initialize()

    const items = await adapter.listCategoryContent('Notes')

    expect(items.map((item) => item.id)).toEqual(['md-good'])
    // Acceptance 2: alt=media is impossible for an editors file, not merely unlikely.
    expect(mediaDownloads().map((p) => p.fileId)).toEqual(['md-good'])
  })

  it('asks Drive for the app mime type in the listing query', async () => {
    categoryFiles = [{ id: 'md-good', name: 'Good_2026-01-01.md', mimeType: MARKDOWN }]
    media = { 'md-good': markdownFixture }

    const adapter = new GoogleDriveContentAdapter(oauth2Client, 'user-1')
    await adapter.initialize()
    await adapter.listCategoryContent('Notes')

    const query = queryWith(`mimeType='${MARKDOWN}'`)
    expect(query).toContain(`mimeType='${MARKDOWN}'`)
    expect(query).toContain(`'folder-Notes' in parents`)
    expect(query).not.toContain('name~')
  })
})

describe('jobs collection - one unreadable sidecar does not fail the list', () => {
  it('returns the readable jobs, skips the failing read and the editors file', async () => {
    jobFiles = [
      { id: 'job-good', name: 'ACME_Dev.job.json', mimeType: JSON_MIME },
      { id: 'job-bad', name: 'Broken_Dev.job.json', mimeType: JSON_MIME },
      { id: 'doc-1', name: 'Interview notes', mimeType: EDITORS_DOC },
    ]
    media = {
      'job-good': JSON.stringify({
        id: 'job-1',
        title: 'Dev',
        company: 'ACME',
        status: 'applied',
        dateApplied: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    }
    mediaErrors = { 'job-bad': editors403() }

    const adapter = new GoogleDriveJobsAdapter(oauth2Client, 'user-1')
    await adapter.initialize()

    const jobs = await adapter.listJobs()

    expect(jobs.map((job) => job.id)).toEqual(['job-1'])
    const query = queryWith(`mimeType='${JSON_MIME}'`)
    expect(query).toContain("name contains '.job.json'")
    expect(query).toContain(`mimeType='${JSON_MIME}'`)
    // The editors file never reaches a download attempt at all.
    expect(mediaDownloads().map((p) => p.fileId)).toEqual(['job-good', 'job-bad'])
  })

  it('getJob returns null instead of throwing when the only candidate is unreadable', async () => {
    jobFiles = [{ id: 'job-bad', name: 'Broken_Dev.job.json', mimeType: JSON_MIME }]
    mediaErrors = { 'job-bad': editors403() }

    const adapter = new GoogleDriveJobsAdapter(oauth2Client, 'user-1')
    await adapter.initialize()

    await expect(adapter.getJob('job-1')).resolves.toBeNull()
  })
})

describe('calendar collection - one unreadable event does not fail the list', () => {
  it('returns the readable events and skips the editors file', async () => {
    eventFiles = [
      { id: 'event-good', name: 'Standup.event.json', mimeType: JSON_MIME },
      { id: 'event-bad', name: 'Broken.event.json', mimeType: JSON_MIME },
      { id: 'doc-1', name: 'Retro notes', mimeType: EDITORS_DOC },
    ]
    media = {
      'event-good': JSON.stringify({
        id: 'event-1',
        title: 'Standup',
        startDate: '2026-01-01T09:00:00.000Z',
        endDate: '2026-01-01T09:15:00.000Z',
        isAllDay: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    }
    mediaErrors = { 'event-bad': editors403() }

    const adapter = new GoogleDriveCalendarAdapter(oauth2Client, 'user-1')
    await adapter.initialize()

    const events = await adapter.listEvents()

    expect(events.map((event) => event.id)).toEqual(['event-1'])
    const query = queryWith('.event.json')
    expect(query).toContain("name contains '.event.json'")
    expect(query).toContain(`mimeType='${JSON_MIME}'`)
    expect(mediaDownloads().map((p) => p.fileId)).toEqual(['event-good', 'event-bad'])
  })
})

describe('categories collection - the metadata read is constrained and skippable', () => {
  it('drops the category whose _category.json is actually a Google Doc', async () => {
    folderListResult = [
      { id: 'cat-a', name: 'A', mimeType: EDITORS_FOLDER },
      { id: 'cat-b', name: 'B', mimeType: EDITORS_FOLDER },
    ]
    categoryMetaByFolder = {
      'cat-a': [
        { id: 'meta-doc', name: '_category.json', mimeType: EDITORS_DOC, parents: ['cat-a'] },
      ],
      'cat-b': [
        { id: 'meta-b', name: '_category.json', mimeType: JSON_MIME, parents: ['cat-b'] },
      ],
    }
    media = {
      'meta-b': JSON.stringify({
        id: 'cat-b',
        name: 'B',
        color: '#000000',
        isSystem: false,
        level: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        children: [],
        _count: { contentItems: 0 },
      }),
    }

    const adapter = new GoogleDriveCategoriesAdapter(oauth2Client, 'user-1')
    await adapter.initialize('vault-1')

    const categories = await adapter.listCategories()

    expect(categories.map((category) => category.id)).toEqual(['cat-b'])
    const query = queryWith("name='_category.json'")
    expect(query).toContain(`mimeType='${JSON_MIME}'`)
    // The Google Doc named _category.json is refused before alt=media is issued.
    expect(mediaDownloads().map((p) => p.fileId)).toEqual(['meta-b'])
  })
})

describe('the editors-file guard itself', () => {
  it('classifies the whole application/vnd.google-apps namespace, folders included', () => {
    expect(isEditorsFileMimeType(EDITORS_DOC)).toBe(true)
    expect(isEditorsFileMimeType(EDITORS_FOLDER)).toBe(true)
    expect(isEditorsFileMimeType('application/vnd.google-apps.spreadsheet')).toBe(true)
    expect(isEditorsFileMimeType(MARKDOWN)).toBe(false)
    expect(isEditorsFileMimeType(JSON_MIME)).toBe(false)
    expect(isEditorsFileMimeType(undefined)).toBe(false)
  })

  it('throws without issuing any request when the caller already knows the mime', async () => {
    const backend = new GoogleDriveBackendService(oauth2Client, 'user-1')

    await expect(backend.readMarkdownContent('doc-1', EDITORS_DOC)).rejects.toThrow(
      /Refusing to download a Google Docs editors file/
    )
    expect(mockDrive.files.get).not.toHaveBeenCalled()
  })

  it('establishes the mime with a metadata get - never with alt=media - when it is unknown', async () => {
    mimeById = { 'doc-2': EDITORS_DOC }
    const backend = new GoogleDriveBackendService(oauth2Client, 'user-1')

    await expect(backend.readMarkdownContent('doc-2')).rejects.toThrow(
      /Refusing to download a Google Docs editors file/
    )

    const calls = mockDrive.files.get.mock.calls.map((call) => call[0] as Params)
    expect(calls).toEqual([{ fileId: 'doc-2', fields: 'id, mimeType' }])
    expect(mediaDownloads()).toEqual([])
  })

  it('still reads a normal markdown file', async () => {
    media = { 'md-good': markdownFixture }
    const backend = new GoogleDriveBackendService(oauth2Client, 'user-1')

    const { metadata, content } = await backend.readMarkdownContent('md-good', MARKDOWN)

    expect(metadata.title).toBe('Good')
    expect(content).toBe('The body the app wrote.')
    expect(mediaDownloads()).toEqual([{ fileId: 'md-good', alt: 'media' }])
  })
})
