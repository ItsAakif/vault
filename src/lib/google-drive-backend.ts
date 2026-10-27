import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import fs from 'fs/promises'
import path from 'path'
import { isAppOwnedFile, readDriveMediaText } from './google-drive-media'

export interface VaultFolderStructure {
  vaultFolderId: string
  folders: Record<string, string> // { categoryName: folderId }
  /**
   * T097 - lowercase category key -> the name Drive reports for that folder.
   *
   * `folders` is keyed by lower case so lookups are case-insensitive, but the name a note writes
   * into its frontmatter should be the folder's real name (`Poetry`, not `poetry`). Optional so a
   * caller that builds a structure by hand (a test, the setup route's mocked backend) still
   * satisfies the type.
   */
  folderNames?: Record<string, string>
  /**
   * T101 - child folders discovered per parent set, cached WITH the structure.
   *
   * The unfiltered listing walks the tree by asking Drive "what folders are inside these?" once per
   * level. That answer only changes when a folder is created, and a create already invalidates this
   * structure, so re-querying it on every listing is pure round-trips. The key is the sorted parent
   * id set (see `childFoldersCacheKey`); the value is the folders Drive reported for exactly that
   * set, so no attribution guesswork is needed and a partial answer is never stored.
   *
   * Optional for the same reason as `folderNames`: a hand-built structure still satisfies the type,
   * and a structure without it simply asks Drive once and fills it in.
   */
  childFolders?: Record<string, Array<{ id: string; name: string }>>
}

/** T094 - the folder a write falls back to when the requested category cannot be resolved. */
export const DEFAULT_CATEGORY_NAME = 'Notes'

/** T094 - the one mime type this app writes for content (`saveContentAsMarkdown`). */
const MARKDOWN_MIME_TYPE = 'text/markdown'

/** T094 - a category IS a Drive folder in this model. */
export const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'

/**
 * T094 - deepest category nesting the unfiltered listing walks (Vault > category > subcategory).
 * The category model allows deeper nesting, but `saveContentAsMarkdown` can only ever write into a
 * Vault-root category folder, so a deeper walk would cost queries and find nothing the app wrote.
 */
const MAX_CATEGORY_DEPTH = 2

/** Drive ids are long opaque tokens; a 20-char floor keeps ordinary category names out. */
const DRIVE_ID_SHAPE = /^[A-Za-z0-9_-]{20,}$/

/**
 * T094 - "is this string a Drive id rather than a category name?"
 *
 * The page posts `selectedCategory?.id`, an opaque id such as
 * `1GNp50lnbq11hlDeB7suqJiEwHrgi3Sp4`. This app's folder lookups are keyed by lowercase NAME, so an
 * id misses the map - and the pre-fix code then *created* a folder whose name was that id.
 *
 * The test is deliberately conservative: a long `[A-Za-z0-9_-]` token that mixes digits with both
 * cases. A name like `Personal-Notes` or `Philosophy` never qualifies, and a legitimate id is only
 * ever treated as an id - never as a folder name to create.
 */
export function looksLikeDriveId(value: string): boolean {
  const candidate = typeof value === 'string' ? value.trim() : ''
  if (!DRIVE_ID_SHAPE.test(candidate)) return false
  return /\d/.test(candidate) && /[A-Z]/.test(candidate) && /[a-z]/.test(candidate)
}

/**
 * T094 - the hard guard on folder creation.
 *
 * The write path resolves or falls back *before* it gets here, so this only fires for a caller that
 * bypassed that path. Failing loudly is the point: creating `Vault/<id>` is never correct, and the
 * note written inside it is unreachable from every listing the app has.
 */
function assertCategoryNameIsNotDriveId(categoryName: string): void {
  if (looksLikeDriveId(categoryName)) {
    throw new Error(
      `Refusing to create a category folder named like a Drive id: ${categoryName}. ` +
        'A category is addressed by name; an id is resolved before the folder lookup.'
    )
  }
}

/** T097 - the categories `initializeVaultStructure` creates when the caller names none. */
const DEFAULT_CATEGORIES = ['Notes', 'Resources', 'Poetry', 'Jobs', 'Projects', 'Daily', 'Archive']

// ---------------------------------------------------------------------------------------------
// T098 - the list cache: every value a list row needs, stored on the Drive file itself.
//
// Why: a listing used to need every file's CONTENT, because the title, type, status, priority,
// tags and timestamps live in the markdown frontmatter. So N notes cost 1 listing round-trip plus N
// media reads - a cost that grows with the vault, which is backwards for a list view. Drive gives
// every file an `appProperties` string map; the listing asks for it in `fields`, and then a list
// needs no media reads at all.
//
// What this is NOT: a content store. `appProperties` never holds a body, and no reader builds a
// note from it. Opening a note still reads the file.
//
// The one thing that comes close is `vault-excerpt` (T100): a bounded preview of the first
// characters of a note's text, and ONLY for the row's preview line. It is never written into the
// markdown, never parsed back out of it, and never handed to an editor - see `buildContentExcerpt`.
// ---------------------------------------------------------------------------------------------

/**
 * T098 - the schema marker. A file whose properties carry a different version is treated as a file
 * with no properties (one body read), so a future schema change degrades to the old path instead of
 * producing a wrong row. Its presence is also what says "this file was written by the app after
 * T098", i.e. "its list row is complete".
 */
export const LIST_METADATA_VERSION_KEY = 'vault-list-v'
export const LIST_METADATA_VERSION = '1'

/**
 * Drive's documented ceiling for ONE `appProperties` entry, in UTF-8 bytes:
 *
 *     byteLength(key) + byteLength(value) <= 124
 *
 * Both halves count. This is the number that matters, and reading it as "124 bytes per value"
 * (with 120 as a rounder-looking value cap) is exactly what broke every create with a body longer
 * than a sentence: with `vault-excerpt` as a 13-byte key, the largest legal value is 111 bytes, so
 * a 180-character excerpt always produced a first chunk Drive rejected with
 * `Properties and app properties are limited to 124 bytes`.
 *
 * Every chunk therefore computes its own capacity from its OWN final key - see
 * `maxPropertyValueBytes` - and never from a fixed number.
 */
export const MAX_PROPERTY_ENTRY_BYTES = 124

/**
 * The largest value one property key may carry: `124 - byteLength(key)`.
 *
 * The key is the FINAL key for that chunk, suffix included: `vault-excerpt-1` is 15 bytes, so its
 * chunk may hold 109, not the 111 the unsuffixed first chunk gets. Counting the key is not
 * optional - Drive counts it.
 */
export function maxPropertyValueBytes(key: string): number {
  return MAX_PROPERTY_ENTRY_BYTES - Buffer.byteLength(key, 'utf8')
}

/**
 * T098 - the hard ceiling on chunks, in BOTH directions: `readPropertyChunks` walks no further, so
 * a value that would need more chunks than this is not writable as a chunked property and is
 * dropped (see `writePropertyChunks`) rather than written into a form the reader cannot rebuild.
 */
const MAX_PROPERTY_CHUNKS = 200

/**
 * T098 - the property schema. Keys are lower case with dashes only (Drive's safe key alphabet), and
 * every value is a STRING because `appProperties` is a `map<string, string>` on the wire.
 *
 *   vault-list-v      "1"                        schema version; absent -> no list metadata
 *   vault-id          "content_1723..."          the frontmatter id (not the Drive file id)
 *   vault-title       "A poem"                   title, chunked as vault-title-1, -2, ...
 *   vault-type        "POETRY"
 *   vault-status      "DRAFT"
 *   vault-priority    "MEDIUM"                   omitted when the note has none
 *   vault-category-id "<folder id>"              omitted when the note has none
 *   vault-category    "Poetry"                   the resolved category NAME
 *   vault-tags        ["one","two"]              JSON-encoded array, see `decodeTagList`
 *   vault-created     "2026-08-01T..."           ISO 8601
 *   vault-updated     "2026-08-01T..."           ISO 8601
 *   vault-excerpt     "The first line..."        T100: display preview, chunked; never a body
 */
const LIST_METADATA_FIELDS = {
  id: 'vault-id',
  title: 'vault-title',
  type: 'vault-type',
  status: 'vault-status',
  priority: 'vault-priority',
  categoryId: 'vault-category-id',
  categoryName: 'vault-category',
  tags: 'vault-tags',
  createdAt: 'vault-created',
  updatedAt: 'vault-updated',
  excerpt: 'vault-excerpt',
} as const

/** T098 - one Drive file as the listings return it, now including the list metadata. */
export interface DriveContentListingEntry {
  id: string
  name: string
  createdTime: string
  mimeType?: string
  appProperties?: Record<string, string>
}

/**
 * T102 - where a by-id read learned the item's category. Cheapest first:
 *
 *   - `listing-cache`: the row a T101 listing already holds. No Drive call at all.
 *   - `file-properties`: the file's own `appProperties` (T098). One metadata get.
 *   - `parent-folder`: neither source knew, so the file's parent folder was checked against the
 *     vault's categories (T094's discovery). A legacy file costs one extra query here.
 */
export type ContentCategorySource = 'listing-cache' | 'file-properties' | 'parent-folder'

/**
 * T102 - everything a by-id read needs before it asks for the body: which category the item is in,
 * the mime type (so the media read needs no metadata call of its own) and which source answered.
 *
 * This is not part of any API response - the shapes are pinned - it is the by-id resolver's answer,
 * so the route and its tests can see the call it saved instead of guessing.
 */
export interface ContentFileLocation {
  categoryName: string
  mimeType: string | null
  source: ContentCategorySource
}

