/**
 * ContentService Adapter for Google Drive Backend
 * Bridges existing ContentService API with GoogleDriveBackendService
 * This allows seamless migration from database to Google Drive storage
 */

import GoogleDriveBackendService, {
  ContentMetadata,
  DEFAULT_CATEGORY_NAME,
  DRIVE_READ_CONCURRENCY,
  decodeContentListProperties,
  looksLikeDriveId,
  mapWithConcurrency
} from './google-drive-backend'
import type { ContentFileLocation } from './google-drive-backend'
import { OAuth2Client } from 'google-auth-library'
import type { ContentType } from '@prisma/client'

/**
 * T103 - the folder each content type belongs in when the user picked no category.
 *
 * The folder names in a vault mirror the content types (`Ideas`, `Poetry`, `Notes`, ...), but a
 * category and a type are different things: a category is a folder, a type is a property of the
 * note. Because the page sent no category id, every note used to fall back to `Notes` - the user's
 * IDEA showed up in `Vault/Notes` while an empty `Vault/Ideas` sat next to it, which reads as a
 * storage bug.
 *
 * Typed as `Record<ContentType, ...>` on purpose: the union comes from the Prisma enum, so adding
 * a content type without deciding its folder is a compile error, not a note in the wrong place.
 * A `null` means "the standard vault has no folder named after this type" - `CUSTOM` is a user's
 * own type and lives in whatever category they choose; it keeps the default folder. Every entry is
 * only a CANDIDATE: it is used when the vault really has a folder with that name (see
 * `resolveCategory`), never to create one.
 */
const CONTENT_TYPE_FOLDER_NAMES: Record<ContentType, string | null> = {
  IDEA: 'Ideas',
  POETRY: 'Poetry',
  NOTE: 'Notes',
  RESOURCE: 'Resources',
  PROJECT: 'Projects',
  JOB: 'Jobs',
  DAILY: 'Daily',
  ARCHIVE: 'Archive',
  CUSTOM: null,
}

/** T103 - is this raw value one of the `ContentType` members? */
function isContentType(value: string): value is ContentType {
  return Object.prototype.hasOwnProperty.call(CONTENT_TYPE_FOLDER_NAMES, value)
}

/**
 * T103 - the folder name a content type should live in, or null when it has none.
 *
 * Types arrive from a request body, so the value is normalised (`'idea'`, `' IDEA '`) and an
 * unknown type answers null instead of throwing. That null keeps the old default-folder behaviour
 * for anything the app does not know as a `ContentType`.
 */
function folderNameForContentType(contentType: unknown): string | null {
  const key = typeof contentType === 'string' ? contentType.trim().toUpperCase() : ''
  return isContentType(key) ? CONTENT_TYPE_FOLDER_NAMES[key] : null
}

export interface ContentItem {
  id: string
  title: string
  content: string
  type: string
  status: string
  priority?: string
  tags?: string[]
  categoryId?: string
  createdAt: Date
  updatedAt: Date
  attachments?: Array<{
    id: string
    fileName: string
    driveFileId: string
    uploadedAt: Date
  }>
}

/**
 * T098 - how the last listing was built.
 *
 * Not part of any API response (the response shape is pinned): this is what the server logs and
 * what a test can assert on, so the legacy path is visible instead of silent. `fromBody` is the
 * number of files that had no usable `appProperties` and therefore cost one media read - the number
 * that should shrink to zero as a vault is edited.
 */
export interface ListingStats {
  items: number
  fromProperties: number
  fromBody: number
}

/** T098 - a file as a listing returns it: enough to build a row, with or without properties. */
interface ListedContentFile {
  id: string
  mimeType?: string
  appProperties?: Record<string, string>
}

export class GoogleDriveContentAdapter {
  private gdrive: GoogleDriveBackendService
  private categoryMap: Map<string, string> = new Map()
  /** T098 - how the last listing was built, for the log line and for tests. */
  private listingStats: ListingStats = { items: 0, fromProperties: 0, fromBody: 0 }

