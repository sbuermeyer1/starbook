// The public leaderboard: one opt-in document per user. Every write must satisfy
// firestore.rules; tests/rules/leaderboard.test.ts runs these functions against the emulator.
import { collection, deleteDoc, doc, getCountFromServer, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import type { DocumentData, Firestore, Unsubscribe } from 'firebase/firestore'
import type { BoardEntry, BoardFields } from './model'

const entryRef = (db: Firestore, uid: string) => doc(db, 'leaderboard', uid)

const toEntry = (uid: string, d: DocumentData): BoardEntry => ({
  uid,
  displayName: d.displayName ?? '',
  username: d.username ?? null,
  photoURL: d.photoURL ?? null,
  stars: d.stars ?? 0,
  three: d.three ?? 0,
  two: d.two ?? 0,
  one: d.one ?? 0,
  bib: d.bib ?? 0,
  green: d.green ?? 0,
  countries: d.countries ?? 0,
  restaurants: d.restaurants ?? 0,
})

export const saveEntry = (db: Firestore, uid: string, f: BoardFields) => setDoc(entryRef(db, uid), { ...f, updatedAt: serverTimestamp() })

export const removeEntry = (db: Firestore, uid: string) => deleteDoc(entryRef(db, uid))

export function subscribeOwn(db: Firestore, uid: string, onChange: (e: BoardEntry | null) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(entryRef(db, uid), (s) => onChange(s.exists() ? toEntry(uid, s.data()) : null), onError)
}

export async function fetchTop(db: Firestore, n = 50): Promise<BoardEntry[]> {
  const snap = await getDocs(query(collection(db, 'leaderboard'), orderBy('stars', 'desc'), limit(n)))
  return snap.docs.map((d) => toEntry(d.id, d.data()))
}

// Your position: one more than the number of people with more stars.
export async function rankOf(db: Firestore, stars: number): Promise<number> {
  const snap = await getCountFromServer(query(collection(db, 'leaderboard'), where('stars', '>', stars)))
  return snap.data().count + 1
}