/**
 * The key a chunk is written under: `baseKey` itself for the first, `baseKey-1`, `baseKey-2`, ...
 * for the rest. The suffix is part of the key Drive measures, which is why the split has to know
 * which chunk it is filling before it can know how much fits.
 */
function propertyChunkKey(baseKey: string, index: number): string {
  return index === 0 ? baseKey : `${baseKey}-${index}`
}

/**
 * Split a value into chunks that each satisfy the key+value budget for their own final key.
 *
 * Two rules, both learned the hard way:
 *
 *   1. BYTES, not characters, and the key counts. `splitByByteLength` cut at a fixed 120 bytes of
 *      VALUE and ignored the key entirely, so the first chunk of an excerpt came out at 120 value
 *      bytes under a 13-byte key: 133 against Drive's 124. Every long note was rejected on create.
 *   2. ITERATE CODE POINTS. `for (const character of value)` walks UTF-16 units, so an astral
 *      character such as an emoji arrives as two lone surrogates and could be split between two
 *      chunks, which corrupts the reassembled value. `Array.from` yields whole code points, so
 *      every character lands in exactly one chunk, unbroken.
 *
 * Returns null when the value cannot be chunked legally at all: either a single character does not
 * fit under its chunk's key (the key alone is too close to 124 bytes), or the value needs more
 * chunks than `readPropertyChunks` will walk. Null means "write nothing" - a half-written chunked
 * value reads back as null, which is worse than an absent property.
 */
function splitByPropertyBudget(value: string, baseKey: string): string[] | null {
  const characters = Array.from(value)
  const chunks: string[] = []
  let offset = 0

  while (offset < characters.length) {
    if (chunks.length >= MAX_PROPERTY_CHUNKS) return null

    const capacity = maxPropertyValueBytes(propertyChunkKey(baseKey, chunks.length))
    let bytes = 0
    let take = 0

    while (offset + take < characters.length) {
      const characterBytes = Buffer.byteLength(characters[offset + take], 'utf8')
      if (bytes + characterBytes > capacity) break
      bytes += characterBytes
      take += 1
    }

    // Not even one character fits on this key: the key is too long to carry a value.
    if (take === 0) return null

    chunks.push(characters.slice(offset, offset + take).join(''))
    offset += take
  }

  return chunks
}

/**
 * T098 - write one logical value across `baseKey`, `baseKey-1`, `baseKey-2`, ...
 *
 * A value that cannot be chunked legally is DROPPED with a warning rather than failing the save:
 * the note is what the user asked for, and its list index is derived data that a body read can
 * rebuild. Failing the whole create over a property (which is what Drive did to every long note
 * before this) loses the note itself.
 */
function writePropertyChunks(
  properties: Record<string, string>,
  baseKey: string,
  value: string
): void {
  const chunks = splitByPropertyBudget(value, baseKey)

  if (chunks === null) {
    console.warn(
      `Dropping list property "${baseKey}": a ${Buffer.byteLength(value, 'utf8')}-byte value ` +
        `cannot be split under Drive's ${MAX_PROPERTY_ENTRY_BYTES}-byte key+value limit. ` +
        'The note is saved; this file will list from its body instead.'
    )
    return
  }

  chunks.forEach((chunk, index) => {
    properties[propertyChunkKey(baseKey, index)] = chunk
  })
}

/**
 * T098 - read one logical value back.
 *
 * Returns null when the first chunk is missing or any chunk is not a string: an incomplete value is
 * indistinguishable from a wrong one, and a wrong row is worse than one body read.
 */
function readPropertyChunks(
  properties: Record<string, unknown>,
  baseKey: string
): string | null {
  const first = properties[baseKey]
  if (typeof first !== 'string') return null

  let value = first
  for (let index = 1; index <= MAX_PROPERTY_CHUNKS; index += 1) {
    const chunk = properties[`${baseKey}-${index}`]
    if (chunk === undefined) return value
    if (typeof chunk !== 'string') return null
    value += chunk
  }

  return null
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * T098 - tags are JSON on the wire (Drive only carries strings). Decoding is deliberately total:
 * a malformed value degrades to `[]` rather than throwing, because a bad tag list must never make
 * a note unlistable. Non-string members are dropped for the same reason.
 */
export function decodeTagList(raw: string | null | undefined): string[] {
  if (typeof raw !== 'string' || raw.trim() === '') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((tag): tag is string => typeof tag === 'string')
  } catch {
    return []
  }
}

/** T098 - one timestamp property, or null when it is absent or not a date. */
function readPropertyDate(properties: Record<string, unknown>, key: string): Date | null {
  const raw = readPropertyChunks(properties, key)
  if (raw === null || raw.trim() === '') return null

  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * T100 - how much of a note the list row's preview line shows, in characters.
 *
 * The list row's `content` is a preview, not the note. Before this the row was built from
 * properties with `content: ''` (T098), so every card on the fast path lost its preview line while
 * fetching bodies back would undo the whole optimisation. A bounded excerpt in the properties is
 * the compromise: 180 characters is more than a preview line renders, so nothing is cut visibly.
 */
export const CONTENT_EXCERPT_MAX_CHARS = 180

/**
 * T100 - the preview of a body: whitespace collapsed to single spaces, trimmed, cut to
 * `CONTENT_EXCERPT_MAX_CHARS`. No markup is stripped - the preview line is rendered as plain text,
 * and a stray `#` or `*` is the author's own text, not a list-path concern.
 *
 * This is the ONE definition of an excerpt: `encodeContentListProperties` runs any value it is
 * given through it, and `decodeContentListProperties` runs what it read back through it, so a
 * property can never hold an unbounded string even if a caller (or a corrupt map) tries.
 *
 * It is deliberately a pure string function with no access to `ContentMetadata`: an excerpt is
 * derived from the body being written, so it can never be confused with the body itself. Nothing
 * in the write path ever reads it back.
 */
export function buildContentExcerpt(text: string): string {
  if (typeof text !== 'string') return ''
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= CONTENT_EXCERPT_MAX_CHARS) return collapsed
  // Code points, not UTF-16 units: a preview must never end in half an emoji. The trailing space a
  // cut can leave behind is dropped, which also makes this function idempotent - decoding a stored
  // excerpt through it returns the same string, so an encode/decode round trip is exact.
  return Array.from(collapsed).slice(0, CONTENT_EXCERPT_MAX_CHARS).join('').trimEnd()
}

/**
 * T098 - the `appProperties` a content file carries, so a listing can build its row without
 * reading the body. Called on create AND on update: a stale list row is the bug this exists to
 * avoid, and an update that skipped this would leave one behind permanently.
 *
 * Empty optional values are omitted, exactly as their frontmatter lines are: an absent priority
 * stays absent instead of becoming `''`.
 */
export function encodeContentListProperties(
  metadata: ContentMetadata
): Record<string, string> {
  const properties: Record<string, string> = {
    [LIST_METADATA_VERSION_KEY]: LIST_METADATA_VERSION,
  }

  const createdAt =
    metadata.createdAt instanceof Date && !Number.isNaN(metadata.createdAt.getTime())
      ? metadata.createdAt.toISOString()
      : ''
  const updatedAt =
    metadata.updatedAt instanceof Date && !Number.isNaN(metadata.updatedAt.getTime())
      ? metadata.updatedAt.toISOString()
      : ''

  const values: Array<[string, string]> = [
    [LIST_METADATA_FIELDS.id, typeof metadata.id === 'string' ? metadata.id : ''],
    [LIST_METADATA_FIELDS.title, typeof metadata.title === 'string' ? metadata.title : ''],
    [LIST_METADATA_FIELDS.type, typeof metadata.type === 'string' ? metadata.type : ''],
    [LIST_METADATA_FIELDS.status, typeof metadata.status === 'string' ? metadata.status : ''],
    [
      LIST_METADATA_FIELDS.priority,
      typeof metadata.priority === 'string' ? metadata.priority : '',
    ],
    [
      LIST_METADATA_FIELDS.categoryId,
      typeof metadata.categoryId === 'string' ? metadata.categoryId : '',
    ],
    [
      LIST_METADATA_FIELDS.categoryName,
      typeof metadata.categoryName === 'string'
        ? metadata.categoryName.replace(/[\r\n]+/g, ' ').trim()
        : '',
    ],
    [
      LIST_METADATA_FIELDS.tags,
      JSON.stringify(Array.isArray(metadata.tags) ? metadata.tags : []),
    ],
    [LIST_METADATA_FIELDS.createdAt, createdAt],
    [LIST_METADATA_FIELDS.updatedAt, updatedAt],
    // T100: bounded here, not at the caller, so no write can put an unbounded value on the file.
    [
      LIST_METADATA_FIELDS.excerpt,
      typeof metadata.excerpt === 'string' ? buildContentExcerpt(metadata.excerpt) : '',
    ],
  ]

  for (const [key, value] of values) {
    if (value === '') continue
    writePropertyChunks(properties, key, value)
  }

  return properties
}

/**
 * T098 - the list metadata a Drive file carries, or null when it has none this code understands.
 *
 * Null is the legacy signal: a file written before T098 (or by a future schema) has no properties,
 * and the caller must read its body exactly as before. Nothing here can return a body - there is
 * nowhere for one to live in `ContentMetadata` and nothing is read from it.
 */
