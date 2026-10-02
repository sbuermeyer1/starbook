// Firestore reads/writes for tracking. Every write must satisfy firestore.rules;
// tests/rules/tracking.test.ts runs these exact functions against the emulator.
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import type { Firestore, Unsubscribe } from 'firebase/firestore'
import type { Restaurant } from '../data/restaurants'
import type { Entry, Visit, VisitInput } from './model'

const entries = (db: Firestore, uid: string) => collection(db, 'users', uid, 'entries')
const visits = (db: Firestore, uid: string) => collection(db, 'users', uid, 'visits')

// An entry with both flags off is deleted rather than stored as all-false.
export async function setEntry(db: Firestore, uid: string, restaurantId: string, next: Entry) {
  const ref = doc(entries(db, uid), restaurantId)
  if (!next.want && !next.favorite) await deleteDoc(ref)
  else await setDoc(ref, { want: next.want, favorite: next.favorite, updatedAt: serverTimestamp() })
}

// Logging a first visit to a wishlist restaurant takes it off the wishlist, in the same batch.
export async function addVisit(
  db: Firestore,
  uid: string,
  r: Pick<Restaurant, 'id' | 'award' | 'green'>,
  input: VisitInput,
  current: Entry | undefined,
): Promise<string> {
  const ref = doc(visits(db, uid))
  const batch = writeBatch(db)
  batch.set(ref, {
    restaurantId: r.id,
    date: input.date,
    rating: input.rating,
    notes: input.notes,
    award: r.award,
    green: r.green,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  if (current?.want) {
    const entryRef = doc(entries(db, uid), r.id)
    if (current.favorite) batch.set(entryRef, { want: false, favorite: true, updatedAt: serverTimestamp() })
    else batch.delete(entryRef)
  }
  await batch.commit()
  return ref.id
}

export async function updateVisit(db: Firestore, uid: string, visitId: string, input: VisitInput) {
  await updateDoc(doc(visits(db, uid), visitId), {
    date: input.date,
    rating: input.rating,
    notes: input.notes,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteVisit(db: Firestore, uid: string, visitId: string) {
  await deleteDoc(doc(visits(db, uid), visitId))
}

export function subscribe(
  db: Firestore,
  uid: string,
  onEntries: (e: Map<string, Entry>) => void,
  onVisits: (v: Visit[]) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  const offEntries = onSnapshot(
    entries(db, uid),
    (snap) => onEntries(new Map(snap.docs.map((d) => [d.id, { want: d.get('want') === true, favorite: d.get('favorite') === true }]))),
    onError,
  )
  const offVisits = onSnapshot(
    visits(db, uid),
    (snap) =>
      onVisits(
        snap.docs.map((d) => {
          // Pending local writes have no server timestamp yet; estimate it.
          const data = d.data({ serverTimestamps: 'estimate' })
          return {
            id: d.id,
            restaurantId: data.restaurantId,
            date: data.date ?? null,
            rating: data.rating ?? null,
            notes: data.notes ?? '',
            award: data.award,
            green: data.green === true,
            createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
          }
        }),
      ),
    onError,
  )
  return () => {
    offEntries()
    offVisits()
  }
}
