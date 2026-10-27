import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { isEditorsFileMimeType, readDriveMediaText } from './google-drive-media'
import { mapWithConcurrency } from './google-drive-backend'

export interface CategoryData {
  id: string
  name: string
  description?: string
  color: string
  icon?: string
  parentId?: string | null
  isSystem: boolean
  level: number
  createdAt: Date
  updatedAt: Date
  children: CategoryData[]
  _count: {
    contentItems: number
  }
}

/**
 * T060 / ADR-009 D1: make the shape the adapter hands out total.
 *
 * `readCategoryMetadata` returns `JSON.parse(...) as CategoryData`, a cast the
 * compiler cannot check, so a stored `_category.json` written before `children`
 * existed reaches a renderer without the key and `category.children.length`
 * throws. Making the fields required lets `tsc` find construction sites; this
 * normaliser covers the one site it cannot see.
 */
function withCategoryDefaults(c: CategoryData): CategoryData {
  return {
    ...c,
    children: Array.isArray(c.children) ? c.children : [],
    _count: { contentItems: c._count?.contentItems ?? 0 }
  }
}

/** T092/T094 - a category IS a Drive folder in this model. */
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'

/** The sidecar this app writes for a category, and the only mime it may ever have (T092). */
const CATEGORY_METADATA_FILE_NAME = '_category.json'
const CATEGORY_METADATA_MIME_TYPE = 'application/json'

/** The colour `createCategory` and the default-metadata branch have always used. */
const DEFAULT_CATEGORY_COLOR = '#3B82F6'

/**
 * How long one assembled category list is trusted: 15 s.
 *
 * `GET /api/categories` was 11.2-11.9 s against the real account, and the dashboard and the rail
 * both call it, so the page waited for it twice. The walk that produced that number is gone (two
 * queries, see `buildCategoryList`), but the run still costs a round-trip, and several requests on
 * mount ask exactly the same question within a second of each other. This sits inside the task's
 * 10-20 s window for the same reason `CONTENT_LISTING_TTL_MS` does: long enough that a page load
 * shares one answer, short enough that a change made in another tab or in the Drive UI corrects
 * itself while the user is still looking at the screen.
 *
 * Every write this process performs invalidates it outright (`invalidateCategoryListCache`), so the
 * TTL is the backstop for writes this process did not see - not the mechanism that makes the user's
 * own change visible.
 */
export const CATEGORY_LIST_TTL_MS = 15 * 1000

/**
 * How long a resolved Vault folder id is trusted: 5 minutes.
 *
 * The route calls `adapter.initialize()` before listing, and without this it would pay a
 * `name='Vault'` lookup on EVERY request - one round-trip (~900 ms against the real account) that
 * would put the warm path straight back over the 800 ms budget. A folder id is immutable, and a
 * rename does not change it, so the same rationale as `VAULT_STRUCTURE_TTL_MS` applies: five
 * minutes is long enough that a normal session never repeats the lookup and short enough that a
 * Vault folder trashed outside this app corrects itself without a restart.
 */
const VAULT_FOLDER_ID_TTL_MS = 5 * 60 * 1000

/**
 * How many `_category.json` bodies one listing may read at once.
 *
 * These are the only per-folder reads left, and they are tiny JSON sidecars (one metadata read, no
 * body store), so the ten-wide cap T101 already uses for folder listings applies here for the same
 * reason: a ten-folder vault is one wave, and a vault with fifty folders is five waves rather than
 * fifty sequential hops.
 */
const CATEGORY_METADATA_READ_CONCURRENCY = 10

/** One folder as the vault listing returns it. */
interface DriveCategoryFolder {
  id: string
  name?: string
  createdTime?: string
  modifiedTime?: string
  mimeType?: string
}

/** One `_category.json` candidate as the account-wide query returns it. */
interface DriveCategoryMetadataFile {
  id: string
  name?: string
  mimeType?: string
  parents?: unknown
}

