import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'

export interface TagData {
  id: string
  name: string
  color?: string
  description?: string
  parentId?: string | null
  createdAt: Date
  updatedAt: Date
  children: TagData[]
  parent?: TagData | null
  _count: {
    contentItems: number
  }
}

/**
 * T060 / ADR-009 D1: same defect class as the categories adapter, latent.
 * `readTagMetadata` returns `JSON.parse(...) as TagData`, which the compiler
 * cannot check, so a stored `.tag.json` written before `children` existed
 * reaches `tag.children.length` and throws.
 */
function withTagDefaults(t: TagData): TagData {
  return {
    ...t,
    children: Array.isArray(t.children) ? t.children : [],
    _count: { contentItems: t._count?.contentItems ?? 0 }
  }
}

export class GoogleDriveTagsAdapter {
  private drive: any
  private oauth2Client: OAuth2Client
  private userId: string
  private vaultFolderId: string | null = null
  private tagsFolderId: string | null = null
  private tagFileMap: Map<string, string> = new Map() // tagId -> fileId

  constructor(oauth2Client: OAuth2Client, userId: string) {
    this.oauth2Client = oauth2Client
    this.drive = google.drive({ version: 'v3', auth: oauth2Client })
    this.userId = userId
  }

  async initialize(vaultFolderId?: string) {
    if (vaultFolderId) {
      this.vaultFolderId = vaultFolderId
    } else {
      // Find Vault folder
      const vaultFolder = await this.findFolderByName('Vault', null)
      if (!vaultFolder) {
        throw new Error('Vault folder not found')
      }
      this.vaultFolderId = vaultFolder.id
    }

    // Find or create Tags folder
    const tagsFolder = await this.findOrCreateFolder('Tags', this.vaultFolderId)
    this.tagsFolderId = tagsFolder.id
  }

