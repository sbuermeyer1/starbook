import type { Summary } from '../stats/stats'
import type { Profile } from '../friends/model'

// One row of the public board. Everything here is public to signed-in users.
export interface BoardEntry {
  uid: string
  displayName: string
  username: string | null
  photoURL: string | null
  stars: number
  three: number
  two: number
  one: number
  bib: number
  green: number
  countries: number
  restaurants: number
}

export type BoardFields = Omit<BoardEntry, 'uid'>

// Ceilings, mirrored in firestore.rules. Far above anything real (about 160 three-star
// restaurants exist), they only reject impossible numbers; the board is an honor system.
export const BOARD_LIMITS = { three: 500, two: 2000, one: 10000, bib: 10000, green: 2000, countries: 100, restaurants: 50000 }

export function boardFields(p: Pick<Profile, 'displayName' | 'username' | 'photoURL'>, s: Summary): BoardFields {
  return {
    displayName: p.displayName,
    username: p.username,
    photoURL: p.photoURL,
    stars: s.stars,
    three: s.byAward['3'],
    two: s.byAward['2'],
    one: s.byAward['1'],
    bib: s.byAward.bib,
    green: s.green,
    countries: s.countries,
    restaurants: s.restaurants,
  }
}

// Whether the stored entry needs rewriting (avoids a write on every render).
export function boardChanged(stored: BoardFields | null, next: BoardFields): boolean {
  if (!stored) return true
  return (Object.keys(next) as (keyof BoardFields)[]).some((k) => stored[k] !== next[k])
}

// Stars, then three-star count, then restaurants; name breaks the final tie.
export function compareEntries(a: BoardEntry, b: BoardEntry): number {
  return b.stars - a.stars || b.three - a.three || b.restaurants - a.restaurants || a.displayName.localeCompare(b.displayName)
}
