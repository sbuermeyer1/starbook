// Usernames, friend requests and friendships: the rules, and the app's own friends API,
// against the Firestore emulator.
import fs from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import * as friends from '../../src/friends/api'
import * as tracking from '../../src/tracking/api'

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
  // Every test starts with three signed-up users and no usernames.
  for (const uid of ['alice', 'bob', 'carol']) await seed(`users/${uid}`, { displayName: uid, photoURL: null, createdAt: T0, updatedAt: T0 })
})

const T0 = Timestamp.fromMillis(Date.UTC(2026, 0, 1))
const as = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore
async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data))
}
const read = async (path: string) => {
  let out: Record<string, unknown> | null = null
  await env.withSecurityRulesDisabled(async (ctx) => {
    const s = await getDoc(doc(ctx.firestore(), path))
    out = s.exists() ? s.data() : null
  })
  return out as Record<string, unknown> | null
}
const befriend = (a: string, b: string) => seed(`friendships/${a < b ? `${a}_${b}` : `${b}_${a}`}`, { members: [a, b].sort(), createdAt: T0 })

describe('usernames', () => {
  it('claims a handle together with the profile', async () => {
    await friends.claimUsername(as('alice'), 'alice', '@Alice_1', null)
    expect(await read('usernames/alice_1')).toEqual({ uid: 'alice' })
    expect((await read('users/alice'))?.username).toBe('alice_1')
  })

  it('changing the handle releases the old one', async () => {
    await friends.claimUsername(as('alice'), 'alice', 'first', null)
    await friends.claimUsername(as('alice'), 'alice', 'second', 'first')
    expect(await read('usernames/first')).toBeNull()
    expect(await read('usernames/second')).toEqual({ uid: 'alice' })
    expect((await read('users/alice'))?.username).toBe('second')
  })

  it('reports a taken handle and changes nothing', async () => {
    await friends.claimUsername(as('alice'), 'alice', 'sam', null)
    await expect(friends.claimUsername(as('bob'), 'bob', 'sam', null)).rejects.toBeInstanceOf(friends.UsernameTakenError)
    expect(await read('usernames/sam')).toEqual({ uid: 'alice' })
    expect((await read('users/bob'))?.username).toBeUndefined()
  })

  it('rules: cannot take over a handle someone holds', async () => {
    await friends.claimUsername(as('alice'), 'alice', 'sam', null)
    const db = as('bob')
    const b = writeBatch(db)
    b.set(doc(db, 'usernames/sam'), { uid: 'bob' })
    b.update(doc(db, 'users/bob'), { username: 'sam', updatedAt: serverTimestamp() })
    await assertFails(b.commit())
  })

  it('rules: a handle must be claimed together with the profile', async () => {
    const db = as('alice')
    await assertFails(setDoc(doc(db, 'usernames/alone'), { uid: 'alice' }))
    await assertFails(updateDoc(doc(db, 'users/alice'), { username: 'alone', updatedAt: serverTimestamp() }))
  })

  it('rules: cannot claim a handle for someone else', async () => {
    const db = as('alice')
    const b = writeBatch(db)
    b.set(doc(db, 'usernames/x_for_bob'), { uid: 'bob' })
    b.update(doc(db, 'users/alice'), { username: 'x_for_bob', updatedAt: serverTimestamp() })
    await assertFails(b.commit())
  })

  it('rules: a handle document holds only the uid', async () => {
    const db = as('alice')
    const b = writeBatch(db)
    b.set(doc(db, 'usernames/extra'), { uid: 'alice', verified: true })
    b.update(doc(db, 'users/alice'), { username: 'extra', updatedAt: serverTimestamp() })
    await assertFails(b.commit())
  })

  it('rules: a handle can only point at its creator, even if the profile already names it', async () => {
    // An inconsistent state the app can't produce: the profile names a handle that has no document.
    await seed('users/alice', { displayName: 'alice', photoURL: null, username: 'orphan', createdAt: T0, updatedAt: T0 })
    await assertFails(setDoc(doc(as('alice'), 'usernames/orphan'), { uid: 'bob' }))
    await assertSucceeds(setDoc(doc(as('alice'), 'usernames/orphan'), { uid: 'alice' }))
  })

  it('rules: changing handles must release the old one (no hoarding)', async () => {
    await friends.claimUsername(as('alice'), 'alice', 'first', null)
    const db = as('alice')
    const b = writeBatch(db)
    b.set(doc(db, 'usernames/second'), { uid: 'alice' })
    b.update(doc(db, 'users/alice'), { username: 'second', updatedAt: serverTimestamp() })
    await assertFails(b.commit())
  })

  it('rules: cannot release a handle still on the profile, or one held by someone else', async () => {
    await friends.claimUsername(as('alice'), 'alice', 'kept', null)
    await assertFails(deleteDoc(doc(as('alice'), 'usernames/kept')))
    await assertFails(deleteDoc(doc(as('bob'), 'usernames/kept')))
  })

  it.each([['ab'], ['x'.repeat(21)], ['Upper'], ['has space'], ['dash-ed'], ['émile']])('rules: rejects the handle %j', async (h) => {
    const db = as('alice')
    const b = writeBatch(db)
    b.set(doc(db, `usernames/${h}`), { uid: 'alice' })
    b.update(doc(db, 'users/alice'), { username: h, updatedAt: serverTimestamp() })
    await assertFails(b.commit())
  })

  it('rules: handles are looked up by exact name, never listed', async () => {
    await friends.claimUsername(as('alice'), 'alice', 'sam', null)
    await assertSucceeds(getDoc(doc(as('bob'), 'usernames/sam')))
    await assertFails(getDocs(collection(as('bob'), 'usernames')))
    await assertFails(getDoc(doc(anon(), 'usernames/sam')))
  })

  it('rules: a new profile cannot arrive with a username', async () => {
    await assertFails(setDoc(doc(as('dave'), 'users/dave'), { displayName: 'd', photoURL: null, username: 'dave', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
  })

  it('lookupUsername returns the profile, or null', async () => {
    await friends.claimUsername(as('alice'), 'alice', 'sam', null)
    expect(await friends.lookupUsername(as('bob'), '@Sam')).toEqual({ uid: 'alice', displayName: 'alice', photoURL: null, username: 'sam' })
    expect(await friends.lookupUsername(as('bob'), 'nobody')).toBeNull()
  })
})

describe('friend requests', () => {
  it('send, see on both sides, cancel', async () => {
    await friends.sendRequest(as('alice'), 'alice', 'bob', false)
    expect(await read('friendRequests/alice_bob')).toMatchObject({ from: 'alice', to: 'bob' })
    await assertSucceeds(getDocs(query(collection(as('bob'), 'friendRequests'), where('to', '==', 'bob'))))
    await assertSucceeds(getDocs(query(collection(as('alice'), 'friendRequests'), where('from', '==', 'alice'))))
    await friends.cancelRequest(as('alice'), 'alice', 'bob')
    expect(await read('friendRequests/alice_bob')).toBeNull()
  })

  it('the recipient can decline', async () => {
    await friends.sendRequest(as('alice'), 'alice', 'bob', false)
    await friends.declineRequest(as('bob'), 'bob', 'alice')
    expect(await read('friendRequests/alice_bob')).toBeNull()
  })

  it('rules: third parties cannot see, list, or delete a request', async () => {
    await friends.sendRequest(as('alice'), 'alice', 'bob', false)
    await assertFails(getDoc(doc(as('carol'), 'friendRequests/alice_bob')))
    await assertFails(getDocs(collection(as('carol'), 'friendRequests')))
    await assertFails(getDocs(query(collection(as('carol'), 'friendRequests'), where('to', '==', 'bob'))))
    await assertFails(deleteDoc(doc(as('carol'), 'friendRequests/alice_bob')))
  })

  it('rules: cannot send as someone else, to yourself, under a mismatched ID, or to a non-user', async () => {
    const req = (from: string, to: string) => ({ from, to, createdAt: serverTimestamp() })
    await assertFails(setDoc(doc(as('carol'), 'friendRequests/alice_bob'), req('alice', 'bob')))
    // Spoofing the sender under your own ID: Bob would see a request "from Alice".
    await assertFails(setDoc(doc(as('carol'), 'friendRequests/carol_bob'), req('alice', 'bob')))
    await assertFails(setDoc(doc(as('alice'), 'friendRequests/alice_alice'), req('alice', 'alice')))
    await assertFails(setDoc(doc(as('alice'), 'friendRequests/alice_carol'), req('alice', 'bob')))
    await assertFails(setDoc(doc(as('alice'), 'friendRequests/alice_ghost'), req('alice', 'ghost')))
    await assertFails(setDoc(doc(as('alice'), 'friendRequests/alice_bob'), { ...req('alice', 'bob'), note: 'hi' }))
    await assertFails(setDoc(doc(as('alice'), 'friendRequests/alice_bob'), { from: 'alice', to: 'bob', createdAt: T0 }))
  })

  it('rules: cannot request someone you are already friends with', async () => {
    await befriend('alice', 'bob')
    await assertFails(friends.sendRequest(as('alice'), 'alice', 'bob', false))
  })

  it('rules: requests cannot be edited', async () => {
    await friends.sendRequest(as('alice'), 'alice', 'bob', false)
    await assertFails(updateDoc(doc(as('bob'), 'friendRequests/alice_bob'), { to: 'carol' }))
  })
})

describe('friendships', () => {
  it('accepting creates the friendship and clears the request', async () => {
    await friends.sendRequest(as('alice'), 'alice', 'bob', false)
    await friends.acceptRequest(as('bob'), 'bob', 'alice', false)
    expect(await read('friendships/alice_bob')).toMatchObject({ members: ['alice', 'bob'] })
    expect(await read('friendRequests/alice_bob')).toBeNull()
  })

  it('crossing requests: sending to someone who already asked you accepts theirs and clears both', async () => {
    await friends.sendRequest(as('bob'), 'bob', 'alice', false)
    await friends.sendRequest(as('alice'), 'alice', 'bob', true)
    expect(await read('friendships/alice_bob')).not.toBeNull()
    expect(await read('friendRequests/bob_alice')).toBeNull()
  })

  it('accepting while my own request to them is pending clears both', async () => {
    await friends.sendRequest(as('alice'), 'alice', 'bob', false)
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'friendRequests/bob_alice'), { from: 'bob', to: 'alice', createdAt: T0 }))
    await friends.acceptRequest(as('bob'), 'bob', 'alice', true)
    expect(await read('friendRequests/alice_bob')).toBeNull()
    expect(await read('friendRequests/bob_alice')).toBeNull()
  })

  it('rules: no friendship without a request from the other person', async () => {
    const f = (members: string[]) => ({ members, createdAt: serverTimestamp() })
    await assertFails(setDoc(doc(as('alice'), 'friendships/alice_bob'), f(['alice', 'bob'])))
    // My own outgoing request doesn't let me accept on their behalf.
    await friends.sendRequest(as('alice'), 'alice', 'bob', false)
    await assertFails(setDoc(doc(as('alice'), 'friendships/alice_bob'), f(['alice', 'bob'])))
  })

  it("rules: a request someone sent me cannot be used to pair them with a third person", async () => {
    await friends.sendRequest(as('alice'), 'alice', 'carol', false)
    await assertFails(setDoc(doc(as('carol'), 'friendships/alice_bob'), { members: ['alice', 'bob'], createdAt: serverTimestamp() }))
  })

  it('rules: a third party cannot create or join a friendship', async () => {
    await friends.sendRequest(as('alice'), 'alice', 'bob', false)
    await assertFails(setDoc(doc(as('carol'), 'friendships/alice_bob'), { members: ['alice', 'bob'], createdAt: serverTimestamp() }))
    await assertFails(setDoc(doc(as('carol'), 'friendships/alice_carol'), { members: ['alice', 'carol'], createdAt: serverTimestamp() }))
  })

  it('rules: the friendship document must be well-formed', async () => {
    await friends.sendRequest(as('alice'), 'alice', 'bob', false)
    const bob = as('bob')
    await assertFails(setDoc(doc(bob, 'friendships/bob_alice'), { members: ['bob', 'alice'], createdAt: serverTimestamp() })) // unsorted
    await assertFails(setDoc(doc(bob, 'friendships/alice_bob'), { members: ['bob', 'alice'], createdAt: serverTimestamp() })) // unsorted members
    await assertFails(setDoc(doc(bob, 'friendships/alice_bob'), { members: ['alice', 'bob', 'carol'], createdAt: serverTimestamp() }))
    await assertFails(setDoc(doc(bob, 'friendships/x'), { members: ['alice', 'bob'], createdAt: serverTimestamp() })) // wrong ID
    await assertFails(setDoc(doc(bob, 'friendships/alice_bob'), { members: ['alice', 'bob'], createdAt: T0 }))
    await assertFails(setDoc(doc(bob, 'friendships/alice_bob'), { members: ['alice', 'bob'], createdAt: serverTimestamp(), extra: 1 }))
  })

  it('either friend can remove it; nobody else can see or remove it', async () => {
    await befriend('alice', 'bob')
    await assertFails(getDoc(doc(as('carol'), 'friendships/alice_bob')))
    await assertFails(getDocs(collection(as('carol'), 'friendships')))
    await assertFails(deleteDoc(doc(as('carol'), 'friendships/alice_bob')))
    await friends.removeFriend(as('bob'), 'bob', 'alice')
    expect(await read('friendships/alice_bob')).toBeNull()
  })

  it('rules: friendships cannot be edited', async () => {
    await befriend('alice', 'bob')
    await assertFails(updateDoc(doc(as('alice'), 'friendships/alice_bob'), { members: ['alice', 'carol'] }))
  })
})