  constructor(oauth2Client: OAuth2Client, userId: string) {
    this.gdrive = new GoogleDriveBackendService(oauth2Client, userId)
  }

  /** T098 - the counters for the most recent listing on this adapter instance. */
  get lastListingStats(): ListingStats {
    return { ...this.listingStats }
  }

  /**
   * Initialize the Google Drive backend
   */
  async initialize(): Promise<void> {
    const structure = await this.gdrive.initializeVaultStructure()
    // Map category IDs to names. T097: the DISPLAY name (the folder's own name in Drive) rather
    // than the lowercase lookup key, so a note can persist `categoryName: Poetry`.
    Object.entries(structure.folders).forEach(([key, id]) => {
      this.categoryMap.set(id, structure.folderNames?.[key] ?? key)
    })
  }

  /**
   * T094 - resolve whatever a caller sent into a category NAME.
   *
   * The page posts `selectedCategory?.id` - an opaque Drive folder id such as
   * `1GNp50lnbq11hlDeB7suqJiEwHrgi3Sp4` - while the backend addresses category folders by name.
   * Passing the id straight through meant the name lookup missed, `createCategoryFolder(id)` ran,
   * and the note was written into a *new folder named after the id*: unreachable from every
   * listing afterwards, which is exactly the note the user reported as vanished.
   *
   * T103 adds the last step: when the caller chose NO category, the note belongs in the folder that
   * matches its content type. Resolution order, cheapest first:
   *
   *   1. an explicit category ID (the map built at initialize),
   *   2. an explicit category NAME (the mobile client and existing callers send names),
   *   3. a Drive folder that the value names as an id (a custom category this adapter did not
   *      enumerate) - one metadata get, only on this path,
   *   4. no category at all -> the vault folder matching `contentType`, case-insensitively
   *      (`Ideas` for `IDEA`, `Poetry` for `POETRY`, `Notes` for `NOTE`, ...), see
   *      `categoryNameForContentType`,
   *   5. the default folder, for an id-shaped value that resolves to nothing or a type the vault
   *      has no folder for.
   *
   * Step 5 is the guarantee: a stale id falls back, and an id is never treated as a name to create.
   * The type step can only ever pick a folder that ALREADY EXISTS (`findExistingCategoryFolder`
   * reads, never creates), so saving a note cannot add a category folder as a side effect.
   *
   * `contentType` is optional: every pre-T103 caller keeps its exact behaviour, and a caller that
   * passes no type is simply resolved as before (an explicit category, or the default).
   */
  async resolveCategory(input?: string | null, contentType?: string | null): Promise<string> {
    const requested = typeof input === 'string' ? input.trim() : ''

    if (requested) {
      const fromId = this.categoryMap.get(requested)
      if (fromId) return fromId

      const fromName = this.knownCategoryName(requested)
      if (fromName) return fromName

      if (looksLikeDriveId(requested)) {
        const folderName = await this.gdrive.findFolderNameById(requested)
        if (folderName) {
          this.categoryMap.set(requested, folderName)
          return folderName
        }

        console.error(
          `Unknown category id ${requested}: writing to ${DEFAULT_CATEGORY_NAME} instead of ` +
            'creating a folder named after the id'
        )
        return DEFAULT_CATEGORY_NAME
      }

      // Not id-shaped: a category name the map does not know yet (a new category, or one created by
      // the categories adapter). The backend finds it by name under Vault, or creates it there.
      return requested
    }

    // No category was chosen: the type decides, when the vault has a folder for that type.
    return this.categoryNameForContentType(contentType)
  }

