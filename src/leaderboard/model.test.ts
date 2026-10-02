import { describe, expect, it } from 'vitest'
import { boardChanged, boardFields, compareEntries } from './model'
import type { BoardEntry } from './model'
import type { Summary } from '../stats/stats'

const summary: Summary = {
  stars: 11, restaurants: 12, visits: 15, green: 1, countries: 3, cities: 4,
  byAward: { '3': 2, '2': 1, '1': 3, bib: 4, selected: 2 },
}
const profile = { displayName: 'Alice', username: 'alice', photoURL: null }

describe('boardFields', () => {
  it('maps a summary and profile onto the public fields only', () => {
    expect(boardFields(profile, summary)).toEqual({
      displayName: 'Alice', username: 'alice', photoURL: null,
      stars: 11, three: 2, two: 1, one: 3, bib: 4, green: 1, countries: 3, restaurants: 12,
    })
  })
})

describe('boardChanged', () => {
  const f = boardFields(profile, summary)
  it('is true with nothing stored, false when equal, true on any difference', () => {
    expect(boardChanged(null, f)).toBe(true)
    expect(boardChanged({ ...f }, f)).toBe(false)
    expect(boardChanged({ ...f, bib: 5 }, f)).toBe(true)
    expect(boardChanged({ ...f, username: null }, f)).toBe(true)
  })
})

describe('compareEntries', () => {
  const e = (uid: string, over: Partial<BoardEntry>): BoardEntry => ({ uid, displayName: uid, username: null, photoURL: null, stars: 0, three: 0, two: 0, one: 0, bib: 0, green: 0, countries: 0, restaurants: 0, ...over })
  it('ranks by stars, then three-stars, then restaurants, then name', () => {
    const list = [
      e('d', { stars: 9, three: 3, restaurants: 5 }),
      e('a', { stars: 9, three: 1, restaurants: 9 }),
      e('c', { stars: 9, three: 3, restaurants: 9 }),
      e('b', { stars: 12 }),
      e('e', { stars: 9, three: 3, restaurants: 5 }),
    ]
    expect(list.sort(compareEntries).map((x) => x.uid)).toEqual(['b', 'c', 'd', 'e', 'a'])
  })
})
