// Pinned goals: rules, and the app's own goals API, against the emulator.
import fs from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import * as goals from '../../src/goals/api'
import type { Goal } from '../../src/goals/model'

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
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), 'friendships/alice_bob'), { members: ['alice', 'bob'], createdAt: Timestamp.now() }),
  )
})

const as = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore
const city: Goal = { scope: 'city', key: 'idf/paris', award: 'bib' }
const country: Goal = { scope: 'country', key: 'France', award: '3' }

describe('goals', () => {
  it('the owner can pin, list and unpin goals; IDs encode the goal', async () => {
    const db = as('alice')
    await assertSucceeds(goals.addGoal(db, 'alice', city))
    await assertSucceeds(goals.addGoal(db, 'alice', country))
    const ids = (await getDocs(collection(db, 'users/alice/goals'))).docs.map((d) => d.id).sort()
    expect(ids).toEqual(['city:bib:idf|paris', 'country:3:France'])
    await assertSucceeds(goals.removeGoal(db, 'alice', city))
    expect((await getDocs(collection(db, 'users/alice/goals'))).size).toBe(1)
  })

  it('goals are private: not even friends can read them', async () => {
    await goals.addGoal(as('alice'), 'alice', city)
    await assertFails(getDocs(collection(as('bob'), 'users/alice/goals')))
    await assertFails(getDocs(collection(anon(), 'users/alice/goals')))
  })

  it("nobody can pin or remove goals on someone else's account", async () => {
    await goals.addGoal(as('alice'), 'alice', city)
    await assertFails(goals.addGoal(as('bob'), 'alice', country))
    await assertFails(goals.removeGoal(as('bob'), 'alice', city))
  })

  it('the same goal cannot be pinned twice (no update)', async () => {
    await goals.addGoal(as('alice'), 'alice', city)
    await assertFails(goals.addGoal(as('alice'), 'alice', city))
    await assertFails(updateDoc(doc(as('alice'), 'users/alice/goals/city:bib:idf|paris'), { award: '3' }))
  })

  it.each([
    ['an ID that does not match the content', 'country:3:Spain', { scope: 'country', key: 'France', award: '3' }],
    ['an unknown scope', 'region:3:France', { scope: 'region', key: 'France', award: '3' }],
    ['an unknown distinction', 'country:4:France', { scope: 'country', key: 'France', award: '4' }],
    ['an empty key', 'country:3:', { scope: 'country', key: '', award: '3' }],
    ['a key over 200 characters', `country:3:${'x'.repeat(201)}`, { scope: 'country', key: 'x'.repeat(201), award: '3' }],
    ['a non-string key', 'country:3:7', { scope: 'country', key: 7, award: '3' }],
  ])('rejects %s', async (_, id, data) => {
    await assertFails(setDoc(doc(as('alice'), `users/alice/goals/${id}`), { ...data, createdAt: serverTimestamp() }))
  })

  it('rejects extra fields and a client-set time', async () => {
    const ref = doc(as('alice'), 'users/alice/goals/country:3:France')
    await assertFails(setDoc(ref, { ...country, createdAt: serverTimestamp(), note: 'x' }))
    await assertFails(setDoc(ref, { ...country, createdAt: Timestamp.now() }))
  })

  it('accepts a key of exactly 200 characters', async () => {
    await assertSucceeds(goals.addGoal(as('alice'), 'alice', { scope: 'country', key: 'x'.repeat(200), award: 'all' }))
  })

  it('subscribeGoals delivers goals oldest first', async () => {
    const db = as('alice')
    const seen: Goal[][] = []
    const off = goals.subscribeGoals(db, 'alice', (g) => seen.push(g), () => {})
    await goals.addGoal(db, 'alice', country)
    await new Promise((r) => setTimeout(r, 50))
    await goals.addGoal(db, 'alice', city)
    await new Promise((r) => setTimeout(r, 500))
    off()
    expect(seen.at(-1)).toEqual([country, city])
  })
})
