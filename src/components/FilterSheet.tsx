import { useMemo, useState } from 'react'
import { AWARD_LABEL, AWARDS } from '../data/restaurants'
import { DEFAULT_FILTERS } from '../data/filters'
import type { Filters } from '../data/filters'
import { fold } from '../data/search'
import type { Status } from '../tracking/model'

const STATUS_LABEL: [Status, string][] = [
  ['visited', 'Visited'],
  ['want', 'Want to go'],
  ['favorite', 'Favorites'],
  ['notVisited', 'Not visited yet'],
]

interface Props {
  filters: Filters
  onChange: (f: Filters) => void
  cuisines: [string, number][]
  shownCount: number
  onClose: () => void
  signedIn: boolean
}

const toggle = <T,>(set: Set<T>, v: T) => {
  const next = new Set(set)
  if (next.has(v)) next.delete(v)
  else next.add(v)
  return next
}

const CUISINES_COLLAPSED = 12

export function FilterSheet({ filters, onChange, cuisines, shownCount, onClose, signedIn }: Props) {
  const [cuisineQuery, setCuisineQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })

  const cuisineList = useMemo(() => {
    const q = fold(cuisineQuery.trim())
    const list = q ? cuisines.filter(([c]) => fold(c).includes(q)) : cuisines
    // Keep chosen cuisines visible even when collapsed.
    if (q || showAll) return list
    const top = list.slice(0, CUISINES_COLLAPSED)
    const chosen = list.filter(([c]) => filters.cuisines.has(c) && !top.some(([t]) => t === c))
    return [...chosen, ...top]
  }, [cuisines, cuisineQuery, showAll, filters.cuisines])

  return (
    <div className="sheet" role="dialog" aria-label="Filters">
      <div className="sheet-head">
        <h2>Filters</h2>
        <button className="link" onClick={() => onChange(DEFAULT_FILTERS)}>
          Reset
        </button>
        <button className="icon-btn" onClick={onClose} aria-label="Close filters">
          ✕
        </button>
      </div>

      {signedIn && (
        <section>
          <h3>My list</h3>
          <div className="chips">
            {STATUS_LABEL.map(([s, label]) => (
              <button key={s} className="chip" aria-pressed={filters.statuses.has(s)} onClick={() => set({ statuses: toggle(filters.statuses, s) })}>
                {label}
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3>Distinction</h3>
        <div className="chips">
          {AWARDS.map((a) => (
            <button key={a} className={`chip chip-${a}`} aria-pressed={filters.awards.has(a)} onClick={() => set({ awards: toggle(filters.awards, a) })}>
              {AWARD_LABEL[a]}
            </button>
          ))}
          <button className="chip chip-green" aria-pressed={filters.greenOnly} onClick={() => set({ greenOnly: !filters.greenOnly })}>
            Green Star only
          </button>
        </div>
      </section>

      <section>
        <h3>Price</h3>
        <div className="chips">
          {[1, 2, 3, 4].map((p) => (
            <button key={p} className="chip" aria-pressed={filters.prices.has(p)} onClick={() => set({ prices: toggle(filters.prices, p) })}>
              {'$'.repeat(p)}
            </button>
          ))}
        </div>
        <p className="hint">Price level in local currency. Any level when none are chosen.</p>
      </section>

      <section>
        <h3>
          Cuisine
          {filters.cuisines.size > 0 && (
            <button className="link" onClick={() => set({ cuisines: new Set() })}>
              Clear ({filters.cuisines.size})
            </button>
          )}
        </h3>
        <input type="search" placeholder="Find a cuisine" value={cuisineQuery} onChange={(e) => setCuisineQuery(e.target.value)} aria-label="Find a cuisine" />
        <div className="chips">
          {cuisineList.map(([c, n]) => (
            <button key={c} className="chip" aria-pressed={filters.cuisines.has(c)} onClick={() => set({ cuisines: toggle(filters.cuisines, c) })}>
              {c} <small>{n}</small>
            </button>
          ))}
        </div>
        {!cuisineQuery && cuisines.length > CUISINES_COLLAPSED && (
          <button className="link" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show fewer' : `Show all ${cuisines.length}`}
          </button>
        )}
      </section>

      <section>
        <label className="check">
          <input type="checkbox" checked={filters.includeRetired} onChange={(e) => set({ includeRetired: e.target.checked })} />
          Include restaurants no longer in the guide
        </label>
      </section>

      <button className="primary" onClick={onClose}>
        Show {shownCount.toLocaleString()} restaurants
      </button>
    </div>
  )
}