export function decodeContentListProperties(
  appProperties: unknown
): ContentMetadata | null {
  if (!isRecordValue(appProperties)) return null
  if (appProperties[LIST_METADATA_VERSION_KEY] !== LIST_METADATA_VERSION) return null

  const title = readPropertyChunks(appProperties, LIST_METADATA_FIELDS.title)
  const type = readPropertyChunks(appProperties, LIST_METADATA_FIELDS.type)
  const status = readPropertyChunks(appProperties, LIST_METADATA_FIELDS.status)
  const createdAt = readPropertyDate(appProperties, LIST_METADATA_FIELDS.createdAt)
  const updatedAt = readPropertyDate(appProperties, LIST_METADATA_FIELDS.updatedAt)

  // A row missing a required field is not a row: fall back to the body rather than invent one.
  if (title === null || type === null || status === null || !createdAt || !updatedAt) {
    return null
  }

  const priority = readPropertyChunks(appProperties, LIST_METADATA_FIELDS.priority)
  const categoryId = readPropertyChunks(appProperties, LIST_METADATA_FIELDS.categoryId)
  const categoryName = readPropertyChunks(appProperties, LIST_METADATA_FIELDS.categoryName)

  // T100: the excerpt is OPTIONAL and never a reason to reject a row. A missing key, a non-string
  // chunk or an empty value is simply "no preview" - the row still lists, exactly as a missing
  // priority does. Anything that did read is bounded again, so a corrupt map cannot put an
  // unbounded string into a rendered row.
  const excerpt = readPropertyChunks(appProperties, LIST_METADATA_FIELDS.excerpt)
  const excerptPreview = excerpt === null ? '' : buildContentExcerpt(excerpt)

  return {
    id: readPropertyChunks(appProperties, LIST_METADATA_FIELDS.id) ?? '',
    title,
    type,
    status,
    priority: priority ?? undefined,
    categoryId: categoryId ?? undefined,
    categoryName: categoryName ?? undefined,
    tags: decodeTagList(readPropertyChunks(appProperties, LIST_METADATA_FIELDS.tags)),
    createdAt,
    updatedAt,
    excerpt: excerptPreview === '' ? undefined : excerptPreview,
  }
}

/**
 * T102 - the category NAME a file's list properties state, or null.
 *
 * Deliberately only this one value. A by-id read has to know which category a note is in, and a file
 * written by T098 or later already says so (`LIST_METADATA_FIELDS.categoryName`), which makes one
 * metadata get enough. Nothing else in `appProperties` is read on this path: in particular the
 * excerpt is a list preview and must never reach an editor.
 *
 * A file from before T098 has no properties at all and answers null here, which is what sends the
 * caller to the parent-folder path instead.
 */
export function readCategoryNameProperty(appProperties: unknown): string | null {
  if (!isRecordValue(appProperties)) return null

  const name = readPropertyChunks(appProperties, LIST_METADATA_FIELDS.categoryName)
  const trimmed = typeof name === 'string' ? name.trim() : ''
  return trimmed === '' ? null : trimmed
}

/**
 * T097 - how long a discovered vault structure is trusted.
 *
 * Five minutes: long enough that a normal session never pays the walk twice, short enough that a
 * folder created outside this app (a rename in the Drive UI, a folder trashed while the app was
 * idle) corrects itself without a restart. Nothing here is a content cache - see the note on
 * `vaultStructureCache`.
 */
const VAULT_STRUCTURE_TTL_MS = 5 * 60 * 1000

/**
 * T097 - how many Drive requests one listing may have in flight at once.
 *
 * Drive quota is per account and a burst is the way to trip it, so the reads are parallel but
 * bounded. Six is the number the task fixes: comfortably above one (so a vault listing is not a
 * serial chain) and low enough that ten folder listings do not all open at once.
 */
export const DRIVE_READ_CONCURRENCY = 6

/**
 * T101 - how many FOLDER LISTINGS one walk may have in flight at once.
 *
 * Separate from `DRIVE_READ_CONCURRENCY` on purpose, and larger, because the two are different
 * requests: a folder listing is one metadata page (`fields=files(id,name,createdTime,mimeType,
 * appProperties)`, `pageSize=100`) with no media transfer, while a read downloads a file body.
 *
 * Ten, because that is the size of the measured vault and the point of the change: with the old cap
 * of six, the ten category folders of the real account were two sequential waves at ~900 ms each.
 * At ten they are one wave, and the only remaining sequential hops are the two discovery levels.
 *
 * Why ten is safe: Drive's per-user quota is far above this (12,000 queries / 100 s / user, and the
 * same again per project, plus a burst allowance), so a walk of ten or eleven concurrent metadata
 * reads is a handful, not a storm. It is a FIXED number, not "one per folder": a vault with fifty
 * category folders still runs five waves, capped at ten, so the burst cannot grow with the vault.
 */
export const DRIVE_LIST_CONCURRENCY = 10

/**
 * T101 - how long one folder's listing is trusted: 15 s.
 *
 * This is a DISPLAY cache and nothing else. It sits inside the task's 10-20 s window because that
 * is the interval in which "did my save show up?" is still a live question: long enough that the
 * several requests a dashboard makes on mount (and the ones a reload fires) share one walk, short
 * enough that a change made in another tab, in the mobile app or in the Drive UI - which cannot
 * invalidate this process - corrects itself while the user is still looking at the screen.
 *
 * Every write that goes through this app invalidates it outright (create, update, delete, category
 * create, category change), so the TTL is the backstop for writes this process did not see, not the
 * mechanism that makes the user's own change visible.
 */
export const CONTENT_LISTING_TTL_MS = 15 * 1000

/**
 * T101 - how long a deleted file id is remembered as deleted: 5 minutes.
 *
 * Longer than the listing TTL on purpose. The stale-cache risk has two halves: a cached listing
 * that still contains the file (bounded by `CONTENT_LISTING_TTL_MS`) and a Drive listing that has
 * not caught up with the delete yet (unbounded, which is exactly why `mergeRecentSaves` exists).
 * A tombstone covers both, and it is keyed by file id, which Drive never reuses - so it can never
 * hide a different, later note.
 */
const DELETED_CONTENT_TOMBSTONE_TTL_MS = 5 * 60 * 1000

interface CachedVaultStructure {
  structure: VaultFolderStructure
  expiresAt: number
}

/**
 * T097 - the vault structure cache, and the whole reason the content route got fast.
 *
 * `initializeVaultStructure` answers "where is the Vault folder, and where is each category
 * folder?". Before this, that answer cost eight sequential `files.list` calls (Vault, then one per
 * default category) and it was recomputed on **every** request, because `GoogleDriveContentAdapter`
 * is constructed per request and an instance field dies with it. Measured against the real account:
 * `GET /api/content` 11.6 s and `GET /api/content?categoryId=...` 6.2 s with a single note in the
 * vault - almost all of it this walk.
 *
 * So the state is module-level: a long-running server keeps the module alive, and the next request
 * on the same account reads the structure instead of rediscovering it. Keyed by account **and** the
 * requested category set, so the `drive/setup` route's custom category list never overwrites the
 * defaults' entry.
 *
 * What is deliberately NOT cached: content. A note's body is read from Drive on every request,
 * because a stale note is worse than a slow one. `folders` is shared with the cache entry on
 * purpose: `findCategoryFolderId` and `createCategoryFolder` register what they learn into it, so
 * the next request inherits it.
 */
const vaultStructureCache = new Map<string, CachedVaultStructure>()

/** T097 - walks in progress, so two concurrent cold requests pay the walk once, not twice. */
const vaultStructureInFlight = new Map<string, Promise<VaultFolderStructure>>()

function vaultStructureKey(userId: string, categories: readonly string[]): string {
  const signature = categories
    .map((category) => category.trim().toLowerCase())
    .sort()
    .join(',')
  return `${userId}\u0000${signature}`
}

/**
 * T097 - forget this account's cached structures.
 *
 * Called when a folder is created (so the new folder is visible immediately rather than after the
 * TTL) and when a cached folder id turns out to be stale (so the retry rebuilds from Drive).
 */
export function invalidateVaultStructureCache(userId: string): void {
  const prefix = `${userId}\u0000`
  for (const key of Array.from(vaultStructureCache.keys())) {
    if (key.startsWith(prefix)) vaultStructureCache.delete(key)
  }
}

/**
 * T097 - drop every cached structure.
 *
 * For tests: the cache is module-level by design, which is exactly what makes it survive a request,
 * so a test that wants a cold path has to say so explicitly.
 *
 * T101: this now clears EVERY module-level cache in this file - structures, folder listings and the
 * delete tombstones - because a test asking for a cold process wants all three cold. The listing and
 * tombstone caches have their own resets when only those need clearing.
 */
export function resetVaultStructureCache(): void {
  vaultStructureCache.clear()
  vaultStructureInFlight.clear()
  resetContentListingCache()
}

/**
 * T097 - `Promise.all` with a concurrency cap, preserving input order.
 *
 * `Promise.all` alone would open one Drive request per folder or per file, which is how a large
 * vault trips the quota. Results are written by index, so callers (and the page's own sort) see the
 * listing order, not the completion order.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []

  const results = new Array<R>(items.length)
  const workerCount = Math.min(Math.max(1, Math.floor(limit)), items.length)
  let nextIndex = 0

  const workers = Array.from({ length: workerCount }, async () => {
    for (;;) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      results[index] = await mapper(items[index], index)
    }
  })

  await Promise.all(workers)
  return results
}

/**
 * T101 - one folder's listing, as it is cached.
 *
 * `entries` is what `files.list` already returns for that folder (id, name, createdTime, mimeType,
 * appProperties). No body is ever stored here, and nothing in this cache can answer a content read:
 * opening a note still goes through `readMarkdownContent`.
 */
interface CachedContentListing {
  entries: DriveContentListingEntry[]
  expiresAt: number
}

