import { describe, expect, it } from 'vitest'
import { viewFor } from './views'
import type { Restaurant } from '../data/restaurants'

const r = { id: 'đong-pho', name: 'Đông Phố' } as Restaurant

describe('viewFor', () => {
  it('maps each panel to a virtual page', () => {
    expect(viewFor({ kind: 'restaurant', restaurant: r })).toEqual({ path: '/restaurant/%C4%91ong-pho', title: 'Đông Phố' })
    expect(viewFor({ kind: 'filters' })).toEqual({ path: '/filters', title: 'Filters' })
    expect(viewFor({ kind: 'friends' })).toEqual({ path: '/friends', title: 'Friends' })
    expect(viewFor({ kind: 'stats' })).toEqual({ path: '/stats', title: 'My stats' })
    expect(viewFor({ kind: 'friendStats' })).toEqual({ path: '/friends/stats', title: 'Friend stats' })
  })
  it('the bare map is not a new view', () => {
    expect(viewFor(null)).toBeNull()
  })
})
