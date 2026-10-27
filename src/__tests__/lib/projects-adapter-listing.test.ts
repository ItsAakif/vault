// @vitest-environment node
/**
 * The bug this pins: `POST /api/projects` succeeded - `createProject` writes a FOLDER per project
 * and `project.json` INSIDE it - but `GET /api/projects` answered `{ success: true, data: [] }`,
 * because `listProjects` asked Drive for `'<Projects>' in parents and name='project.json'`, which
 * only matches a record sitting directly in `Vault/Projects`. `files.list` is not recursive.
 *
 * The assertions are on the QUERIES as well as the results, because a listing that returns the
 * right rows by accident (reading every file in the account) is not the fix: one wave for the
 * folders plus one flat `project.json` query, then one `project.json` query per folder.
 *
 * `getProject` and `updateProject` shared the same flat-parent assumption (`properties has
 * { key='projectId' ... }` directly under Projects), so they are pinned here too.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { OAuth2Client } from 'google-auth-library'
import { GoogleDriveProjectsAdapter } from '@/lib/google-drive-projects-adapter'
import type { Project } from '@/lib/google-drive-projects-adapter'

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const PROJECTS_ID = 'projects-folder'

interface MockFolder {
  id: string
  name: string
  mimeType: string
  parentId: string | null
  properties?: Record<string, string>
}

interface MockFile {
  id: string
  name: string
  mimeType: string
  parentId: string | null
  /** What `files.get` hands back: a raw body string, or an already-parsed object. */
  body?: unknown
  properties?: Record<string, string>
}

type Params = {
  q?: string
  fields?: string
  fileId?: string
  alt?: string
  pageSize?: number
  resource?: {
    name?: string
    mimeType?: string
    parents?: string[]
    properties?: Record<string, string>
    trashed?: boolean
  }
  media?: { mimeType?: string; body?: string }
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

let folders: MockFolder[] = []
let files: MockFile[] = []
let listCalls: Array<{ q: string; fields: string }> = []
let nextId = 0

function addFolder(folder: Omit<MockFolder, 'mimeType'>): MockFolder {
  const entry: MockFolder = { ...folder, mimeType: FOLDER_MIME }
  folders.push(entry)
  return entry
}

function addFlatProject(id: string, body: unknown, properties?: Record<string, string>): MockFile {
  const file: MockFile = {
    id,
    name: 'project.json',
    mimeType: 'application/json',
    parentId: PROJECTS_ID,
    body,
    properties,
  }
  files.push(file)
  return file
}

function sampleProject(id: string, title: string, updatedAt = '2026-01-02T00:00:00.000Z') {
  return {
    id,
    title,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
    status: 'PLANNING',
    priority: 'MEDIUM',
    progress: 0,
    archived: false,
  }
}

/** `'a' in parents or 'b' in parents` -> ['a', 'b'] */
function parentIdsFrom(q: string): string[] {
  return Array.from(q.matchAll(/'([^']+)' in parents/g)).map((match) => match[1])
}

/**
 * A Drive `files.list` that honours the parts of `q` this adapter actually builds: parent,
 * folder mime type, name, and the `properties has` filter. Nothing else is guessed, so a query
 * that asks the wrong folder or shape returns nothing - which is exactly the production symptom.
 */
function listResult(params: Params): { data: { files: Array<Record<string, unknown>> } } {
  const q = params.q ?? ''
  listCalls.push({ q, fields: params.fields ?? '' })

  let entries: Array<MockFolder | MockFile> = [...folders, ...files]

  const parentIds = parentIdsFrom(q)
  if (parentIds.length > 0) {
    entries = entries.filter(
      (entry) => entry.parentId !== null && parentIds.includes(entry.parentId)
    )
  }

  if (q.includes(`mimeType='${FOLDER_MIME}'`)) {
    entries = entries.filter((entry) => entry.mimeType === FOLDER_MIME)
  }

  const name = /name='([^'\\]*)'/.exec(q)
  if (name) {
    entries = entries.filter((entry) => entry.name === name[1])
  }

  if (q.includes('properties has')) {
    const value = /value='([^'\\]*)'/.exec(q)?.[1]
    entries = entries.filter(
      (entry) => value !== undefined && entry.properties?.projectId === value
    )
  }

  return { data: { files: entries.map((entry) => ({ id: entry.id, name: entry.name, mimeType: entry.mimeType })) } }
}

