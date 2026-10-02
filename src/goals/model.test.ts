import { describe, expect, it } from 'vitest'
import { fraction, goalId, goalLabel, matchesAward, progress, suggestions } from './model'
import { groupVisits } from '../tracking/model'
import type { Tracked, Visit } from '../tracking/model'
import type { Award, Restaurant } from '../data/restaurants'

const r = (id: string, award: Award, path: string, country: string, over: Partial<Restaurant> = {}): Restaurant => ({
  id, path: `${path}/restaurant/${id}`, name: id, address: '', city: path.split('/')[1].replace(/^./, (c) => c.toUpperCase()), country, lat: 0, lng: 0,
  award, green: false, price: 2, currency: '€', cuisine: 'X', website: null, phone: null, inGuide: true, ...over,
})
const all = [
  r('p3a', '3', 'idf/paris', 'France'),
  r('p3b', '3', 'idf/paris', 'France'),
  r('p2', '2', 'idf/paris', 'France', { green: true }),
  r('pbib', 'bib', 'idf/paris', 'France'),
  r('pbib2', 'bib', 'idf/paris', 'France'),
  r('pgone', '3', 'idf/paris', 'France', { inGuide: false }),
  r('l3', '3', 'ara/lyon', 'France'),
  r('t3', '3', 'kanto/tokyo', 'Japan'),
  r('t1', '1', 'kanto/tokyo', 'Japan', { green: true }),
]
const byId = new Map(all.map((x) => [x.id, x]))
const visit = (rid: string): Visit => ({ id: rid, restaurantId: rid, date: '2025-01-01', rating: null, notes: '', award: '3', green: false, createdAt: 1 })
const me = (...ids: string[]): Tracked => ({ entries: new Map(), visits: groupVisits(ids.map(visit)) })

describe('matchesAward', () => {
  it.each([
    ['3', 'p3a', true], ['3', 'p2', false],
    ['starred', 'p2', true], ['starred', 'pbib', false],
    ['green', 'p2', true], ['green', 'p3a', false],
    ['all', 'pbib', true], ['bib', 'pbib', true],
  ] as const)('%s / %s -> %s', (award, id, expected) => {
    expect(matchesAward(byId.get(id)!, award)).toBe(expected)
  })
})

describe('progress', () => {
  it('counts in-guide targets in scope, done = visited, remaining best-first', () => {
    const p = progress({ scope: 'country', key: 'France', award: '3' }, all, me('p3a'))
    expect(p.target.map((x) => x.id).sort()).toEqual(['l3', 'p3a', 'p3b']) // pgone left the guide
    expect(p.done.map((x) => x.id)).toEqual(['p3a'])
    expect(p.remaining.map((x) => x.id)).toEqual(['l3', 'p3b'])
    expect(fraction(p)).toBeCloseTo(1 / 3)
  })

  it('scopes a city by its guide path', () => {
    const p = progress({ scope: 'city', key: 'idf/paris', award: 'starred' }, all, me())
    expect(p.target.map((x) => x.id).sort()).toEqual(['p2', 'p3a', 'p3b'])
    expect(p.remaining.map((x) => x.id)).toEqual(['p3a', 'p3b', 'p2'])
  })

  it('an empty target has fraction 0', () => {
    expect(fraction(progress({ scope: 'country', key: 'Nowhere', award: '3' }, all, me()))).toBe(0)
  })
})

describe('suggestions', () => {
  it('suggests distinctions with at least two restaurants where you have been, closest first, finished last', () => {
    const s = suggestions(all, me('p3a', 'p3b', 't3'), byId)
    const labels = s.map((p) => `${goalLabel(p.goal, all)} ${p.done.length}/${p.target.length}`)
    expect(labels).toEqual([
      'Three Stars in France 2/3',
      'Three Stars in Paris, France 2/2',
    ])
  })

  it('needs a visit somewhere first', () => {
    expect(suggestions(all, me(), byId)).toEqual([])
  })

  it('skips distinctions with fewer than two restaurants in the place', () => {
    // Tokyo/Japan each have a single 1★ and a single Green Star restaurant
    expect(suggestions(all, me('t1'), byId)).toEqual([])
  })

  it("only suggests goals you've started", () => {
    // Paris has two Bibs, but none visited, so no Bib goal is suggested
    const s = suggestions(all, me('p3a'), byId)
    expect(s.some((p) => p.goal.award === 'bib')).toBe(false)
    expect(s.map((p) => goalLabel(p.goal, all))).toEqual(['Three Stars in Paris, France', 'Three Stars in France'])
  })
})

describe('goalId', () => {
  it('is deterministic and slash-free', () => {
    expect(goalId({ scope: 'city', key: 'idf/paris', award: 'bib' })).toBe('city:bib:idf|paris')
    expect(goalId({ scope: 'country', key: 'United Kingdom', award: '3' })).toBe('country:3:United Kingdom')
  })
})
