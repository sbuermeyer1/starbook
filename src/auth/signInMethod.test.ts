import { describe, expect, it } from 'vitest'
import { signInMethod } from './signInMethod'

const ua = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Mobile Safari/537.36',
  ipadOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
}

describe('signInMethod', () => {
  it.each([
    ['iPhone Safari', ua.iphoneSafari, 5],
    ['iPhone Chrome', ua.iphoneChrome, 5],
    ['Android Chrome', ua.android, 5],
    ['iPad (reports as a Mac, has touch)', ua.ipadOS, 5],
  ])('redirects on %s', (_, userAgent, maxTouchPoints) => {
    expect(signInMethod({ userAgent, maxTouchPoints, standalone: false })).toBe('redirect')
  })

  it.each([
    ['Mac Safari', ua.macSafari],
    ['Windows Chrome', ua.windowsChrome],
  ])('keeps the popup on %s', (_, userAgent) => {
    expect(signInMethod({ userAgent, maxTouchPoints: 0, standalone: false })).toBe('popup')
  })

  it('redirects from a home-screen app on any device', () => {
    expect(signInMethod({ userAgent: ua.windowsChrome, maxTouchPoints: 0, standalone: true })).toBe('redirect')
  })
})
