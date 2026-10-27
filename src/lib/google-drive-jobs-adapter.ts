import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { isAppOwnedFile, readDriveMediaText } from './google-drive-media'

export interface JobData {
  id: string
  title: string
  company: string
  description?: string
  status: 'applied' | 'rejected' | 'interview' | 'offered' | 'accepted' | 'declined'
  salary?: string
  location?: string
  url?: string
  dateApplied: Date
  dateDeadline?: Date
  notes?: string
  tags?: string[]
  createdAt: Date
  updatedAt: Date
}

export class GoogleDriveJobsAdapter {
  private drive: any
  private oauth2Client: OAuth2Client
  private userId: string
  private vaultFolderId: string | null = null
  private jobsFolderId: string | null = null

  constructor(oauth2Client: OAuth2Client, userId: string) {
    this.oauth2Client = oauth2Client
    this.drive = google.drive({ version: 'v3', auth: oauth2Client })
    this.userId = userId
  }

  async initialize(vaultFolderId?: string) {
    if (vaultFolderId) {
      this.vaultFolderId = vaultFolderId
    } else {
      const vaultFolder = await this.findFolderByName('Vault', null)
      if (!vaultFolder) {
        throw new Error('Vault folder not found')
      }
      this.vaultFolderId = vaultFolder.id
    }

    const jobsFolder = await this.findOrCreateFolder('Jobs', this.vaultFolderId)
    this.jobsFolderId = jobsFolder.id
  }

  async listJobs(): Promise<JobData[]> {
    if (!this.jobsFolderId) {
      throw new Error('Adapter not initialized')
    }

    try {
      // T092: only the app's own job sidecars are jobs. Matching by name suffix keeps the existing
      // `.job.json` naming contract, `mimeType='application/json'` keeps every Google Docs editors
      // file out of the collection - those have no binary content, so reading one with alt=media can
      // only return 403 fileNotDownloadable.
      const response = await this.drive.files.list({
        q: `'${this.jobsFolderId}' in parents and name contains '.job.json' and mimeType='application/json' and trashed=false`,
        spaces: 'drive',
        fields: 'files(id, name, mimeType)',
        pageSize: 100
      })

      const jobs: JobData[] = []
      for (const file of (response.data.files || []).filter(isAppOwnedFile)) {
        const job = await this.readJobData(file.id, file.mimeType)
        if (job) {
          jobs.push(job)
        }
      }

      return jobs.sort((a, b) => new Date(b.dateApplied).getTime() - new Date(a.dateApplied).getTime())
    } catch (error) {
      console.error('Error listing jobs:', error)
      throw error
    }
  }

