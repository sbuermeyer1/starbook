import { describe, expect, it } from 'vitest'
import { decodePayload, guideUrl, priceLabel } from './restaurants'
import type { Restaurant } from './restaurants'
import { activeFilterCount, applyFilters, changedFilters, cuisineCounts, DEFAULT_FILTERS, matches } from './filters'
import type { Filters } from './filters'
import { buildCities, CITY_RADIUS_KM, search } from './search'
import { buildIndex, itemsInView } from '../map/clusters'

const r = (over: Partial<Restaurant> = {}): Restaurant => ({
  id: 'x',
  path: 'region/city/restaurant/x',
  name: 'X',
  address: '',
  city: 'City',
  country: 'Country',
  lat: 48.85,
  lng: 2.35,
  award: '1',
  green: false,
  price: 3,
  currency: '€',
  cuisine: 'French',
  website: null,
  phone: null,
  inGuide: true,
  ...over,
})

const f = (over: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, ...over })

describe('decodePayload', () => {
  it('follows the payload field order', () => {
    const d = decodePayload({
      snapshot: '2026-10-01',
      fields: ['inGuide', 'phone', 'website', 'cuisine', 'currency', 'price', 'green', 'award', 'lng', 'lat', 'country', 'city', 'address', 'name', 'path', 'id'],
      rows: [[true, null, null, 'French', '€', 2, true, 'bib', 2.3, 48.8, 'France', 'Paris', 'addr', 'Chez', 'r/paris/restaurant/chez', 'chez']],
    })
    expect(d.restaurants[0]).toEqual({
      id: 'chez', path: 'r/paris/restaurant/chez', name: 'Chez', address: 'addr', city: 'Paris', country: 'France',
      lat: 48.8, lng: 2.3, award: 'bib', green: true, price: 2, currency: '€', cuisine: 'French', website: null, phone: null, inGuide: true,
    })
  })

  it('fails loudly when a field is missing', () => {
    expect(() => decodePayload({ snapshot: '', fields: ['id'], rows: [] })).toThrow(/missing fields: path/)
  })
})

describe('restaurant helpers', () => {
  it('rebuilds the guide URL, re-encoding non-ASCII', () => {
    expect(guideUrl({ path: 'hcmc/ho-chi-minh/restaurant/đong-pho' })).toBe('https://guide.michelin.com/en/hcmc/ho-chi-minh/restaurant/%C4%91ong-pho')
  })
  it('formats price in local currency', () => {
    expect(priceLabel({ price: 3, currency: '¥' })).toBe('¥¥¥')
    expect(priceLabel({ price: null, currency: null })).toBeNull()
  })
})

describe('filters', () => {
  it('defaults hide Selected and retired restaurants', () => {
    expect(matches(r({ award: '3' }), DEFAULT_FILTERS)).toBe(true)
    expect(matches(r({ award: 'bib' }), DEFAULT_FILTERS)).toBe(true)
    expect(matches(r({ award: 'selected' }), DEFAULT_FILTERS)).toBe(false)
    expect(matches(r({ inGuide: false }), DEFAULT_FILTERS)).toBe(false)
    expect(matches(r({ inGuide: false }), f({ includeRetired: true }))).toBe(true)
  })

  it('green-only keeps only Green Star restaurants', () => {
    expect(matches(r({ green: false }), f({ greenOnly: true }))).toBe(false)
    expect(matches(r({ green: true }), f({ greenOnly: true }))).toBe(true)
  })

  it('price filter is any-of, and excludes unknown prices only when active', () => {
    const p = f({ prices: new Set([1, 2]) })
    expect(matches(r({ price: 2 }), p)).toBe(true)
    expect(matches(r({ price: 3 }), p)).toBe(false)
    expect(matches(r({ price: null }), p)).toBe(false)
    expect(matches(r({ price: null }), DEFAULT_FILTERS)).toBe(true)
  })

  it('cuisine filter is any-of', () => {
    const c = f({ cuisines: new Set(['Japanese', 'Sushi']) })
    expect(matches(r({ cuisine: 'Sushi' }), c)).toBe(true)
    expect(matches(r({ cuisine: 'French' }), c)).toBe(false)
  })

  it('applyFilters combines every condition', () => {
    const rs = [r({ id: 'a', award: '3', green: true }), r({ id: 'b', award: '3' }), r({ id: 'c', award: 'selected', green: true })]
    expect(applyFilters(rs, f({ greenOnly: true })).map((x) => x.id)).toEqual(['a'])
  })

  it('counts filters that differ from the defaults', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0)
    expect(activeFilterCount(f({ awards: new Set(['3', '2', '1', 'bib']) }))).toBe(0)
    expect(activeFilterCount(f({ awards: new Set(['3']) }))).toBe(1)
    expect(activeFilterCount(f({ awards: new Set(['3', '2', '1', 'selected']) }))).toBe(1)
    expect(activeFilterCount(f({ greenOnly: true, prices: new Set([1]), cuisines: new Set(['x']), includeRetired: true }))).toBe(4)
  })

  it('counts cuisines among in-guide restaurants, most common first', () => {
    const rs = [r({ cuisine: 'B' }), r({ cuisine: 'A' }), r({ cuisine: 'B' }), r({ cuisine: 'C', inGuide: false }), r({ cuisine: '' })]
    expect(cuisineCounts(rs)).toEqual([['B', 2], ['A', 1]])
  })
})

