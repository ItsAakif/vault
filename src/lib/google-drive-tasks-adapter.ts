import { OAuth2Client } from 'google-auth-library'
import { google } from 'googleapis'

export interface Task {
  id: string
  title: string
  description?: string
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  dueDate?: string
  startDate?: string
  estimatedHours?: number
  actualHours?: number
  projectId?: string
  parentTaskId?: string
  tags?: string[]
  assigneeId?: string
  createdAt: string
  updatedAt: string
  dependencies?: string[]
  subtasks?: Task[]
}

export class GoogleDriveTasksAdapter {
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
      }
    } catch (error) {
      console.error('Error ensuring Projects folder:', error)
      throw error
    }
  }

  async listProjectTasks(projectId: string): Promise<Task[]> {
    try {
      const projectFolder = await this.getProjectFolder(projectId)
      if (!projectFolder) return []

      const files = await this.drive.files.list({
        q: `'${projectFolder}' in parents and name='tasks.json' and trashed=false`,
        spaces: 'drive',
        fields: 'files(id)',
        pageSize: 1,
      })

      if (!files.data.files || files.data.files.length === 0) {
        return []
      }

      const content = await this.drive.files.get({
        fileId: files.data.files[0].id,
        alt: 'media',
      })

      const tasksData = JSON.parse(content.data)
      return (tasksData.tasks || []).sort(
        (a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    } catch (error) {
      console.error('Error listing tasks:', error)
      throw error
    }
  }

  async getTask(projectId: string, taskId: string): Promise<Task | null> {
    try {
      const tasks = await this.listProjectTasks(projectId)
      return tasks.find(t => t.id === taskId) || null
    } catch (error) {
      console.error('Error getting task:', error)
      throw error
    }
  }

  async createTask(projectId: string, taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    try {
      const projectFolder = await this.getProjectFolder(projectId)
      if (!projectFolder) {
        throw new Error('Project folder not found')
      }

      const tasks = await this.listProjectTasks(projectId)
      const id = `task_${Date.now()}`
      const now = new Date().toISOString()

      const newTask: Task = {
        ...taskData,
        id,
        projectId,
        createdAt: now,
        updatedAt: now,
        status: taskData.status || 'TODO',
        priority: taskData.priority || 'MEDIUM',
      }

      tasks.push(newTask)

      await this.saveTasksFile(projectFolder, { tasks })

      return newTask
    } catch (error) {
      console.error('Error creating task:', error)
      throw error
    }
  }

  async updateTask(projectId: string, taskId: string, updates: Partial<Task>): Promise<Task> {
    try {
      const projectFolder = await this.getProjectFolder(projectId)
      if (!projectFolder) {
        throw new Error('Project folder not found')
      }

      const tasks = await this.listProjectTasks(projectId)
      const taskIndex = tasks.findIndex(t => t.id === taskId)

      if (taskIndex === -1) {
        throw new Error('Task not found')
      }

      const updated: Task = {
        ...tasks[taskIndex],
        ...updates,
        id: taskId,
        projectId,
        createdAt: tasks[taskIndex].createdAt,
        updatedAt: new Date().toISOString(),
      }

      tasks[taskIndex] = updated

      await this.saveTasksFile(projectFolder, { tasks })

      return updated
    } catch (error) {
      console.error('Error updating task:', error)
      throw error
    }
  }

  async deleteTask(projectId: string, taskId: string): Promise<void> {
    try {
      const projectFolder = await this.getProjectFolder(projectId)
      if (!projectFolder) {
        throw new Error('Project folder not found')
      }

      let tasks = await this.listProjectTasks(projectId)
      tasks = tasks.filter(t => t.id !== taskId && t.parentTaskId !== taskId)

      await this.saveTasksFile(projectFolder, { tasks })
    } catch (error) {
      console.error('Error deleting task:', error)
      throw error
    }
  }

  async createSubtask(projectId: string, parentTaskId: string, taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'projectId'>): Promise<Task> {
    try {
      const projectFolder = await this.getProjectFolder(projectId)
      if (!projectFolder) {
        throw new Error('Project folder not found')
      }

      const tasks = await this.listProjectTasks(projectId)
      const id = `task_${Date.now()}`
      const now = new Date().toISOString()

      const subtask: Task = {
        ...taskData,
        id,
        projectId,
        parentTaskId,
        createdAt: now,
        updatedAt: now,
        status: taskData.status || 'TODO',
        priority: taskData.priority || 'MEDIUM',
      }

      tasks.push(subtask)

      await this.saveTasksFile(projectFolder, { tasks })

      return subtask
    } catch (error) {
      console.error('Error creating subtask:', error)
      throw error
    }
  }

  private async getProjectFolder(projectId: string): Promise<string | null> {
    try {
      const folders = await this.drive.files.list({
        q: `'${this.projectsFolderId}' in parents and properties has { key='projectId' and value='${projectId}' } and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        spaces: 'drive',
        fields: 'files(id)',
        pageSize: 1,
      })

      if (folders.data.files && folders.data.files.length > 0) {
        return folders.data.files[0].id
      }

      return null
    } catch (error) {
      console.error('Error getting project folder:', error)
      return null
    }
  }

  private async saveTasksFile(projectFolderId: string, data: any) {
    try {
      const files = await this.drive.files.list({
        q: `'${projectFolderId}' in parents and name='tasks.json' and trashed=false`,
        spaces: 'drive',
        fields: 'files(id)',
        pageSize: 1,
      })

      const fileContent = JSON.stringify(data)

      if (files.data.files && files.data.files.length > 0) {
        // Update existing file
        await this.drive.files.update({
          fileId: files.data.files[0].id,
          media: {
            mimeType: 'application/json',
            body: fileContent,
          },
        })
      } else {
        // Create new file
        await this.drive.files.create({
          resource: {
            name: 'tasks.json',
            parents: [projectFolderId],
          },
          media: {
            mimeType: 'application/json',
            body: fileContent,
          },
          fields: 'id',
        })
      }
    } catch (error) {
      console.error('Error saving tasks file:', error)
      throw error
    }
  }
}
