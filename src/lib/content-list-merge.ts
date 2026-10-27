/**
 * T097 - merging a fresh listing into the list the user is already looking at.
 *
 * The two mechanisms that made a note "disappear" after a save are fixed in two places:
 *
 *   1. the fetches are fast and no longer blank the list (see `page.tsx`), and
 *   2. this module - Drive's listing is eventually consistent, so the refetch that follows a save
 *      can arrive *without* the file that was just written. The page prepends the saved item
 *      optimistically; replacing the whole list with that stale answer is what made the note vanish
 *      from the UI while it existed in Drive.
 *
 * The rule here is merge-by-id with a short grace window, rather than "retry the listing once":
 *
 *   - a retry costs another full Drive round-trip on a path that was just made fast, and it can
 *     still miss (the lag is not bounded by one request), so it fixes the symptom only sometimes;
 *   - a merge is free, keeps the item where the user already saw it, and expires on its own, so a
 *     note that really was deleted cannot be kept alive by it.
 *
 * Nothing else from the previous list survives: an item the server stopped returning is gone, which
 * is the one behaviour "server wins" has to keep.
 */

/** T097 - how long a just-saved item is kept when a listing does not return it yet. */
export const RECENT_SAVE_GRACE_MS = 2 * 60 * 1000

/** Anything the list can identify: a content item, structurally. */
export interface Identifiable {
  id: string
}

export interface RecentSave<T> {
  item: T
  savedAt: number
}

/**
 * The listing, plus any recently saved item it has not caught up on yet.
 *
 * `incoming` is authoritative: it is returned as-is, in its own order, and an item present there is
 * never duplicated. `previous` is what the user currently sees - an item only survives from the
 * grace map while it is still in that list, so deleting a note (or a filter change that legitimately
 * excluded it) is not undone by a save from ninety seconds ago.
 *
 * Kept items go back to the front, because that is where the save put them.
 */
export function mergeRecentSaves<T extends Identifiable>(
  incoming: readonly T[],
  previous: readonly T[],
  recentSaves: ReadonlyMap<string, RecentSave<T>>,
  now: number,
  graceMs: number = RECENT_SAVE_GRACE_MS
): T[] {
  const incomingIds = new Set(incoming.map((item) => item.id))
  const previousIds = new Set(previous.map((item) => item.id))

  const kept: T[] = []
  for (const [id, save] of recentSaves) {
    if (incomingIds.has(id)) continue
    if (now - save.savedAt > graceMs) continue
    if (!previousIds.has(id)) continue
    kept.push(save.item)
  }

  // `recentSaves` is in save order, oldest first; the page prepends each save, so the newest is the
  // one that has to stay at the top.
  kept.reverse()

  return [...kept, ...incoming]
}

/**
 * Drop grace entries that can no longer be used.
 *
 * Without this the map would grow for the lifetime of the page. An entry is pruned once it is older
 * than the window; entries the server already returned are left to expire, so a listing that flickers
 * (returns the file, then not) cannot resurrect the problem.
 */
export function pruneRecentSaves<T extends Identifiable>(
  recentSaves: Map<string, RecentSave<T>>,
  now: number,
  graceMs: number = RECENT_SAVE_GRACE_MS
): void {
  for (const [id, save] of recentSaves) {
    if (now - save.savedAt > graceMs) recentSaves.delete(id)
  }
}
