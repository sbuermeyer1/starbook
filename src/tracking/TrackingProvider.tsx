import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { db } from '../firebase'
import { useAuth } from '../auth/useAuth'
import * as api from './api'
import { EMPTY_TRACKED, groupVisits } from './model'
import type { Entry, Tracked, Visit } from './model'
import { TrackingContext } from './useTracking'
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
    return api.subscribe(
      db,
      uid,
      (e) => {
        setEntries(e)
        setLoadedFor(uid)
      },
      setVisitList,
      (e) => {
        console.error(e)
        setError("Couldn't load your list. Check your connection.")
      },
    )
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
    const guard = async (fn: (uid: string) => Promise<unknown>) => {
      if (!uid) throw new Error('Sign in first')
      setError(null)
      fn(uid).catch((e) => {
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
      setEntry: (rid, next) => guard((u) => api.setEntry(db, u, rid, next)),
      addVisit: (r, input) => guard((u) => api.addVisit(db, u, r, input, tracked.entries.get(r.id))),
      updateVisit: (id, input) => guard((u) => api.updateVisit(db, u, id, input)),
      deleteVisit: (id) => guard((u) => api.deleteVisit(db, u, id)),
    }
  }, [uid, current, tracked, error])

  return <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>
}
