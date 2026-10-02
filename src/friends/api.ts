// Firestore reads/writes for usernames and friends. Every write must satisfy
// firestore.rules; tests/rules/friends.test.ts runs these exact functions against the emulator.
import { collection, deleteDoc, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore'
import type { Firestore, Unsubscribe } from 'firebase/firestore'
import { normalizeHandle, pairId } from './model'
import type { FriendRequest, Profile } from './model'

const profileRef = (db: Firestore, uid: string) => doc(db, 'users', uid)
const handleRef = (db: Firestore, handle: string) => doc(db, 'usernames', handle)
const requestRef = (db: Firestore, from: string, to: string) => doc(db, 'friendRequests', `${from}_${to}`)
const friendshipRef = (db: Firestore, a: string, b: string) => doc(db, 'friendships', pairId(a, b))

export class UsernameTakenError extends Error {
  constructor(handle: string) {
    super(`@${handle} is taken`)
  }
}

// Claims (or changes) a username in one batch: the profile field, the new handle, and the
// release of the old one. A taken handle makes the batch fail the rules, and is reported
// as UsernameTakenError.
export async function claimUsername(db: Firestore, uid: string, wanted: string, current: string | null) {
  const handle = normalizeHandle(wanted)
  if (handle === current) return
  const existing = await getDoc(handleRef(db, handle))
  if (existing.exists() && existing.get('uid') !== uid) throw new UsernameTakenError(handle)
  const batch = writeBatch(db)
  batch.set(handleRef(db, handle), { uid })
  batch.update(profileRef(db, uid), { username: handle, updatedAt: serverTimestamp() })
  if (current) batch.delete(handleRef(db, current))
  try {
    await batch.commit()
  } catch (e) {
    // Lost a race for the handle between the check and the write.
    if ((e as { code?: string }).code === 'permission-denied') {
      const now = await getDoc(handleRef(db, handle))
      if (now.exists() && now.get('uid') !== uid) throw new UsernameTakenError(handle)
    }
    throw e
  }
}

export async function getProfile(db: Firestore, uid: string): Promise<Profile | null> {
  const snap = await getDoc(profileRef(db, uid))
  if (!snap.exists()) return null
  return { uid, displayName: snap.get('displayName') ?? '', photoURL: snap.get('photoURL') ?? null, username: snap.get('username') ?? null }
}

export async function lookupUsername(db: Firestore, wanted: string): Promise<Profile | null> {
  const handle = normalizeHandle(wanted)
  const snap = await getDoc(handleRef(db, handle))
  if (!snap.exists()) return null
  return getProfile(db, snap.get('uid'))
}

// If the other person already asked, accept their request instead of crossing requests.
export async function sendRequest(db: Firestore, me: string, other: string, incomingFromThem: boolean) {
  if (incomingFromThem) return acceptRequest(db, me, other, false)
  await setDoc(requestRef(db, me, other), { from: me, to: other, createdAt: serverTimestamp() })
}

export const cancelRequest = (db: Firestore, me: string, other: string) => deleteDoc(requestRef(db, me, other))

export const declineRequest = (db: Firestore, me: string, other: string) => deleteDoc(requestRef(db, other, me))

// Creates the friendship and clears the request (and my own crossing request, if any).
export async function acceptRequest(db: Firestore, me: string, other: string, outgoingToThem: boolean) {
  const [a, b] = me < other ? [me, other] : [other, me]
  const batch = writeBatch(db)
  batch.set(friendshipRef(db, me, other), { members: [a, b], createdAt: serverTimestamp() })
  batch.delete(requestRef(db, other, me))
  if (outgoingToThem) batch.delete(requestRef(db, me, other))
  await batch.commit()
}

export const removeFriend = (db: Firestore, me: string, other: string) => deleteDoc(friendshipRef(db, me, other))

export interface FriendsSnapshot {
  friends: string[] // uids
  incoming: FriendRequest[]
  outgoing: FriendRequest[]
}

export function subscribeFriends(db: Firestore, me: string, onChange: (s: FriendsSnapshot) => void, onError: (e: Error) => void): Unsubscribe {
  const state: Partial<FriendsSnapshot> = {}
  const emit = () => {
    if (state.friends && state.incoming && state.outgoing) onChange({ ...(state as FriendsSnapshot) })
  }
  const toRequest = (d: { get: (f: string) => unknown }): FriendRequest => ({ from: d.get('from') as string, to: d.get('to') as string })
  const offs = [
    onSnapshot(
      query(collection(db, 'friendships'), where('members', 'array-contains', me)),
      (snap) => {
        state.friends = snap.docs.map((d) => (d.get('members') as string[]).find((m) => m !== me)!).filter(Boolean)
        emit()
      },
      onError,
    ),
    onSnapshot(
      query(collection(db, 'friendRequests'), where('to', '==', me)),
      (snap) => {
        state.incoming = snap.docs.map(toRequest)
        emit()
      },
      onError,
    ),
    onSnapshot(
      query(collection(db, 'friendRequests'), where('from', '==', me)),
      (snap) => {
        state.outgoing = snap.docs.map(toRequest)
        emit()
      },
      onError,
    ),
  ]
  return () => offs.forEach((off) => off())
}