describe('cities', () => {
  it('groups by guide path, not display name', () => {
    const cs = buildCities([
      r({ id: '1', path: 'fryslan/hoorn_2213765/restaurant/a', city: 'Hoorn', country: 'Netherlands' }),
      r({ id: '2', path: 'noord-holland/hoorn/restaurant/b', city: 'Hoorn', country: 'Netherlands' }),
    ])
    expect(cs.map((c) => c.label).sort()).toEqual(['Hoorn, Netherlands (Fryslan)', 'Hoorn, Netherlands (Noord Holland)'])
  })

  it('leaves unique labels alone and skips retired restaurants', () => {
    const cs = buildCities([r({ path: 'x/paris/restaurant/a', city: 'Paris', country: 'France' }), r({ path: 'x/gone/restaurant/b', inGuide: false })])
    expect(cs).toHaveLength(1)
    expect(cs[0]).toMatchObject({ label: 'Paris, France', count: 1 })
  })

  it('fits bounds to restaurants near the median, ignoring far outliers', () => {
    const far = 1.5 // degrees of latitude, ~165 km
    const cs = buildCities([
      r({ id: 'a', path: 'x/dc/restaurant/a', lat: 38.90 }),
      r({ id: 'b', path: 'x/dc/restaurant/b', lat: 38.91 }),
      r({ id: 'c', path: 'x/dc/restaurant/c', lat: 38.92 }),
      r({ id: 'd', path: 'x/dc/restaurant/d', lat: 38.90 + far }),
    ])
    expect(CITY_RADIUS_KM).toBeLessThan(far * 111)
    expect(cs[0].count).toBe(4)
    expect(cs[0].bounds[1][0]).toBeCloseTo(38.92)
  })
})

describe('search', () => {
  const rs = [
    r({ id: 'sel', name: 'Le Bernardin Café', award: 'selected', path: 'ny/new-york/restaurant/sel', city: 'New York', country: 'USA' }),
    r({ id: 'three', name: 'Le Bernardin', award: '3', path: 'ny/new-york/restaurant/three', city: 'New York', country: 'USA' }),
    r({ id: 'mid', name: 'Chez Bernard', award: '1', path: 'x/paris/restaurant/mid', city: 'Paris', country: 'France' }),
    r({ id: 'acc', name: 'Café Ébène', award: 'bib', path: 'x/paris/restaurant/acc', city: 'Paris', country: 'France' }),
  ]
  const cities = buildCities(rs)

  it('needs at least two characters', () => {
    expect(search('l', cities, rs)).toEqual({ cities: [], restaurants: [] })
  })

  it('ranks whole-name prefix, then word prefix, and better awards first within a tier', () => {
    expect(search('le ber', cities, rs).restaurants.map((x) => x.id)).toEqual(['three', 'sel'])
    expect(search('bernar', cities, rs).restaurants.map((x) => x.id)).toEqual(['three', 'mid', 'sel'])
  })

  it('ignores accents and case', () => {
    expect(search('EBENE', cities, rs).restaurants.map((x) => x.id)).toEqual(['acc'])
  })

  it('finds cities and orders by restaurant count', () => {
    expect(search('par', cities, rs).cities.map((c) => c.label)).toEqual(['Paris, France'])
    expect(search('new', cities, rs).cities[0]).toMatchObject({ label: 'New York, USA', count: 2 })
  })

  it('ranks in-guide restaurants above retired ones', () => {
    const withRetired = [r({ id: 'old', name: 'Alma', award: '3', inGuide: false }), r({ id: 'new', name: 'Alma', award: 'selected' })]
    expect(search('alma', [], withRetired).restaurants.map((x) => x.id)).toEqual(['new', 'old'])
  })
})

describe('clusters', () => {
  const world: [number, number, number, number] = [-180, -85, 180, 85]

  it('colors a cluster by its best award', () => {
    const idx = buildIndex([r({ id: 'a', award: 'selected' }), r({ id: 'b', award: '2', lng: 2.3501 }), r({ id: 'c', award: 'bib', lng: 2.3502 })])
    const items = itemsInView(idx, world, 3)
    expect(items).toEqual([expect.objectContaining({ kind: 'cluster', count: 3, best: '2' })])
  })

  it('splits into individual points when zoomed in', () => {
    const idx = buildIndex([r({ id: 'a' }), r({ id: 'b', lng: 2.36 })])
    expect(itemsInView(idx, world, 16).map((i) => (i.kind === 'point' ? i.id : 'cluster')).sort()).toEqual(['a', 'b'])
  })
})

describe('changedFilters', () => {
  it('names the filters that changed, ignoring Set order', () => {
    const a = f({ cuisines: new Set(['A', 'B']) })
    expect(changedFilters(a, f({ cuisines: new Set(['B', 'A']) }))).toEqual([])
    expect(changedFilters(a, { ...a, greenOnly: true, prices: new Set([1]) }).sort()).toEqual(['greenOnly', 'prices'])
    expect(changedFilters(DEFAULT_FILTERS, { ...DEFAULT_FILTERS, friend: { kind: 'any' } })).toEqual(['friend'])
  })
})
