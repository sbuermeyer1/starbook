import { describe, expect, it } from 'vitest'
import { normalizeRow, resolve, toClientPayload } from './lib.ts'
import type { CsvRow, Listing, Restaurant } from './lib.ts'

const row = (over: Partial<CsvRow> = {}): CsvRow => ({
  Name: 'ABaC',
  Address: 'Avenida del Tibidabo 1, Barcelona, 08022, Spain',
  Location: 'Barcelona, Spain',
  Price: '€€€€',
  Cuisine: 'Creative',
  Longitude: '2.1365112',
  Latitude: '41.4104497',
  PhoneNumber: '+34933196600',
  Url: 'https://guide.michelin.com/en/catalunya/barcelona/restaurant/abac',
  WebsiteUrl: 'https://abacrestaurant.com',
  Award: '3 Stars',
  GreenStar: '0',
  ...over,
})

describe('normalizeRow', () => {
  it('maps the CSV fields', () => {
    expect(normalizeRow(row())).toEqual({
      path: 'catalunya/barcelona/restaurant/abac',
      name: 'ABaC',
      address: 'Avenida del Tibidabo 1, Barcelona, 08022, Spain',
      city: 'Barcelona',
      country: 'Spain',
      lat: 41.4104497,
      lng: 2.1365112,
      award: '3',
      green: false,
      price: 4,
      currency: '€',
      cuisine: 'Creative',
      url: 'https://guide.michelin.com/en/catalunya/barcelona/restaurant/abac',
      website: 'https://abacrestaurant.com',
      phone: '+34933196600',
    })
  })

  it.each([
    ['1 Star', '1'],
    ['2 Stars', '2'],
    ['Bib Gourmand', 'bib'],
    ['Selected Restaurants', 'selected'],
  ])('maps award %s', (raw, award) => {
    expect(normalizeRow(row({ Award: raw })).award).toBe(award)
  })

  it('rejects an unknown award instead of guessing', () => {
    expect(() => normalizeRow(row({ Award: '4 Stars' }))).toThrow(/unknown award/)
  })

  it.each([
    ['', '2.1'],
    ['abc', '2.1'],
    ['0', '0'],
    ['91', '2.1'],
  ])('rejects bad coordinates (%s, %s)', (lat, lng) => {
    expect(() => normalizeRow(row({ Latitude: lat, Longitude: lng }))).toThrow(/bad coordinates/)
  })

  it('decodes percent-encoded paths so IDs survive an encoding change', () => {
    const encoded = normalizeRow(row({ Url: 'https://guide.michelin.com/en/hcmc/ho-chi-minh/restaurant/%C4%91ong-pho' }))
    const plain = normalizeRow(row({ Url: 'https://guide.michelin.com/en/hcmc/ho-chi-minh/restaurant/đong-pho' }))
    expect(encoded.path).toBe('hcmc/ho-chi-minh/restaurant/đong-pho')
    expect(plain.path).toBe(encoded.path)
  })

  it('rejects a segment that decodes to a slash', () => {
    expect(() => normalizeRow(row({ Url: 'https://guide.michelin.com/en/a/b/restaurant/x%2Fy' }))).toThrow(/unusable path segment/)
  })

  it('rejects an unexpected URL shape', () => {
    expect(() => normalizeRow(row({ Url: 'https://guide.michelin.com/en/barcelona/abac' }))).toThrow(/URL shape/)
  })

  it('reads price level from symbol count in any currency', () => {
    expect(normalizeRow(row({ Price: '฿฿' }))).toMatchObject({ price: 2, currency: '฿' })
    expect(normalizeRow(row({ Price: '$' }))).toMatchObject({ price: 1, currency: '$' })
  })

  it('treats a non-symbol price as unknown', () => {
    // the live file has one row with Price "none"
    expect(normalizeRow(row({ Price: 'none' }))).toMatchObject({ price: null, currency: null })
    expect(normalizeRow(row({ Price: '$€' }))).toMatchObject({ price: null, currency: null })
  })

  it('splits city and country for 1-, 2- and 3-part locations', () => {
    expect(normalizeRow(row({ Location: 'Singapore' }))).toMatchObject({ city: 'Singapore', country: 'Singapore' })
    expect(normalizeRow(row({ Location: 'San Diego, CA, USA' }))).toMatchObject({ city: 'San Diego', country: 'USA' })
  })

  it('keeps a cuisine containing a comma whole', () => {
    expect(normalizeRow(row({ Cuisine: 'Cheese, Fondue and Raclette' })).cuisine).toBe('Cheese, Fondue and Raclette')
  })

  it('reads the green star flag and empty optionals', () => {
    expect(normalizeRow(row({ GreenStar: '1', WebsiteUrl: '', PhoneNumber: ' ' }))).toMatchObject({ green: true, website: null, phone: null })
  })
})

// --- resolve ---------------------------------------------------------------

