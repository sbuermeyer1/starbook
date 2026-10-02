import { describe, expect, it } from 'vitest'
import { activityByRestaurant, friendsWhoVisited, matchesFriendFilter } from './activity'
import type { FriendLists } from './activity'
import { groupVisits } from '../tracking/model'
import { activeFilterCount, applyFilters, DEFAULT_FILTERS } from '../data/filters'
import type { Entry, Tracked, Visit } from '../tracking/model'

const v = (restaurantId: string, date: string | null, over: Partial<Visit> = {}): Visit => ({
  id: `${restaurantId}-${date}`,
  restaurantId,
  date,
  rating: 4,
  notes: '',
  award: '1',
  green: false,
  createdAt: 1,
  ...over,
})
const lists = (visits: Visit[], entries: [string, Entry][] = []): FriendLists => ({ visits, entries: new Map(entries) })
const me = (visits: Visit[] = []): Tracked => ({ entries: new Map(), visits: groupVisits(visits) })

describe('activityByRestaurant', () => {
  const activity = activityByRestaurant(
    new Map([
      ['bob', lists([v('abac', '2025-03-01'), v('abac', '2026-01-10'), v('disfrutar', '2024-05-05')], [['abac', { want: false, favorite: true }]])],
      ['carol', lists([v('abac', '2026-06-01')], [['noma', { want: true, favorite: false }]])],
      ['dave', lists([], [['abac', { want: true, favorite: false }]])],
    ]),
  )

  it('groups each friend\'s visits per restaurant, newest first, with their flags', () => {
    const bob = activity.get('abac')!.find((a) => a.uid === 'bob')!
    expect(bob.visits.map((x) => x.date)).toEqual(['2026-01-10', '2025-03-01'])
    expect(bob).toMatchObject({ favorite: true, want: false })
  })

  it('orders friends by most recent visit, wishlist-only friends last', () => {
    expect(activity.get('abac')!.map((a) => a.uid)).toEqual(['carol', 'bob', 'dave'])
  })

  it('includes wishlist-only restaurants', () => {
    expect(activity.get('noma')).toEqual([{ uid: 'carol', visits: [], favorite: false, want: true }])
  })

  it('ignores all-false entries', () => {
    const a = activityByRestaurant(new Map([['bob', lists([], [['x', { want: false, favorite: false }]])]]))
    expect(a.has('x')).toBe(false)
  })

  it('friendsWhoVisited excludes wishlist-only friends', () => {
    expect(friendsWhoVisited(activity, 'abac')).toEqual(['carol', 'bob'])
    expect(friendsWhoVisited(activity, 'noma')).toEqual([])
    expect(friendsWhoVisited(activity, 'unknown')).toEqual([])
  })
})

describe('matchesFriendFilter', () => {
  const activity = activityByRestaurant(
    new Map([
      ['bob', lists([v('abac', '2025-03-01')])],
      ['carol', lists([], [['noma', { want: true, favorite: false }]])],
    ]),
  )
  const mine = me([v('disfrutar', '2026-01-01')])
  const ids = ['abac', 'noma', 'disfrutar', 'other']
  const pick = (f: Parameters<typeof matchesFriendFilter>[0]) => ids.filter((rid) => matchesFriendFilter(f, rid, activity, mine))

  it('off matches everything', () => expect(pick(null)).toEqual(ids))
  it('any friend has been', () => expect(pick({ kind: 'any' })).toEqual(['abac']))
  it('a specific friend has been', () => {
    expect(pick({ kind: 'friend', uid: 'bob' })).toEqual(['abac'])
    expect(pick({ kind: 'friend', uid: 'carol' })).toEqual([]) // a wish isn't a visit
  })
  it('nobody in the group (me included) has been', () => expect(pick({ kind: 'nobody' })).toEqual(['noma', 'other']))
})

describe('applyFilters with the friend filter', () => {
  const r = (id: string) => ({
    id, path: `x/y/restaurant/${id}`, name: id, address: '', city: 'C', country: 'K', lat: 0, lng: 0,
    award: '1' as const, green: false, price: 2, currency: '$', cuisine: 'X', website: null, phone: null, inGuide: true,
  })
  const activity = activityByRestaurant(new Map([['bob', lists([v('a', '2025-01-01')])]]))
  const rs = [r('a'), r('b')]

  it('narrows the map and counts as an active filter', () => {
    const f = { ...DEFAULT_FILTERS, friend: { kind: 'any' } as const }
    expect(applyFilters(rs, f, me(), activity).map((x) => x.id)).toEqual(['a'])
    expect(applyFilters(rs, { ...DEFAULT_FILTERS, friend: { kind: 'nobody' } }, me(), activity).map((x) => x.id)).toEqual(['b'])
    expect(activeFilterCount(f)).toBe(1)
    expect(applyFilters(rs, DEFAULT_FILTERS, me(), activity).map((x) => x.id)).toEqual(['a', 'b'])
  })
})
