import type { Award, Restaurant } from './restaurants'

export interface Filters {
  awards: Set<Award>
  greenOnly: boolean
  prices: Set<number> // empty = any price
  cuisines: Set<string> // empty = any cuisine
  includeRetired: boolean // restaurants no longer in the guide
}

// "Selected" is ~12k of the ~20k pins, so it starts hidden; one tap turns it on.
export const DEFAULT_FILTERS: Filters = {
  awards: new Set<Award>(['3', '2', '1', 'bib']),
  greenOnly: false,
  prices: new Set(),
  cuisines: new Set(),
  includeRetired: false,
}

export function matches(r: Restaurant, f: Filters): boolean {
  if (!r.inGuide && !f.includeRetired) return false
  if (!f.awards.has(r.award)) return false
  if (f.greenOnly && !r.green) return false
  // A restaurant with an unknown price can't be shown to satisfy a price filter.
  if (f.prices.size && (r.price === null || !f.prices.has(r.price))) return false
  if (f.cuisines.size && !f.cuisines.has(r.cuisine)) return false
  return true
}

export const applyFilters = (rs: Restaurant[], f: Filters) => rs.filter((r) => matches(r, f))

// How many filters differ from the defaults, for the badge on the filter button.
export function activeFilterCount(f: Filters): number {
  const d = DEFAULT_FILTERS
  const sameAwards = f.awards.size === d.awards.size && [...f.awards].every((a) => d.awards.has(a))
  return [!sameAwards, f.greenOnly, f.prices.size > 0, f.cuisines.size > 0, f.includeRetired].filter(Boolean).length
}

// Cuisines with counts among in-guide restaurants, most common first.
export function cuisineCounts(rs: Restaurant[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const r of rs) if (r.inGuide && r.cuisine) counts.set(r.cuisine, (counts.get(r.cuisine) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}