/**
 * T101 - folder id -> the rows Drive listed for it, for a few seconds.
 *
 * The list request walks one Drive endpoint per category folder, and every one of them costs a
 * round-trip (~900 ms against the real account). Most of those walks are the same walk: a dashboard
 * mount fires several requests, a reload fires them again, and `locateContent` in the by-id routes
 * lists a category just to find one file. This map makes the second and later walks free.
 *
 * Module-level and keyed by ACCOUNT **and** folder id, because the adapter/backend is constructed
 * per request (`new GoogleDriveContentAdapter(oauth2Client, session.user.id)`), so an instance field
 * would die before it could be reused - and because two accounts must never see each other's rows.
 *
 * What it is NOT: a source of truth. It is invalidated by every write this app performs, it expires
 * on its own after `CONTENT_LISTING_TTL_MS`, and it holds metadata only - a row's body is read from
 * Drive on request.
 */
const contentListingCache = new Map<string, CachedContentListing>()

/**
 * T101 - file ids deleted through this app, and when the memory expires.
 *
 * The listing cache is invalidated on delete, but two things can still hand back a deleted row: a
 * listing already in flight when the delete landed, and Drive's own listing lag (the same lag that
 * `mergeRecentSaves` exists for). A tombstone makes "deleted" a fact this process holds rather than
 * something it hopes the next listing agrees with, so a deleted note cannot reappear in the list
 * while the page is still open.
 */
const deletedContentFileIds = new Map<string, number>()

function contentListingCacheKey(userId: string, folderId: string): string {
  return `${userId}\u0000${folderId}`
}

function deleteTombstoneKey(userId: string, fileId: string): string {
  return `${userId}\u0000${fileId}`
}

/** T101 - has this account deleted this file, recently enough to still be sure? */
function isContentFileDeleted(userId: string, fileId: string): boolean {
  const key = deleteTombstoneKey(userId, fileId)
  const expiresAt = deletedContentFileIds.get(key)
  if (expiresAt === undefined) return false

  if (expiresAt > Date.now()) return true

  deletedContentFileIds.delete(key)
  return false
}

/**
 * T101 - a deleted file id must not come back from a listing that has not caught up.
 *
 * Called only after Drive has actually accepted the delete, so a failed delete cannot hide a note
 * that is still there.
 */
export function rememberDeletedContentFile(userId: string, fileId: string): void {
  deletedContentFileIds.set(
    deleteTombstoneKey(userId, fileId),
    Date.now() + DELETED_CONTENT_TOMBSTONE_TTL_MS
  )
}

/**
 * T101 - forget this account's cached folder listings.
 *
 * Called by every write path: create, update, delete, category create and category change. The next
 * list therefore asks Drive, instead of answering with rows that predate the change the user just
 * made.
 */
export function invalidateContentListingCache(userId: string): void {
  const prefix = `${userId}\u0000`
  for (const key of Array.from(contentListingCache.keys())) {
    if (key.startsWith(prefix)) contentListingCache.delete(key)
  }
}

/**
 * T101 - drop every cached listing and every delete tombstone.
 *
 * For tests: both maps are module-level by design, so a test that wants a cold process (or that
 * wants to reuse a file id after deleting it) has to say so.
 */
export function resetContentListingCache(): void {
  contentListingCache.clear()
  deletedContentFileIds.clear()
}

/**
 * T101 - the key a discovered child-folder set is cached under: the sorted, de-duplicated parent
 * ids. Two walks that ask the same question share one answer; a walk that asks about a different
 * set asks Drive.
 */
function childFoldersCacheKey(parentIds: readonly string[]): string {
  return Array.from(new Set(parentIds)).sort().join(',')
}

/**
 * T101 - how many entries the two maps may hold before expired ones are swept.
 *
 * Both caches are small (one entry per folder, one per deleted id) and both expire, but a
 * long-running server that serves many accounts should not grow them forever just because nobody
 * listed an old folder again. The sweep is O(n) and only runs when the map is already this big, so
 * it costs nothing in the normal case.
 */
const CONTENT_CACHE_PRUNE_THRESHOLD = 256

/** T101 - drop the cache entries whose TTL has already passed. */
function pruneExpiredContentCacheEntries(now: number): void {
  for (const [key, entry] of Array.from(contentListingCache.entries())) {
    if (entry.expiresAt <= now) contentListingCache.delete(key)
  }
  for (const [key, expiresAt] of Array.from(deletedContentFileIds.entries())) {
    if (expiresAt <= now) deletedContentFileIds.delete(key)
  }
}

/**
 * T102 - the first parent folder id from a metadata `parents` array, or null.
 *
 * Drive answers `parents` as a string array; a file created in the Drive root may have none. The
 * value is `unknown` because it comes off the wire, so it is narrowed rather than asserted.
 */
function firstParentId(parents: unknown): string | null {
  if (!Array.isArray(parents)) return null

  const [parent] = parents
  return typeof parent === 'string' && parent.length > 0 ? parent : null
}

/**
 * T097 - "Drive says it is not there", however googleapis surfaced it.
 *
 * A `files.list` scoped to a deleted parent can answer 404 (`File not found`), and a `files.get` on
 * a trashed folder always does; the client wraps that in a plain `Error` whose message is JSON. Both
 * shapes have to be recognised, because both mean the same thing to the caller: a cached id is
 * stale.
 */
function isDriveNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const candidate = error as {
    code?: unknown
    status?: unknown
    message?: unknown
    response?: { status?: unknown }
  }
  const status = candidate.code ?? candidate.status ?? candidate.response?.status
  if (status === 404) return true

  const message = typeof candidate.message === 'string' ? candidate.message : ''
  return message.includes('404') || /not found/i.test(message)
}

export interface ContentMetadata {
  id: string
  title: string
  type: string
  status: string
  priority?: string
  createdAt: Date
  updatedAt: Date
  tags?: string[]
  categoryId?: string
  /**
   * T097 - the category this note lives in, by NAME.
   *
   * `categoryId` alone cannot describe a note: the page sends `selectedCategory?.id`, which is
   * empty when no category is picked, so the file said `categoryId: ""` and nothing in it said
   * where it belonged. The resolved name is written alongside it and never replaces it. Optional on
   * read: every file written before this field existed must still parse.
   */
  categoryName?: string
  /**
   * T100 - a bounded preview of the note's body, for the list row's preview line ONLY.
   *
   * It lives in `appProperties` (see `buildContentExcerpt`), never in the markdown: the frontmatter
   * writer does not emit it and the frontmatter parser does not read it, so an opened note can never
   * come back with this in place of its body. `saveContentAsMarkdown`/`updateMarkdownContent` set it
   * from the content they are writing, which is why a save can never write a stale preview back as
   * the note.
   */
  excerpt?: string
  customFields?: Record<string, any>
}

export class GoogleDriveBackendService {
  private drive: any
  private oauth2Client: OAuth2Client
  private userId: string
  private vaultFolderStructure: VaultFolderStructure | null = null
  /** T097 - the cache key this instance last initialized with, for invalidation and re-seeding. */
  private structureCacheKey: string | null = null
  /** T097 - the effective category list, so a stale-id rebuild asks Drive for the same folders. */
  private structureCategories: string[] = [...DEFAULT_CATEGORIES]

  constructor(oauth2Client: OAuth2Client, userId: string) {
    this.oauth2Client = oauth2Client
    this.drive = google.drive({ version: 'v3', auth: oauth2Client })
    this.userId = userId
  }

  /**
   * Initialize the Vault folder structure in Google Drive
   * Creates Vault folder and default category folders if they don't exist
   *
   * T097: this is now a cache read on every request after the first. See `vaultStructureCache` for
   * why the state is module-level and why only the *structure* is cached.
   */
  async initializeVaultStructure(defaultCategories: string[] = []): Promise<VaultFolderStructure> {
    const categories =
      defaultCategories.length > 0 ? [...defaultCategories] : [...DEFAULT_CATEGORIES]
    const key = vaultStructureKey(this.userId, categories)

    this.structureCacheKey = key
    this.structureCategories = categories

    const cached = vaultStructureCache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      // The same object is shared with the cache entry on purpose: a folder another request
      // registers (a custom category) is then already known here.
      this.vaultFolderStructure = cached.structure
      return cached.structure
    }

    const inFlight = vaultStructureInFlight.get(key)
    if (inFlight) {
      // Another request is already walking the tree. Wait for its answer instead of paying the
      // same round-trips a second time.
      this.vaultFolderStructure = await inFlight
      return this.vaultFolderStructure
    }

