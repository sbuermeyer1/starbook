import type { Restaurant } from '../data/restaurants'

export type Panel = { kind: 'filters' } | { kind: 'friends' } | { kind: 'stats' } | { kind: 'friendStats' } | { kind: 'restaurant'; restaurant: Restaurant } | null

// The virtual page for whatever panel is open, or null for the bare map.
export function viewFor(panel: Panel): { path: string; title: string } | null {
  if (!panel) return null
  if (panel.kind === 'restaurant') return { path: `/restaurant/${encodeURIComponent(panel.restaurant.id)}`, title: panel.restaurant.name }
  // A friend's stats page: never the friend's identity, just that one was opened.
  if (panel.kind === 'friendStats') return { path: '/friends/stats', title: 'Friend stats' }
  const titles = { filters: 'Filters', friends: 'Friends', stats: 'My stats' }
  return { path: `/${panel.kind}`, title: titles[panel.kind] }
}
