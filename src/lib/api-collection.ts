// T093: one place that turns "whatever the route answered" into an array.
//
// The recurring crash in this project is always the same sentence:
//
//     setContentItems(await response.json())
//
// The state is declared `ContentItem[]`, so TypeScript is satisfied, but the response is
// `unknown` until it is parsed. A 200 whose body is an envelope
// (`{ success: true, data: [...] }`), an error object, `null` or a string therefore lands in a
// `T[]` variable and the first `.filter(...)` / `.map(...)` throws
// `TypeError: <minified>.filter is not a function` into the page error boundary.
//
// This module is that check, in one place. It accepts exactly two shapes:
//
//     [ ... ]              -> the array itself
//     { data: [ ... ] }    -> the envelope's array
//
// and returns `[]` for everything else. It never throws and its return value is always an array,
// so a wrong body degrades into the surface's empty state instead of a "Page Error".
//
// Element-level checking is the caller's business through `isItem`: an array can hold values of
// the wrong type too, and `item.title.toLowerCase()` in a render throws just as hard as
// `.filter` on an object. Call sites that render fields therefore pass a real type guard.

export interface CollectionEnvelope {
  data: unknown
}

/** The narrowest honest check for "a JSON object": arrays and `null` are not records. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isCollectionEnvelope(body: unknown): body is CollectionEnvelope {
  return isRecord(body) && 'data' in body
}

/** The `{ data: [...] }` envelope this project's Drive-backed routes answer with, unwrapped. */
function collectionPayload(body: unknown): unknown {
  return isCollectionEnvelope(body) ? body.data : body
}

/**
 * A collection from an already-parsed response body:
 *
 *   readCollection(data, isContentItem)   // bare array or `{ data: [...] }`
 *
 * A wrong body yields `[]`; elements that fail `isItem` are dropped rather than rendered. When
 * every element passes, the body's own array is returned BY IDENTITY, so a consumer that publishes
 * the array it renders (the calendar's `toBe` invariant, T089) keeps that guarantee and the common
 * case allocates nothing.
 */
export function readCollection<T>(
  body: unknown,
  isItem: (value: unknown) => value is T
): T[] {
  const payload = collectionPayload(body)
  if (!Array.isArray(payload)) return []
  return isCollectionOf(payload, isItem) ? payload : payload.filter(isItem)
}

/** The `every(...)` narrowing TypeScript does not provide for `Array.prototype.every`. */
function isCollectionOf<T>(
  values: unknown[],
  isItem: (value: unknown) => value is T
): values is T[] {
  return values.every(isItem)
}

/**
 * The counterpart for a single item (create/update responses): the item itself, the item inside
 * the envelope, or `null`. Never a half-populated object.
 */
export function readItem<T>(body: unknown, isItem: (value: unknown) => value is T): T | null {
  const payload = collectionPayload(body)
  return isItem(payload) ? payload : null
}

/**
 * `string[]` fields (e.g. `preferences.disabledContentTypes`): a non-array or non-string entries
 * are dropped, so the value is always safe to `.includes(...)`.
 */
export function readStringCollection(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}
