// Progress goals: "every <distinction> in <country or city>". Targets come from the
// current guide (in-guide restaurants only); a target counts as done once you've visited it.
import { AWARD_RANK } from '../data/restaurants'
import type { Restaurant } from '../data/restaurants'
import type { Tracked } from '../tracking/model'
import { cityKey } from '../stats/stats'

export type GoalScope = 'country' | 'city'
export type GoalAward = '3' | '2' | '1' | 'starred' | 'bib' | 'green' | 'all'

export interface Goal {
  scope: GoalScope
  key: string // country name, or "region/city" from the guide path
  award: GoalAward
}

export const GOAL_AWARDS: GoalAward[] = ['3', '2', '1', 'starred', 'bib', 'green', 'all']

export const GOAL_AWARD_LABEL: Record<GoalAward, string> = {
  '3': 'Three Stars',
  '2': 'Two Stars',
  '1': 'One Star',
  starred: 'Starred',
  bib: 'Bib Gourmand',
  green: 'Green Star',
  all: 'Guide restaurants',
}

export const MAX_GOALS = 20

// Deterministic, so the same goal can't be saved twice. Firestore IDs can't contain "/".
// Mirrored in firestore.rules.
export const goalId = (g: Goal) => `${g.scope}:${g.award}:${g.key.replace(/\//g, '|')}`

export function matchesAward(r: Restaurant, a: GoalAward): boolean {
  if (a === 'all') return true
  if (a === 'green') return r.green
  if (a === 'starred') return r.award === '3' || r.award === '2' || r.award === '1'
  return r.award === a
}

export const inScope = (r: Restaurant, g: Pick<Goal, 'scope' | 'key'>) => (g.scope === 'country' ? r.country === g.key : cityKey(r) === g.key)

export interface Progress {
  goal: Goal
  target: Restaurant[]
  done: Restaurant[]
  remaining: Restaurant[] // best award first, then name
}

const byAwardThenName = (a: Restaurant, b: Restaurant) => AWARD_RANK[a.award] - AWARD_RANK[b.award] || a.name.localeCompare(b.name)

export function progress(goal: Goal, all: Restaurant[], t: Tracked): Progress {
  const target = all.filter((r) => r.inGuide && inScope(r, goal) && matchesAward(r, goal.award))
  const visited = (r: Restaurant) => (t.visits.get(r.id)?.length ?? 0) > 0
  return {
    goal,
    target,
    done: target.filter(visited),
    remaining: target.filter((r) => !visited(r)).sort(byAwardThenName),
  }
}

export const fraction = (p: Pick<Progress, 'target' | 'done'>) => (p.target.length ? p.done.length / p.target.length : 0)

// Goals for the places you've eaten: every distinction with at least two restaurants
// there. Unfinished goals first, closest to done first; finished ones last.
const SUGGESTED_AWARDS: GoalAward[] = ['3', '2', '1', 'bib', 'green']

export function suggestions(all: Restaurant[], t: Tracked, byId: Map<string, Restaurant>): Progress[] {
  const places = new Map<string, Pick<Goal, 'scope' | 'key'>>()
  for (const [rid, vs] of t.visits) {
    const r = byId.get(rid)
    if (!r || !vs.length) continue
    places.set(`country:${r.country}`, { scope: 'country', key: r.country })
    places.set(`city:${cityKey(r)}`, { scope: 'city', key: cityKey(r) })
  }
  const out: Progress[] = []
  for (const place of places.values()) {
    for (const award of SUGGESTED_AWARDS) {
      const p = progress({ ...place, award }, all, t)
      if (p.target.length >= 2 && p.done.length > 0) out.push(p)
    }
  }
  return out.sort((a, b) => {
    const fa = fraction(a)
    const fb = fraction(b)
    const finishedA = fa === 1 ? 1 : 0
    const finishedB = fb === 1 ? 1 : 0
    return finishedA - finishedB || fb - fa || a.remaining.length - b.remaining.length || placeLabelSort(a.goal, b.goal)
  })
}

const placeLabelSort = (a: Goal, b: Goal) => a.key.localeCompare(b.key) || GOAL_AWARDS.indexOf(a.award) - GOAL_AWARDS.indexOf(b.award)

export function placeLabel(g: Pick<Goal, 'scope' | 'key'>, all: Restaurant[]): string {
  if (g.scope === 'country') return g.key
  const r = all.find((x) => cityKey(x) === g.key)
  return r ? `${r.city}, ${r.country}` : g.key
}

export const goalLabel = (g: Goal, all: Restaurant[]) => `${GOAL_AWARD_LABEL[g.award]} in ${placeLabel(g, all)}`