function getResult(params: Params): { data: unknown } {
  const file = files.find((candidate) => candidate.id === params.fileId)
  if (!file || file.body === undefined) {
    throw new Error(JSON.stringify({ error: { code: 404, message: `File not found: ${params.fileId}` } }))
  }
  return { data: file.body }
}

function createResult(params: Params): { data: { id: string } } {
  const resource = params.resource ?? {}
  const parentId = resource.parents?.[0] ?? null

  if (resource.mimeType === FOLDER_MIME) {
    const folder = addFolder({
      id: `created-folder-${nextId++}`,
      name: resource.name ?? '',
      parentId,
      properties: resource.properties,
    })
    return { data: { id: folder.id } }
  }

  const file: MockFile = {
    id: `created-file-${nextId++}`,
    name: resource.name ?? '',
    mimeType: resource.mimeType ?? params.media?.mimeType ?? 'application/json',
    parentId,
    body: params.media?.body,
    properties: resource.properties,
  }
  files.push(file)
  return { data: { id: file.id } }
}

function updateResult(params: Params): { data: { id: string } } {
  const file = files.find((candidate) => candidate.id === params.fileId)
  if (!file) throw new Error(`No file ${params.fileId}`)

  if (typeof params.media?.body === 'string') {
    file.body = params.media.body
  }
  // A trashed file disappears from subsequent listings, as it does in Drive.
  if (params.resource?.trashed) {
    files = files.filter((candidate) => candidate.id !== file.id)
    folders = folders.filter((candidate) => candidate.id !== file.id)
  }

  return { data: { id: file.id } }
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  folders = []
  files = []
  listCalls = []
  nextId = 0

  mockDrive.files.list.mockReset()
  mockDrive.files.get.mockReset()
  mockDrive.files.create.mockReset()
  mockDrive.files.update.mockReset()
  mockDrive.files.delete.mockReset()

  mockDrive.files.list.mockImplementation(async (params: Params) => listResult(params))
  mockDrive.files.get.mockImplementation(async (params: Params) => getResult(params))
  mockDrive.files.create.mockImplementation(async (params: Params) => createResult(params))
  mockDrive.files.update.mockImplementation(async (params: Params) => updateResult(params))
  mockDrive.files.delete.mockImplementation(async () => ({ data: '' }))

  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

  // The vault this adapter expects to find: `Vault/Projects`.
  addFolder({ id: PROJECTS_ID, name: 'Projects', parentId: 'vault-folder' })
})

afterEach(() => {
  consoleError.mockRestore()
})

async function warmAdapter(): Promise<GoogleDriveProjectsAdapter> {
  const adapter = new GoogleDriveProjectsAdapter(new OAuth2Client('client-id', 'client-secret'))
  await adapter.initialize()
  return adapter
}

/** Projects' direct children, i.e. everything the listing asks for in its first wave. */
function directChildrenQueries(): Array<{ q: string; fields: string }> {
  return listCalls.filter((call) => call.q.includes(`'${PROJECTS_ID}' in parents`))
}

