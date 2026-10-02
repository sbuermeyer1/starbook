// Popup sign-in on phones opens Google in a separate window that often can't hand the
// result back (iOS especially, and always from a home-screen app): the app waits, then
// gives up. A full-page redirect works everywhere there, because sign-in runs on our own
// domain (authDomain = the hosting origin). Desktops keep the popup, which doesn't
// reload the page.

export interface DeviceHints {
  userAgent: string
  maxTouchPoints: number
  standalone: boolean // launched from the home screen
}

export function signInMethod(d: DeviceHints): 'popup' | 'redirect' {
  if (d.standalone) return 'redirect'
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(d.userAgent)) return 'redirect'
  // iPadOS reports itself as a Mac; touch support gives it away.
  if (/Macintosh/.test(d.userAgent) && d.maxTouchPoints > 1) return 'redirect'
  return 'popup'
}

export const currentDevice = (): DeviceHints => ({
  userAgent: navigator.userAgent,
  maxTouchPoints: navigator.maxTouchPoints ?? 0,
  standalone:
    // Emulator-only switch so a desktop browser can exercise the phone (redirect) flow.
    (import.meta.env.VITE_USE_EMULATORS === '1' && localStorage.getItem('starbook:force-redirect') === '1') ||
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true,
})
