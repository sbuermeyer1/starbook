// What friends have done at each restaurant, derived from their entries and visits.
import { compareVisits, groupVisits } from '../tracking/model'
import type { Entry, Tracked, Visit } from '../tracking/model'

export interface FriendLists {
  entries: Map<string, Entry>
  visits: Visit[]
}

export interface FriendActivity {
  uid: string
  visits: Visit[] // newest first
  favorite: boolean
  want: boolean
}

// restaurantId -> friends with any activity there. Friends who've visited come first
// (most recent visit first), then wishlist-only friends.
export function activityByRestaurant(lists: Map<string, FriendLists>): Map<string, FriendActivity[]> {
  const out = new Map<string, FriendActivity[]>()
  const get = (rid: string, uid: string) => {
    let list = out.get(rid)
    if (!list) out.set(rid, (list = []))
    let a = list.find((x) => x.uid === uid)
    if (!a) list.push((a = { uid, visits: [], favorite: false, want: false }))
    return a
  }
  for (const [uid, l] of lists) {
    for (const [rid, vs] of groupVisits(l.visits)) get(rid, uid).visits = vs
    for (const [rid, e] of l.entries) {
      if (!e.want && !e.favorite) continue
      const a = get(rid, uid)
      a.favorite = e.favorite
      a.want = e.want
    }
  }
  for (const list of out.values()) {
    list.sort((a, b) => {
      if (a.visits.length && b.visits.length) return compareVisits(a.visits[0], b.visits[0])
      return Number(b.visits.length > 0) - Number(a.visits.length > 0)
    })
  }
  return out
}

export const friendsWhoVisited = (activity: Map<string, FriendActivity[]>, rid: string): string[] =>
  (activity.get(rid) ?? []).filter((a) => a.visits.length > 0).map((a) => a.uid)

export type FriendFilter = { kind: 'any' } | { kind: 'friend'; uid: string } | { kind: 'nobody' } | null

export function matchesFriendFilter(f: FriendFilter, rid: string, activity: Map<string, FriendActivity[]>, me: Tracked): boolean {
  if (!f) return true
  const visitors = friendsWhoVisited(activity, rid)
  if (f.kind === 'any') return visitors.length > 0
  if (f.kind === 'friend') return visitors.includes(f.uid)
  // Nobody in the group: neither me nor any friend.
  return visitors.length === 0 && (me.visits.get(rid)?.length ?? 0) === 0
}
