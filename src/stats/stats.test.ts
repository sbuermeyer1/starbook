import { describe, expect, it } from 'vitest'
import { bestRecorded, favorites, places, summarize, topRated, visitsByYear } from './stats'
import { groupVisits } from '../tracking/model'
import type { Visit } from '../tracking/model'
import type { Award, Restaurant } from '../data/restaurants'

const r = (id: string, over: Partial<Restaurant> = {}): Restaurant => ({
  id, path: `region/city/restaurant/${id}`, name: id, address: '', city: 'City', country: 'France', lat: 0, lng: 0,
  award: '1', green: false, price: 2, currency: '€', cuisine: 'X', website: null, phone: null, inGuide: true, ...over,
})
let n = 0
const v = (restaurantId: string, award: Award, over: Partial<Visit> = {}): Visit => ({
  id: `v${n++}`, restaurantId, date: '2025-05-01', rating: null, notes: '', award, green: false, createdAt: n, ...over,
})

const byId = new Map(
  [
    r('paris3', { path: 'idf/paris/restaurant/paris3', city: 'Paris' }),
    r('paris1', { path: 'idf/paris/restaurant/paris1', city: 'Paris' }),
    r('lyonbib', { path: 'ara/lyon/restaurant/lyonbib', city: 'Lyon' }),
    r('tokyo2', { path: 'kanto/tokyo/restaurant/tokyo2', city: 'Tokyo', country: 'Japan' }),
    r('portland-or', { path: 'oregon/portland/restaurant/portland-or', city: 'Portland', country: 'USA' }),
    r('portland-me', { path: 'maine/portland/restaurant/portland-me', city: 'Portland', country: 'USA' }),
  ].map((x) => [x.id, x]),
)

describe('bestRecorded', () => {
  it('takes the best award and any Green Star across visits', () => {
    expect(bestRecorded([v('x', '1'), v('x', '2', { green: true }), v('x', 'bib')])).toEqual({ award: '2', green: true })
  })
})

describe('summarize', () => {
  const visits = groupVisits([
    v('paris3', '3'),
    v('paris3', '3'), // a second visit adds no stars
    v('paris1', '1', { green: true }),
    v('paris1', '2'), // upgraded since the first visit: counts as 2
    v('lyonbib', 'bib'),
    v('tokyo2', '2', { date: null }),
  ])

  it('counts each restaurant once, at its best recorded award', () => {
    expect(summarize(visits, byId)).toEqual({
      stars: 3 + 2 + 0 + 2,
      restaurants: 4,
      visits: 6,
      byAward: { '3': 1, '2': 2, '1': 0, bib: 1, selected: 0 },
      green: 1,
      countries: 2,
      cities: 3,
    })
  })

  it('uses recorded awards, not the current guide', () => {
    const s = summarize(groupVisits([v('paris1', '3')]), byId) // currently 1★, was 3★ when logged
    expect(s.stars).toBe(3)
  })

  it('treats two same-named cities in different regions as different', () => {
    expect(summarize(groupVisits([v('portland-or', '1'), v('portland-me', '1')]), byId).cities).toBe(2)
  })

  it('is all zeros with no visits', () => {
    expect(summarize(new Map(), byId)).toMatchObject({ stars: 0, restaurants: 0, visits: 0, countries: 0 })
  })

  it('still counts a visit to a restaurant missing from the data, without a place', () => {
    expect(summarize(groupVisits([v('gone', '3')]), byId)).toMatchObject({ stars: 3, restaurants: 1, countries: 0 })
  })
})

describe('places', () => {
  it('ranks countries and cities by restaurants visited', () => {
    const p = places(groupVisits([v('paris3', '3'), v('paris3', '3'), v('paris1', '1'), v('lyonbib', 'bib'), v('tokyo2', '2')]), byId)
    expect(p.countries).toEqual([
      { key: 'France', label: 'France', restaurants: 3 },
      { key: 'Japan', label: 'Japan', restaurants: 1 },
    ])
    expect(p.cities.map((c) => [c.label, c.restaurants])).toEqual([
      ['Paris, France', 2],
      ['Lyon, France', 1],
      ['Tokyo, Japan', 1],
    ])
  })
})

describe('visitsByYear', () => {
  it('counts visits (not restaurants) per year, undated separately', () => {
    const out = visitsByYear(groupVisits([v('a', '1', { date: '2024-01-01' }), v('a', '1', { date: '2025-02-02' }), v('b', '1', { date: '2025-03-03' }), v('c', '1', { date: null })]))
    expect(out).toEqual({ years: [[2024, 1], [2025, 2]], undated: 1 })
  })
})

describe('topRated', () => {
  it('ranks by best rating, then recorded award, ignoring unrated', () => {
    const out = topRated(
      groupVisits([v('lyonbib', 'bib', { rating: 5 }), v('paris3', '3', { rating: 5 }), v('paris1', '1', { rating: 3 }), v('paris1', '1', { rating: 4 }), v('tokyo2', '2')]),
      byId,
    )
    expect(out.map((x) => [x.restaurant.id, x.rating])).toEqual([
      ['paris3', 5],
      ['lyonbib', 5],
      ['paris1', 4],
    ])
  })
})

describe('favorites', () => {
  it('lists favorite restaurants by name', () => {
    const t = { entries: new Map([['tokyo2', { want: false, favorite: true }], ['paris1', { want: true, favorite: false }], ['lyonbib', { want: false, favorite: true }]]), visits: new Map() }
    expect(favorites(t, byId).map((x) => x.id)).toEqual(['lyonbib', 'tokyo2'])
  })
})
