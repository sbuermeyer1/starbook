import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { loadDb } from '../firebase/lazy'
import { goalId, MAX_GOALS } from './model'
import type { Goal } from './model'

export interface GoalsState {
  ready: boolean
  pinned: Goal[]
  isPinned: (g: Goal) => boolean
  pin: (g: Goal) => Promise<void>
  unpin: (g: Goal) => Promise<void>
  error: string | null
}

export function useGoals(): GoalsState {
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const [pinned, setPinned] = useState<Goal[]>([])
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!uid) return
    let off: (() => void) | undefined
    let cancelled = false
    loadDb().then(({ db, goals }) => {
      if (cancelled) return
      off = goals.subscribeGoals(
        db,
        uid,
        (g) => {
          setPinned(g)
          setLoadedFor(uid)
        },
        (e) => {
          console.error(e)
          setError("Couldn't load your goals.")
        },
      )
    })
    return () => {
      cancelled = true
      off?.()
    }
  }, [uid])

  const ready = uid !== null && loadedFor === uid
  const ids = new Set(ready ? pinned.map(goalId) : [])

  const pin = useCallback(
    async (g: Goal) => {
      if (!uid) return
      if (pinned.length >= MAX_GOALS) {
        setError(`You can pin up to ${MAX_GOALS} goals. Unpin one first.`)
        return
      }
      setError(null)
      const { db, goals } = await loadDb()
      // Like tracking writes, don't wait for the server: the cache updates the list at once.
      goals.addGoal(db, uid, g).catch((e) => {
        console.error(e)
        setError("Couldn't pin that goal.")
      })
    },
    [uid, pinned.length],
  )

  const unpin = useCallback(
    async (g: Goal) => {
      if (!uid) return
      setError(null)
      const { db, goals } = await loadDb()
      goals.removeGoal(db, uid, g).catch((e) => {
        console.error(e)
        setError("Couldn't unpin that goal.")
      })
    },
    [uid],
  )

  return { ready, pinned: ready ? pinned : [], isPinned: (g) => ids.has(goalId(g)), pin, unpin, error }
}