  /**
   * Get all tags (flat list - relationships handled via parentId)
   */
  async listTags(includeUsage: boolean = false): Promise<TagData[]> {
    if (!this.tagsFolderId) {
      throw new Error('Adapter not initialized')
    }

    try {
      // List all .tag.json files in Tags folder
      const response = await this.drive.files.list({
        q: `'${this.tagsFolderId}' in parents and name~'\\.tag\\.json$' and trashed=false`,
        spaces: 'drive',
        fields: 'files(id, name, createdTime, modifiedTime)',
        pageSize: 100
      })

      const tags: TagData[] = []

      for (const file of response.data.files || []) {
        const tag = await this.readTagMetadata(file.id)
        if (tag) {
          tags.push(withTagDefaults(tag))
        }
      }

      // Sort: parent tags first, then by name
      return tags.sort((a, b) => {
        if ((a.parentId === null || a.parentId === undefined) !== 
            (b.parentId === null || b.parentId === undefined)) {
          return (a.parentId === null || a.parentId === undefined) ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })
    } catch (error) {
      console.error('Error listing tags:', error)
      throw error
    }
  }

  /**
   * Create a new tag
   */
  async createTag(
    name: string,
    color?: string,
    description?: string,
    parentId?: string | null
  ): Promise<TagData> {
    if (!this.tagsFolderId) {
      throw new Error('Adapter not initialized')
    }

    try {
      // Check for duplicate name at same level
      const existingTags = await this.listTags()
      const duplicate = existingTags.find(
        t => t.name.toLowerCase() === name.toLowerCase() && t.parentId === (parentId || null)
      )

      if (duplicate) {
        throw new Error(`Tag "${name}" already exists at this level`)
      }

      // Validate parent if provided
      if (parentId) {
        const parentTag = existingTags.find(t => t.id === parentId)
        if (!parentTag) {
          throw new Error(`Parent tag not found: ${parentId}`)
        }
      }

      const tagId = `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      const metadata: TagData = {
        id: tagId,
        name,
        color: color || '#8B5CF6',
        description,
        parentId: parentId || null,
        createdAt: new Date(),
        updatedAt: new Date(),
        children: [],
        _count: {
          contentItems: 0
        }
      }

      // Create tag file
      const fileName = `${name}.tag.json`
      await this.drive.files.create({
        resource: {
          name: fileName,
          mimeType: 'application/json',
          parents: [this.tagsFolderId]
        },
        media: {
          mimeType: 'application/json',
          body: JSON.stringify(metadata, null, 2)
        },
        fields: 'id'
      })

      // Store mapping
      this.tagFileMap.set(tagId, tagId)

      return withTagDefaults(metadata)
    } catch (error) {
      console.error('Error creating tag:', error)
      throw error
    }
  }

  /**
   * Update a tag
   */
  async updateTag(
    tagId: string,
    updates: Partial<TagData>
  ): Promise<TagData> {
    try {
      // Find tag by ID
      const allTags = await this.listTags()
      const tagIndex = allTags.findIndex(t => t.id === tagId)

      if (tagIndex === -1) {
        throw new Error('Tag not found')
      }

      const tag = allTags[tagIndex]
      const updated: TagData = {
        ...tag,
        ...updates,
        updatedAt: new Date()
      }

      // Find file by tag name (search for .tag.json file)
      const fileResponse = await this.drive.files.list({
        q: `'${this.tagsFolderId}' in parents and name='${tag.name}.tag.json' and trashed=false`,
        spaces: 'drive',
        fields: 'files(id)',
        pageSize: 1
      })

      if (!fileResponse.data.files || fileResponse.data.files.length === 0) {
        throw new Error('Tag file not found')
      }

      const fileId = fileResponse.data.files[0].id

      // Update name in filename if changed
      if (updates.name && updates.name !== tag.name) {
        await this.drive.files.update({
          fileId,
          resource: { name: `${updates.name}.tag.json` }
        })
      }

      // Update metadata file
      await this.drive.files.update({
        fileId,
        media: {
          mimeType: 'application/json',
          body: JSON.stringify(updated, null, 2)
        }
      })

      return withTagDefaults(updated)
    } catch (error) {
      console.error('Error updating tag:', error)
      throw error
    }
  }

  /**
   * Delete a tag
   */
  async deleteTag(tagId: string): Promise<boolean> {
    try {
      // Find tag
      const allTags = await this.listTags()
      const tag = allTags.find(t => t.id === tagId)

      if (!tag) {
        throw new Error('Tag not found')
      }

      // Check for child tags
      const childTags = allTags.filter(t => t.parentId === tagId)
      if (childTags.length > 0) {
        throw new Error('Cannot delete tag with child tags')
      }

      // Find file
      const fileResponse = await this.drive.files.list({
        q: `'${this.tagsFolderId}' in parents and name='${tag.name}.tag.json' and trashed=false`,
        spaces: 'drive',
        fields: 'files(id)',
        pageSize: 1
      })

      if (!fileResponse.data.files || fileResponse.data.files.length === 0) {
        throw new Error('Tag file not found')
      }

      const fileId = fileResponse.data.files[0].id

      // Move to trash
      await this.drive.files.update({
        fileId,
        resource: { trashed: true }
      })

      this.tagFileMap.delete(tagId)
      return true
    } catch (error) {
      console.error('Error deleting tag:', error)
      throw error
    }
  }

  /**
   * Merge two tags (move all content from source to target)
   */
  async mergeTags(sourceTagId: string, targetTagId: string): Promise<TagData> {
    try {
      // Find tags
      const allTags = await this.listTags()
      const sourceTag = allTags.find(t => t.id === sourceTagId)
      const targetTag = allTags.find(t => t.id === targetTagId)

      if (!sourceTag || !targetTag) {
        throw new Error('Source or target tag not found')
      }

      // Delete source tag (this would cascade to content in real implementation)
      // For now, just mark as merged
      await this.deleteTag(sourceTagId)

      return withTagDefaults(targetTag)
    } catch (error) {
      console.error('Error merging tags:', error)
      throw error
    }
  }

  /**
   * Find or create a folder
   */
  private async findOrCreateFolder(
    folderName: string,
    parentFolderId: string
  ): Promise<{ id: string; name: string }> {
    try {
      // Search for existing folder
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

      // Create new folder
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

  /**
   * Find folder by name
   */
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

  /**
   * Read tag metadata from file
   */
  private async readTagMetadata(fileId: string): Promise<TagData | null> {
    try {
      const fileResponse = await this.drive.files.get({
        fileId,
        alt: 'media'
      })

      const metadata = JSON.parse(fileResponse.data) as TagData
      this.tagFileMap.set(metadata.id, fileId)

      return withTagDefaults(metadata)
    } catch (error) {
      console.error('Error reading tag metadata:', error)
      return null
    }
  }
}
