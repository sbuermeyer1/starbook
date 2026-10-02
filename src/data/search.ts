import { AWARD_RANK } from './restaurants'
import type { Restaurant } from './restaurants'

export const fold = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

export interface City {
  key: string // "region/city" from the guide path; unique, unlike the display name
  label: string
  count: number
  // Where to point the map. Centered on the median restaurant and fitted to those within
  // CITY_RADIUS_KM, because a few guide cities absorb far-flung suburbs (Washington DC spans 104 km).
  center: [number, number]
  bounds: [[number, number], [number, number]]
}

export const CITY_RADIUS_KM = 25

const distanceKm = (a: [number, number], b: [number, number]) => {
  const rad = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const titleCase = (slug: string) => slug.replace(/[-_]\d+$/, '').split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

export function buildCities(rs: Restaurant[]): City[] {
  const groups = new Map<string, Restaurant[]>()
  for (const r of rs) {
    if (!r.inGuide) continue
    const [region, city] = r.path.split('/')
    const key = `${region}/${city}`
    let g = groups.get(key)
    if (!g) groups.set(key, (g = []))
    g.push(r)
  }

  const cities: City[] = []
  for (const [key, g] of groups) {
    const center: [number, number] = [median(g.map((r) => r.lat)), median(g.map((r) => r.lng))]
    const near = g.filter((r) => distanceKm(center, [r.lat, r.lng]) <= CITY_RADIUS_KM)
    const pts = near.length ? near : g
    const lats = pts.map((r) => r.lat)
    const lngs = pts.map((r) => r.lng)
    cities.push({
      key,
      label: `${g[0].city}, ${g[0].country}`,
      count: g.length,
      center,
      bounds: [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
    })
  }

  // Two guide cities can share a display name (Hoorn in Friesland and in Noord-Holland).
  const byLabel = new Map<string, City[]>()
  for (const c of cities) byLabel.set(c.label, [...(byLabel.get(c.label) ?? []), c])
  for (const same of byLabel.values()) {
    if (same.length > 1) for (const c of same) c.label = `${c.label} (${titleCase(c.key.split('/')[0])})`
  }
  return cities
}

export interface SearchResults {
  cities: City[]
  restaurants: Restaurant[]
}

// Prefix matches (of the whole string or any word) rank above substring matches.
const score = (text: string, q: string): number => {
  const t = fold(text)
  if (t.startsWith(q)) return 0
  if (t.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(q))) return 1
  if (t.includes(q)) return 2
  return -1
}

export function search(query: string, cities: City[], rs: Restaurant[], limit = 6): SearchResults {
  const q = fold(query.trim())
  if (q.length < 2) return { cities: [], restaurants: [] }

  const cityHits = cities
    .map((c) => ({ c, s: score(c.label, q) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || b.c.count - a.c.count)
    .slice(0, limit)
    .map((x) => x.c)

  const restaurantHits = rs
    .map((r) => ({ r, s: score(r.name, q) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || Number(b.r.inGuide) - Number(a.r.inGuide) || AWARD_RANK[a.r.award] - AWARD_RANK[b.r.award] || a.r.name.localeCompare(b.r.name))
    .slice(0, limit)
    .map((x) => x.r)

  return { cities: cityHits, restaurants: restaurantHits }
}
