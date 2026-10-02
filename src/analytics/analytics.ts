// Usage analytics (Google Analytics 4 via Firebase), with Consent Mode.
//
// - Until the visitor chooses, consent is "denied": GA receives cookieless pings only,
//   which it uses for modelled totals and which identify no one.
// - "Allow" grants analytics_storage; ad storage is always denied.
// - Never sent: notes, names, usernames, emails, precise location.
// - Off during local development, unless the URL has ?ga_debug=1. Check those events in
//   GA's Realtime report, not DebugView: Firebase sends debug_mode as a plain event
//   parameter (ep.debug_mode), never as the _dbg flag DebugView requires (measured
//   2026-10-02; a raw _dbg=1 hit did show in DebugView).
//
// track() can be called at any time; events queue until analytics has loaded.

export type Consent = 'granted' | 'denied'
type Params = Record<string, string | number | boolean>

const CONSENT_KEY = 'starbook:analytics-consent'

export function storedConsent(): Consent | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY)
    return v === 'granted' || v === 'denied' ? v : null
  } catch {
    return null
  }
}

const debug = (() => {
  try {
    return new URLSearchParams(location.search).has('ga_debug')
  } catch {
    return false
  }
})()

// Real visitors only: not the dev server, not the emulator build, not localhost previews.
export const analyticsEnabled =
  debug || (!import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS !== '1' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname))

type Sender = {
  event: (name: string, params: Params) => void
  userProps: (props: Params) => void
  consent: (c: Consent) => void
}

let sender: Sender | null = null
let loading = false
const queue: ((s: Sender) => void)[] = []

function withSender(fn: (s: Sender) => void) {
  if (!analyticsEnabled) return
  if (sender) return fn(sender)
  queue.push(fn)
  if (!loading) {
    loading = true
    load().catch((e) => console.warn('analytics unavailable', e))
  }
}

const consentState = (c: Consent | null) => ({
  analytics_storage: (c === 'granted' ? 'granted' : 'denied') as 'granted' | 'denied',
  ad_storage: 'denied' as const,
  ad_user_data: 'denied' as const,
  ad_personalization: 'denied' as const,
})

async function load() {
  const [{ app }, a] = await Promise.all([import('../firebase/app'), import('firebase/analytics')])
  if (!(await a.isSupported())) return
  // Consent must be set before Analytics initializes.
  a.setConsent(consentState(storedConsent()))
  const ga = a.initializeAnalytics(app, { config: { send_page_view: true } })
  sender = {
    event: (name, params) => a.logEvent(ga, name, params),
    userProps: (props) => a.setUserProperties(ga, props),
    consent: (c) => a.setConsent(consentState(c)),
  }
  for (const fn of queue.splice(0)) fn(sender)
}

export function track(name: string, params: Params = {}) {
  withSender((s) => s.event(name, params))
}

export function setUserProps(props: Params) {
  withSender((s) => s.userProps(props))
}

export function setConsent(c: Consent) {
  try {
    localStorage.setItem(CONSENT_KEY, c)
  } catch {
    // storage blocked: the choice applies to this visit only
  }
  withSender((s) => s.consent(c))
}

// Starts analytics (cookieless until consent) once the map is up.
export const startAnalytics = () => withSender(() => {})
