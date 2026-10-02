import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadDb } from '../firebase/lazy'
import { useAuth } from '../auth/useAuth'
import { useTracking } from '../tracking/useTracking'
import { useFriends } from '../friends/useFriends'
import { summarize } from '../stats/stats'
import type { Restaurant } from '../data/restaurants'
import { boardChanged, boardFields } from './model'
import type { BoardEntry } from './model'

export interface LeaderboardState {
  available: boolean // signed in, and everything needed to compute your totals has loaded
  joined: boolean
  own: BoardEntry | null
  join: () => Promise<void>
  leave: () => Promise<void>
  fetchTop: () => Promise<BoardEntry[]>
  rankOf: (stars: number) => Promise<number>
}

// Owns the public leaderboard entry: while you're opted in, it rewrites the entry whenever
// your totals or profile change. Never writes before your visits, profile and the
// restaurant data have all loaded, so a half-loaded page can't post zeros.
export function useLeaderboard(byId: Map<string, Restaurant>): LeaderboardState {
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const tracking = useTracking()
  const { me } = useFriends()
  const [own, setOwn] = useState<BoardEntry | null>(null)
  const [ownLoadedFor, setOwnLoadedFor] = useState<string | null>(null)

  useEffect(() => {
    if (!uid) return
    let off: (() => void) | undefined
    let cancelled = false
    loadDb().then(({ db, leaderboard }) => {
      if (cancelled) return
      off = leaderboard.subscribeOwn(
        db,
        uid,
        (e) => {
          setOwn(e)
          setOwnLoadedFor(uid)
        },
        (e) => console.error('leaderboard entry unavailable', e),
      )
    })
    return () => {
      cancelled = true
      off?.()
    }
  }, [uid])

  const available = uid !== null && tracking.ready && me !== null && byId.size > 0 && ownLoadedFor === uid
  const next = useMemo(() => (available && me ? boardFields(me, summarize(tracking.tracked.visits, byId)) : null), [available, me, tracking.tracked, byId])
  const joined = available && own !== null

  useEffect(() => {
    if (!joined || !next || !uid || !boardChanged(own, next)) return
    loadDb()
      .then(({ db, leaderboard }) => leaderboard.saveEntry(db, uid, next))
      .catch((e) => console.error('leaderboard update failed', e))
  }, [joined, next, own, uid])

  const join = useCallback(async () => {
    if (!uid || !next) return
    const { db, leaderboard } = await loadDb()
    await leaderboard.saveEntry(db, uid, next)
  }, [uid, next])

  const leave = useCallback(async () => {
    if (!uid) return
    const { db, leaderboard } = await loadDb()
    await leaderboard.removeEntry(db, uid)
  }, [uid])

  const fetchTop = useCallback(async () => {
    const { db, leaderboard } = await loadDb()
    return leaderboard.fetchTop(db)
  }, [])

  const rankOf = useCallback(async (stars: number) => {
    const { db, leaderboard } = await loadDb()
    return leaderboard.rankOf(db, stars)
  }, [])

  return { available, joined, own: available ? own : null, join, leave, fetchTop, rankOf }
}
