// Restaurant data pipeline: normalize the community CSV and assign stable IDs.
//
// IDs must survive monthly refreshes because user visits reference them. Measured
// against a 13-month-old snapshot of the dataset, neither natural key is safe:
//   - the URL's last segment is reused by unrelated restaurants (two "bagatelle"s 312 km apart);
//   - the full URL path changes when the guide re-files a restaurant (62 cases) or
//     re-slugs it in place (115 cases).
// So IDs live in a committed registry, assigned at first sighting and carried across
// path changes only when the match is unambiguous and geographically close.

export type Award = '3' | '2' | '1' | 'bib' | 'selected'

export interface Restaurant {
  id: string
  path: string // guide URL path minus the language prefix, e.g. "catalunya/barcelona/restaurant/abac"
  name: string
  address: string
  city: string
  country: string
  lat: number
  lng: number
  award: Award
  green: boolean
  price: number | null // 1-4, from the count of currency symbols
  currency: string | null
  cuisine: string
  url: string
  website: string | null
  phone: string | null
  inGuide: boolean
  firstSeen: string // snapshot date (YYYY-MM-DD) the ID was assigned
  lastSeen: string // last snapshot date the restaurant was listed
}

export type Listing = Omit<Restaurant, 'id' | 'inGuide' | 'firstSeen' | 'lastSeen'>

export interface CsvRow {
  Name: string
  Address: string
  Location: string
  Price: string
  Cuisine: string
  Longitude: string
  Latitude: string
  PhoneNumber: string
  Url: string
  WebsiteUrl: string
  Award: string
  GreenStar: string
}

const AWARDS: Record<string, Award> = {
  '3 Stars': '3',
  '2 Stars': '2',
  '1 Star': '1',
  'Bib Gourmand': 'bib',
  'Selected Restaurants': 'selected',
}

// Fail loudly on anything unexpected: a silently mislabeled award is worse than a failed refresh.
export function normalizeRow(row: CsvRow): Listing {
  const award = AWARDS[row.Award]
  if (!award) throw new Error(`unknown award ${JSON.stringify(row.Award)} for ${row.Url}`)

  // Number('') is 0, so a blank coordinate must be caught before conversion.
  const lat = row.Latitude.trim() ? Number(row.Latitude) : NaN
  const lng = row.Longitude.trim() ? Number(row.Longitude) : NaN
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) {
    throw new Error(`bad coordinates (${row.Latitude}, ${row.Longitude}) for ${row.Url}`)
  }

  // Decode so IDs don't depend on how the source percent-encodes non-ASCII slugs.
  const segments = new URL(row.Url).pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (segments.length !== 5 || segments[3] !== 'restaurant') throw new Error(`unexpected URL shape: ${row.Url}`)
  // IDs become Firestore document IDs, which may not contain '/' or be '.' / '..'
  if (segments.some((s) => s.includes('/') || s === '.' || s === '..')) throw new Error(`unusable path segment: ${row.Url}`)

  // "City[, State], Country"; city-states like "Singapore" have a single part.
  const parts = row.Location.split(',').map((s) => s.trim())
  const price = /^(.)\1{0,3}$/u.exec(row.Price)

  return {
    path: segments.slice(1).join('/'),
    name: row.Name.trim(),
    address: row.Address.trim(),
    city: parts[0],
    country: parts[parts.length - 1],
    lat,
    lng,
    award,
    green: row.GreenStar === '1',
    price: price ? [...row.Price].length : null,
    currency: price ? price[1] : null,
    cuisine: row.Cuisine.trim(),
    url: row.Url,
    website: row.WebsiteUrl.trim() || null,
    phone: row.PhoneNumber.trim() || null,
  }
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

const slugOf = (path: string) => path.split('/').pop()!

// Thresholds for carrying an ID across a path change. Kept tight on purpose: a missed
// link leaves a visit attached to the retired entry (still correct history), while a
// false link moves someone's visit onto a different restaurant.
export const SAME_SLUG_KM = 2
export const SAME_NAME_KM = 0.3

export interface ResolveReport {
  kept: number
  relinked: { id: string; from: string; to: string; rule: 'slug' | 'name' }[]
  ambiguous: string[] // paths that had more than one candidate and got a fresh ID
  added: number
  retired: number
  awardChanges: { id: string; from: Award; to: Award }[]
}

