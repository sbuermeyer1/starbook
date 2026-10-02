import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { AuthContext } from './useAuth'

export interface AuthState {
  user: User | null
  ready: boolean // false until Firebase has restored (or ruled out) a session
  error: string | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

// Keeps users/{uid} in step with the Google account. createdAt is written once.
async function syncProfile(user: User) {
  const ref = doc(db, 'users', user.uid)
  const fields = {
    displayName: (user.displayName ?? '').slice(0, 100),
    photoURL: user.photoURL && user.photoURL.length <= 1000 ? user.photoURL : null,
    updatedAt: serverTimestamp(),
  }
  const snap = await getDoc(ref)
  if (!snap.exists()) await setDoc(ref, { ...fields, createdAt: serverTimestamp() })
  else if (snap.get('displayName') !== fields.displayName || snap.get('photoURL') !== fields.photoURL) await updateDoc(ref, fields)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u)
        setReady(true)
        if (u) syncProfile(u).catch((e) => console.error('profile sync failed', e))
      }),
    [],
  )

  const signIn = async () => {
    setError(null)
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    try {
      await signInWithPopup(auth, provider)
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, provider)
      } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setError('Sign-in failed. Please try again.')
        console.error(e)
      }
    }
  }

  return (
    <AuthContext.Provider value={{ user, ready, error, signIn, signOut: () => signOut(auth) }}>{children}</AuthContext.Provider>
  )
}
