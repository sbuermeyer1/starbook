import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { loadDb } from '../firebase/lazy'
import { useAuth } from '../auth/useAuth'
import { EMPTY_TRACKED, groupVisits } from './model'
import type { Entry, Tracked, Visit } from './model'
import { TrackingContext } from './useTracking'
import { track } from '../analytics/analytics'
import type { TrackingState } from './useTracking'

export function TrackingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const [entries, setEntries] = useState<Map<string, Entry>>(new Map())
  const [visitList, setVisitList] = useState<Visit[]>([])
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!uid) return
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    const fail = (e: unknown) => {
      console.error(e)
      setError("Couldn't load your list. Check your connection.")
    }
    loadDb().then(({ db, tracking }) => {
      if (cancelled) return
      unsubscribe = tracking.subscribe(
        db,
        uid,
        (e) => {
          setEntries(e)
          setLoadedFor(uid)
        },
        setVisitList,
        fail,
      )
    }, fail)
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [uid])

  // Signed out, or still showing the previous account's data: show nothing.
  const current = uid !== null && loadedFor === uid
  const tracked: Tracked = useMemo(
    () => (current ? { entries, visits: groupVisits(visitList) } : EMPTY_TRACKED),
    [current, entries, visitList],
  )

  const value: TrackingState = useMemo(() => {
    // Firestore applies writes to the local cache at once and only resolves when the server
    // confirms, which never happens offline. So don't wait: the UI updates from the cache,
    // and a rejected write (e.g. by the rules) surfaces as an error banner.
    type Db = Awaited<ReturnType<typeof loadDb>>
    const guard = async (fn: (m: Db, uid: string) => Promise<unknown>) => {
      if (!uid) throw new Error('Sign in first')
      setError(null)
      loadDb().then((m) => fn(m, uid)).catch((e) => {
        console.error(e)
        setError("Couldn't save that change. Please try again.")
      })
    }
    return {
      signedIn: uid !== null,
      ready: current,
      tracked,
      error,
      clearError: () => setError(null),
      setEntry: (rid, next) => {
        const prev = tracked.entries.get(rid)
        if (next.want !== (prev?.want ?? false)) track('want_to_go', { on: next.want })
        if (next.favorite !== (prev?.favorite ?? false)) track('favorite', { on: next.favorite })
        return guard(({ db, tracking }, u) => tracking.setEntry(db, u, rid, next))
      },
      addVisit: (r, input) => {
        track('log_visit', {
          award: r.award,
          rated: input.rating !== null,
          has_notes: input.notes.length > 0,
          dated: input.date !== null,
          first_visit: !(tracked.visits.get(r.id)?.length),
        })
        return guard(({ db, tracking }, u) => tracking.addVisit(db, u, r, input, tracked.entries.get(r.id)))
      },
      updateVisit: (id, input) => guard(({ db, tracking }, u) => tracking.updateVisit(db, u, id, input)),
      deleteVisit: (id) => guard(({ db, tracking }, u) => tracking.deleteVisit(db, u, id)),
    }
  }, [uid, current, tracked, error])

  return <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>
}
