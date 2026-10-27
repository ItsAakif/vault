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

  async listProjects(): Promise<Project[]> {
    try {
      const files = await this.drive.files.list({
        q: `'${this.projectsFolderId}' in parents and name='project.json' and trashed=false`,
        spaces: 'drive',
        fields: 'files(id, name)',
        pageSize: 100,
      })

      const projects: Project[] = []
      if (files.data.files) {
        for (const file of files.data.files) {
          const content = await this.drive.files.get({
            fileId: file.id,
            alt: 'media',
          })
          const project = JSON.parse(content.data)
          projects.push(project)
        }
      }

      return projects.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    } catch (error) {
      console.error('Error listing projects:', error)
      throw error
    }
  }

  async getProject(projectId: string): Promise<Project | null> {
    try {
      const files = await this.drive.files.list({
        q: `'${this.projectsFolderId}' in parents and properties has { key='projectId' and value='${projectId}' } and trashed=false`,
        spaces: 'drive',
        fields: 'files(id)',
        pageSize: 1,
      })

      if (!files.data.files || files.data.files.length === 0) {
        return null
      }

      const fileId = files.data.files[0].id
      const content = await this.drive.files.get({
        fileId,
        alt: 'media',
      })

      return JSON.parse(content.data)
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
          mimeType: 'application/vnd.google-apps.folder',
          parents: [this.projectsFolderId],
          properties: { projectId: id },
        },
        fields: 'id',
      })

      // Write project.json
      await this.drive.files.create({
        resource: {
          name: 'project.json',
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

      const files = await this.drive.files.list({
        q: `'${this.projectsFolderId}' in parents and properties has { key='projectId' and value='${projectId}' } and trashed=false`,
        spaces: 'drive',
        fields: 'files(id)',
        pageSize: 1,
      })

      if (!files.data.files || files.data.files.length === 0) {
        throw new Error('Project folder not found')
      }

      const projectFolderId = files.data.files[0].id

      // Find and update project.json
      const projectFiles = await this.drive.files.list({
        q: `'${projectFolderId}' in parents and name='project.json' and trashed=false`,
        spaces: 'drive',
        fields: 'files(id)',
        pageSize: 1,
      })

      if (projectFiles.data.files && projectFiles.data.files.length > 0) {
        await this.drive.files.update({
          fileId: projectFiles.data.files[0].id,
          media: {
            mimeType: 'application/json',
            body: JSON.stringify(updated),
          },
        })
      }

      return updated
    } catch (error) {
      console.error('Error updating project:', error)
      throw error
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    try {
      const files = await this.drive.files.list({
        q: `'${this.projectsFolderId}' in parents and properties has { key='projectId' and value='${projectId}' } and trashed=false`,
        spaces: 'drive',
        fields: 'files(id)',
        pageSize: 1,
      })

      if (files.data.files && files.data.files.length > 0) {
        const projectFolderId = files.data.files[0].id
        // Trash the folder (soft delete)
        await this.drive.files.update({
          fileId: projectFolderId,
          resource: { trashed: true },
        })
      }
    } catch (error) {
      console.error('Error deleting project:', error)
      throw error
    }
  }
}
