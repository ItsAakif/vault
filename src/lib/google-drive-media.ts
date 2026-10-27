/**
 * T092 - Google Docs editors files are not app files, and `alt=media` cannot read them.
 *
 * A Drive file whose mimeType starts with `application/vnd.google-apps.` is a Google
 * Docs/Sheets/Slides/Forms/Drawing editor object (or a folder). It has no binary content of
 * its own, so `files.get({ fileId, alt: 'media' })` answers
 *
 *   403 { "reason": "fileNotDownloadable",
 *         "message": "Only files with binary content can be downloaded. Use Export with Docs
 *                     Editors files." }
 *
 * This app writes its own files into Drive: markdown with frontmatter for content, JSON sidecars
 * for jobs/events/categories. A native Google Doc is not one of those, and exporting one and
 * parsing the text as markdown would invent content the app never wrote - it would surface as a
 * corrupt item in the user's list. So:
 *
 *   1. every listing is constrained to the mime types this app writes (the editors namespace is
 *      never listed as content, jobs, events or categories), and
 *   2. every media read goes through `assertMediaDownloadAllowed`, which refuses an editors file
 *      before the request is made.
 *
 * The failure is therefore impossible rather than merely unlikely, and a refused read is a normal
 * throw that the caller's per-item boundary turns into "skip this item".
 */

/** Everything in this namespace is an editor object or a folder: never downloadable with alt=media. */
export const GOOGLE_APPS_MIME_PREFIX = 'application/vnd.google-apps.'

/** The minimum surface these helpers need from `google.drive({ version: 'v3' })`. */
export interface DriveFilesLike {
  files: {
    get: (
      params: { fileId: string; alt?: string; fields?: string },
      options?: { responseType?: string }
    ) => Promise<{ data: any }>
  }
}

/**
 * True for `application/vnd.google-apps.*`.
 *
 * Folders are included on purpose: `application/vnd.google-apps.folder` is in the same namespace
 * and is equally undownloadable, so the same refusal is correct for it.
 */
export function isEditorsFileMimeType(mimeType: unknown): boolean {
  return typeof mimeType === 'string' && mimeType.startsWith(GOOGLE_APPS_MIME_PREFIX)
}

/** Stable message prefix so a caller/test can recognise the refusal without matching prose. */
export const EDITORS_FILE_REFUSED = 'Refusing to download a Google Docs editors file with alt=media'

/** Reads `mimeType` without `alt=media`, i.e. a metadata get, which is always allowed. */
async function readMimeType(drive: DriveFilesLike, fileId: string): Promise<string | null> {
  const response = await drive.files.get({ fileId, fields: 'id, mimeType' })
  const mimeType = response.data?.mimeType
  return typeof mimeType === 'string' ? mimeType : null
}

/**
 * The guard. Throws before any `alt=media` request when the file is a Google apps object.
 *
 * `mimeType` is optional: listings now select `mimeType` in their `fields`, so the list paths pass
 * the value they already have and cost no extra request. When it is unknown, one metadata get
 * establishes it - still without `alt=media`.
 */
export async function assertMediaDownloadAllowed(
  drive: DriveFilesLike,
  fileId: string,
  mimeType?: string | null
): Promise<void> {
  const resolved = mimeType ?? (await readMimeType(drive, fileId))

  if (isEditorsFileMimeType(resolved)) {
    throw new Error(`${EDITORS_FILE_REFUSED}: ${fileId} (${resolved})`)
  }
}

/**
 * Reads a text media body, never with `alt=media` on an editors file.
 *
 * `responseType: 'text'` is passed for every caller so a JSON/text body is always a string. Without
 * it the client may hand back an already-parsed object and `JSON.parse(object)` throws.
 */
export async function readDriveMediaText(
  drive: DriveFilesLike,
  fileId: string,
  mimeType?: string | null
): Promise<string> {
  await assertMediaDownloadAllowed(drive, fileId, mimeType)

  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'text' }
  )

  return typeof response.data === 'string' ? response.data : String(response.data)
}

/**
 * Listing-side counterpart: a Drive that ignores (or partially honours) the `q` filter must still
 * not hand an editors file to a reader. A missing `mimeType` is kept - the read guard covers it.
 */
export function isAppOwnedFile(file: { mimeType?: unknown }): boolean {
  return !isEditorsFileMimeType(file.mimeType)
}
