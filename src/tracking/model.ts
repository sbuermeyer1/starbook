import type { Award, Restaurant } from '../data/restaurants'

export interface Entry {
  want: boolean
  favorite: boolean
}

export interface Visit {
  id: string
  restaurantId: string
  date: string | null // YYYY-MM-DD, or null when the user doesn't remember
  rating: number | null // 1-5
  notes: string
  award: Award // as listed when the visit was logged (see BACKLOG.md)
  green: boolean
  createdAt: number // ms; estimated locally until the server confirms
}

export interface VisitInput {
  date: string | null
  rating: number | null
  notes: string
}

export type Status = 'visited' | 'want' | 'favorite' | 'notVisited'

export interface Tracked {
  entries: Map<string, Entry>
  visits: Map<string, Visit[]> // by restaurant, newest first
}

export const EMPTY_TRACKED: Tracked = { entries: new Map(), visits: new Map() }

export const MAX_NOTES = 2000

export function statusOf(t: Tracked, restaurantId: string) {
  const e = t.entries.get(restaurantId)
  const visited = (t.visits.get(restaurantId)?.length ?? 0) > 0
  return { visited, want: e?.want ?? false, favorite: e?.favorite ?? false }
}

export function isTracked(t: Tracked, restaurantId: string): boolean {
  const s = statusOf(t, restaurantId)
  return s.visited || s.want || s.favorite
}

export function matchesStatus(t: Tracked, restaurantId: string, wanted: Set<Status>): boolean {
  if (wanted.size === 0) return true
  const s = statusOf(t, restaurantId)
  return (
    (wanted.has('visited') && s.visited) ||
    (wanted.has('want') && s.want) ||
    (wanted.has('favorite') && s.favorite) ||
    (wanted.has('notVisited') && !s.visited)
  )
}

// Dated visits newest first; undated visits last, most recently logged first.
export function compareVisits(a: Visit, b: Visit): number {
  if (a.date && b.date && a.date !== b.date) return a.date < b.date ? 1 : -1
  if (a.date && !b.date) return -1
  if (!a.date && b.date) return 1
  return b.createdAt - a.createdAt
}

export function groupVisits(visits: Visit[]): Map<string, Visit[]> {
  const out = new Map<string, Visit[]>()
  for (const v of visits) {
    let list = out.get(v.restaurantId)
    if (!list) out.set(v.restaurantId, (list = []))
    list.push(v)
  }
  for (const list of out.values()) list.sort(compareVisits)
  return out
}

export const todayISO = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

// Mirrors firestore.rules, plus the checks rules can't express (real calendar date, not in the future).
export function validateVisit(v: VisitInput, today = todayISO()): string | null {
  if (v.date !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return 'Enter a valid date.'
    const d = new Date(`${v.date}T00:00:00Z`)
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v.date) return 'Enter a valid date.'
    if (v.date > today) return "The date can't be in the future."
    if (v.date < '1900-01-01') return 'Enter a valid date.'
  }
  if (v.rating !== null && !(Number.isInteger(v.rating) && v.rating >= 1 && v.rating <= 5)) return 'Rating must be 1 to 5.'
  if (v.notes.length > MAX_NOTES) return `Notes can be at most ${MAX_NOTES} characters.`
  return null
}

// The award recorded on the visit, when it differs from the restaurant's current listing.
export function awardChange(v: Visit, r: Pick<Restaurant, 'award' | 'inGuide'>): { was: Award; now: Award | null } | null {
  if (!r.inGuide) return { was: v.award, now: null }
  return v.award !== r.award ? { was: v.award, now: r.award } : null
}
