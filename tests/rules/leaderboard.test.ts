// The public leaderboard: rules, and the app's own leaderboard API, against the emulator.
import fs from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import * as board from '../../src/leaderboard/api'
import type { BoardFields } from '../../src/leaderboard/model'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-starbook',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 },
  })
})
afterAll(() => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await seed('users/alice', { displayName: 'Alice', photoURL: null, username: 'alice', createdAt: T0, updatedAt: T0 })
  await seed('users/bob', { displayName: 'Bob', photoURL: 'https://example.com/b.png', createdAt: T0, updatedAt: T0 })
})

const T0 = Timestamp.fromMillis(Date.UTC(2026, 0, 1))
const as = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore
async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data))
}

// 2 three-star, 1 two-star, 3 one-star, 4 Bibs, 12 restaurants in 3 countries.
const alice = (over: Partial<BoardFields> = {}): BoardFields => ({
  displayName: 'Alice', username: 'alice', photoURL: null,
  stars: 2 * 3 + 2 + 3, three: 2, two: 1, one: 3, bib: 4, green: 1, countries: 3, restaurants: 12,
  ...over,
})

describe('leaderboard entries', () => {
  it('the owner can join, update and leave', async () => {
    const db = as('alice')
    await assertSucceeds(board.saveEntry(db, 'alice', alice()))
    await assertSucceeds(board.saveEntry(db, 'alice', alice({ one: 4, stars: 12, restaurants: 13 })))
    await assertSucceeds(board.removeEntry(db, 'alice'))
  })

  it('signed-in users can read the board; anonymous visitors cannot', async () => {
    await board.saveEntry(as('alice'), 'alice', alice())
    const top = await board.fetchTop(as('bob'))
    expect(top).toEqual([expect.objectContaining({ uid: 'alice', stars: 11, username: 'alice' })])
    await assertFails(getDocs(collection(anon(), 'leaderboard')))
  })

  it("nobody can write or delete someone else's entry", async () => {
    await board.saveEntry(as('alice'), 'alice', alice())
    await assertFails(board.saveEntry(as('bob'), 'alice', alice({ three: 0, stars: 5 })))
    await assertFails(board.removeEntry(as('bob'), 'alice'))
    await assertFails(board.saveEntry(anon(), 'alice', alice()))
  })

  it.each([
    ['a different display name (impersonation)', { displayName: 'Bob' }],
    ['a different username', { username: 'bob' }],
    ['a different photo', { photoURL: 'https://example.com/fake.png' }],
  ])('rejects %s', async (_, over) => {
    await assertFails(board.saveEntry(as('alice'), 'alice', alice(over)))
  })

  it('a user without a username posts username null, and their real photo', async () => {
    const bob: BoardFields = { ...alice(), displayName: 'Bob', username: null, photoURL: 'https://example.com/b.png' }
    await assertSucceeds(board.saveEntry(as('bob'), 'bob', bob))
    await assertFails(board.saveEntry(as('bob'), 'bob', { ...bob, username: 'bob' }))
  })

  it.each([
    ['stars that disagree with the counts', { stars: 12 }],
    ['negative counts', { one: -1, stars: 8 }],
    ['fractional counts', { bib: 1.5 }],
    ['more three-stars than could exist', { three: 501, stars: 1503 + 2 + 3, restaurants: 600 }],
    ['too many countries', { countries: 101 }],
    ['starred and Bib counts exceeding restaurants', { restaurants: 9 }],
    ['more Green Stars than restaurants', { green: 13 }],
    ['restaurants with no country', { countries: 0 }],
    ['counts as strings', { three: '2' as unknown as number }],
  ])('rejects %s', async (_, over) => {
    await assertFails(board.saveEntry(as('alice'), 'alice', alice(over)))
  })

  it('accepts the exact ceilings and an empty record', async () => {
    const db = as('alice')
    await assertSucceeds(board.saveEntry(db, 'alice', alice({ three: 500, two: 0, one: 0, bib: 0, stars: 1500, restaurants: 500, countries: 100, green: 0 })))
    await assertSucceeds(board.saveEntry(db, 'alice', alice({ three: 0, two: 0, one: 0, bib: 0, stars: 0, restaurants: 0, countries: 0, green: 0 })))
  })

  it('rejects extra fields and a client-set timestamp', async () => {
    const ref = doc(as('alice'), 'leaderboard/alice')
    await assertFails(setDoc(ref, { ...alice(), updatedAt: serverTimestamp(), verified: true }))
    await assertFails(setDoc(ref, { ...alice(), updatedAt: T0 }))
  })

  it('an update is validated as a whole', async () => {
    const db = as('alice')
    await board.saveEntry(db, 'alice', alice())
    await assertFails(updateDoc(doc(db, 'leaderboard/alice'), { three: 100, updatedAt: serverTimestamp() }))
  })
})

describe('ranking', () => {
  it('fetchTop orders by stars and rankOf counts those strictly ahead', async () => {
    await board.saveEntry(as('alice'), 'alice', alice())
    await seed('users/carol', { displayName: 'Carol', photoURL: null, createdAt: T0, updatedAt: T0 })
    await board.saveEntry(as('carol'), 'carol', { ...alice(), displayName: 'Carol', username: null, three: 5, stars: 5 * 3 + 2 + 3, restaurants: 20 })
    await board.saveEntry(as('bob'), 'bob', { ...alice(), displayName: 'Bob', username: null, photoURL: 'https://example.com/b.png' })
    const db = as('alice')
    expect((await board.fetchTop(db)).map((e) => e.uid)).toEqual(['carol', expect.any(String), expect.any(String)])
    expect(await board.rankOf(db, 20)).toBe(1)
    expect(await board.rankOf(db, 11)).toBe(2) // Carol ahead; Bob ties with Alice
    expect(await board.rankOf(db, 0)).toBe(4)
  })
})

describe('subscribeOwn', () => {
  it('reports the entry, then null after leaving', async () => {
    const db = as('alice')
    const seen: (string | null)[] = []
    const off = board.subscribeOwn(db, 'alice', (e) => seen.push(e ? `stars:${e.stars}` : null), () => {})
    // Let the first snapshot ("not on the board") arrive before joining.
    for (let i = 0; i < 40 && seen.length === 0; i++) await new Promise((r) => setTimeout(r, 50))
    await board.saveEntry(db, 'alice', alice())
    await new Promise((r) => setTimeout(r, 400))
    await board.removeEntry(db, 'alice')
    await new Promise((r) => setTimeout(r, 400))
    off()
    expect(seen[0]).toBeNull()
    expect(seen).toContain('stars:11')
    expect(seen.at(-1)).toBeNull()
  })
})