export function resolve(
  registry: Restaurant[],
  listings: Listing[],
  snapshotDate: string,
): { restaurants: Restaurant[]; report: ResolveReport } {
  const seenPaths = new Set<string>()
  for (const l of listings) {
    if (seenPaths.has(l.path)) throw new Error(`duplicate path in snapshot: ${l.path}`)
    seenPaths.add(l.path)
  }

  const report: ResolveReport = { kept: 0, relinked: [], ambiguous: [], added: 0, retired: 0, awardChanges: [] }
  const byPath = new Map(registry.map((r) => [r.path, r]))
  const usedIds = new Set(registry.map((r) => r.id))
  const out = new Map<string, Restaurant>()

  const carry = (prev: Restaurant, l: Listing): Restaurant => {
    if (prev.award !== l.award) report.awardChanges.push({ id: prev.id, from: prev.award, to: l.award })
    return { ...l, id: prev.id, inGuide: true, firstSeen: prev.firstSeen, lastSeen: snapshotDate }
  }

  // Pass 1: exact path matches.
  const unmatched: Listing[] = []
  for (const l of listings) {
    const prev = byPath.get(l.path)
    if (prev) {
      out.set(prev.id, carry(prev, l))
      report.kept++
    } else unmatched.push(l)
  }

  // Pass 2: link new paths to entries whose path vanished. Candidates on both sides
  // must be unique, so one restaurant can never absorb two histories.
  const orphans = registry.filter((r) => !out.has(r.id) && !seenPaths.has(r.path))
  const candidatesFor = (l: Listing) => {
    const bySlug = orphans.filter((o) => slugOf(o.path) === slugOf(l.path) && distanceKm(o, l) <= SAME_SLUG_KM)
    if (bySlug.length) return { rule: 'slug' as const, list: bySlug }
    const name = normalizeName(l.name)
    return { rule: 'name' as const, list: orphans.filter((o) => normalizeName(o.name) === name && distanceKm(o, l) <= SAME_NAME_KM) }
  }
  const proposals = unmatched.map((l) => ({ l, ...candidatesFor(l) }))
  const claims = new Map<string, number>()
  for (const p of proposals) for (const o of p.list) claims.set(o.id, (claims.get(o.id) ?? 0) + 1)

  const fresh: Listing[] = []
  for (const p of proposals) {
    if (p.list.length === 1 && claims.get(p.list[0].id) === 1) {
      const prev = p.list[0]
      out.set(prev.id, carry(prev, p.l))
      report.relinked.push({ id: prev.id, from: prev.path, to: p.l.path, rule: p.rule })
    } else {
      if (p.list.length > 0) report.ambiguous.push(p.l.path)
      fresh.push(p.l)
    }
  }

  // Pass 3: new restaurants. Prefer the bare slug; disambiguate with the city segment.
  for (const l of fresh) {
    const [, citySeg, , slug] = l.path.split('/')
    let id = slug
    if (usedIds.has(id)) id = `${slug}--${citySeg}`
    for (let n = 2; usedIds.has(id); n++) id = `${slug}--${citySeg}-${n}`
    usedIds.add(id)
    out.set(id, { ...l, id, inGuide: true, firstSeen: snapshotDate, lastSeen: snapshotDate })
    report.added++
  }

  // Entries no longer listed stay in the registry so existing visits still resolve.
  for (const r of registry) {
    if (out.has(r.id)) continue
    if (r.inGuide) report.retired++
    out.set(r.id, { ...r, inGuide: false })
  }

  const restaurants = [...out.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { restaurants, report }
}

// Compact array-of-arrays for the client; ~half the size of keyed objects.
// The guide URL is not shipped: the client rebuilds it from `path`.
export const CLIENT_FIELDS = [
  'id', 'path', 'name', 'address', 'city', 'country', 'lat', 'lng', 'award', 'green',
  'price', 'currency', 'cuisine', 'website', 'phone', 'inGuide',
] as const

export function toClientPayload(restaurants: Restaurant[], snapshotDate: string) {
  return {
    snapshot: snapshotDate,
    fields: CLIENT_FIELDS,
    rows: restaurants.map((r) => CLIENT_FIELDS.map((f) => (f === 'lat' || f === 'lng' ? Math.round(r[f] * 1e5) / 1e5 : r[f]))),
  }
}
