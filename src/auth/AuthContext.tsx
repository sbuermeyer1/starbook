import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { loadAuth, loadDb } from '../firebase/lazy'
import { AuthContext } from './useAuth'

export interface AuthState {
  user: User | null
  ready: boolean // false until Firebase has restored (or ruled out) a session
  error: string | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

type AuthModule = Awaited<ReturnType<typeof loadAuth>>

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Held so sign-in can open the popup synchronously inside the click; browsers block
  // popups opened after an await. The Sign in button only renders once this is set.
  const fb = useRef<AuthModule | null>(null)

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    loadAuth().then(
      (m) => {
        if (cancelled) return
        fb.current = m
        unsubscribe = m.onAuthStateChanged(m.auth, (u) => {
          setUser(u)
          setReady(true)
          if (u) loadDb().then((d) => d.syncProfile(u)).catch((e) => console.error('profile sync failed', e))
        })
      },
      (e) => {
        console.error(e)
        setError("Couldn't reach the sign-in service.")
        setReady(true)
      },
    )
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  const signIn = async () => {
    const m = fb.current
    if (!m) return
    setError(null)
    const provider = new m.GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    try {
      await m.signInWithPopup(m.auth, provider)
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await m.signInWithRedirect(m.auth, provider)
      } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setError('Sign-in failed. Please try again.')
        console.error(e)
      }
    }
  }

  const signOut = async () => {
    if (fb.current) await fb.current.signOut(fb.current.auth)
  }

  return <AuthContext.Provider value={{ user, ready, error, signIn, signOut }}>{children}</AuthContext.Provider>
}
