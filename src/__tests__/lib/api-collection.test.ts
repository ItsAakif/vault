import { describe, it, expect } from 'vitest'
import {
  isCollectionEnvelope,
  isRecord,
  readCollection,
  readItem,
  readStringCollection,
} from '@/lib/api-collection'

/**
 * T093 - the shared reader itself.
 *
 * The component tests prove the pages degrade; these pin the contract every page now relies on:
 * a bare array or `{ data: [...] }` in, `[]` for everything else, never a throw, never a non-array.
 */

interface Item {
  id: string
}

function isItem(value: unknown): value is Item {
  return isRecord(value) && typeof value.id === 'string'
}

const items: Item[] = [{ id: 'a' }, { id: 'b' }]

describe('readCollection', () => {
  it('accepts a bare array', () => {
    expect(readCollection(items, isItem)).toEqual(items)
  })

  it('unwraps the { success, data } envelope the routes answer with', () => {
    expect(readCollection({ success: true, data: items }, isItem)).toEqual(items)
  })

  it.each([
    ['an object with no data', { success: true }],
    ['an object whose data is not a list', { success: true, data: 'not a list' }],
    ['an object whose data is null', { data: null }],
    ['null', null],
    ['undefined', undefined],
    ['a string', 'not a list'],
    ['a number', 42],
    ['a boolean', true],
  ])('returns [] for %s', (_label, body) => {
    expect(readCollection(body, isItem)).toEqual([])
  })

  it('drops elements that are not items and keeps the ones that are', () => {
    expect(readCollection([null, 42, {}, { id: 'a' }, 'x', { id: 'b' }], isItem)).toEqual(items)
  })

  it('returns the body array BY IDENTITY when every element passes', () => {
    // T089: the calendar publishes `toBe(events)`; a needless copy would break that guarantee.
    expect(readCollection(items, isItem)).toBe(items)
    const envelopeBody = { success: true, data: items }
    expect(readCollection(envelopeBody, isItem)).toBe(items)
  })

  it('returns a new array only when something was dropped', () => {
    const body = [{ id: 'a' }, null]
    const result = readCollection(body, isItem)
    expect(result).not.toBe(body)
    expect(result).toEqual([{ id: 'a' }])
  })

  it('never throws, whatever the body', () => {
    const bodies: unknown[] = [
      null,
      undefined,
      0,
      '',
      'x',
      true,
      {},
      { data: {} },
      { data: [null] },
      () => items,
      Symbol('x'),
    ]
    for (const body of bodies) {
      expect(() => readCollection(body, isItem)).not.toThrow()
      expect(Array.isArray(readCollection(body, isItem))).toBe(true)
    }
  })

  it('does not mutate the body', () => {
    const body = { success: true, data: [...items, null] }
    readCollection(body, isItem)
    expect(body.data).toEqual([...items, null])
  })
})

describe('readItem', () => {
  it('accepts a bare item', () => {
    expect(readItem({ id: 'a' }, isItem)).toEqual({ id: 'a' })
  })

  it('unwraps an item inside the envelope', () => {
    expect(readItem({ success: true, data: { id: 'a' } }, isItem)).toEqual({ id: 'a' })
  })

  it.each([
    ['an envelope with no data', { success: true }],
    ['an object that is not an item', { nope: true }],
    ['an array', []],
    ['null', null],
    ['a string', 'x'],
  ])('returns null for %s', (_label, body) => {
    expect(readItem(body, isItem)).toBeNull()
  })
})

describe('readStringCollection', () => {
  it('keeps only the strings', () => {
    expect(readStringCollection(['NOTE', 42, null, 'IDEA', {}])).toEqual(['NOTE', 'IDEA'])
  })

  it.each([
    ['a string', 'NOTE'],
    ['null', null],
    ['undefined', undefined],
    ['an object', { 0: 'NOTE' }],
    ['a number', 1],
  ])('returns [] for %s', (_label, body) => {
    expect(readStringCollection(body)).toEqual([])
  })
})

describe('the guards themselves', () => {
  it('isRecord rejects arrays and null', () => {
    expect(isRecord({})).toBe(true)
    expect(isRecord([])).toBe(false)
    expect(isRecord(null)).toBe(false)
    expect(isRecord('x')).toBe(false)
    expect(isRecord(1)).toBe(false)
  })

  it('isCollectionEnvelope only claims records that carry data', () => {
    expect(isCollectionEnvelope({ data: [] })).toBe(true)
    expect(isCollectionEnvelope({ success: true })).toBe(false)
    expect(isCollectionEnvelope([])).toBe(false)
    expect(isCollectionEnvelope(null)).toBe(false)
  })
})
