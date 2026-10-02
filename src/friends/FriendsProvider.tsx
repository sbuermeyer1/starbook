import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'
import { loadDb } from '../firebase/lazy'
import type { Profile } from './model'
import type { FriendsSnapshot } from './api'
import { activityByRestaurant } from './activity'
import type { FriendLists } from './activity'
import { FriendsContext } from './useFriends'
import type { FriendsState, Relation } from './useFriends'

const byName = (a: Profile, b: Profile) => (a.displayName || a.username || '').localeCompare(b.displayName || b.username || '')

export function FriendsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const [me, setMe] = useState<Profile | null>(null)
  const [snap, setSnap] = useState<FriendsSnapshot | null>(null)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const requested = useRef(new Set<string>())
  const [lists, setLists] = useState<Map<string, FriendLists>>(new Map())
  const listSubs = useRef(new Map<string, () => void>())

  useEffect(() => {
    if (!uid) return
    let offs: (() => void)[] = []
    let cancelled = false
    const fail = (e: unknown) => {
      console.error(e)
      setError("Couldn't load your friends. Check your connection.")
    }
    loadDb().then(({ db, friends }) => {
      if (cancelled) return
      offs = [
        friends.subscribeProfile(db, uid, setMe, fail),
        friends.subscribeFriends(
          db,
          uid,
          (s) => {
            setSnap(s)
            setLoadedFor(uid)
          },
          fail,
        ),
      ]
    }, fail)
    return () => {
      cancelled = true
      offs.forEach((off) => off())
      requested.current = new Set()
    }
  }, [uid])

  const current = uid !== null && loadedFor === uid
  const friendKey = current && snap ? [...snap.friends].sort().join(',') : ''

  // One live subscription per friend's entries + visits, opened and closed as friends change.
  useEffect(() => {
    const wanted = new Set(friendKey ? friendKey.split(',') : [])
    const subs = listSubs.current
    for (const [f, off] of subs) {
      if (wanted.has(f)) continue
      off()
      subs.delete(f)
      setLists((prev) => {
        const next = new Map(prev)
        next.delete(f)
        return next
      })
    }
    const toOpen = [...wanted].filter((f) => !subs.has(f))
    if (!toOpen.length) return
    let cancelled = false
    loadDb().then(({ db, tracking }) => {
      if (cancelled) return
      for (const f of toOpen) {
        const update = (patch: Partial<FriendLists>) =>
          setLists((prev) => {
            const next = new Map(prev)
            next.set(f, { entries: new Map(), visits: [], ...prev.get(f), ...patch })
            return next
          })
        subs.set(
          f,
          tracking.subscribe(
            db,
            f,
            (entries) => update({ entries }),
            (visits) => update({ visits }),
            // e.g. the friendship was just removed and access ended: drop quietly.
            (e) => console.warn('friend list unavailable', f, e),
          ),
        )
      }
    })
    return () => {
      cancelled = true
    }
  }, [friendKey])

  // Close everything on sign-out or account switch.
  useEffect(
    () => () => {
      for (const off of listSubs.current.values()) off()
      listSubs.current = new Map()
      setLists(new Map())
    },
    [uid],
  )

  const activity = useMemo(() => activityByRestaurant(lists), [lists])
  const others = useMemo(() => {
    if (!current || !snap) return []
    return [...snap.friends, ...snap.incoming.map((r) => r.from), ...snap.outgoing.map((r) => r.to)]
  }, [current, snap])

  // Fetch each counterpart's profile once (name, photo, handle).
  useEffect(() => {
    const missing = others.filter((o) => !requested.current.has(o))
    if (!missing.length) return
    missing.forEach((o) => requested.current.add(o))
    loadDb().then(({ db, friends }) =>
      Promise.all(missing.map((o) => friends.getProfile(db, o).then((p) => [o, p] as const))).then((pairs) =>
        setProfiles((prev) => {
          const next = new Map(prev)
          for (const [o, p] of pairs) next.set(o, p ?? { uid: o, displayName: 'Unknown', photoURL: null, username: null })
          return next
        }),
      ),
    )
  }, [others])

  const value: FriendsState = useMemo(() => {
    const profileOf = (id: string): Profile => profiles.get(id) ?? { uid: id, displayName: '…', photoURL: null, username: null }
    const s = current ? snap : null
    const friendIds = new Set(s?.friends ?? [])
    const incomingIds = new Set(s?.incoming.map((r) => r.from) ?? [])
    const outgoingIds = new Set(s?.outgoing.map((r) => r.to) ?? [])

    const relationTo = (other: string): Relation =>
      other === uid ? 'self' : friendIds.has(other) ? 'friend' : incomingIds.has(other) ? 'incoming' : outgoingIds.has(other) ? 'outgoing' : 'none'

    // Unlike tracking writes, these wait for the server: each one is a deliberate action
    // whose result (a taken handle, a rejected request) the user needs to see.
    const run = async <T,>(fn: (m: Awaited<ReturnType<typeof loadDb>>, me: string) => Promise<T>, message: string): Promise<T> => {
      if (!uid) throw new Error('Sign in first')
      setError(null)
      try {
        return await fn(await loadDb(), uid)
      } catch (e) {
        // A taken handle is an expected answer, shown by the form itself.
        if ((e as Error)?.name !== 'UsernameTakenError') {
          console.error(e)
          setError(message)
        }
        throw e
      }
    }

    return {
      ready: current,
      me: current ? me : null,
      friends: [...friendIds].map(profileOf).sort(byName),
      incoming: [...incomingIds].map(profileOf).sort(byName),
      outgoing: [...outgoingIds].map(profileOf).sort(byName),
      activity: current ? activity : new Map(),
      profileOf,
      error,
      clearError: () => setError(null),
      relationTo,
      claimUsername: (h) => run(({ db, friends }, u) => friends.claimUsername(db, u, h, me?.username ?? null), "Couldn't save that username."),
      lookup: (h) => run(({ db, friends }) => friends.lookupUsername(db, h), "Couldn't look that up. Check your connection."),
      send: (o) => run(({ db, friends }, u) => friends.sendRequest(db, u, o, incomingIds.has(o)), "Couldn't send the request."),
      cancel: (o) => run(({ db, friends }, u) => friends.cancelRequest(db, u, o), "Couldn't cancel the request."),
      accept: (o) => run(({ db, friends }, u) => friends.acceptRequest(db, u, o, outgoingIds.has(o)), "Couldn't accept the request."),
      decline: (o) => run(({ db, friends }, u) => friends.declineRequest(db, u, o), "Couldn't decline the request."),
      remove: (o) => run(({ db, friends }, u) => friends.removeFriend(db, u, o), "Couldn't remove that friend."),
    }
  }, [uid, current, snap, me, profiles, error, activity])

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>
}
