import { createContext, useContext } from 'react'
import type { Restaurant } from '../data/restaurants'
import type { Entry, Tracked, VisitInput } from './model'

export interface TrackingState {
  signedIn: boolean
  ready: boolean // the signed-in user's data has arrived
  tracked: Tracked
  error: string | null
  clearError: () => void
  setEntry: (restaurantId: string, next: Entry) => Promise<void>
  addVisit: (r: Restaurant, input: VisitInput) => Promise<void>
  updateVisit: (visitId: string, input: VisitInput) => Promise<void>
  deleteVisit: (visitId: string) => Promise<void>
}

export const TrackingContext = createContext<TrackingState | null>(null)

export function useTracking(): TrackingState {
  const ctx = useContext(TrackingContext)
  if (!ctx) throw new Error('useTracking must be used inside <TrackingProvider>')
  return ctx
}
