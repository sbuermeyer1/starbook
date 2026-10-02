// Pinned goals: users/{uid}/goals, private to the owner. Every write must satisfy
// firestore.rules; tests/rules/goals.test.ts runs these functions against the emulator.
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import type { Firestore, Unsubscribe } from 'firebase/firestore'
import { goalId } from './model'
import type { Goal } from './model'

const goalsCol = (db: Firestore, uid: string) => collection(db, 'users', uid, 'goals')

export const addGoal = (db: Firestore, uid: string, g: Goal) =>
  setDoc(doc(goalsCol(db, uid), goalId(g)), { scope: g.scope, key: g.key, award: g.award, createdAt: serverTimestamp() })

export const removeGoal = (db: Firestore, uid: string, g: Goal) => deleteDoc(doc(goalsCol(db, uid), goalId(g)))

// Oldest pinned first.
export function subscribeGoals(db: Firestore, uid: string, onChange: (goals: Goal[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    goalsCol(db, uid),
    (snap) =>
      onChange(
        snap.docs
          .map((d) => ({ g: { scope: d.get('scope'), key: d.get('key'), award: d.get('award') } as Goal, t: d.get('createdAt', { serverTimestamps: 'estimate' })?.toMillis?.() ?? 0 }))
          .sort((a, b) => a.t - b.t)
          .map((x) => x.g),
      ),
    onError,
  )
}
