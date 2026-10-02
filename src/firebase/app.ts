// Loaded lazily (see ./lazy.ts) so the map renders before any Firebase code downloads.
import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'

// Web config is public by design: access is enforced by firestore.rules, not by this key.
const config = {
  apiKey: 'AIzaSyAF1ii6gNY523Ev7yGtT3Ys9DYMb2SkNMM',
  // Served from the same origin when hosted, so sign-in doesn't depend on third-party cookies.
  authDomain: /\.(web\.app|firebaseapp\.com)$/.test(location.hostname) ? location.host : 'starbook-3298e.firebaseapp.com',
  projectId: 'starbook-3298e',
  storageBucket: 'starbook-3298e.firebasestorage.app',
  messagingSenderId: '741626959945',
  appId: '1:741626959945:web:4046196137305fdd934798',
  measurementId: 'G-KFR6B2GTTC',
}

// `npm run dev:emulators` points the app at local emulators instead of production.
export const useEmulators = import.meta.env.VITE_USE_EMULATORS === '1'

export const app = initializeApp(useEmulators ? { ...config, projectId: 'demo-starbook' } : config)
export const auth = getAuth(app)
if (useEmulators) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })

export { getRedirectResult, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth'

// Emulator-only hook so browser checks can sign in without the Google popup.
if (useEmulators) {
  const { GoogleAuthProvider, signInWithCredential } = await import('firebase/auth')
  Object.assign(window, {
    __starbookTestSignIn: (sub: string, name: string) =>
      signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub, name, email: `${sub}@example.com` }))),
  })
}