  async createJob(
    title: string,
    company: string,
    description?: string,
    status?: string,
    salary?: string,
    location?: string,
    url?: string,
    dateDeadline?: Date,
    notes?: string,
    tags?: string[]
  ): Promise<JobData> {
    if (!this.jobsFolderId) {
      throw new Error('Adapter not initialized')
    }

    try {
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      const job: JobData = {
        id: jobId,
        title,
        company,
        description,
        status: (status || 'applied') as any,
        salary,
        location,
        url,
        dateApplied: new Date(),
        dateDeadline,
        notes,
        tags,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const fileName = `${company}_${title}.job.json`
      await this.drive.files.create({
        resource: {
          name: fileName,
          mimeType: 'application/json',
          parents: [this.jobsFolderId]
        },
        media: {
          mimeType: 'application/json',
          body: JSON.stringify(job, null, 2)
        },
        fields: 'id'
      })

      return job
    } catch (error) {
      console.error('Error creating job:', error)
      throw error
    }
  }

  async getJob(jobId: string): Promise<JobData | null> {
    try {
      const response = await this.drive.files.list({
        q: `'${this.jobsFolderId}' in parents and name contains '.job.json' and mimeType='application/json' and trashed=false`,
        spaces: 'drive',
        fields: 'files(id, name, mimeType)',
        pageSize: 100
      })

      for (const file of (response.data.files || []).filter(isAppOwnedFile)) {
        const job = await this.readJobData(file.id, file.mimeType)
        if (job && job.id === jobId) {
          return job
        }
      }

      return null
    } catch (error) {
      console.error('Error getting job:', error)
      return null
    }
  }

  async updateJob(jobId: string, updates: Partial<JobData>): Promise<JobData> {
    try {
      const job = await this.getJob(jobId)
      if (!job) {
        throw new Error('Job not found')
      }

      const updated: JobData = {
        ...job,
        ...updates,
        updatedAt: new Date()
      }

      // Find file
      const response = await this.drive.files.list({
        q: `'${this.jobsFolderId}' in parents and name contains '.job.json' and mimeType='application/json' and trashed=false`,
        spaces: 'drive',
        fields: 'files(id, name, mimeType)',
        pageSize: 100
      })

      let fileId: string | null = null
      for (const file of (response.data.files || []).filter(isAppOwnedFile)) {
        const data = await this.readJobData(file.id, file.mimeType)
        if (data && data.id === jobId) {
          fileId = file.id
          break
        }
      }

      if (!fileId) {
        throw new Error('Job file not found')
      }

      // Update filename if company/title changed
      const newFileName = `${updated.company}_${updated.title}.job.json`
      await this.drive.files.update({
        fileId,
        resource: { name: newFileName },
        media: {
          mimeType: 'application/json',
          body: JSON.stringify(updated, null, 2)
        }
      })

      return updated
    } catch (error) {
      console.error('Error updating job:', error)
      throw error
    }
  }

  async deleteJob(jobId: string): Promise<boolean> {
    try {
      const job = await this.getJob(jobId)
      if (!job) {
        throw new Error('Job not found')
      }

      const response = await this.drive.files.list({
        q: `'${this.jobsFolderId}' in parents and name contains '.job.json' and mimeType='application/json' and trashed=false`,
        spaces: 'drive',
        fields: 'files(id, name, mimeType)',
        pageSize: 100
      })

      for (const file of (response.data.files || []).filter(isAppOwnedFile)) {
        const job = await this.readJobData(file.id, file.mimeType)
        if (job && job.id === jobId) {
          await this.drive.files.update({
            fileId: file.id,
            resource: { trashed: true }
          })
          return true
        }
      }

      throw new Error('Job file not found')
    } catch (error) {
      console.error('Error deleting job:', error)
      throw error
    }
  }

  /**
   * T092 failure boundary: any read failure (refused editors file, 403, corrupt JSON) returns null
   * instead of throwing, and every caller (`listJobs`, `getJob`, `updateJob`, `deleteJob`) skips a
   * null. A collection therefore loses the unreadable item and keeps the rest; it never fails.
   */
  private async readJobData(fileId: string, mimeType?: string | null): Promise<JobData | null> {
    try {
      const body = await readDriveMediaText(this.drive, fileId, mimeType)

      return JSON.parse(body) as JobData
    } catch (error) {
      console.error('Error reading job data:', error)
      return null
    }
  }

  private async findOrCreateFolder(
    folderName: string,
    parentFolderId: string
  ): Promise<{ id: string; name: string }> {
    try {
      const query = `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed=false`

      const response = await this.drive.files.list({
        q: query,
        spaces: 'drive',
        fields: 'files(id, name)',
        pageSize: 1
      })

      if (response.data.files && response.data.files.length > 0) {
        return response.data.files[0]
      }

      const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId]
      }

      const createResponse = await this.drive.files.create({
        resource: fileMetadata,
        fields: 'id, name'
      })

      return createResponse.data
    } catch (error) {
      console.error('Error finding or creating folder:', error)
      throw error
    }
  }

  private async findFolderByName(
    folderName: string,
    parentFolderId: string | null
  ): Promise<{ id: string; name: string } | null> {
    try {
      let query = `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
      if (parentFolderId) {
        query += ` and '${parentFolderId}' in parents`
      }

      const response = await this.drive.files.list({
        q: query,
        spaces: 'drive',
        fields: 'files(id, name)',
        pageSize: 1
      })

      if (response.data.files && response.data.files.length > 0) {
        return response.data.files[0]
      }

      return null
    } catch (error) {
      console.error('Error finding folder:', error)
      return null
    }
  }
}