describe('listProjects finds the per-project folders createProject writes', () => {
  it('lists three created projects, one wave for the folders and one query per project', async () => {
    const adapter = await warmAdapter()

    const created: Project[] = []
    for (const title of ['Alpha', 'Bravo', 'Charlie']) {
      created.push(await adapter.createProject({ title }))
    }

    listCalls = []
    const projects = await adapter.listProjects()

    expect(projects.map((project) => project.title).sort()).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(projects.map((project) => project.id).sort()).toEqual(created.map((project) => project.id).sort())

    // ---- the query shape ----------------------------------------------------------------
    // Wave 1 is exactly two queries against Projects: its child folders, and the flat
    // `project.json` files (the legacy layout). Nothing recursive is asked of Drive.
    expect(directChildrenQueries()).toHaveLength(2)

    const folderWave = directChildrenQueries().find((call) =>
      call.q.includes(`mimeType='${FOLDER_MIME}'`)
    )
    const flatWave = directChildrenQueries().find((call) => call.q.includes("name='project.json'"))
    expect(folderWave).toBeDefined()
    expect(flatWave).toBeDefined()
    expect(folderWave?.q).not.toContain("name='")
    expect(folderWave?.q).toContain('trashed=false')
    expect(flatWave?.q).toContain('trashed=false')

    // Wave 2: one `project.json` listing inside each project folder.
    const nestedQueries = listCalls.filter(
      (call) => !call.q.includes(`'${PROJECTS_ID}' in parents`) && call.q.includes("name='project.json'")
    )
    expect(nestedQueries).toHaveLength(3)
    for (const folder of folders.filter((candidate) => candidate.parentId === PROJECTS_ID)) {
      expect(nestedQueries.some((call) => call.q.includes(`'${folder.id}' in parents`))).toBe(true)
    }

    // 2 + 3 listings, and one media read per record - the old code issued 1 listing and 0 rows.
    expect(listCalls).toHaveLength(5)
    expect(mockDrive.files.get).toHaveBeenCalledTimes(3)
    expect(mockDrive.files.get.mock.calls.every((call) => call[0].alt === 'media')).toBe(true)
  })

  it('keeps the legacy flat project.json visible', async () => {
    addFlatProject('flat-project', JSON.stringify(sampleProject('proj_flat', 'Flat project')))

    const adapter = await warmAdapter()
    const projects = await adapter.listProjects()

    expect(projects.map((project) => project.title)).toEqual(['Flat project'])
  })

  it('sorts by updatedAt and skips an unreadable record instead of failing the list', async () => {
    addFlatProject('older', JSON.stringify(sampleProject('proj_old', 'Older', '2026-01-01T00:00:00.000Z')))
    addFlatProject('newer', JSON.stringify(sampleProject('proj_new', 'Newer', '2026-03-01T00:00:00.000Z')))
    addFlatProject('broken', '{ this is not json')

    const adapter = await warmAdapter()
    const projects = await adapter.listProjects()

    // The two readable projects, newest first; the broken one is skipped, not propagated.
    expect(projects.map((project) => project.title)).toEqual(['Newer', 'Older'])
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Skipping unreadable project broken'),
      expect.anything()
    )
  })
})

describe('getProject and updateProject resolve the record inside the project folder', () => {
  it('opens and updates a project created by this adapter', async () => {
    const adapter = await warmAdapter()
    const created = await adapter.createProject({ title: 'Ship the launch' })

    const fetched = await adapter.getProject(created.id)
    expect(fetched?.title).toBe('Ship the launch')

    // The folder carries the projectId property; the record inside it is the file to write.
    const folder = folders.find((candidate) => candidate.properties?.projectId === created.id)
    expect(folder).toBeDefined()
    const record = files.find((candidate) => candidate.parentId === folder?.id)
    expect(record).toBeDefined()

    const updated = await adapter.updateProject(created.id, { title: 'Ship the launch, revised' })
    expect(updated.title).toBe('Ship the launch, revised')

    expect(mockDrive.files.update).toHaveBeenCalledTimes(1)
    expect(mockDrive.files.update.mock.calls[0][0].fileId).toBe(record?.id)
    // The write really landed on the record, so the next open sees it.
    expect((await adapter.getProject(created.id))?.title).toBe('Ship the launch, revised')
  })

  it('opens and updates the legacy flat record', async () => {
    addFlatProject(
      'flat-project',
      JSON.stringify(sampleProject('proj_flat', 'Flat project')),
      { projectId: 'proj_flat' }
    )

    const adapter = await warmAdapter()
    const fetched = await adapter.getProject('proj_flat')
    expect(fetched?.title).toBe('Flat project')

    await adapter.updateProject('proj_flat', { title: 'Flat project, revised' })

    expect(mockDrive.files.update.mock.calls[0][0].fileId).toBe('flat-project')
    expect((await adapter.getProject('proj_flat'))?.title).toBe('Flat project, revised')
  })

  it('answers null for an id nothing carries', async () => {
    const adapter = await warmAdapter()
    expect(await adapter.getProject('proj_missing')).toBeNull()
  })
})

