// Runs against the Firestore emulator: `npm run test:rules`.
import fs from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, getDocs, collection, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-starbook',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 },
  })
})
afterAll(() => env.cleanup())
beforeEach(() => env.clearFirestore())

const as = (uid: string) => env.authenticatedContext(uid).firestore()
const anon = () => env.unauthenticatedContext().firestore()

const profile = (over: Record<string, unknown> = {}) => ({
  displayName: 'Alice',
  photoURL: 'https://example.com/a.png',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...over,
})
const entry = (over: Record<string, unknown> = {}) => ({ want: true, favorite: false, updatedAt: serverTimestamp(), ...over })
const visit = (over: Record<string, unknown> = {}) => ({
  restaurantId: 'abac',
  date: '2026-09-30',
  rating: 5,
  notes: 'Superb',
  award: '3',
  green: false,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...over,
})

// Seed with rules bypassed, using fixed timestamps.
const T0 = Timestamp.fromMillis(Date.UTC(2026, 0, 1))
async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data))
}

describe('users/{uid} profile', () => {
  it('owner can create, read and update their profile', async () => {
    const db = as('alice')
    await assertSucceeds(setDoc(doc(db, 'users/alice'), profile()))
    await assertSucceeds(getDoc(doc(db, 'users/alice')))
    await assertSucceeds(updateDoc(doc(db, 'users/alice'), { displayName: 'Al', updatedAt: serverTimestamp() }))
  })

  it('signed-in users can read it by exact path; nobody else can write it, and anonymous visitors cannot read it', async () => {
    await seed('users/alice', profile({ createdAt: T0, updatedAt: T0 }))
    await assertSucceeds(getDoc(doc(as('bob'), 'users/alice')))
    await assertFails(getDoc(doc(anon(), 'users/alice')))
    await assertFails(updateDoc(doc(as('bob'), 'users/alice'), { displayName: 'Mallory', updatedAt: serverTimestamp() }))
    await assertFails(setDoc(doc(as('bob'), 'users/alice'), profile()))
    await assertFails(setDoc(doc(anon(), 'users/anon'), profile()))
  })

  it('rejects unknown fields, missing fields and oversize names', async () => {
    const db = as('alice')
    await assertFails(setDoc(doc(db, 'users/alice'), profile({ isAdmin: true })))
    const { photoURL: _, ...noPhoto } = profile()
    await assertFails(setDoc(doc(db, 'users/alice'), noPhoto))
    await assertFails(setDoc(doc(db, 'users/alice'), profile({ displayName: 'x'.repeat(101) })))
    await assertSucceeds(setDoc(doc(db, 'users/alice'), profile({ photoURL: null })))
  })

  it('requires server timestamps and keeps createdAt fixed', async () => {
    const db = as('alice')
    await assertFails(setDoc(doc(db, 'users/alice'), profile({ createdAt: T0 })))
    await assertFails(setDoc(doc(db, 'users/alice'), profile({ updatedAt: T0 })))
    await seed('users/alice', profile({ createdAt: T0, updatedAt: T0 }))
    await assertFails(updateDoc(doc(db, 'users/alice'), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(db, 'users/alice'), { displayName: 'Al' })) // stale updatedAt
  })

  it('cannot be deleted from the client', async () => {
    await seed('users/alice', profile({ createdAt: T0, updatedAt: T0 }))
    await assertFails(deleteDoc(doc(as('alice'), 'users/alice')))
  })
})

describe('users/{uid}/entries/{rid}', () => {
  it('owner can set, read, list and delete entries', async () => {
    const db = as('alice')
    await assertSucceeds(setDoc(doc(db, 'users/alice/entries/abac'), entry()))
    await assertSucceeds(setDoc(doc(db, 'users/alice/entries/abac'), entry({ favorite: true })))
    await assertSucceeds(getDocs(collection(db, 'users/alice/entries')))
    await assertSucceeds(deleteDoc(doc(db, 'users/alice/entries/abac')))
  })

  it('other users cannot read, list or write them', async () => {
    await seed('users/alice/entries/abac', entry({ updatedAt: T0 }))
    const bob = as('bob')
    await assertFails(getDoc(doc(bob, 'users/alice/entries/abac')))
    await assertFails(getDocs(collection(bob, 'users/alice/entries')))
    await assertFails(setDoc(doc(bob, 'users/alice/entries/abac'), entry()))
    await assertFails(deleteDoc(doc(bob, 'users/alice/entries/abac')))
    await assertFails(getDocs(collection(anon(), 'users/alice/entries')))
  })

  it('validates the shape', async () => {
    const db = as('alice')
    const ref = doc(db, 'users/alice/entries/abac')
    await assertFails(setDoc(ref, entry({ want: 'yes' })))
    await assertFails(setDoc(ref, entry({ favorite: 1 })))
    await assertFails(setDoc(ref, entry({ note: 'x' })))
    await assertFails(setDoc(ref, { want: true, updatedAt: serverTimestamp() }))
    await assertFails(setDoc(ref, entry({ updatedAt: T0 })))
  })

  it('rejects an oversize restaurant ID', async () => {
    await assertFails(setDoc(doc(as('alice'), `users/alice/entries/${'x'.repeat(201)}`), entry()))
    await assertSucceeds(setDoc(doc(as('alice'), `users/alice/entries/${'x'.repeat(200)}`), entry()))
  })
})