/** What one walk produced: the list to serve, and the id map the mutation paths reuse. */
interface CategoryListSnapshot {
  categories: CategoryData[]
  folderIds: Map<string, string> // categoryId -> folderId
}

interface CachedCategoryList extends CategoryListSnapshot {
  expiresAt: number
}

/**
 * Account (and vault) -> the list the adapter assembled a moment ago.
 *
 * Module-level on purpose: `GoogleDriveCategoriesAdapter` is constructed per request, so an
 * instance field would die before it could be reused - the same reason `vaultStructureCache` and
 * `contentListingCache` are module-level (T097/T101). Keyed by account AND vault folder id so two
 * accounts (or two vaults, in a test) can never be served each other's list.
 *
 * What is NOT cached: anything a caller could confuse with a Drive content read. This is the
 * category list as `GET /api/categories` returns it, normalised by `withCategoryDefaults`.
 */
const categoryListCache = new Map<string, CachedCategoryList>()

/** Walks in progress, so the dashboard and the rail mounting together pay ONE walk, not two. */
const categoryListInFlight = new Map<string, Promise<CategoryListSnapshot>>()

/** Account -> the Vault folder id `initialize()` resolved from Drive. */
const vaultFolderIdCache = new Map<string, { folderId: string; expiresAt: number }>()

function categoryListCacheKey(userId: string, vaultFolderId: string): string {
  return `${userId}\u0000${vaultFolderId}`
}

/**
 * Forget this account's cached category list.
 *
 * Called by every write that changes it - create, rename/update and delete. The next list therefore
 * asks Drive, instead of answering with a list that predates the change the user just made. A
 * reorder would call this too; there is no reorder endpoint in this app today.
 */
export function invalidateCategoryListCache(userId: string): void {
  const prefix = `${userId}\u0000`
  for (const key of Array.from(categoryListCache.keys())) {
    if (key.startsWith(prefix)) categoryListCache.delete(key)
  }
}

/**
 * Drop every cached category list, the in-flight walks and the resolved Vault folder ids.
 *
 * For tests: all three are module-level by design, so a test that wants a cold path has to say so.
 */
export function resetCategoryListCache(): void {
  categoryListCache.clear()
  categoryListInFlight.clear()
  vaultFolderIdCache.clear()
}

/**
 * The first id of a Drive `parents` array that names one of `known`, or null.
 *
 * The value is `unknown` because it comes off the wire. This is also how the ONE metadata query is
 * scoped to the vault: a `_category.json` anywhere else in the account has no parent in the vault's
 * folder set and is dropped before anything is read.
 */
function knownParentId(parents: unknown, known: ReadonlySet<string>): string | null {
  if (!Array.isArray(parents)) return null

  for (const parent of parents) {
    if (typeof parent === 'string' && known.has(parent)) return parent
  }

  return null
}

/** A Drive timestamp as a Date, falling back when the field is missing or unparseable. */
function driveDate(value: unknown, fallback: Date): Date {
  if (typeof value !== 'string' || value.trim() === '') return fallback

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date
}

/** The one ordering `listCategories` has always applied. */
function compareCategories(a: CategoryData, b: CategoryData): number {
  // System categories first, then by level, then by name
  if (a.isSystem !== b.isSystem) {
    return a.isSystem ? -1 : 1
  }
  if (a.level !== b.level) {
    return a.level - b.level
  }
  return a.name.localeCompare(b.name)
}

export class GoogleDriveCategoriesAdapter {
  private drive: any
  private oauth2Client: OAuth2Client
  private userId: string
  private vaultFolderId: string | null = null
  private categoryFolderMap: Map<string, string> = new Map() // categoryId -> folderId

  constructor(oauth2Client: OAuth2Client, userId: string) {
    this.oauth2Client = oauth2Client
    this.drive = google.drive({ version: 'v3', auth: oauth2Client })
    this.userId = userId
  }