/**
 * The bug this pins: the Drive client parses an `application/json` media response for you, so
 * `files.get({ alt: 'media' })` handed `listProjects` an OBJECT and `JSON.parse(object)` threw
 * `SyntaxError: "[object Object]" is not valid JSON` for every record - `GET /api/projects` kept
 * answering `[]`. Every media read now asks for text, and the parser accepts either shape.
 */
describe('project.json media reads survive both body shapes', () => {
  /** The options argument of every `files.get` call. */
  function getOptions(): Array<Record<string, unknown> | undefined> {
    return mockDrive.files.get.mock.calls.map(
      (call) => call[1] as Record<string, unknown> | undefined
    )
  }

  it('parses a record returned as a JSON string, and asks for text on every read', async () => {
    addFlatProject('string-project', JSON.stringify(sampleProject('proj_string', 'String body')))

    const adapter = await warmAdapter()
    const projects = await adapter.listProjects()

    expect(projects.map((project) => project.title)).toEqual(['String body'])
    expect(consoleError).not.toHaveBeenCalled()

    // The read that fixes the bug: `alt: 'media'` AND `responseType: 'text'`.
    expect(mockDrive.files.get).toHaveBeenCalledTimes(1)
    expect(mockDrive.files.get.mock.calls[0][0]).toMatchObject({
      fileId: 'string-project',
      alt: 'media',
    })
    expect(getOptions()[0]).toMatchObject({ responseType: 'text' })
  })

  it('lists a record the client already parsed into an object instead of throwing', async () => {
    // A client that ignores `responseType: 'text'` hands the object straight back.
    addFlatProject('object-project', sampleProject('proj_object', 'Object body'))

    const adapter = await warmAdapter()
    const projects = await adapter.listProjects()

    expect(projects.map((project) => project.title)).toEqual(['Object body'])
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('skips a malformed or non-object body, logs it, and still returns the readable records', async () => {
    addFlatProject('string-project', JSON.stringify(sampleProject('proj_a', 'Readable string')))
    addFlatProject('object-project', sampleProject('proj_b', 'Readable object'))
    addFlatProject('broken-json', '{ this is not json')
    addFlatProject('scalar-json', '42')
    addFlatProject('array-json', '[{"id":"proj_x"}]')

    const adapter = await warmAdapter()
    const projects = await adapter.listProjects()

    expect(projects.map((project) => project.title).sort()).toEqual([
      'Readable object',
      'Readable string',
    ])

    for (const fileId of ['broken-json', 'scalar-json', 'array-json']) {
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining(`Skipping unreadable project ${fileId}`),
        expect.anything()
      )
    }
  })

  it('applies the same text read to getProject and updateProject', async () => {
    addFlatProject('flat-project', JSON.stringify(sampleProject('proj_flat', 'Flat project')), {
      projectId: 'proj_flat',
    })

    const adapter = await warmAdapter()
    expect((await adapter.getProject('proj_flat'))?.title).toBe('Flat project')

    const updated = await adapter.updateProject('proj_flat', { title: 'Flat project, revised' })
    expect(updated.title).toBe('Flat project, revised')

    expect(mockDrive.files.get.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(mockDrive.files.get.mock.calls.every((call) => call[0].alt === 'media')).toBe(true)
    expect(
      getOptions().every((options) => options?.responseType === 'text')
    ).toBe(true)

    // And the object shape works on the single-record path too.
    files.find((file) => file.id === 'flat-project')!.body = sampleProject(
      'proj_flat',
      'Object record'
    )
    expect((await adapter.getProject('proj_flat'))?.title).toBe('Object record')
  })
})
