import { createContext, useContext } from 'react'
import type { Profile } from './model'
import type { FriendActivity } from './activity'

export type Relation = 'self' | 'friend' | 'incoming' | 'outgoing' | 'none'

export interface FriendsState {
  ready: boolean // signed in and the first snapshot has arrived
  me: Profile | null
  friends: Profile[]
  incoming: Profile[] // people who asked me
  outgoing: Profile[] // people I asked
  // restaurantId -> what friends did there (visits, favorite, wishlist)
  activity: Map<string, FriendActivity[]>
  profileOf: (uid: string) => Profile
  error: string | null
  clearError: () => void
  relationTo: (uid: string) => Relation
  claimUsername: (handle: string) => Promise<void> // rejects with UsernameTakenError
  lookup: (handle: string) => Promise<Profile | null>
  send: (uid: string) => Promise<void>
  cancel: (uid: string) => Promise<void>
  accept: (uid: string) => Promise<void>
  decline: (uid: string) => Promise<void>
  remove: (uid: string) => Promise<void>
}

export const FriendsContext = createContext<FriendsState | null>(null)

export function useFriends(): FriendsState {
  const ctx = useContext(FriendsContext)
  if (!ctx) throw new Error('useFriends must be used inside <FriendsProvider>')
  return ctx
}