describe('users/{uid}/visits/{vid}', () => {
  it('owner can log, read, edit and delete a visit', async () => {
    const db = as('alice')
    const ref = doc(db, 'users/alice/visits/v1')
    await assertSucceeds(setDoc(ref, visit()))
    await assertSucceeds(getDocs(collection(db, 'users/alice/visits')))
    await assertSucceeds(updateDoc(ref, { rating: 4, notes: 'Still great', updatedAt: serverTimestamp() }))
    await assertSucceeds(deleteDoc(ref))
  })

  it('allows an unknown date and no rating', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'users/alice/visits/v1'), visit({ date: null, rating: null, notes: '' })))
  })

  it('other users and anonymous visitors are denied', async () => {
    await seed('users/alice/visits/v1', visit({ createdAt: T0, updatedAt: T0 }))
    await assertFails(getDoc(doc(as('bob'), 'users/alice/visits/v1')))
    await assertFails(getDocs(collection(anon(), 'users/alice/visits')))
    await assertFails(setDoc(doc(as('bob'), 'users/alice/visits/v2'), visit()))
    await assertFails(updateDoc(doc(as('bob'), 'users/alice/visits/v1'), { rating: 1, updatedAt: serverTimestamp() }))
    await assertFails(deleteDoc(doc(as('bob'), 'users/alice/visits/v1')))
  })

  it.each([
    ['rating 0', { rating: 0 }],
    ['rating 6', { rating: 6 }],
    ['fractional rating', { rating: 4.5 }],
    ['rating as string', { rating: '5' }],
    ['malformed date', { date: '30/09/2026' }],
    ['date with time', { date: '2026-09-30T20:00' }],
    ['notes too long', { notes: 'x'.repeat(2001) }],
    ['null notes', { notes: null }],
    ['unknown award', { award: '4' }],
    ['green as string', { green: 'true' }],
    ['empty restaurant ID', { restaurantId: '' }],
    ['oversize restaurant ID', { restaurantId: 'x'.repeat(201) }],
    ['extra field', { photos: [] }],
    ['client createdAt', { createdAt: T0 }],
    ['client updatedAt', { updatedAt: T0 }],
  ])('rejects %s', async (_, over) => {
    await assertFails(setDoc(doc(as('alice'), 'users/alice/visits/v1'), visit(over)))
  })

  it('accepts notes at exactly the limit', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'users/alice/visits/v1'), visit({ notes: 'x'.repeat(2000) })))
  })

  it('rejects a visit missing a field', async () => {
    const { green: _, ...noGreen } = visit()
    await assertFails(setDoc(doc(as('alice'), 'users/alice/visits/v1'), noGreen))
  })

  it('an edit cannot move the visit to another restaurant or rewrite createdAt', async () => {
    await seed('users/alice/visits/v1', visit({ createdAt: T0, updatedAt: T0 }))
    const ref = doc(as('alice'), 'users/alice/visits/v1')
    await assertFails(updateDoc(ref, { restaurantId: 'other', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { rating: 2 })) // stale updatedAt
    await assertSucceeds(updateDoc(ref, { rating: 2, updatedAt: serverTimestamp() }))
  })
})

describe('everything else', () => {
  it('denies top-level collections outside users', async () => {
    await assertFails(setDoc(doc(as('alice'), 'restaurants/abac'), { name: 'x' }))
    await assertFails(getDocs(collection(as('alice'), 'restaurants')))
  })

  it('denies listing all users', async () => {
    await assertFails(getDocs(collection(as('alice'), 'users')))
  })

  it('denies unknown subcollections under your own user', async () => {
    await assertFails(setDoc(doc(as('alice'), 'users/alice/secrets/x'), { a: 1 }))
  })
})