describe("reading a friend's list", () => {
  const visit = { id: 'abac', award: '3' as const, green: false }

  it("friends can read each other's visits and entries; others cannot", async () => {
    await tracking.addVisit(as('alice'), 'alice', visit, { date: '2026-05-01', rating: 5, notes: 'Langoustine!' }, undefined)
    await tracking.setEntry(as('alice'), 'alice', 'disfrutar', { want: true, favorite: false })
    await befriend('alice', 'bob')
    const bobView = await getDocs(collection(as('bob'), 'users/alice/visits'))
    expect(bobView.docs.map((d) => d.get('notes'))).toEqual(['Langoustine!'])
    await assertSucceeds(getDocs(collection(as('bob'), 'users/alice/entries')))
    await assertFails(getDocs(collection(as('carol'), 'users/alice/visits')))
    await assertFails(getDocs(collection(as('carol'), 'users/alice/entries')))
  })

  it('a pending request does not grant access', async () => {
    await friends.sendRequest(as('bob'), 'bob', 'alice', false)
    await assertFails(getDocs(collection(as('bob'), 'users/alice/visits')))
  })

  it('access ends when the friendship is removed', async () => {
    await befriend('alice', 'bob')
    await assertSucceeds(getDocs(collection(as('bob'), 'users/alice/visits')))
    await friends.removeFriend(as('alice'), 'alice', 'bob')
    await assertFails(getDocs(collection(as('bob'), 'users/alice/visits')))
  })

  it("friends cannot write to each other's lists", async () => {
    await befriend('alice', 'bob')
    await assertFails(tracking.addVisit(as('bob'), 'alice', visit, { date: null, rating: null, notes: '' }, undefined))
    await assertFails(tracking.setEntry(as('bob'), 'alice', 'abac', { want: true, favorite: false }))
  })
})

describe('subscribeFriends', () => {
  it('delivers friends and requests in both directions', async () => {
    await befriend('alice', 'bob')
    await friends.sendRequest(as('carol'), 'carol', 'alice', false)
    await seed('users/dave', { displayName: 'dave', photoURL: null, createdAt: T0, updatedAt: T0 })
    await friends.sendRequest(as('alice'), 'alice', 'dave', false)
    const seen: friends.FriendsSnapshot[] = []
    const errors: Error[] = []
    const off = friends.subscribeFriends(as('alice'), 'alice', (s) => seen.push(s), (e) => errors.push(e))
    await new Promise((r) => setTimeout(r, 800))
    off()
    expect(errors).toEqual([])
    expect(seen.at(-1)).toEqual({ friends: ['bob'], incoming: [{ from: 'carol', to: 'alice' }], outgoing: [{ from: 'alice', to: 'dave' }] })
  })
})
