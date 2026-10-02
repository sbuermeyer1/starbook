import { describe, expect, it } from 'vitest'
import { awardChange, compareVisits, groupVisits, isTracked, matchesStatus, statusOf, todayISO, validateVisit } from './model'
import type { Entry, Tracked, Visit } from './model'
import { applyFilters, activeFilterCount, DEFAULT_FILTERS } from '../data/filters'
import type { Restaurant } from '../data/restaurants'

const visit = (over: Partial<Visit> = {}): Visit => ({
  id: 'v',
  restaurantId: 'r1',
  date: '2026-05-01',
  rating: 4,
  notes: '',
  award: '1',
  green: false,
  createdAt: 1000,
  ...over,
})

const tracked = (entries: [string, Entry][] = [], visits: Visit[] = []): Tracked => ({
  entries: new Map(entries),
  visits: groupVisits(visits),
})

describe('statusOf', () => {
  it('derives visited from having a visit, flags from the entry', () => {
    const t = tracked([['r2', { want: true, favorite: false }]], [visit({ restaurantId: 'r1' })])
    expect(statusOf(t, 'r1')).toEqual({ visited: true, want: false, favorite: false })
    expect(statusOf(t, 'r2')).toEqual({ visited: false, want: true, favorite: false })
    expect(statusOf(t, 'r3')).toEqual({ visited: false, want: false, favorite: false })
  })

  it('isTracked is any of the three', () => {
    const t = tracked([['f', { want: false, favorite: true }], ['w', { want: true, favorite: false }]], [visit({ restaurantId: 'v' })])
    expect(['f', 'w', 'v', 'none'].map((id) => isTracked(t, id))).toEqual([true, true, true, false])
  })
})

describe('matchesStatus', () => {
  const t = tracked(
    [
      ['want', { want: true, favorite: false }],
      ['fav', { want: false, favorite: true }],
    ],
    [visit({ restaurantId: 'been' }), visit({ id: 'v2', restaurantId: 'fav' })],
  )
  const ids = ['want', 'fav', 'been', 'none']
  const pick = (...s: Parameters<typeof matchesStatus>[2] extends Set<infer S> ? S[] : never) =>
    ids.filter((id) => matchesStatus(t, id, new Set(s)))

  it('empty set matches everything', () => expect(pick()).toEqual(ids))
  it('visited', () => expect(pick('visited')).toEqual(['fav', 'been']))
  it('want', () => expect(pick('want')).toEqual(['want']))
  it('favorite', () => expect(pick('favorite')).toEqual(['fav']))
  it('not visited', () => expect(pick('notVisited')).toEqual(['want', 'none']))
  it('several are any-of', () => expect(pick('want', 'favorite')).toEqual(['want', 'fav']))
})

describe('visit ordering', () => {
  it('dated newest first, then undated by most recently logged', () => {
    const vs = [
      visit({ id: 'old', date: '2024-01-01' }),
      visit({ id: 'undated-early', date: null, createdAt: 1 }),
      visit({ id: 'new', date: '2026-01-01' }),
      visit({ id: 'undated-late', date: null, createdAt: 2 }),
    ]
    expect([...vs].sort(compareVisits).map((v) => v.id)).toEqual(['new', 'old', 'undated-late', 'undated-early'])
  })

  it('same date falls back to most recently logged', () => {
    const vs = [visit({ id: 'a', createdAt: 1 }), visit({ id: 'b', createdAt: 2 })]
    expect([...vs].sort(compareVisits).map((v) => v.id)).toEqual(['b', 'a'])
  })

  it('groups by restaurant and sorts each group', () => {
    const g = groupVisits([visit({ id: 'x1', restaurantId: 'x', date: '2020-01-01' }), visit({ id: 'y', restaurantId: 'y' }), visit({ id: 'x2', restaurantId: 'x', date: '2025-01-01' })])
    expect(g.get('x')!.map((v) => v.id)).toEqual(['x2', 'x1'])
    expect(g.get('y')!.map((v) => v.id)).toEqual(['y'])
  })
})

describe('validateVisit', () => {
  const ok = { date: '2026-05-01', rating: 4, notes: '' }
  const today = '2026-10-01'
  it('accepts a normal visit, today, an unknown date and no rating', () => {
    expect(validateVisit(ok, today)).toBeNull()
    expect(validateVisit({ ...ok, date: today }, today)).toBeNull()
    expect(validateVisit({ ...ok, date: null, rating: null }, today)).toBeNull()
  })
  it.each([
    ['future date', { date: '2026-10-02' }, /future/],
    ['impossible date', { date: '2026-02-30' }, /valid date/],
    ['malformed date', { date: '1/5/2026' }, /valid date/],
    ['ancient date', { date: '1850-01-01' }, /valid date/],
    ['empty date string', { date: '' }, /valid date/],
    ['rating 0', { rating: 0 }, /1 to 5/],
    ['rating 6', { rating: 6 }, /1 to 5/],
    ['fractional rating', { rating: 3.5 }, /1 to 5/],
    ['long notes', { notes: 'x'.repeat(2001) }, /2000/],
  ])('rejects %s', (_, over, msg) => {
    expect(validateVisit({ ...ok, ...over }, today)).toMatch(msg)
  })
  it('accepts notes at exactly the limit', () => {
    expect(validateVisit({ ...ok, notes: 'x'.repeat(2000) }, today)).toBeNull()
  })
  it('todayISO uses the local calendar date', () => {
    expect(todayISO(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('awardChange', () => {
  it('is null when the award is unchanged', () => {
    expect(awardChange(visit({ award: '1' }), { award: '1', inGuide: true })).toBeNull()
  })
  it('reports was/now when it changed', () => {
    expect(awardChange(visit({ award: '1' }), { award: '2', inGuide: true })).toEqual({ was: '1', now: '2' })
  })
  it('reports a restaurant that left the guide', () => {
    expect(awardChange(visit({ award: '3' }), { award: '3', inGuide: false })).toEqual({ was: '3', now: null })
  })
})

describe('filters with tracking', () => {
  const r = (id: string, over: Partial<Restaurant> = {}): Restaurant => ({
    id, path: `x/y/restaurant/${id}`, name: id, address: '', city: 'C', country: 'K', lat: 0, lng: 0,
    award: '1', green: false, price: 2, currency: '$', cuisine: 'X', website: null, phone: null, inGuide: true, ...over,
  })
  const rs = [r('been'), r('want'), r('none'), r('gone-visited', { inGuide: false }), r('gone', { inGuide: false })]
  const t = tracked([['want', { want: true, favorite: false }]], [visit({ restaurantId: 'been' }), visit({ id: 'g', restaurantId: 'gone-visited' })])

  it('a status filter narrows the map', () => {
    expect(applyFilters(rs, { ...DEFAULT_FILTERS, statuses: new Set(['visited']) }, t).map((x) => x.id)).toEqual(['been', 'gone-visited'])
  })
  it('restaurants you tracked stay on the map after leaving the guide; others stay hidden', () => {
    expect(applyFilters(rs, DEFAULT_FILTERS, t).map((x) => x.id)).toEqual(['been', 'want', 'none', 'gone-visited'])
  })
  it('counts the status filter as active', () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, statuses: new Set(['want']) })).toBe(1)
  })
})
