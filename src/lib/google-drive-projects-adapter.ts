import { OAuth2Client } from 'google-auth-library'
import { google } from 'googleapis'

export interface Project {
  id: string
  title: string
  description?: string
  content?: string
  startDate?: string
  endDate?: string
  status?: 'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED'
  priority?: 'LOW' | 'MEDIUM' | 'HIGH'
  progress?: number
  archived?: boolean
  createdAt: string
  updatedAt: string
  tasks?: any[]
  milestones?: any[]
}

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const PROJECT_FILE_NAME = 'project.json'

/** A `project.json` record and the project folder that holds it (`null` for the flat layout). */
interface ProjectRecordFile {
  fileId: string
  folderId: string | null
}

/** Escape a value for a Drive `q` string literal. */
function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/** A `project.json` body is a JSON object; arrays and primitives are not records. */
function isProjectRecord(value: unknown): value is Project {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parse a `project.json` body into a project, or `null` when it cannot be one.
 *
 * Media reads ask for `responseType: 'text'`, so the body normally arrives as a string. A client
 * version that ignores the option may hand back an already-parsed object, which `JSON.parse`
 * would coerce to `"[object Object]"` and throw on - both shapes are therefore accepted here.
 * Malformed JSON, arrays and primitives are `null`, so one bad record can be skipped instead of
 * failing the whole collection.
 */
function parseProjectRecord(body: unknown): Project | null {
  if (typeof body === 'string') {
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      return null
    }
    return isProjectRecord(parsed) ? parsed : null
  }

  return isProjectRecord(body) ? body : null
}

export class GoogleDriveProjectsAdapter {
  private drive: any
  private projectsFolderId: string = ''

  constructor(oauth2Client: OAuth2Client) {
    this.drive = google.drive({ version: 'v3', auth: oauth2Client })
  }

  async initialize() {
    await this.ensureProjectsFolder()
  }

  private async ensureProjectsFolder() {
    try {
      const folders = await this.drive.files.list({
        q: "name='Projects' and mimeType='application/vnd.google-apps.folder' and trashed=false",
        spaces: 'drive',
        fields: 'files(id)',
        pageSize: 1,
      })

      if (folders.data.files && folders.data.files.length > 0) {
        this.projectsFolderId = folders.data.files[0].id
      } else {
        // Create Projects folder
        const folder = await this.drive.files.create({
          resource: { name: 'Projects', mimeType: 'application/vnd.google-apps.folder' },
          fields: 'id',
        })
        this.projectsFolderId = folder.data.id
      }
    } catch (error) {
      console.error('Error ensuring Projects folder:', error)
      throw error
    }
  }