  async initialize(vaultFolderId?: string) {
    if (vaultFolderId) {
      this.vaultFolderId = vaultFolderId
      return
    }

    // The route calls initialize() before every list/create/update/delete, and the answer for an
    // account cannot change while the process is warm - see `VAULT_FOLDER_ID_TTL_MS`.
    const cached = vaultFolderIdCache.get(this.userId)
    if (cached && cached.expiresAt > Date.now()) {
      this.vaultFolderId = cached.folderId
      return
    }

    // Find Vault folder
    const vaultFolder = await this.findFolderByName('Vault', null)
    if (!vaultFolder) {
      throw new Error('Vault folder not found')
    }

    this.vaultFolderId = vaultFolder.id
    vaultFolderIdCache.set(this.userId, {
      folderId: vaultFolder.id,
      expiresAt: Date.now() + VAULT_FOLDER_ID_TTL_MS
    })
  }

  /**
   * Get all categories (flat list - relationships handled via parentId)
   *
   * Cached for `CATEGORY_LIST_TTL_MS` and coalesced, so the dashboard and the rail asking at the
   * same moment do one walk. A hit costs no Drive call at all.
   */
  async listCategories(): Promise<CategoryData[]> {
    if (!this.vaultFolderId) {
      throw new Error('Adapter not initialized')
    }

    const key = categoryListCacheKey(this.userId, this.vaultFolderId)

    const cached = categoryListCache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      this.seedFolderMap(cached.folderIds)
      return [...cached.categories]
    }

    const inFlight = categoryListInFlight.get(key)
    if (inFlight) {
      const snapshot = await inFlight
      this.seedFolderMap(snapshot.folderIds)
      return [...snapshot.categories]
    }

