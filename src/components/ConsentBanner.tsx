import { useEffect, useState } from 'react'
import { analyticsEnabled, setConsent, storedConsent } from '../analytics/analytics'

// Asks once; the "Privacy" link by the map attribution (#privacy) reopens it.
export function ConsentBanner() {
  const [open, setOpen] = useState(() => analyticsEnabled && storedConsent() === null)

  useEffect(() => {
    const onHash = () => {
      if (location.hash === '#privacy') {
        setOpen(true)
        history.replaceState(null, '', location.pathname + location.search)
      }
    }
    window.addEventListener('hashchange', onHash)
    onHash()
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (!open) return null
  const current = storedConsent()
  const choose = (c: 'granted' | 'denied') => {
    setConsent(c)
    setOpen(false)
  }

  return (
    <div className="consent" role="dialog" aria-label="Usage statistics">
      <p>
        Starbook uses Google Analytics to count visits and see which features get used. It never sends your notes, name or
        location.
        {current && <> You currently {current === 'granted' ? 'allow' : "don't allow"} usage stats.</>}
      </p>
      <div className="consent-actions">
        <button className="secondary small" onClick={() => choose('denied')}>
          No thanks
        </button>
        <button className="primary small" onClick={() => choose('granted')}>
          Allow
        </button>
      </div>
    </div>
  )
}