    const pending = this.buildVaultStructure(categories)
    vaultStructureInFlight.set(key, pending)
    try {
      const structure = await pending
      this.vaultFolderStructure = structure
      vaultStructureCache.set(key, {
        structure,
        expiresAt: Date.now() + VAULT_STRUCTURE_TTL_MS,
      })
      return structure
    } finally {
      vaultStructureInFlight.delete(key)
    }
  }

  /**
   * T097 - the cold path: one Vault lookup, then the category lookups CONCURRENTLY.
   *
   * Why the concurrency is safe:
   *
   *   - each lookup is an independent read, `name='<category>' and '<vault>' in parents`; they
   *     share nothing mutable, and `vaultFolderId` is resolved by the first `await` before any of
   *     them starts;
   *   - the categories are distinct names, so parallel find-or-create cannot race itself into two
   *     folders holding the same name (that race already existed between processes and is
   *     unchanged; the cache in front of it makes it rarer);
   *   - `Promise.all` preserves input order, so the `folders` map is built deterministically and a
   *     test can assert on it.
   *
   * Cold cost: 1 + 1 round-trips for the setup instead of 1 + 7.
   */
  private async buildVaultStructure(categories: string[]): Promise<VaultFolderStructure> {
    try {
      // Find or create Vault folder
      const vaultFolder = await this.findOrCreateFolder('Vault', null)
      const vaultFolderId = vaultFolder.id

      const entries = await Promise.all(
        categories.map(async (category) => {
          const folder = await this.findOrCreateFolder(category, vaultFolderId)
          const name = typeof folder.name === 'string' && folder.name ? folder.name : category
          return { key: category.toLowerCase(), id: folder.id, name }
        })
      )

      const folders: Record<string, string> = {}
      const folderNames: Record<string, string> = {}
      for (const entry of entries) {
        folders[entry.key] = entry.id
        folderNames[entry.key] = entry.name
      }

      return { vaultFolderId, folders, folderNames }
    } catch (error) {
      console.error('Error initializing Vault structure:', error)
      throw error
    }
  }

  /**
   * T097 - a cached folder id can name a folder that no longer exists: deleted, renamed, trashed
   * while this process still had the structure cached. One retry with a rebuilt structure, then the
   * error belongs to the caller again - the retry is capped at one on purpose, so a genuinely broken
   * Drive fails fast instead of walking the tree in a loop.
   */
  private async retryOnceWithFreshStructure<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (!isDriveNotFoundError(error)) throw error

      console.error(
        'A cached Vault folder is no longer in Drive: rebuilding the Vault structure and retrying once.'
      )
      invalidateVaultStructureCache(this.userId)
      // T101: the cached folder listings were read through those stale ids, so they are suspect
      // for the same reason and have to go with the structure.
      invalidateContentListingCache(this.userId)
      this.vaultFolderStructure = null
      this.structureCacheKey = null
      await this.initializeVaultStructure(this.structureCategories)
      return await operation()
    }
  }

  /**
   * Find existing folder or create new one
   */
  private async findOrCreateFolder(folderName: string, parentFolderId: string | null): Promise<{ id: string; name: string }> {
    try {
      // Search for existing folder
      let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
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

      // Create new folder
      const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        ...(parentFolderId && { parents: [parentFolderId] })
      }

      const createResponse = await this.drive.files.create({
        resource: fileMetadata,
        fields: 'id, name'
      })

      return createResponse.data
    } catch (error) {
      console.error(`Error finding or creating folder ${folderName}:`, error)
      throw error
    }
  }

  /**
   * Create a new category folder in Vault (find-or-create by name)
   *
   * T094: refuses an id-shaped name outright. This is the last line of defence - the write path
   * resolves an id to a name (or falls back) before it gets here, so the only way to reach this
   * throw is a caller that skipped that resolution.
   */
  async createCategoryFolder(categoryName: string): Promise<string> {
    if (!this.vaultFolderStructure) {
      throw new Error('Vault structure not initialized. Call initializeVaultStructure first.')
    }

    assertCategoryNameIsNotDriveId(categoryName)

    const folder = await this.findOrCreateFolder(categoryName, this.vaultFolderStructure.vaultFolderId)
    const key = categoryName.toLowerCase()
    this.vaultFolderStructure.folders[key] = folder.id
    if (this.vaultFolderStructure.folderNames) {
      this.vaultFolderStructure.folderNames[key] = folder.name || categoryName
    }

    // T101: a new folder is new children for the Vault root. Registering it in the structure's own
    // discovery cache keeps the next "all content" walk free, instead of re-querying a level whose
    // only change is the folder we just created.
    const rootKey = childFoldersCacheKey([this.vaultFolderStructure.vaultFolderId])
    const rootChildren = this.vaultFolderStructure.childFolders?.[rootKey]
    if (rootChildren && !rootChildren.some((child) => child.id === folder.id)) {
      this.vaultFolderStructure.childFolders![rootKey] = [
        ...rootChildren,
        { id: folder.id, name: folder.name || categoryName },
      ]
    }

    // T097: a folder created now must be visible to the NEXT request, not after the TTL. Drop every
    // structure cached for this account, then re-seed this instance's key with the folder it just
    // learned, so the very next `listCategoryFiles` / write resolves it from the map.
    invalidateVaultStructureCache(this.userId)

    // T101: the cached listings describe a vault without this folder, so a cached "all content"
    // answer must not be served either. (Nothing is cached under the new folder's id yet.)
    invalidateContentListingCache(this.userId)
    if (this.structureCacheKey) {
      vaultStructureCache.set(this.structureCacheKey, {
        structure: this.vaultFolderStructure,
        expiresAt: Date.now() + VAULT_STRUCTURE_TTL_MS,
      })
    }

    return folder.id
  }

  /**
   * T094 - the folder a write goes to, as an id.
   *
   * The requested value is a category NAME at this point. Three cases:
   *
   *   1. a known category (default or already registered) -> its folder,
   *   2. an unknown, name-shaped value -> find-or-create by name under Vault (the pre-existing
   *      behaviour for a genuinely new category, and also how a custom category created by the
   *      categories adapter is found),
   *   3. an unknown, id-shaped value (a stale selection) -> the default folder.
   *
   * Case 3 is the repair: it falls back instead of creating `Vault/<id>`. The fallback is the
   * 'Notes' folder when it exists, otherwise the first known category folder, so a vault built with
   * custom `defaultCategories` still has somewhere to write.
   */
  private async resolveWriteFolderId(categoryName: string): Promise<string> {
    if (!this.vaultFolderStructure) {
      throw new Error('Vault structure not initialized')
    }

    const requested = typeof categoryName === 'string' ? categoryName.trim() : ''
    const known = requested
      ? this.vaultFolderStructure.folders[requested.toLowerCase()]
      : undefined
    if (known) return known

    if (requested && !looksLikeDriveId(requested)) {
      // findOrCreateFolder classifies by name under Vault, so an existing custom category is
      // reused rather than duplicated.
      return this.createCategoryFolder(requested)
    }

    const fallback =
      this.vaultFolderStructure.folders[DEFAULT_CATEGORY_NAME.toLowerCase()] ??
      Object.values(this.vaultFolderStructure.folders)[0]

    if (!fallback) {
      throw new Error(`No category folder is available to write "${requested}" into`)
    }

    console.error(
      `Unknown category ${JSON.stringify(requested)}: writing to the default category folder instead ` +
        'of creating a folder named after the id'
    )
    return fallback
  }

  /**
   * T094 - the name a category id stands for, if it still names a folder in Drive.
   *
   * Returns null for anything that is not a folder: an unknown id, a deleted folder, or a string
   * that is not an id at all. A 404 from Drive is the normal answer for a stale selection.
   */
  async findFolderNameById(folderId: string): Promise<string | null> {
    try {
      const response = await this.drive.files.get({
        fileId: folderId,
        fields: 'id, name, mimeType'
      })

      const file = response.data
      if (!file || file.mimeType !== FOLDER_MIME_TYPE || typeof file.name !== 'string') {
        return null
      }

      return file.name
    } catch (error) {
      console.error(`Category folder ${folderId} could not be resolved by id:`, error)
      return null
    }
  }

  /**
   * T095 - the folder a file lives in, as an id.
   *
   * A note's own metadata is the one piece of state that always knows where the note is: `parents`
   * is the category folder this app wrote it into. One `files.get` answers it, which is what lets
   * GET/PATCH/DELETE locate an item by file id alone instead of guessing a category name.
   *
   * The id is only half the answer - the caller still needs a folder id -> name resolution, which
   * is `findFolderNameById` (T094). Nothing is created, renamed or moved here.
   *
   * Returns null for a file that cannot answer: a deleted file, a Drive error, or a file with no
   * parent (the user's Drive root). It never throws, so the caller's 404 contract stays a 404
   * rather than becoming a 500.
   */
  async findParentFolderId(fileId: string): Promise<string | null> {
    try {
      const response = await this.drive.files.get({
        fileId,
        fields: 'id, parents'
      })

      return firstParentId(response.data?.parents)
    } catch (error) {
      console.error(`File ${fileId} could not be resolved to its parent folder:`, error)
      return null
    }
  }

  /**
   * T102 - the category and mime type a by-id READ needs, without listing a category folder.
   *
   * T095 located an item by listing its category folder and looking for the id it had been given.
   * For a file the caller already has an id for that listing is pure cost: the id is enough to
   * address the file, and the category is only needed because the caller asked "where does this
   * live?". That route measured four sequential steps - parents, folder name, category listing,
   * body - five requests at ~900 ms each, for a note the page had just listed.
   *
   * The category is therefore taken from the cheapest source that already knows it:
   *
   *   1. the row a T101 listing cached - a file the page listed seconds ago needs NO metadata call
   *      (`listing-cache`, zero Drive calls);
   *   2. the file's own `appProperties.vault-category`, which T098 writes on every save - one
   *      metadata get names the category, with no folder-name query after it (`file-properties`);
   *   3. the file's parent folder, checked against the vault's category folders - the legacy path
   *      for a file written before T098 (`parent-folder`, one extra query, cached on the structure).
   *
   * No Drive id -> name resolution is duplicated here: `parent-folder` asks T094's folder discovery
   * (`listChildFolders`, which is cached with the structure) for both the membership and the name,
   * and `resolveCategory`/`findFolderNameById` remain the only by-id resolver in the app.
   *
   * Returns null - never a throw - when the id is not one of the app's own markdown files: a missing
   * or trashed file, a Google editors object (which `alt=media` cannot read at all), any other mime
   * type, markdown outside the vault's category folders, or a file this process has deleted. The
   * caller's existing answer to null is 404, so none of those become a 500 or a blank note.
   */
  async locateContentFile(fileId: string): Promise<ContentFileLocation | null> {
    // T101: a file this process deleted must not be served, whatever a stale cached row says.
    if (isContentFileDeleted(this.userId, fileId)) return null

    const cached = this.findCachedContentFile(fileId)
    if (cached) return cached

    const file = await this.readFileMetadata(fileId)
    if (!file) return null

    // A trashed file is not content: every listing asks for `trashed=false`, so the pre-T102 route
    // answered 404 for one. Its metadata still answers, which is why this is checked here.
    if (file.trashed) return null

    // Only the app's own markdown is content. An editors file cannot be downloaded, and any other
    // mime type is not a note, so both stay the pre-existing 404 instead of a body read.
    if (file.mimeType !== MARKDOWN_MIME_TYPE) return null

    const fromProperties = readCategoryNameProperty(file.appProperties)
    if (fromProperties) {
      return { categoryName: fromProperties, mimeType: file.mimeType, source: 'file-properties' }
    }

    const parentFolderId = firstParentId(file.parents)
    if (!parentFolderId) return null

    const categoryName = await this.categoryFolderName(parentFolderId)
    if (!categoryName) return null

    return { categoryName, mimeType: file.mimeType, source: 'parent-folder' }
  }

  /**
   * T102 - the listing-cache row for this file, if a cached listing holds it.
   *
   * A pure cache read: the map is module-level and keyed by account + folder id (T101), so the
   * folder id comes out of the key. A row is only accepted when its folder is one of the vault's
   * categories - the structure cache knows their ids - so a cached row can never turn a file outside
   * the vault into an app item. When the folder cannot be named the lookup simply misses and the
   * caller pays one metadata get instead of answering with a name it does not know.
   */
  private findCachedContentFile(fileId: string): ContentFileLocation | null {
    const prefix = `${this.userId}\u0000`
    const now = Date.now()

    for (const [key, entry] of contentListingCache) {
      if (!key.startsWith(prefix) || entry.expiresAt <= now) continue

      const row = entry.entries.find((candidate) => candidate.id === fileId)
      if (!row) continue

      const categoryName = this.structureCategoryName(key.slice(prefix.length))
      if (!categoryName) continue

      return { categoryName, mimeType: row.mimeType ?? null, source: 'listing-cache' }
    }

    return null
  }

  /**
   * T102 - a category's display name from the structure cache, keyed by folder id, or null.
   *
   * No Drive call: `initializeVaultStructure` already knows every category folder it created or
   * found, by name. Only those top-level folders count as categories, which is exactly the
   * membership rule the pre-T102 listing-based lookup enforced.
   */
  private structureCategoryName(folderId: string): string | null {
    const structure = this.vaultFolderStructure
    if (!structure) return null

    for (const [key, id] of Object.entries(structure.folders)) {
      if (id !== folderId) continue
      return structure.folderNames?.[key] ?? key
    }

    return null
  }

  /**
   * T102 - the category a parent folder id names, or null when it is not one of the vault's.
   *
   * Reuses T094's folder discovery, which T101 caches on the structure: one query answers both
   * "which folders are categories?" and "what is this one called?", and a vault that has already
   * been listed pays nothing. This is the legacy path - a note written before T098 carries no
   * `vault-category`, so it cannot name its own category and its parent has to be checked.
   */
  private async categoryFolderName(folderId: string): Promise<string | null> {
    const known = this.structureCategoryName(folderId)
    if (known) return known

    const structure = this.vaultFolderStructure
    if (!structure) return null

    const children = await this.listChildFolders([structure.vaultFolderId])
    const match = children.find((child) => child.id === folderId)
    return match?.name ?? null
  }

  /**
   * T102 - one metadata get with exactly the fields a by-id read needs.
   *
   * `appProperties` is what makes the read two calls instead of four: it carries the category T098
   * wrote. `parents` is the fallback for a legacy file. `trashed` is read because every listing
   * asks for `trashed=false`, so a trashed note answered 404 before and must keep doing so.
   * Nothing here can return a body - the body still comes from `readMarkdownContent` - so this can
   * never serve a note from properties.
   *
   * A Drive error (a deleted file, a permission failure) answers null, exactly as
   * `findParentFolderId` does, so the caller's 404 contract does not become a 500.
   */
  private async readFileMetadata(fileId: string): Promise<{
    mimeType: string | null
    parents: unknown
    appProperties?: unknown
    trashed: boolean
  } | null> {
    try {
      const response = await this.drive.files.get({
        fileId,
        fields: 'id, name, mimeType, parents, appProperties, trashed'
      })

      const data = response.data ?? {}
      return {
        mimeType: typeof data.mimeType === 'string' ? data.mimeType : null,
        parents: data.parents,
        appProperties: data.appProperties,
        trashed: data.trashed === true,
      }
    } catch (error) {
      console.error(`File ${fileId} could not be read by id:`, error)
      return null
    }
  }

  /**
   * T094 - the folder id for a category name, WITHOUT creating anything.
   *
   * The in-memory map only holds the defaults created by `initializeVaultStructure`, so a custom
   * category created through the categories adapter has to be found by name once and is then
   * registered. A name that names no folder returns null (the caller lists an empty category).
   */
  private async findCategoryFolderId(categoryName: string): Promise<string | null> {
    if (!this.vaultFolderStructure) {
      throw new Error('Vault structure not initialized')
    }

    const key = categoryName.toLowerCase()
    const known = this.vaultFolderStructure.folders[key]
    if (known) return known

    const response = await this.drive.files.list({
      q: `name='${this.escapeQueryValue(categoryName)}' and mimeType='${FOLDER_MIME_TYPE}' and '${this.vaultFolderStructure.vaultFolderId}' in parents and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name)',
      pageSize: 1
    })

    const folder = (response.data.files || [])[0] as { id: string; name: string } | undefined
    if (!folder) return null

    this.vaultFolderStructure.folders[key] = folder.id
    // T097: remember the folder's real name too, so a note written here says `Poetry`, not `poetry`.
    if (this.vaultFolderStructure.folderNames && folder.name) {
      this.vaultFolderStructure.folderNames[key] = folder.name
    }
    return folder.id
  }

  /**
   * T103 - the category folder a name names, IF the vault already has one. Never creates.
   *
   * The content-type fallback asks "is there a folder called `Ideas`?" before writing the note
   * that would otherwise have landed in `Notes`. That question must not be able to create a folder
   * (a save is not a category-management action), so it cannot use `findOrCreateFolder` or
   * `createCategoryFolder`. It also cannot use `findCategoryFolderId` above: that asks Drive for an
   * exact, case-sensitive `name=` match, and the vault's folder is whatever the user typed - a
   * folder named `ideas` would miss it.
   *
   * So this reads the folders that already exist under Vault (`listChildFolders`, one query cached
   * with the structure) and compares names case-insensitively. A hit answers the folder's REAL name
   * (`ideas`), which is what the note then writes into its frontmatter and `appProperties`; a miss
   * answers null and the caller decides what to do. Nothing is created, renamed or moved here, and
   * the hit is registered exactly as `findCategoryFolderId` registers one, so the write that follows
   * resolves from the map instead of querying again.
   */
  async findExistingCategoryFolder(
    categoryName: string
  ): Promise<{ id: string; name: string } | null> {
    if (!this.vaultFolderStructure) {
      throw new Error('Vault structure not initialized')
    }

    const requested = typeof categoryName === 'string' ? categoryName.trim() : ''
    if (!requested) return null

    const key = requested.toLowerCase()
    const knownId = this.vaultFolderStructure.folders[key]
    if (knownId) {
      return { id: knownId, name: this.vaultFolderStructure.folderNames?.[key] ?? requested }
    }

    const children = await this.listChildFolders([this.vaultFolderStructure.vaultFolderId])
    const folder = children.find((child) => child.name.trim().toLowerCase() === key)
    if (!folder) return null

    this.vaultFolderStructure.folders[key] = folder.id
    if (this.vaultFolderStructure.folderNames) {
      this.vaultFolderStructure.folderNames[key] = folder.name
    }

    return { id: folder.id, name: folder.name }
  }

  /**
   * Save content as markdown file to Google Drive
   * File naming: {title}_{timestamp}.md
   */
  async saveContentAsMarkdown(
    categoryName: string,
    content: string,
    metadata: ContentMetadata
  ): Promise<string> {
    try {
      if (!this.vaultFolderStructure) {
        throw new Error('Vault structure not initialized')
      }

      const response = await this.retryOnceWithFreshStructure(async () => {
        // T094: the only place a save chooses its folder. Resolves a name, and falls back to the
        // default folder for an id that this app cannot place - it never creates `Vault/<id>`.
        const categoryFolderId = await this.resolveWriteFolderId(categoryName)

        // Generate filename with timestamp
        const timestamp = metadata.createdAt.toISOString().split('T')[0] // YYYY-MM-DD
        const fileName = `${this.sanitizeFileName(metadata.title)}_${timestamp}.md`

        // Create markdown content with frontmatter
        const markdownContent = this.createMarkdownWithFrontmatter(content, metadata)

        // Upload to Google Drive
        const fileMetadata = {
          name: fileName,
          mimeType: 'text/markdown',
          parents: [categoryFolderId],
          // T098: the list metadata, written with the file. The frontmatter is still written too -
          // the file must stay self-describing and readable outside this app - but the listing no
          // longer has to read it back.
          //
          // T100: the row's preview line is derived from the body being written HERE, never taken
          // from `metadata` - a caller cannot hand in a stale preview, and the excerpt can only
          // ever describe the content in this same request.
          appProperties: encodeContentListProperties({
            ...metadata,
            excerpt: buildContentExcerpt(content),
          })
        }

        const media = {
          mimeType: 'text/markdown',
          body: markdownContent
        }

        return await this.drive.files.create({
          resource: fileMetadata,
          media: media,
          fields: 'id, webViewLink, webContentLink'
        })
      })

      // T101: a listing cached before this create must not hide the note that was just written.
      // This is the invalidation half of "a save is visible immediately"; the merge-by-id in
      // `mergeRecentSaves` is the other half, for the case where Drive's own listing lags.
      invalidateContentListingCache(this.userId)

      return response.data.id
    } catch (error) {
      console.error('Error saving content as markdown:', error)
      throw error
    }
  }

  /**
   * Upload attachment file with markdown file prefix
   * File naming: {title}_{timestamp}_{originalFilename}
   */
  async uploadAttachment(
    categoryName: string,
    attachmentFile: Buffer,
    originalFileName: string,
    metadata: ContentMetadata
  ): Promise<string> {
    try {
      if (!this.vaultFolderStructure) {
        throw new Error('Vault structure not initialized')
      }

      const response = await this.retryOnceWithFreshStructure(async () => {
        // T094: same resolution as `saveContentAsMarkdown` - an id never becomes a folder name.
        const categoryFolderId = await this.resolveWriteFolderId(categoryName)
        const timestamp = metadata.createdAt.toISOString().split('.')[0].replace(/:/g, '-')
        const ext = path.extname(originalFileName)
        const baseName = path.basename(originalFileName, ext)
        const fileName = `${this.sanitizeFileName(metadata.title)}_${timestamp}_${baseName}${ext}`

        // Get MIME type
        const mimeType = this.getMimeType(ext)

        const fileMetadata = {
          name: fileName,
          mimeType: mimeType,
          parents: [categoryFolderId]
        }

        const media = {
          mimeType: mimeType,
          body: attachmentFile
        }

        return await this.drive.files.create({
          resource: fileMetadata,
          media: media,
          fields: 'id, webViewLink, webContentLink'
        })
      })

      return response.data.id
    } catch (error) {
      console.error('Error uploading attachment:', error)
      throw error
    }
  }

  /**
   * Read markdown file from Google Drive
   *
   * T092: `mimeType` is the value the caller already has from the listing. When it is present and
   * is a Google editors mime, `readDriveMediaText` refuses before any request is made, because
   * `alt=media` on such a file can only ever answer 403 `fileNotDownloadable`.
   */
  async readMarkdownContent(
    fileId: string,
    mimeType?: string | null
  ): Promise<{ metadata: ContentMetadata; content: string }> {
    try {
      const body = await readDriveMediaText(this.drive, fileId, mimeType)

      const { metadata, content } = this.parseMarkdownWithFrontmatter(body)
      return { metadata, content }
    } catch (error) {
      console.error('Error reading markdown content:', error)
      throw error
    }
  }

  /**
   * Update markdown file in Google Drive
   *
   * T098: the file's list metadata is re-written in the SAME request as the body, so an edited
   * title, type, status, priority, category or tags can never leave a stale list row behind. One
   * multipart `files.update` (metadata + media) rather than a second round-trip.
   */
  async updateMarkdownContent(
    fileId: string,
    content: string,
    metadata: ContentMetadata
  ): Promise<void> {
    try {
      const markdownContent = this.createMarkdownWithFrontmatter(content, metadata)

      await this.drive.files.update({
        fileId: fileId,
        requestBody: {
          // T100: as on create, the preview is derived from the body in this request. An edit that
          // does not touch the body keeps the body and therefore keeps the excerpt pointing at it.
          appProperties: encodeContentListProperties({
            ...metadata,
            excerpt: buildContentExcerpt(content),
          })
        },
        media: {
          mimeType: 'text/markdown',
          body: markdownContent
        }
      })

      // T101: an edited note (title, status, tags, category) must not be served from a listing that
      // predates the edit.
      invalidateContentListingCache(this.userId)
    } catch (error) {
      console.error('Error updating markdown content:', error)
      throw error
    }
  }

  /**
   * Delete file from Google Drive
   */
  async deleteFile(fileId: string): Promise<void> {
    try {
      await this.drive.files.delete({
        fileId: fileId
      })

      // T101: two guarantees, not one. The cached listing is dropped, so the next list asks Drive;
      // and the id is remembered as deleted, so a listing that has not caught up (or one that was
      // already in flight when the delete landed) cannot put the row back. A delete that Drive
      // refused throws above and records nothing.
      invalidateContentListingCache(this.userId)
      rememberDeletedContentFile(this.userId, fileId)
    } catch (error) {
      console.error('Error deleting file:', error)
      throw error
    }
  }

  /**
   * List files in a category folder
   *
   * T092: constrained to the mime type this app writes (`saveContentAsMarkdown` uploads
   * `text/markdown`). A category folder can also contain Google Docs editors files and subfolders,
   * which are not app content and cannot be read with `alt=media`; they are excluded in the query
   * and again on the returned page.
   *
   * T094: the name is resolved without creating anything (`findCategoryFolderId`), so a custom
   * category the map did not enumerate at initialize is still listable.
   */
  async listCategoryFiles(categoryName: string): Promise<DriveContentListingEntry[]> {
    try {
      if (!this.vaultFolderStructure) {
        throw new Error('Vault structure not initialized')
      }

      // T097: the folder id may come from the structure cache, and a cached id can name a folder
      // that was deleted since. A not-found rebuilds the structure and retries once.
      return await this.retryOnceWithFreshStructure(async () => {
        const categoryFolderId = await this.findCategoryFolderId(categoryName)
        if (!categoryFolderId) {
          return []
        }

        return await this.listMarkdownFilesIn(categoryFolderId)
      })
    } catch (error) {
      console.error('Error listing category files:', error)
      throw error
    }
  }

  /**
   * T094 - the markdown files directly inside one folder. Same constraint as `listCategoryFiles`.
   *
   * T098: `appProperties` is part of the `fields` selector. That is the whole fix - the listing
   * brings back every value a row needs, so the caller never has to read a body to build one. Files
   * written before T098 simply come back without it and take the one-body-read fallback.
   *
   * T101: the answer is cached per account+folder for `CONTENT_LISTING_TTL_MS`, because the same
   * folder is listed several times per user interaction (a dashboard mount, a reload, and again by
   * `locateContent` when a note is opened). The cache holds rows only. Opening a note is a separate
   * `readMarkdownContent` call, so the body is always the file's own.
   */
  private async listMarkdownFilesIn(folderId: string): Promise<DriveContentListingEntry[]> {
    const cached = contentListingCache.get(contentListingCacheKey(this.userId, folderId))
    if (cached && cached.expiresAt > Date.now()) {
      // Filtered again on read: a listing that was already in flight when a delete landed may have
      // written a row this process has since deleted.
      return cached.entries.filter((entry) => !isContentFileDeleted(this.userId, entry.id))
    }

    const response = await this.drive.files.list({
      q: `'${folderId}' in parents and mimeType='${MARKDOWN_MIME_TYPE}' and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name, createdTime, mimeType, appProperties)',
      pageSize: 100
    })

    const files: DriveContentListingEntry[] = (response.data.files || [])
      .filter(isAppOwnedFile)
      // A deleted file must not enter the cache at all, and must not be returned from a fresh
      // listing either - Drive's listing lag is exactly what a tombstone is for.
      .filter((entry: DriveContentListingEntry) => !isContentFileDeleted(this.userId, entry.id))

    contentListingCache.set(contentListingCacheKey(this.userId, folderId), {
      entries: files,
      expiresAt: Date.now() + CONTENT_LISTING_TTL_MS,
    })

    if (
      contentListingCache.size > CONTENT_CACHE_PRUNE_THRESHOLD ||
      deletedContentFileIds.size > CONTENT_CACHE_PRUNE_THRESHOLD
    ) {
      pruneExpiredContentCacheEntries(Date.now())
    }

    return files
  }

  /**
   * T094 - enumerate the app's markdown across the vault's category folders.
   *
   * This is the "All content" listing, and the reason the dashboard's default view was empty is
   * that it used to ask for `name contains '*'` in the Vault root - a literal substring match that
   * no file name satisfies, while every note lives one level down inside a category folder.
   *
   * Drive's `q` has no recursive `in parents`, so "all content" over a folder tree is either a
   * bounded walk (below) or an unfiltered scan of the user's whole Drive. The walk costs, for a
   * vault with C category folders and no nested categories:
   *
   *   1 query (Vault's child folders) + C queries (one markdown listing per category folder)
   *
   * i.e. C + 1, NOT a query per (folder x depth). Nested categories are allowed by the category
   * model, so beyond the first level there is one extra *discovery* query per level (not per
   * folder), capped at `MAX_CATEGORY_DEPTH`; a visited set guarantees no folder is queried twice.
   *
   * The folder walk deliberately also includes a folder whose NAME looks like an id: a note the
   * pre-fix bug wrote into `Vault/<id>` is still the user's note, and this listing is how it
   * becomes visible again. Deleting those folders is the user's call, not this code's.
   */
  async listAllContentFiles(): Promise<DriveContentListingEntry[]> {
    if (!this.vaultFolderStructure) {
      throw new Error('Vault structure not initialized')
    }

    // T097: the walk starts from a cached Vault id, and a cached id can name a folder that was
    // deleted since. A not-found rebuilds the structure and retries once instead of surfacing a 500.
    return await this.retryOnceWithFreshStructure(() => this.walkAllContentFiles())
  }

  /** T097 - the body of `listAllContentFiles`, so the stale-id retry can run it twice. */
  private async walkAllContentFiles(): Promise<DriveContentListingEntry[]> {
    const structure = this.vaultFolderStructure
    if (!structure) {
      throw new Error('Vault structure not initialized')
    }

    const vaultFolderId = structure.vaultFolderId

    // Query 1: the category folders that actually exist in Drive. The in-memory map only holds
    // the defaults from `initializeVaultStructure`, so a custom category is invisible without it.
    const folders: Array<{ id: string; name: string }> = await this.listChildFolders([vaultFolderId])

    // Plus anything this session registered that the listing did not return (a folder created
    // after the query, or metadata the Drive listing lags on). Deduped by id.
    for (const id of Object.values(structure.folders)) {
      if (!folders.some((folder) => folder.id === id)) {
        folders.push({ id, name: id })
      }
    }

    const files: DriveContentListingEntry[] = []
    const seenFiles = new Set<string>()
    const visitedFolders = new Set<string>()

    let level = folders
    let depth = 1

    while (level.length > 0) {
      const unvisited = level.filter((folder) => !visitedFolders.has(folder.id))
      for (const folder of unvisited) visitedFolders.add(folder.id)
      if (unvisited.length === 0) break

      const hasDeeperLevel = depth < MAX_CATEGORY_DEPTH

      // T101: the listings for this level and the discovery of the NEXT level are one wave.
      // The ids of this level's folders are already known, so "what is inside them?" does not depend
      // on their file listings - waiting for the listings before asking was a self-inflicted extra
      // round-trip.
      //
      // T097: the listings themselves run concurrently under `DRIVE_LIST_CONCURRENCY` (a ten-folder
      // vault is one wave instead of two), and results are collected by index so the file order is
      // still the folder order.
      const [listings, children] = await Promise.all([
        mapWithConcurrency(unvisited, DRIVE_LIST_CONCURRENCY, (folder) =>
          this.listMarkdownFilesIn(folder.id)
        ),
        hasDeeperLevel
          ? this.listChildFolders(unvisited.map((folder) => folder.id))
          : Promise.resolve([] as Array<{ id: string; name: string }>),
      ])

      for (const listed of listings) {
        for (const file of listed) {
          if (seenFiles.has(file.id)) continue
          seenFiles.add(file.id)
          files.push(file)
        }
      }

      if (!hasDeeperLevel) break

      level = children
      depth += 1
    }

    return files
  }

  /**
   * T094 - the folders directly inside each of `parentIds`, in one query.
   *
   * `isAppOwnedFile` is NOT applied here on purpose: a folder lives in the editors mime namespace,
   * so that filter - which is right for content files - would drop every folder.
   *
   * T101: the answer is cached ON THE STRUCTURE (see `VaultFolderStructure.childFolders`), so the
   * two discovery levels a listing walks are paid once per structure (5 minutes), not once per
   * listing. It is cached with the structure rather than in its own map because it has exactly the
   * same lifetime: a folder that is created - here or in another tab - is the only thing that
   * changes it, and a create already invalidates this structure.
   */
  private async listChildFolders(
    parentIds: string[]
  ): Promise<Array<{ id: string; name: string }>> {
    if (parentIds.length === 0) return []

    const structure = this.vaultFolderStructure
    const cacheKey = childFoldersCacheKey(parentIds)
    const cached = structure?.childFolders?.[cacheKey]
    if (cached) return [...cached]

    const parents = parentIds.map((id) => `'${id}' in parents`).join(' or ')
    const response = await this.drive.files.list({
      q: `(${parents}) and mimeType='${FOLDER_MIME_TYPE}' and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name, mimeType)',
      pageSize: 200
    })

    const folders: Array<{ id: string; name: string }> = (response.data.files || []).map(
      (folder: { id: string; name: string }) => ({ id: folder.id, name: folder.name })
    )

    if (structure) {
      structure.childFolders = structure.childFolders ?? {}
      structure.childFolders[cacheKey] = folders
    }

    return folders
  }

  /**
   * Search for files across all categories
   *
   * T092: same constraint as `listCategoryFiles`; only the app's markdown is content.
   *
   * T094: NOT the "all content" path any more. This lists direct children of the Vault root and
   * filters by name, so it cannot see a note inside a category folder; `listAllContentFiles` is the
   * listing the dashboard uses. Kept because it is the only name-filtered search the backend offers.
   */
  async searchFiles(query: string): Promise<
    Array<{
      id: string
      name: string
      webViewLink: string
      mimeType?: string
      appProperties?: Record<string, string>
    }>
  > {
    try {
      if (!this.vaultFolderStructure) {
        throw new Error('Vault structure not initialized')
      }

      const vaultFolderId = this.vaultFolderStructure.vaultFolderId
      const response = await this.drive.files.list({
        q: `'${vaultFolderId}' in parents and name contains '${query}' and mimeType='text/markdown' and trashed=false`,
        spaces: 'drive',
        // T098: same list metadata as `listMarkdownFilesIn`, so a name-filtered search is also
        // body-free for a file that has properties.
        fields: 'files(id, name, webViewLink, mimeType, appProperties)',
        pageSize: 50
      })

      const files: Array<{
        id: string
        name: string
        webViewLink: string
        mimeType?: string
        appProperties?: Record<string, string>
      }> = response.data.files || []

      // T101: same delete guarantee as the folder listings - a deleted note does not come back.
      return files.filter(
        (file) => isAppOwnedFile(file) && !isContentFileDeleted(this.userId, file.id)
      )
    } catch (error) {
      console.error('Error searching files:', error)
      throw error
    }
  }

  /**
   * Get shareable link for a file
   */
  async getShareableLink(fileId: string): Promise<string> {
    try {
      const response = await this.drive.files.get({
        fileId: fileId,
        fields: 'webViewLink, webContentLink'
      })

      return response.data.webViewLink
    } catch (error) {
      console.error('Error getting shareable link:', error)
      throw error
    }
  }

  // Helper methods

  /**
   * T094 - a Drive `q` string literal. A category name is user-controlled, so a quote in it must
   * not be able to end the literal and change the query.
   */
  private escapeQueryValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  }

  /**
   * T097 - a value that goes on one frontmatter line.
   *
   * A category name is a Drive folder name, so it may contain a newline. A newline would split the
   * line and the parser would see two garbage keys; collapsing it to a space keeps the file
   * readable and the round trip lossless enough to say where the note lives.
   */
  private sanitizeFrontmatterValue(value: string): string {
    return value.replace(/[\r\n]+/g, ' ').trim()
  }

  private sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .substring(0, 200) // Limit length
  }

  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.zip': 'application/zip'
    }
    return mimeTypes[ext.toLowerCase()] || 'application/octet-stream'
  }

  private createMarkdownWithFrontmatter(content: string, metadata: ContentMetadata): string {
    const frontmatter = `---
id: ${metadata.id}
title: ${metadata.title}
type: ${metadata.type}
status: ${metadata.status}
${metadata.priority ? `priority: ${metadata.priority}` : ''}
createdAt: ${metadata.createdAt.toISOString()}
updatedAt: ${metadata.updatedAt.toISOString()}
${metadata.tags && metadata.tags.length > 0 ? `tags: ${JSON.stringify(metadata.tags)}` : ''}
${metadata.categoryId ? `categoryId: ${metadata.categoryId}` : ''}
${metadata.categoryName ? `categoryName: ${this.sanitizeFrontmatterValue(metadata.categoryName)}` : ''}
---

${content}
${metadata.customFields ? `\n\n## Custom Fields\n\n${JSON.stringify(metadata.customFields, null, 2)}` : ''}`

    return frontmatter
  }

  private parseMarkdownWithFrontmatter(
    content: string
  ): { metadata: ContentMetadata; content: string } {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
    const match = content.match(frontmatterRegex)

    if (!match) {
      throw new Error('Invalid markdown format: missing frontmatter')
    }

    const [, frontmatterStr, bodyContent] = match
    const metadata = this.parseFrontmatter(frontmatterStr)

    return {
      metadata,
      content: bodyContent.trim()
    }
  }

  private parseFrontmatter(frontmatterStr: string): ContentMetadata {
    const lines = frontmatterStr.split('\n')
    const metadata: any = {}

    for (const line of lines) {
      const [key, ...valueParts] = line.split(':')
      const value = valueParts.join(':').trim()

      if (key && value) {
        if (value.startsWith('[') || value.startsWith('{')) {
          metadata[key.trim()] = JSON.parse(value)
        } else if (value === 'true' || value === 'false') {
          metadata[key.trim()] = value === 'true'
        } else if (!isNaN(Number(value)) && value !== '') {
          metadata[key.trim()] = Number(value)
        } else {
          metadata[key.trim()] = value
        }
      }
    }

    return {
      id: metadata.id,
      title: metadata.title,
      type: metadata.type,
      status: metadata.status,
      priority: metadata.priority,
      createdAt: new Date(metadata.createdAt),
      updatedAt: new Date(metadata.updatedAt),
      tags: metadata.tags || [],
      categoryId: metadata.categoryId,
      // T097: optional. A file written before this field existed simply has `undefined` here; the
      // parser must not require it, and the parser's number/boolean coercion is not allowed to turn
      // a name such as "2024" into a number - a category name is always a string.
      categoryName:
        metadata.categoryName === undefined || metadata.categoryName === null
          ? undefined
          : String(metadata.categoryName),
      customFields: metadata.customFields
    }
  }
}

export default GoogleDriveBackendService