    const pending = this.buildCategoryList(this.vaultFolderId)
    categoryListInFlight.set(key, pending)
    try {
      const snapshot = await pending
      categoryListCache.set(key, {
        ...snapshot,
        expiresAt: Date.now() + CATEGORY_LIST_TTL_MS
      })
      this.seedFolderMap(snapshot.folderIds)
      return [...snapshot.categories]
    } finally {
      categoryListInFlight.delete(key)
    }
  }

  /**
   * The cold path, and the whole point of this change: TWO queries, not one per folder.
   *
   * What it replaced: for every folder, a `files.list` looking for its `_category.json`, then - when
   * there was none - a `files.get` to build default metadata. Ten folders were ten sequential
   * metadata probes plus ten sequential gets, ~900 ms each against the real account: 11.2-11.9 s for
   * `GET /api/categories`, the slowest endpoint in the app.
   *
   * What it does now:
   *
   *   1. ONE `files.list` for the vault's category folders, asking for the fields the default
   *      metadata branch needs (`name`, `createdTime`, `modifiedTime`) in the same query, so a vault
   *      whose folders have no sidecar - the measured account - costs no second call of its own.
   *   2. ONE `files.list` for every `_category.json` in the account, constrained to
   *      `mimeType='application/json'` (T092) and associated with its folder by parent id. A
   *      metadata file whose parent is not one of the vault's category folders is ignored, which is
   *      what scopes the account-wide query to this vault.
   *
   * Both queries are independent, so they run together: one round-trip, not two.
   *
   * The bodies of the files found by (2) still have to be read - Drive has no multi-file media
   * read - so those are read at `CATEGORY_METADATA_READ_CONCURRENCY`, in one wave for the ten-folder
   * vault, and only for folders that actually have a sidecar.
   *
   * Failure boundaries kept exactly as they were (T092): a folder whose metadata cannot be read is
   * skipped, never allowed to fail the list, and an editors file is refused before `alt=media`.
   */
  private async buildCategoryList(vaultFolderId: string): Promise<CategoryListSnapshot> {
    try {
      const [folderResponse, metadataResponse] = await Promise.all([
        this.drive.files.list({
          q: `'${vaultFolderId}' in parents and mimeType='${FOLDER_MIME_TYPE}' and trashed=false`,
          spaces: 'drive',
          fields: 'files(id, name, createdTime, modifiedTime, properties, mimeType)',
          pageSize: 100
        }),
        // T092: the mime constraint is what keeps an editors file out of the metadata path. The
        // read guard below is the second line of defence, because a Drive that ignores `q` must
        // still not be able to hand one over.
        this.drive.files.list({
          q:
            `name='${CATEGORY_METADATA_FILE_NAME}' and ` +
            `mimeType='${CATEGORY_METADATA_MIME_TYPE}' and trashed=false`,
          spaces: 'drive',
          fields: 'files(id, name, mimeType, parents)',
          // One page holds a `_category.json` per category; a vault with more than 1000 categories
          // is not a case this app can serve, and paginating would add a round-trip to every walk.
          pageSize: 1000
        })
      ])

      const folders: DriveCategoryFolder[] = Array.isArray(folderResponse.data?.files)
        ? folderResponse.data.files
        : []
      const folderIds = new Set(folders.map((folder) => folder.id))

      // parent folder id -> the metadata file that belongs to it.
      const metadataByParent = new Map<string, DriveCategoryMetadataFile>()
      const metadataFiles: DriveCategoryMetadataFile[] = Array.isArray(metadataResponse.data?.files)
        ? metadataResponse.data.files
        : []
      for (const file of metadataFiles) {
        const parentId = knownParentId(file.parents, folderIds)
        if (!parentId || metadataByParent.has(parentId)) continue
        metadataByParent.set(parentId, file)
      }

      const entries = await mapWithConcurrency(
        folders,
        CATEGORY_METADATA_READ_CONCURRENCY,
        async (
          folder: DriveCategoryFolder
        ): Promise<{ category: CategoryData; folderId: string } | null> => {
          const metadataFile = metadataByParent.get(folder.id)

          if (!metadataFile) {
            // No sidecar: the folder listing already answered everything this branch needs.
            return { category: this.defaultCategoryFor(folder), folderId: folder.id }
          }

          if (isEditorsFileMimeType(metadataFile.mimeType)) {
            console.error(
              `Category folder ${folder.id} has an editors file named ` +
                `${CATEGORY_METADATA_FILE_NAME}: skipping it rather than offering it as metadata.`
            )
            return null
          }

          const metadata = await this.readCategoryMetadataFile(metadataFile, folder.id)
          return metadata ? { category: metadata, folderId: folder.id } : null
        }
      )

      // mapWithConcurrency preserves input order; the sort is the one this method always applied.
      const flat = entries.filter(
        (entry): entry is { category: CategoryData; folderId: string } => entry !== null
      )
      const sorted = [...flat].sort((a, b) => compareCategories(a.category, b.category))

      const folderIdByCategory = new Map<string, string>()
      for (const entry of flat) {
        folderIdByCategory.set(entry.category.id, entry.folderId)
      }

      return { categories: sorted.map((entry) => entry.category), folderIds: folderIdByCategory }
    } catch (error) {
      console.error('Error listing categories:', error)
      throw error
    }
  }

  /**
   * The metadata a folder with no `_category.json` has always been given - built from the listing
   * entry, so this branch costs no Drive call of its own.
   */
  private defaultCategoryFor(folder: DriveCategoryFolder): CategoryData {
    const createdAt = driveDate(folder.createdTime, new Date(0))
    const updatedAt = driveDate(folder.modifiedTime, createdAt)

    return withCategoryDefaults({
      id: folder.id,
      name: typeof folder.name === 'string' && folder.name ? folder.name : folder.id,
      color: DEFAULT_CATEGORY_COLOR,
      isSystem: false,
      level: 1,
      createdAt,
      updatedAt,
      children: [],
      _count: { contentItems: 0 }
    })
  }

  /** Re-seed this instance's id map from a cached list, so same-instance callers still resolve ids. */
  private seedFolderMap(folderIds: ReadonlyMap<string, string>): void {
    for (const [categoryId, folderId] of folderIds) {
      this.categoryFolderMap.set(categoryId, folderId)
    }
  }

  /**
   * Create a new category
   */
  async createCategory(
    name: string,
    description?: string,
    color?: string,
    icon?: string,
    parentId?: string | null
  ): Promise<CategoryData> {
    if (!this.vaultFolderId) {
      throw new Error('Adapter not initialized')
    }

    try {
      // Determine parent folder
      let parentFolderId = this.vaultFolderId
      let level = 1

      if (parentId) {
        const parentFolder = this.categoryFolderMap.get(parentId)
        if (!parentFolder) {
          throw new Error(`Parent category not found: ${parentId}`)
        }
        parentFolderId = parentFolder
        // Get parent level to calculate this level
        const parentMetadata = await this.readCategoryMetadata(parentFolder)
        if (parentMetadata) {
          level = parentMetadata.level + 1
        }
      }

      // Create folder
      const folder = await this.findOrCreateFolder(name, parentFolderId)
      const categoryId = folder.id

      // Store metadata
      const metadata: CategoryData = {
        id: categoryId,
        name,
        description,
        color: color || '#3B82F6',
        icon,
        parentId: parentId || null,
        isSystem: false,
        level,
        createdAt: new Date(),
        updatedAt: new Date(),
        children: [],
        _count: {
          contentItems: 0
        }
      }

      await this.writeCategoryMetadata(categoryId, metadata)
      this.categoryFolderMap.set(categoryId, categoryId)

      // A new folder is a new category. The cached list predates it, and the user who just created
      // it must see it on the next request - not after the TTL.
      invalidateCategoryListCache(this.userId)

      return withCategoryDefaults(metadata)
    } catch (error) {
      console.error('Error creating category:', error)
      throw error
    }
  }

  /**
   * Update a category
   */
  async updateCategory(
    categoryId: string,
    updates: Partial<CategoryData>
  ): Promise<CategoryData> {
    try {
      const metadata = await this.readCategoryMetadata(categoryId)
      if (!metadata) {
        throw new Error('Category not found')
      }

      if (metadata.isSystem) {
        throw new Error('Cannot modify system categories')
      }

      // Update name in folder if provided
      if (updates.name && updates.name !== metadata.name) {
        await this.drive.files.update({
          fileId: categoryId,
          resource: { name: updates.name }
        })
      }

      // Update metadata
      const updated: CategoryData = {
        ...metadata,
        ...updates,
        updatedAt: new Date()
      }

      await this.writeCategoryMetadata(categoryId, updated)

      // The name, colour, description and icon all live in the list, so a rename or an edit has to
      // drop it. (The folder rename happens before this and would be worth an invalidation on its
      // own; one call after the metadata write covers both.)
      invalidateCategoryListCache(this.userId)

      return withCategoryDefaults(updated)
    } catch (error) {
      console.error('Error updating category:', error)
      throw error
    }
  }

  /**
   * Delete a category
   */
  async deleteCategory(categoryId: string): Promise<boolean> {
    try {
      const metadata = await this.readCategoryMetadata(categoryId)
      if (!metadata) {
        throw new Error('Category not found')
      }

      if (metadata.isSystem) {
        throw new Error('Cannot delete system categories')
      }

      // Check for children (child categories)
      const childFolders = await this.drive.files.list({
        q: `'${categoryId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        spaces: 'drive',
        fields: 'files(id)',
        pageSize: 100
      })

      if ((childFolders.data.files || []).length > 0) {
        throw new Error('Cannot delete category with subcategories')
      }

      // Move to trash
      await this.drive.files.update({
        fileId: categoryId,
        resource: { trashed: true }
      })

      this.categoryFolderMap.delete(categoryId)

      // The trashed folder must disappear from the next list, not after the TTL.
      invalidateCategoryListCache(this.userId)
      return true
    } catch (error) {
      console.error('Error deleting category:', error)
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
   * Read one category's metadata, by folder id.
   *
   * Only the mutation paths still call this (a create's parent level, an update, a delete): the
   * listing no longer asks per folder, it associates the ONE metadata query's results by parent id
   * and calls `readCategoryMetadataFile`. A caller that knows the folder but not the file still has
   * to look it up, which is why the per-folder probe stays here.
   *
   * T092: the lookup is constrained to `application/json` and the read goes through the media guard,
   * so a Google Docs editors file can never be offered as category metadata and `alt=media` is never
   * attempted on one. Any failure returns null - the caller skips that category.
   */
  private async readCategoryMetadata(categoryFolderId: string): Promise<CategoryData | null> {
    try {
      // Find _category.json file
      const response = await this.drive.files.list({
        q: `name='${CATEGORY_METADATA_FILE_NAME}' and '${categoryFolderId}' in parents and mimeType='${CATEGORY_METADATA_MIME_TYPE}' and trashed=false`,
        spaces: 'drive',
        fields: 'files(id, name, mimeType)',
        pageSize: 1
      })

      const found: DriveCategoryMetadataFile[] = Array.isArray(response.data?.files)
        ? response.data.files
        : []

      if (found.length === 0) {
        // If no metadata file, create default metadata
        const folderInfo = await this.drive.files.get({
          fileId: categoryFolderId,
          fields: 'id, name, createdTime, modifiedTime'
        })

        return this.defaultCategoryFor({
          id: categoryFolderId,
          name: folderInfo.data?.name,
          createdTime: folderInfo.data?.createdTime,
          modifiedTime: folderInfo.data?.modifiedTime
        })
      }

      return await this.readCategoryMetadataFile(found[0], categoryFolderId)
    } catch (error) {
      console.error('Error reading category metadata:', error)
      return null
    }
  }

  /**
   * Read one `_category.json` body that a caller has already found.
   *
   * T092: the read goes through `readDriveMediaText`, which refuses an editors file before any
   * `alt=media` request. Any failure - a refused file, a body that is not JSON, a network error -
   * returns null, which is the per-item skip: one unreadable category cannot fail the list.
   */
  private async readCategoryMetadataFile(
    metadataFile: DriveCategoryMetadataFile,
    categoryFolderId: string
  ): Promise<CategoryData | null> {
    try {
      const body = await readDriveMediaText(this.drive, metadataFile.id, metadataFile.mimeType)

      const metadata = JSON.parse(body) as CategoryData
      this.categoryFolderMap.set(metadata.id, categoryFolderId)

      return withCategoryDefaults(metadata)
    } catch (error) {
      console.error('Error reading category metadata:', error)
      return null
    }
  }

  /**
   * Write category metadata to _category.json
   */
  private async writeCategoryMetadata(
    categoryFolderId: string,
    metadata: CategoryData
  ): Promise<void> {
    try {
      // Check if metadata file exists
      const response = await this.drive.files.list({
        q: `name='_category.json' and '${categoryFolderId}' in parents and mimeType='application/json' and trashed=false`,
        spaces: 'drive',
        fields: 'files(id)',
        pageSize: 1
      })

      const metadataContent = JSON.stringify(metadata, null, 2)

      if (response.data.files && response.data.files.length > 0) {
        // Update existing file
        const metadataFileId = response.data.files[0].id
        await this.drive.files.update({
          fileId: metadataFileId,
          media: {
            mimeType: 'application/json',
            body: metadataContent
          }
        })
      } else {
        // Create new file
        await this.drive.files.create({
          resource: {
            name: '_category.json',
            mimeType: 'application/json',
            parents: [categoryFolderId]
          },
          media: {
            mimeType: 'application/json',
            body: metadataContent
          }
        })
      }

      this.categoryFolderMap.set(metadata.id, categoryFolderId)
    } catch (error) {
      console.error('Error writing category metadata:', error)
      throw error
    }
  }
}
