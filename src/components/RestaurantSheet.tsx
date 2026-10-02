import { directionsUrl, guideUrl, priceLabel } from '../data/restaurants'
import type { Restaurant } from '../data/restaurants'
import { AwardBadge } from './AwardBadge'
import { TrackingPanel } from './TrackingPanel'

export function RestaurantSheet({ r, onClose }: { r: Restaurant; onClose: () => void }) {
  const price = priceLabel(r)
  return (
    <div className="sheet restaurant" role="dialog" aria-label={r.name}>
      <div className="sheet-head">
        <div>
          <h2>{r.name}</h2>
          <div className="meta">
            <AwardBadge award={r.award} long />
            {r.green && <span className="badge badge-green">Green Star</span>}
            {!r.inGuide && <span className="badge badge-retired">No longer in guide</span>}
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <p className="line">
        {[r.cuisine, price].filter(Boolean).join(' · ')}
      </p>
      <p className="line muted">{r.address}</p>

      <div className="actions">
        <a className="action" href={directionsUrl(r)} target="_blank" rel="noreferrer">
          Directions
        </a>
        {r.website && (
          <a className="action" href={r.website} target="_blank" rel="noreferrer">
            Website
          </a>
        )}
        {r.phone && (
          <a className="action" href={`tel:${r.phone.replace(/\s/g, '')}`}>
            Call
          </a>
        )}
        <a className="action" href={guideUrl(r)} target="_blank" rel="noreferrer">
          Guide page
        </a>
      </div>

      <TrackingPanel r={r} />
    </div>
  )
}