const listing = (path: string, over: Partial<Listing> = {}): Listing => ({
  path,
  name: path.split('/').pop()!,
  address: '',
  city: path.split('/')[1],
  country: 'X',
  lat: 48,
  lng: 2,
  award: '1',
  green: false,
  price: 3,
  currency: '€',
  cuisine: 'French',
  url: `https://guide.michelin.com/en/${path}`,
  website: null,
  phone: null,
  ...over,
})

const seed = (...ls: Listing[]): Restaurant[] => resolve([], ls, '2026-01-01').restaurants
const byId = (rs: Restaurant[], id: string) => rs.find((r) => r.id === id)

// ~1 km of latitude
const KM = 1 / 111.2

describe('resolve', () => {
  it('assigns the bare slug as the ID on first sighting', () => {
    const rs = seed(listing('r/paris/restaurant/chez-a'))
    expect(rs).toHaveLength(1)
    expect(rs[0]).toMatchObject({ id: 'chez-a', inGuide: true, firstSeen: '2026-01-01', lastSeen: '2026-01-01' })
  })

  it('disambiguates a slug collision with the city segment, then a counter', () => {
    const rs = seed(
      listing('r/paris/restaurant/bistro'),
      listing('r/lyon/restaurant/bistro'),
      listing('q/lyon/restaurant/bistro'),
    )
    expect(rs.map((r) => r.id).sort()).toEqual(['bistro', 'bistro--lyon', 'bistro--lyon-2'])
  })

  it('keeps the ID on an exact path match and updates the listing', () => {
    const reg = seed(listing('r/paris/restaurant/chez-a', { award: '1' }))
    const { restaurants, report } = resolve(reg, [listing('r/paris/restaurant/chez-a', { award: '2' })], '2026-02-01')
    expect(restaurants[0]).toMatchObject({ id: 'chez-a', award: '2', firstSeen: '2026-01-01', lastSeen: '2026-02-01' })
    expect(report.kept).toBe(1)
    expect(report.awardChanges).toEqual([{ id: 'chez-a', from: '1', to: '2' }])
  })

  it('relinks a re-filed path with the same slug nearby', () => {
    const reg = seed(listing('florida/miami-beach/restaurant/taquiza'))
    const { restaurants, report } = resolve(reg, [listing('florida/miami/restaurant/taquiza', { lat: 48 + 1.5 * KM })], '2026-02-01')
    expect(restaurants).toHaveLength(1)
    expect(restaurants[0]).toMatchObject({ id: 'taquiza', path: 'florida/miami/restaurant/taquiza', inGuide: true })
    expect(report.relinked).toEqual([{ id: 'taquiza', from: 'florida/miami-beach/restaurant/taquiza', to: 'florida/miami/restaurant/taquiza', rule: 'slug' }])
  })

  it('does NOT relink a same-slug restaurant far away (the two bagatelles)', () => {
    const reg = seed(listing('rheinland-pfalz/trier/restaurant/bagatelle'))
    const { restaurants, report } = resolve(reg, [listing('bfc/dole/restaurant/bagatelle', { lat: 48 + 300 * KM })], '2026-02-01')
    expect(byId(restaurants, 'bagatelle')).toMatchObject({ path: 'rheinland-pfalz/trier/restaurant/bagatelle', inGuide: false })
    expect(byId(restaurants, 'bagatelle--dole')).toMatchObject({ inGuide: true, firstSeen: '2026-02-01' })
    expect(report).toMatchObject({ relinked: [], added: 1, retired: 1 })
  })

  it('does not relink a same-slug move just beyond the slug radius', () => {
    const reg = seed(listing('r/a/restaurant/x'))
    const { report } = resolve(reg, [listing('r/b/restaurant/x', { lat: 48 + 2.2 * KM })], '2026-02-01')
    expect(report.relinked).toEqual([])
  })

  it('relinks an in-place re-slug by normalized name within 300 m', () => {
    const reg = seed(listing('r/monaco/restaurant/blue-bay', { name: 'Blue Bay Marcel Ravin' }))
    const { restaurants, report } = resolve(
      reg,
      [listing('r/monaco/restaurant/blue-bay-marcel-ravin', { name: 'Blue Bay - Marcel Ravin', lat: 48 + 0.2 * KM })],
      '2026-02-01',
    )
    expect(restaurants).toHaveLength(1)
    expect(restaurants[0]).toMatchObject({ id: 'blue-bay', path: 'r/monaco/restaurant/blue-bay-marcel-ravin' })
    expect(report.relinked[0].rule).toBe('name')
  })

  it('matches names across accents and case', () => {
    const reg = seed(listing('r/a/restaurant/old', { name: 'Café Ébène' }))
    const { report } = resolve(reg, [listing('r/a/restaurant/new', { name: 'CAFE EBENE' })], '2026-02-01')
    expect(report.relinked).toEqual([expect.objectContaining({ id: 'old', rule: 'name' })])
  })

  it('rejects a registry with duplicate paths', () => {
    const [r] = seed(listing('r/a/restaurant/x'))
    expect(() => resolve([r, { ...r, id: 'other' }], [], '2026-02-01')).toThrow(/duplicate paths/)
  })

  it('does not relink by name beyond 300 m', () => {
    const reg = seed(listing('r/a/restaurant/one', { name: 'Kenya' }))
    const { report } = resolve(reg, [listing('r/a/restaurant/two', { name: 'Kenya', lat: 48 + 0.5 * KM })], '2026-02-01')
    expect(report.relinked).toEqual([])
  })

  it('never relinks onto a restaurant whose path is still listed', () => {
    const reg = seed(listing('r/a/restaurant/twin', { name: 'Twin' }))
    const { restaurants, report } = resolve(
      reg,
      [listing('r/a/restaurant/twin', { name: 'Twin' }), listing('r/a/restaurant/twin-2', { name: 'Twin' })],
      '2026-02-01',
    )
    expect(report).toMatchObject({ kept: 1, relinked: [], added: 1 })
    expect(restaurants.every((r) => r.inGuide)).toBe(true)
  })

  it('gives fresh IDs when two new paths claim one vanished entry', () => {
    const reg = seed(listing('r/a/restaurant/dup'))
    const { restaurants, report } = resolve(reg, [listing('r/b/restaurant/dup'), listing('r/c/restaurant/dup')], '2026-02-01')
    expect(report.relinked).toEqual([])
    expect(report.ambiguous.sort()).toEqual(['r/b/restaurant/dup', 'r/c/restaurant/dup'])
    expect(byId(restaurants, 'dup')).toMatchObject({ inGuide: false })
  })

  it('gives a fresh ID when one new path matches two vanished entries', () => {
    const reg = seed(listing('r/a/restaurant/one', { name: 'Same' }), listing('r/a/restaurant/two', { name: 'Same' }))
    const { report } = resolve(reg, [listing('r/a/restaurant/three', { name: 'Same' })], '2026-02-01')
    expect(report).toMatchObject({ relinked: [], ambiguous: ['r/a/restaurant/three'], added: 1, retired: 2 })
  })

  it('prefers the slug rule over the name rule', () => {
    const reg = seed(listing('r/a/restaurant/x', { name: 'Other' }), listing('r/a/restaurant/y', { name: 'Name' }))
    const { report } = resolve(reg, [listing('r/b/restaurant/x', { name: 'Name' })], '2026-02-01')
    expect(report.relinked).toEqual([{ id: 'x', from: 'r/a/restaurant/x', to: 'r/b/restaurant/x', rule: 'slug' }])
  })

  it('keeps retired entries with their last listing and never reuses their IDs', () => {
    const reg = seed(listing('r/a/restaurant/gone', { award: '2' }))
    const r1 = resolve(reg, [], '2026-02-01')
    expect(r1.restaurants[0]).toMatchObject({ id: 'gone', award: '2', inGuide: false, lastSeen: '2026-01-01' })
    expect(r1.report.retired).toBe(1)
    // counted once, not again on the next refresh
    expect(resolve(r1.restaurants, [], '2026-03-01').report.retired).toBe(0)
    // a new restaurant far away with the same slug gets a different ID
    const r3 = resolve(r1.restaurants, [listing('r/z/restaurant/gone', { lat: 10 })], '2026-03-01')
    expect(byId(r3.restaurants, 'gone--z')).toMatchObject({ inGuide: true })
  })

  it('relinks a retired entry that returns under a new path nearby', () => {
    const reg = resolve(seed(listing('r/a/restaurant/back')), [], '2026-02-01').restaurants
    const { restaurants } = resolve(reg, [listing('r/b/restaurant/back')], '2026-03-01')
    expect(restaurants).toEqual([expect.objectContaining({ id: 'back', inGuide: true, firstSeen: '2026-01-01' })])
  })

  it('rejects a snapshot with duplicate paths', () => {
    expect(() => resolve([], [listing('r/a/restaurant/x'), listing('r/a/restaurant/x')], '2026-01-01')).toThrow(/duplicate path/)
  })

  it('output is sorted by ID', () => {
    const rs = seed(listing('r/a/restaurant/c'), listing('r/a/restaurant/a'), listing('r/a/restaurant/b'))
    expect(rs.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('toClientPayload', () => {
  it('emits rows in field order with rounded coordinates', () => {
    const [r] = seed(listing('r/a/restaurant/x', { lat: 41.41044971234, lng: 2.13651129 }))
    const p = toClientPayload([r], '2026-01-01')
    expect(p.snapshot).toBe('2026-01-01')
    const o = Object.fromEntries(p.fields.map((f, i) => [f, p.rows[0][i]]))
    expect(o).toMatchObject({ id: 'x', path: 'r/a/restaurant/x', lat: 41.41045, lng: 2.13651, inGuide: true })
    expect(p.fields).not.toContain('url')
  })
})
