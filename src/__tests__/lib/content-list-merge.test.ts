// @vitest-environment node
/**
 * T097 - why a just-saved note must not be replaced by a listing that has not caught up yet.
 *
 * Drive's listing is eventually consistent: the refetch that follows a save can arrive without the
 * file that was just written. The page prepends the saved item optimistically, so a wholesale
 * `setContentItems(incoming)` was what made the note blink out of the UI while it existed in Drive.
 *
 * The rule is merge-by-id with a short grace window (not "retry the listing once"): a retry costs
 * another Drive round-trip on a path that was just made fast and can still miss, while the merge is
 * free, keeps the item where the user already saw it, and expires on its own.
 */
import { describe, it, expect } from 'vitest'
import {
  RECENT_SAVE_GRACE_MS,
  mergeRecentSaves,
  pruneRecentSaves,
  type RecentSave,
} from '@/lib/content-list-merge'

interface Item {
  id: string
  title: string
}

function item(id: string, title = id): Item {
  return { id, title }
}

function saves(...entries: Array<[Item, number]>): Map<string, RecentSave<Item>> {
  return new Map(entries.map(([saved, savedAt]) => [saved.id, { item: saved, savedAt }]))
}

const NOW = 1_000_000

describe('mergeRecentSaves - a listing that has not caught up yet', () => {
  it('keeps the just-saved item, at the front, when the listing does not contain it', () => {
    const saved = item('saved-1', 'A brand new note')
    const merged = mergeRecentSaves(
      [item('older-1', 'An older note')],
      [saved, item('older-1', 'An older note')],
      saves([saved, NOW - 1_000]),
      NOW
    )

    expect(merged.map((entry) => entry.id)).toEqual(['saved-1', 'older-1'])
    expect(merged[0].title).toBe('A brand new note')
  })

  it('takes the server copy as soon as the listing returns the id - no duplicate', () => {
    const saved = item('saved-1', 'Title at save time')
    const merged = mergeRecentSaves(
      [item('saved-1', 'Title the server now has')],
      [saved],
      saves([saved, NOW - 1_000]),
      NOW
    )

    expect(merged).toHaveLength(1)
    expect(merged[0].title).toBe('Title the server now has')
  })

  it('drops it once the grace window has passed', () => {
    const saved = item('saved-1')

    const merged = mergeRecentSaves([], [saved], saves([saved, NOW - RECENT_SAVE_GRACE_MS - 1]), NOW)

    expect(merged).toEqual([])
  })

  it('keeps the newest save first when several are inside the window', () => {
    const first = item('saved-1')
    const second = item('saved-2')

    const merged = mergeRecentSaves(
      [],
      [second, first],
      saves([first, NOW - 2_000], [second, NOW - 1_000]),
      NOW
    )

    expect(merged.map((entry) => entry.id)).toEqual(['saved-2', 'saved-1'])
  })
})

describe('mergeRecentSaves - what the grace window must NOT do', () => {
  it('does not resurrect an item the user is no longer looking at (a delete, or a filter change)', () => {
    const saved = item('saved-1')

    // The item is not in the current list any more, even though it was saved a second ago.
    const merged = mergeRecentSaves([], [], saves([saved, NOW - 1_000]), NOW)

    expect(merged).toEqual([])
  })

  it('drops items the server stopped returning, even though they are in the previous list', () => {
    const old = item('older-1')

    // No save involved: the listing is authoritative and the note is gone.
    const merged = mergeRecentSaves([], [old], saves(), NOW)

    expect(merged).toEqual([])
  })

  it('returns the incoming list, in its own order, when nothing is pending', () => {
    const merged = mergeRecentSaves([item('b'), item('a')], [item('a'), item('b')], saves(), NOW)

    expect(merged.map((entry) => entry.id)).toEqual(['b', 'a'])
  })
})

describe('pruneRecentSaves', () => {
  it('drops only the expired entries, and keeps the ones still inside the window', () => {
    const expired = item('expired')
    const fresh = item('fresh')
    const map = saves([expired, NOW - RECENT_SAVE_GRACE_MS - 1], [fresh, NOW - 1_000])

    pruneRecentSaves(map, NOW)

    expect(Array.from(map.keys())).toEqual(['fresh'])
  })

  it('leaves the map empty when everything has expired, so it cannot grow for a session', () => {
    const map = saves([item('a'), NOW - RECENT_SAVE_GRACE_MS - 1], [item('b'), NOW - RECENT_SAVE_GRACE_MS - 1])

    pruneRecentSaves(map, NOW)

    expect(map.size).toBe(0)
  })
})
