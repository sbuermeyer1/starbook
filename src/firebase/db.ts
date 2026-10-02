// Firestore is the largest part of the Firebase SDK, so it loads only once someone signs in.
import { connectFirestoreEmulator, doc, getDoc, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { app, useEmulators } from './app'

// Cached on the device, so reopening the app doesn't re-read every visit, and edits work offline.
export const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
if (useEmulators) connectFirestoreEmulator(db, '127.0.0.1', 8085)

export * as tracking from '../tracking/api'
export * as friends from '../friends/api'
export * as leaderboard from '../leaderboard/api'
export * as goals from '../goals/api'

// Keeps users/{uid} in step with the Google account. createdAt is written once.
// Returns true when the profile was just created (a new account).
export async function syncProfile(user: User): Promise<boolean> {
  const ref = doc(db, 'users', user.uid)
  const fields = {
    displayName: (user.displayName ?? '').slice(0, 100),
    photoURL: user.photoURL && user.photoURL.length <= 1000 ? user.photoURL : null,
    updatedAt: serverTimestamp(),
  }
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, { ...fields, createdAt: serverTimestamp() })
    return true
  }
  if (snap.get('displayName') !== fields.displayName || snap.get('photoURL') !== fields.photoURL) await updateDoc(ref, fields)
  return false
}
