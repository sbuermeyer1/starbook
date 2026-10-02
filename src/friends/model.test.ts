import { describe, expect, it } from 'vitest'
import { handleFromPath, inviteUrl, normalizeHandle, pairId, validateHandle } from './model'

describe('handles', () => {
  it('normalizes @, case and whitespace', () => {
    expect(normalizeHandle('  @Sam_1 ')).toBe('sam_1')
  })
  it.each([
    ['sam', null],
    ['@Sam', null],
    ['a_b_c_123', null],
    ['ab', /At least 3/],
    ['x'.repeat(21), /At most 20/],
    ['dash-ed', /letters, numbers/],
    ['émile', /letters, numbers/],
    ['has space', /letters, numbers/],
  ])('validateHandle(%j)', (input, expected) => {
    const r = validateHandle(input)
    if (expected === null) expect(r).toBeNull()
    else expect(r).toMatch(expected)
  })
})

describe('pairId', () => {
  it('is order-independent and sorted', () => {
    expect(pairId('b', 'a')).toBe('a_b')
    expect(pairId('a', 'b')).toBe('a_b')
  })
})

describe('invite links', () => {
  it('round-trips a handle', () => {
    const url = new URL(inviteUrl('https://starbook.web.app', 'sam_1'))
    expect(handleFromPath(url.pathname)).toBe('sam_1')
  })
  it.each([['/add/Sam/'], ['/add/%40sam']])('accepts %s', (p) => {
    expect(handleFromPath(p)).toBe('sam')
  })
  it.each([['/'], ['/add/'], ['/add/a'], ['/add/sam/extra'], ['/other/sam'], ['/add/bad-name']])('rejects %s', (p) => {
    expect(handleFromPath(p)).toBeNull()
  })
})