  /**
   * Read one `project.json` body.
   *
   * `responseType: 'text'` keeps the body a string so `JSON.parse` never receives the object the
   * client would otherwise hand back for an `application/json` response.
   */
  private async readProjectRecord(fileId: string): Promise<Project | null> {
    const content = await this.drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'text' }
    )

    return parseProjectRecord(content.data)
  }

  /**
   * `createProject` writes one FOLDER per project and puts `project.json` INSIDE it, while Drive's
   * `files.list` is not recursive: "project.json in Projects" only ever matched a record sitting
   * directly in `Vault/Projects`. The listing therefore walks the one level that exists, in waves
   * (as the content adapter does):
   *
   *   1. Projects' child folders AND its direct `project.json` files, in parallel - the legacy flat
   *      layout keeps listing.
   *   2. One `project.json` listing per child folder, in parallel.
   *
   * A folder whose listing fails is skipped, and an unreadable record is skipped below: one broken
   * project must never fail the whole collection.
   */
  async listProjects(): Promise<Project[]> {
    try {
      const records = await this.listProjectRecords()

      const projects = await Promise.all(
        records.map(async (record) => {
          try {
            const project = await this.readProjectRecord(record.fileId)
            if (!project) {
              console.error(
                `Skipping unreadable project ${record.fileId}:`,
                new Error('project.json body is not a JSON object')
              )
              return null
            }
            return project
          } catch (error) {
            console.error(`Skipping unreadable project ${record.fileId}:`, error)
            return null
          }
        })
      )

      return projects
        .filter((project): project is Project => project !== null)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    } catch (error) {
      console.error('Error listing projects:', error)
      throw error
    }
  }

  /** Wave 1: the child folders of Projects and its direct `project.json` files, in parallel. */
  private async listProjectRecords(): Promise<ProjectRecordFile[]> {
    const [childFolders, flatFileIds] = await Promise.all([
      this.listChildFolders(),
      this.listProjectFileIdsIn(this.projectsFolderId),
    ])

    // Wave 2: the record inside each project folder, all folders queried in parallel.
    const nested = await Promise.all(
      childFolders.map(async (folder) => {
        try {
          const fileIds = await this.listProjectFileIdsIn(folder.id)
          return fileIds.map((fileId) => ({ fileId, folderId: folder.id }))
        } catch (error) {
          console.error(`Skipping unlistable project folder ${folder.id}:`, error)
          return [] as ProjectRecordFile[]
        }
      })
    )

    return [
      ...flatFileIds.map((fileId) => ({ fileId, folderId: null })),
      ...nested.flat(),
    ]
  }

  private async listChildFolders(): Promise<Array<{ id: string; name: string }>> {
    const response = await this.drive.files.list({
      q: `'${this.projectsFolderId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name)',
      pageSize: 100,
    })

    return ((response.data.files ?? []) as Array<{ id: string; name: string }>).map((folder) => ({
      id: folder.id,
      name: folder.name,
    }))
  }

  private async listProjectFileIdsIn(folderId: string): Promise<string[]> {
    const response = await this.drive.files.list({
      q: `'${folderId}' in parents and name='${PROJECT_FILE_NAME}' and trashed=false`,
      spaces: 'drive',
      fields: 'files(id)',
      pageSize: 100,
    })

    return ((response.data.files ?? []) as Array<{ id: string }>).map((file) => file.id)
  }

  /**
   * Locate the `project.json` that holds `projectId`.
   *
   * `createProject` stamps `projectId` on the project's FOLDER and on the record inside it, so the
   * property query has to run at both levels: on Projects' children (today's folder layout) and on
   * Projects itself (the legacy flat record). Wave 2 then asks the matched folder for its record.
   */
  private async findProjectRecordFile(projectId: string): Promise<ProjectRecordFile | null> {
    const propertyFilter = `properties has { key='projectId' and value='${escapeQueryValue(projectId)}' }`

    const owners = await this.drive.files.list({
      q: `'${this.projectsFolderId}' in parents and ${propertyFilter} and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name, mimeType)',
      pageSize: 10,
    })

    const candidates = (owners.data.files ?? []) as Array<{
      id: string
      name?: string
      mimeType?: string
    }>

    // The folder is today's layout; a folder without a record is not a project.
    for (const candidate of candidates) {
      if (candidate.mimeType !== FOLDER_MIME) continue
      const fileIds = await this.listProjectFileIdsIn(candidate.id)
      if (fileIds.length > 0) {
        return { fileId: fileIds[0], folderId: candidate.id }
      }
    }

    // The legacy layout: `project.json` directly inside Projects.
    const flat = candidates.find(
      (candidate) => candidate.mimeType !== FOLDER_MIME && candidate.name === PROJECT_FILE_NAME
    )
    if (flat) return { fileId: flat.id, folderId: null }

    return null
  }

  async getProject(projectId: string): Promise<Project | null> {
    try {
      const record = await this.findProjectRecordFile(projectId)
      if (!record) {
        return null
      }

      const project = await this.readProjectRecord(record.fileId)
      if (!project) {
        throw new Error(`Project record is not a JSON object: ${record.fileId}`)
      }

      return project
    } catch (error) {
      console.error('Error getting project:', error)
      throw error
    }
  }

  async createProject(projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    try {
      const id = `proj_${Date.now()}`
      const now = new Date().toISOString()

      const project: Project = {
        ...projectData,
        id,
        createdAt: now,
        updatedAt: now,
        status: projectData.status || 'PLANNING',
        priority: projectData.priority || 'MEDIUM',
        progress: projectData.progress || 0,
        archived: projectData.archived || false,
      }

      const folderName = projectData.title.replace(/[^a-zA-Z0-9-]/g, '_')
      const folder = await this.drive.files.create({
        resource: {
          name: folderName,
          mimeType: FOLDER_MIME,
          parents: [this.projectsFolderId],
          properties: { projectId: id },
        },
        fields: 'id',
      })

      // Write project.json
      await this.drive.files.create({
        resource: {
          name: PROJECT_FILE_NAME,
          parents: [folder.data.id],
          properties: { projectId: id },
        },
        media: {
          mimeType: 'application/json',
          body: JSON.stringify(project),
        },
        fields: 'id',
      })

      return project
    } catch (error) {
      console.error('Error creating project:', error)
      throw error
    }
  }

  async updateProject(projectId: string, updates: Partial<Project>): Promise<Project> {
    try {
      const existing = await this.getProject(projectId)
      if (!existing) {
        throw new Error('Project not found')
      }

      const updated: Project = {
        ...existing,
        ...updates,
        id: projectId,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      }

      // Same resolution as `getProject`: the record lives in the project's folder (or, for a
      // legacy project, directly in Projects). Using the matched owner id as the file id would
      // look for `project.json` inside a FILE.
      const record = await this.findProjectRecordFile(projectId)
      if (!record) {
        throw new Error('Project record not found')
      }

      await this.drive.files.update({
        fileId: record.fileId,
        media: {
          mimeType: 'application/json',
          body: JSON.stringify(updated),
        },
      })

      return updated
    } catch (error) {
      console.error('Error updating project:', error)
      throw error
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    try {
      const record = await this.findProjectRecordFile(projectId)
      if (!record) {
        return
      }

      // Trash the project's folder (soft delete) - or the flat record for a legacy project.
      await this.drive.files.update({
        fileId: record.folderId ?? record.fileId,
        resource: { trashed: true },
      })
    } catch (error) {
      console.error('Error deleting project:', error)
      throw error
    }
  }
}
