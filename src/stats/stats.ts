// Personal statistics, computed from a user's visits and the restaurant data. The same
// summary feeds the leaderboards, so friends are scored exactly like you are.
import { AWARD_RANK } from '../data/restaurants'
import type { Award, Restaurant } from '../data/restaurants'
import type { Tracked, Visit } from '../tracking/model'

export const STAR_POINTS: Record<Award, number> = { '3': 3, '2': 2, '1': 1, bib: 0, selected: 0 }

export interface Summary {
  stars: number // sum of star points, each restaurant counted once
  restaurants: number // distinct restaurants visited
  visits: number
  byAward: Record<Award, number> // distinct restaurants per recorded award
  green: number // distinct restaurants with a Green Star when logged
  countries: number
  cities: number
}

// Each restaurant counts once, at the best award recorded on any of its visits
// (the guide as it was when you logged them, not as it is today).
export function bestRecorded(visits: Visit[]): { award: Award; green: boolean } {
  let award = visits[0].award
  for (const v of visits) if (AWARD_RANK[v.award] < AWARD_RANK[award]) award = v.award
  return { award, green: visits.some((v) => v.green) }
}

const emptyByAward = (): Record<Award, number> => ({ '3': 0, '2': 0, '1': 0, bib: 0, selected: 0 })

export function summarize(visitsByRestaurant: Map<string, Visit[]>, byId: Map<string, Restaurant>): Summary {
  const byAward = emptyByAward()
  const countries = new Set<string>()
  const cities = new Set<string>()
  let stars = 0
  let green = 0
  let visits = 0
  for (const [rid, vs] of visitsByRestaurant) {
    if (!vs.length) continue
    visits += vs.length
    const best = bestRecorded(vs)
    byAward[best.award]++
    stars += STAR_POINTS[best.award]
    if (best.green) green++
    const r = byId.get(rid)
    if (r) {
      countries.add(r.country)
      cities.add(cityKey(r))
    }
  }
  return { stars, restaurants: [...visitsByRestaurant.values()].filter((v) => v.length).length, visits, byAward, green, countries: countries.size, cities: cities.size }
}

// Same grouping as city search: region/city from the guide path, so two Portlands differ.
export const cityKey = (r: Pick<Restaurant, 'path'>) => r.path.split('/').slice(0, 2).join('/')

export interface Place {
  key: string
  label: string
  restaurants: number
}

export function places(visitsByRestaurant: Map<string, Visit[]>, byId: Map<string, Restaurant>) {
  const countries = new Map<string, Place>()
  const cities = new Map<string, Place>()
  for (const [rid, vs] of visitsByRestaurant) {
    const r = byId.get(rid)
    if (!r || !vs.length) continue
    const c = countries.get(r.country) ?? { key: r.country, label: r.country, restaurants: 0 }
    c.restaurants++
    countries.set(r.country, c)
    const k = cityKey(r)
    const ci = cities.get(k) ?? { key: k, label: `${r.city}, ${r.country}`, restaurants: 0 }
    ci.restaurants++
    cities.set(k, ci)
  }
  const sort = (m: Map<string, Place>) => [...m.values()].sort((a, b) => b.restaurants - a.restaurants || a.label.localeCompare(b.label))
  return { countries: sort(countries), cities: sort(cities) }
}

// Visits per year, oldest first; undated visits are reported separately.
export function visitsByYear(visitsByRestaurant: Map<string, Visit[]>): { years: [number, number][]; undated: number } {
  const counts = new Map<number, number>()
  let undated = 0
  for (const vs of visitsByRestaurant.values()) {
    for (const v of vs) {
      if (!v.date) undated++
      else {
        const y = Number(v.date.slice(0, 4))
        counts.set(y, (counts.get(y) ?? 0) + 1)
      }
    }
  }
  return { years: [...counts].sort((a, b) => a[0] - b[0]), undated }
}

export interface Rated {
  restaurant: Restaurant
  rating: number
}

// Your highest-rated restaurants (best rating across visits), ties broken by recorded award.
export function topRated(visitsByRestaurant: Map<string, Visit[]>, byId: Map<string, Restaurant>, limit = 5): Rated[] {
  const out: (Rated & { award: Award })[] = []
  for (const [rid, vs] of visitsByRestaurant) {
    const r = byId.get(rid)
    const ratings = vs.map((v) => v.rating).filter((x): x is number => x !== null)
    if (!r || !ratings.length) continue
    out.push({ restaurant: r, rating: Math.max(...ratings), award: bestRecorded(vs).award })
  }
  out.sort((a, b) => b.rating - a.rating || AWARD_RANK[a.award] - AWARD_RANK[b.award] || a.restaurant.name.localeCompare(b.restaurant.name))
  return out.slice(0, limit).map(({ restaurant, rating }) => ({ restaurant, rating }))
}

export const favorites = (t: Tracked, byId: Map<string, Restaurant>): Restaurant[] =>
  [...t.entries]
    .filter(([, e]) => e.favorite)
    .map(([rid]) => byId.get(rid))
    .filter((r): r is Restaurant => r !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name))