  /**
   * T103 - the note's home when the user picked no category: the folder named after its type.
   *
   * `Ideas` for `IDEA`, `Notes` for `NOTE`, and so on (see `CONTENT_TYPE_FOLDER_NAMES`). The folder
   * must already exist - a miss is not a reason to create one, because saving a note is not a
   * category-management action - so the lookup goes through `findExistingCategoryFolder`, which
   * only reads. A type with no folder (`CUSTOM`, or any value that is not a `ContentType`) and a
   * type whose folder the vault does not have both answer the default category, exactly as a note
   * with no category did before T103.
   */
  private async categoryNameForContentType(contentType?: string | null): Promise<string> {
    const candidate = folderNameForContentType(contentType)

    if (!candidate) {
      const requestedType =
        typeof contentType === 'string' ? contentType.trim().toUpperCase() : ''
      if (requestedType) {
        console.info(
          `Content type ${requestedType} has no category folder of its own: ` +
            `writing to ${DEFAULT_CATEGORY_NAME}`
        )
      }
      return DEFAULT_CATEGORY_NAME
    }

    // A default category (and any folder another resolution already learned) is free to check.
    const known = this.knownCategoryName(candidate)
    if (known) return known

    try {
      const folder = await this.gdrive.findExistingCategoryFolder(candidate)
      if (folder) {
        // Cache it like `initialize()` does, so the write that follows - and any later
        // `resolveCategory(folderId)` in this request - resolves without another query.
        this.categoryMap.set(folder.id, folder.name)
        return folder.name
      }
    } catch (error) {
      // A folder lookup that fails must not fail the save: fall back to the default category
      // (the pre-T103 behaviour) instead of turning a write into a 500.
      console.error(
        `Could not look up the folder for content type ${candidate}: using ${DEFAULT_CATEGORY_NAME}`,
        error
      )
      return DEFAULT_CATEGORY_NAME
    }

    console.info(
      `The vault has no ${candidate} folder: a ${candidate} note is written to ` +
        `${DEFAULT_CATEGORY_NAME} (no folder is created for it)`
    )
    return DEFAULT_CATEGORY_NAME
  }

  /** T094 - the canonical name for a known category name, case-insensitively, or null. */
  private knownCategoryName(input: string): string | null {
    const key = input.trim().toLowerCase()
    for (const name of this.categoryMap.values()) {
      if (name.toLowerCase() === key) return name
    }
    return null
  }

  /**
   * T095 - the category a content item actually lives in, derived from the item itself.
   *
   * This is the fix for the dead end T094 left open: `GET /api/content` now lists notes from every
   * category folder, so opening a note kept in `Vault/Ideas` used to 404, because the by-id routes
   * looked for it in `Vault/Notes` and nowhere else. The file's own `parents` (its category folder)
   * is the one source that does not need the client to remember the category.
   *
   * Reuses T094's resolvers rather than duplicating them: `findParentFolderId` answers the folder
   * id from the file metadata, `findFolderNameById` answers the folder id -> name. This method is
   * only the composition, so there is exactly one id -> name implementation in the app.
   *
   * T102: the by-id routes no longer call this. It answers with a NAME, which costs a second
   * metadata get (the folder id) and then a third (the folder name); `locateContentById` answers
   * the whole location from a cached listing row or the file's own properties instead. Kept as the
   * name-only derivation for callers that have nothing but a file id.
   *
   * Returns null when the item cannot be placed (a deleted file, no parent, a Drive error). The
   * caller decides what that means - for the routes it is the existing 404.
   */
  async resolveCategoryForFile(fileId: string): Promise<string | null> {
    const parentFolderId = await this.gdrive.findParentFolderId(fileId)
    if (!parentFolderId) return null

    const folderName = await this.gdrive.findFolderNameById(parentFolderId)
    // Same cache `initialize()` fills, so a later `resolveCategory(folderId)` in the same request
    // is free. A miss is not cached - the folder may simply not exist (yet).
    if (folderName) this.categoryMap.set(parentFolderId, folderName)

    return folderName
  }

