// The app's own write functions, run against the emulator with the real rules.
// A shape mismatch between src/tracking/api.ts and firestore.rules fails here,
// not silently in production.
import fs from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import * as api from '../../src/tracking/api'
import type { Entry, Visit } from '../../src/tracking/model'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-starbook',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 },
  })
})
afterAll(() => env.cleanup())
beforeEach(() => env.clearFirestore())

const as = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore
const abac = { id: 'abac', award: '3' as const, green: true }
const input = { date: '2026-09-30', rating: 5, notes: 'Superb' }

const entryOf = async (db: Firestore, rid: string) => {
  const s = await getDoc(doc(db, 'users/alice/entries', rid))
  return s.exists() ? { want: s.get('want'), favorite: s.get('favorite') } : null
}
const visitsOf = async (db: Firestore) => (await getDocs(collection(db, 'users/alice/visits'))).docs.map((d) => ({ id: d.id, ...d.data() }))

describe('entries', () => {
  it('sets, updates, and deletes an entry once both flags are off', async () => {
    const db = as('alice')
    await api.setEntry(db, 'alice', 'abac', { want: true, favorite: false })
    expect(await entryOf(db, 'abac')).toEqual({ want: true, favorite: false })
    await api.setEntry(db, 'alice', 'abac', { want: true, favorite: true })
    expect(await entryOf(db, 'abac')).toEqual({ want: true, favorite: true })
    await api.setEntry(db, 'alice', 'abac', { want: false, favorite: false })
    expect(await entryOf(db, 'abac')).toBeNull()
  })

  it('clearing a flag that was never set is a harmless delete', async () => {
    await api.setEntry(as('alice'), 'alice', 'abac', { want: false, favorite: false })
  })

  it("cannot write someone else's list", async () => {
    await assertFails(api.setEntry(as('bob'), 'alice', 'abac', { want: true, favorite: false }))
  })
})

describe('visits', () => {
  it('logs a visit with the current award and server timestamps', async () => {
    const db = as('alice')
    const id = await api.addVisit(db, 'alice', abac, input, undefined)
    const [v] = await visitsOf(db)
    expect(v).toMatchObject({ id, restaurantId: 'abac', date: '2026-09-30', rating: 5, notes: 'Superb', award: '3', green: true })
    expect(v.createdAt).toBeTruthy()
  })

  it('logs a visit with no date and no rating', async () => {
    await api.addVisit(as('alice'), 'alice', abac, { date: null, rating: null, notes: '' }, undefined)
    expect(await visitsOf(as('alice'))).toHaveLength(1)
  })

  it('a first visit takes the restaurant off the wishlist', async () => {
    const db = as('alice')
    const want: Entry = { want: true, favorite: false }
    await api.setEntry(db, 'alice', 'abac', want)
    await api.addVisit(db, 'alice', abac, input, want)
    expect(await entryOf(db, 'abac')).toBeNull()
  })

  it('...but keeps it as a favorite', async () => {
    const db = as('alice')
    const both: Entry = { want: true, favorite: true }
    await api.setEntry(db, 'alice', 'abac', both)
    await api.addVisit(db, 'alice', abac, input, both)
    expect(await entryOf(db, 'abac')).toEqual({ want: false, favorite: true })
  })

  it('leaves a favorite-only entry untouched', async () => {
    const db = as('alice')
    const fav: Entry = { want: false, favorite: true }
    await api.setEntry(db, 'alice', 'abac', fav)
    await api.addVisit(db, 'alice', abac, input, fav)
    expect(await entryOf(db, 'abac')).toEqual(fav)
  })

  it('edits and deletes a visit', async () => {
    const db = as('alice')
    const id = await api.addVisit(db, 'alice', abac, input, undefined)
    await api.updateVisit(db, 'alice', id, { date: null, rating: 3, notes: 'Revised' })
    expect((await visitsOf(db))[0]).toMatchObject({ date: null, rating: 3, notes: 'Revised', award: '3', restaurantId: 'abac' })
    await api.deleteVisit(db, 'alice', id)
    expect(await visitsOf(db)).toHaveLength(0)
  })

  it('a rejected write rejects the whole batch (wishlist stays intact)', async () => {
    const db = as('alice')
    const want: Entry = { want: true, favorite: false }
    await api.setEntry(db, 'alice', 'abac', want)
    await assertFails(api.addVisit(db, 'alice', abac, { ...input, rating: 9 }, want))
    expect(await entryOf(db, 'abac')).toEqual(want)
    expect(await visitsOf(db)).toHaveLength(0)
  })

  it("cannot log a visit on someone else's account", async () => {
    await assertFails(api.addVisit(as('bob'), 'alice', abac, input, undefined))
  })
})

describe('subscribe', () => {
  it('delivers entries and visits, and stops on unsubscribe', async () => {
    const db = as('alice')
    let entries = new Map<string, Entry>()
    let visits: Visit[] = []
    const errors: Error[] = []
    const off = api.subscribe(db, 'alice', (e) => (entries = e), (v) => (visits = v), (e) => errors.push(e))
    await api.setEntry(db, 'alice', 'other', { want: true, favorite: false })
    await api.addVisit(db, 'alice', abac, input, undefined)
    await new Promise((r) => setTimeout(r, 500))
    expect(entries.get('other')).toEqual({ want: true, favorite: false })
    expect(visits).toEqual([expect.objectContaining({ restaurantId: 'abac', rating: 5, award: '3', green: true })])
    expect(typeof visits[0].createdAt).toBe('number')
    expect(errors).toEqual([])
    off()
  })

  it("reports an error when subscribing to someone else's list", async () => {
    const errors: Error[] = []
    const off = api.subscribe(as('bob'), 'alice', () => {}, () => {}, (e) => errors.push(e))
    await new Promise((r) => setTimeout(r, 500))
    expect(errors.length).toBeGreaterThan(0)
    off()
  })
})