  /**
   * T102 - the category and mime type a by-id READ needs, cheapest source first.
   *
   * T095 answered this by listing the item's category folder and looking for the id the caller
   * already had - three round-trips to learn something the file, or a recent listing, already says.
   * The resolution itself lives in the backend (`locateContentFile`), which owns the listing cache,
   * the structure and T094's folder lookups; this method is the adapter's face on it so the route
   * keeps talking to one object.
   *
   * Returns null when the id is not one of the app's own markdown files - the caller answers 404.
   * `source` says which source answered, so a log (or a test) can see the call that was saved:
   * `listing-cache` is free, `file-properties` costs the one metadata get the read already needs,
   * and `parent-folder` is the legacy file that has no properties at all.
   */
  async locateContentById(fileId: string): Promise<ContentFileLocation | null> {
    const location = await this.gdrive.locateContentFile(fileId)

    // T100/T098: a note written before the list properties existed has to be placed by its parent
    // folder, which is one extra query. Worth a line: it shrinks to zero as notes are edited.
    if (location?.source === 'parent-folder') {
      console.info(
        `Located ${fileId} in ${location.categoryName} by its parent folder: the file carries no ` +
          'list properties, so naming its category cost one extra folder query'
      )
    }

    return location
  }

  /**
   * Create a new content item and save to Google Drive
   *
   * T094: `category` may be an id or a name; `resolveCategory` turns it into the name the backend
   * writes under, so an id can never become the folder name.
   *
   * T103: `item.type` is passed to the resolver too, so a save with no category lands in the folder
   * named after the note's type (`IDEA` -> `Ideas`). An explicit category still wins - the resolver
   * only consults the type when no category was chosen. The resolved NAME is written into the
   * note's metadata below, which puts it in the frontmatter (`categoryName:`) and in
   * `appProperties` (`vault-category`), so the file itself can answer "where does this live?".
   */
  async createContent(
    category: string,
    item: Omit<ContentItem, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const categoryName = await this.resolveCategory(category, item.type)
    const now = new Date()
    const metadata: ContentMetadata = {
      id: `content_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: item.title,
      type: item.type,
      status: item.status,
      priority: item.priority,
      createdAt: now,
      updatedAt: now,
      tags: item.tags,
      categoryId: item.categoryId,
      // T097: the file names where it lives. `categoryId` is whatever the caller sent and is empty
      // when no category was picked; the resolved NAME is the one fact the file can always state.
      categoryName
    }

    // Save markdown file to Google Drive
    const fileId = await this.gdrive.saveContentAsMarkdown(categoryName, item.content, metadata)

    return fileId
  }

  /**
   * Get content item from Google Drive
   *
   * T092: `mimeType` is optional and comes from the listing. It lets the read guard refuse a
   * Google editors file without a second metadata request.
   *
   * T100: this is the ONLY way to get a note's body. A listed item's `content` is a preview excerpt
   * (see `itemFromListMetadata`); this method reads the file, so the editor receives the real text.
   */
  async getContent(fileId: string, categoryName: string, mimeType?: string | null): Promise<ContentItem> {
    const { metadata, content } = await this.gdrive.readMarkdownContent(fileId, mimeType)

    return {
      id: fileId,
      title: metadata.title,
      content: content,
      type: metadata.type,
      status: metadata.status,
      priority: metadata.priority,
      tags: metadata.tags,
      categoryId: metadata.categoryId,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      attachments: []
    }
  }

  /**
   * Update content item in Google Drive
   *
   * T097: the resolved category name is re-written into the frontmatter here too, so an update
   * cannot leave the file describing a category it no longer matches. Every existing field is
   * preserved by the spread; `categoryName` is the one field this method states itself.
   *
   * T100: the body is read from Drive before this call and `updates.content` only wins when the
   * caller actually sent one, so an update that changes a title keeps the real note. The list
   * excerpt is not an input here at all - `updateMarkdownContent` derives it from the body being
   * written, so a preview string can never travel back into the file as its content.
   *
   * T103: an update NEVER moves a note. `updateMarkdownContent` writes the body and the properties
   * of the file addressed by id and re-parents nothing, and the category written here is the one
   * the caller resolved for THIS file (the by-id route passes the file's own location) - not the
   * folder its type would pick today. So editing an `IDEA` that lives in `Notes` keeps it in
   * `Notes`; the type fallback is a create-time decision only.
   */
  async updateContent(
    fileId: string,
    categoryName: string,
    updates: Partial<ContentItem>
  ): Promise<void> {
    const { metadata, content: existingContent } = await this.gdrive.readMarkdownContent(fileId)

    const updatedMetadata: ContentMetadata = {
      ...metadata,
      ...updates,
      categoryName: categoryName || metadata.categoryName,
      updatedAt: new Date()
    }

    const newContent = updates.content || existingContent

    await this.gdrive.updateMarkdownContent(fileId, newContent, updatedMetadata)
  }

  /**
   * Delete content item from Google Drive
   */
  async deleteContent(fileId: string): Promise<void> {
    await this.gdrive.deleteFile(fileId)
  }

  /**
   * List all content in a category
   *
   * T092 failure boundary: one item that cannot be read (403 from Drive, a vanished file, a file
   * whose body is not app markdown) is skipped here. The caller receives the items that did read,
   * never an exception for the collection. The listing itself is already constrained to the app's
   * markdown mime, so this is a second line of defence rather than the only one.
   *
   * T094: `category` may be an id (which is what the page sends) or a name.
   */
  async listCategoryContent(category: string): Promise<ContentItem[]> {
    const categoryName = await this.resolveCategory(category)
    const files = await this.gdrive.listCategoryFiles(categoryName)

    return this.readContentItems(files, categoryName)
  }

  /**
   * List every content item in the vault, across all category folders (T094)
   *
   * This is the "All content" view. The per-item boundary is the same as `listCategoryContent`:
   * one unreadable file is skipped, the rest still come back.
   */
  async listAllContent(): Promise<ContentItem[]> {
    const files = await this.gdrive.listAllContentFiles()

    return this.readContentItems(files, DEFAULT_CATEGORY_NAME)
  }

  /**
   * T097 - read the items for one listing, with the per-item reads running CONCURRENTLY under a
   * small cap.
   *
   * T098 - and, for a file that carries list metadata, not at all.
   *
   * The listing asks Drive for `appProperties`, which hold every value a row shows (title, type,
   * status, priority, category, tags, timestamps, and - T100 - the body's preview excerpt). So:
   *
   *   - a file WITH properties is built from them: 0 Drive calls, whatever the vault size;
   *   - a file WITHOUT them (written before T098, or written by another client) is read exactly as
   *     before: one media read, full body, same failure boundary.
   *
   * The fallback is per file, counted in `lastListingStats.fromBody` and logged, so a vault's
   * legacy tail is visible without a migration and without a second request. What is deliberately
   * NOT done: shaping a body out of properties. A property-built row's `content` is the bounded
   * preview excerpt - a display string of at most `CONTENT_EXCERPT_MAX_CHARS` characters, never
   * the note. Opening a note reads the file (see `getContent` and the by-id route), which is why
   * the excerpt is never in the editor and never in a save.
   *
   * The failure boundary is unchanged: one unreadable file is logged and skipped, and the rest of
   * the collection still answers.
   */
  private async readContentItems(
    files: ReadonlyArray<ListedContentFile>,
    categoryName: string
  ): Promise<ContentItem[]> {
    let fromProperties = 0
    let fromBody = 0

    const items = await mapWithConcurrency(files, DRIVE_READ_CONCURRENCY, async (file) => {
      const listMetadata = decodeContentListProperties(file.appProperties)
      if (listMetadata) {
        fromProperties += 1
        return this.itemFromListMetadata(file.id, listMetadata)
      }

      // A file without properties: the pre-T098 path, one body read, unchanged.
      fromBody += 1
      try {
        // The read is addressed by file id; the category is not an input to it.
        return await this.getContent(file.id, categoryName, file.mimeType)
      } catch (error) {
        console.error(`Skipping unreadable content file ${file.id}:`, error)
        // Skip files that can't be read; one bad file must not fail the collection.
        return null
      }
    })

    const collected = items.filter((item): item is ContentItem => item !== null)

    this.listingStats = {
      items: collected.length,
      fromProperties,
      fromBody,
    }

    if (fromBody > 0) {
      console.info(
        `Listed ${collected.length} content items: ${fromProperties} from file properties, ` +
          `${fromBody} from a body read (no list properties - written before T098)`
      )
    }

    return collected
  }

  /**
   * T098 - one list row, built entirely from the file's own `appProperties`.
   *
   * T100 - `content` is the row's preview EXCERPT, not the note. The editor never sees this value:
   * it reads the body through `getContent` (the by-id route), and a save derives the excerpt from
   * the content it writes, so this string can neither be opened as the note nor written back as
   * one. When a file carries no excerpt property this is `''` - the pre-T100 behaviour, and still
   * zero body reads.
   */
  private itemFromListMetadata(fileId: string, metadata: ContentMetadata): ContentItem {
    return {
      id: fileId,
      title: metadata.title,
      content: metadata.excerpt ?? '',
      type: metadata.type,
      status: metadata.status,
      priority: metadata.priority,
      tags: metadata.tags ?? [],
      categoryId: metadata.categoryId,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      attachments: [],
    }
  }

  /**
   * Search content across all categories
   *
   * T092 failure boundary: as `listCategoryContent` - unreadable items are skipped, not propagated.
   *
   * T094: `'*'` (and an empty query) means "everything in the vault", not "a name containing an
   * asterisk". The route's unfiltered branch has always asked for `'*'`, and the old backend
   * answered with `name contains '*'` - a literal substring match no file name satisfies - which is
   * why "All content" was empty. It now enumerates the category folders instead.
   */
  async searchContent(query: string): Promise<ContentItem[]> {
    const trimmed = typeof query === 'string' ? query.trim() : ''
    if (!trimmed || trimmed === '*') {
      return this.listAllContent()
    }

    const files = await this.gdrive.searchFiles(trimmed)

    // Extract category from file path or use a default
    return this.readContentItems(files, DEFAULT_CATEGORY_NAME)
  }

  /**
   * Upload attachment for a content item
   * File naming: {contentTitle}_{timestamp}_{originalFilename}
   *
   * T094: resolves an id or a name, so an attachment lands in the same folder as its note.
   */
  async uploadAttachment(
    category: string,
    contentItem: ContentItem,
    file: Buffer,
    originalFileName: string
  ): Promise<string> {
    const categoryName = await this.resolveCategory(category)
    const metadata: ContentMetadata = {
      id: contentItem.id,
      title: contentItem.title,
      type: contentItem.type,
      status: contentItem.status,
      priority: contentItem.priority,
      createdAt: contentItem.createdAt,
      updatedAt: contentItem.updatedAt,
      tags: contentItem.tags,
      categoryId: contentItem.categoryId
    }

    const driveFileId = await this.gdrive.uploadAttachment(
      categoryName,
      file,
      originalFileName,
      metadata
    )

    return driveFileId
  }

  /**
   * Get shareable link for content
   */
  async getShareableLink(fileId: string): Promise<string> {
    return await this.gdrive.getShareableLink(fileId)
  }

  /**
   * Create a new category folder
   */
  async createCategory(categoryName: string): Promise<void> {
    const folderId = await this.gdrive.createCategoryFolder(categoryName)
    this.categoryMap.set(folderId, categoryName)
  }
}

export default GoogleDriveContentAdapter
