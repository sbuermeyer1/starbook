import { useMemo, useState } from 'react'
import { AWARD_LABEL } from '../data/restaurants'
import type { Award, Restaurant } from '../data/restaurants'
import type { Tracked } from '../tracking/model'
import { favorites, places, summarize, topRated, visitsByYear } from '../stats/stats'
import { AwardBadge } from './AwardBadge'
import { Stars } from './Stars'

interface Props {
  tracked: Tracked
  byId: Map<string, Restaurant>
  onOpenRestaurant: (r: Restaurant) => void
  onClose: () => void
}

const TILES: Award[] = ['3', '2', '1', 'bib', 'selected']
const PLACES_COLLAPSED = 5

export function StatsSheet({ tracked, byId, onOpenRestaurant, onClose }: Props) {
  const s = useMemo(() => summarize(tracked.visits, byId), [tracked, byId])
  const p = useMemo(() => places(tracked.visits, byId), [tracked, byId])
  const years = useMemo(() => visitsByYear(tracked.visits), [tracked])
  const top = useMemo(() => topRated(tracked.visits, byId), [tracked, byId])
  const favs = useMemo(() => favorites(tracked, byId), [tracked, byId])
  const [allCountries, setAllCountries] = useState(false)
  const [allCities, setAllCities] = useState(false)
  const maxYear = Math.max(1, ...years.years.map(([, c]) => c))

  return (
    <div className="sheet stats" role="dialog" aria-label="My stats">
      <div className="sheet-head">
        <h2>My stats</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close stats">
          ✕
        </button>
      </div>

      {s.restaurants === 0 ? (
        <p className="hint">Log a visit from any restaurant's panel and your stats will appear here.</p>
      ) : (
        <>
          <div className="stars-total">
            <span className="big">★ {s.stars}</span>
            <span className="muted">
              stars collected · {s.restaurants} restaurant{s.restaurants === 1 ? '' : 's'} · {s.visits} visit{s.visits === 1 ? '' : 's'}
            </span>
          </div>

          <div className="tiles">
            {TILES.map((a) => (
              <div key={a} className="tile">
                <AwardBadge award={a} />
                <strong>{s.byAward[a]}</strong>
                <small>{AWARD_LABEL[a]}</small>
              </div>
            ))}
            <div className="tile">
              <span className="badge badge-green">Green</span>
              <strong>{s.green}</strong>
              <small>Green Star</small>
            </div>
          </div>
          <p className="hint">Each restaurant counts once, at the best award it had when you logged it.</p>

          <section>
            <h3>
              {s.countries} countr{s.countries === 1 ? 'y' : 'ies'}, {s.cities} cit{s.cities === 1 ? 'y' : 'ies'}
            </h3>
            <PlaceList items={p.countries} all={allCountries} onToggle={() => setAllCountries(!allCountries)} />
            <PlaceList items={p.cities} all={allCities} onToggle={() => setAllCities(!allCities)} />
          </section>

          {years.years.length > 0 && (
            <section>
              <h3>Visits by year</h3>
              <ul className="bars">
                {years.years.map(([y, c]) => (
                  <li key={y}>
                    <span>{y}</span>
                    <span className="bar" style={{ width: `${(100 * c) / maxYear}%` }} />
                    <span className="muted">{c}</span>
                  </li>
                ))}
              </ul>
              {years.undated > 0 && <p className="hint">Plus {years.undated} without a date.</p>}
            </section>
          )}

          {top.length > 0 && (
            <section>
              <h3>Top rated</h3>
              <RestaurantList items={top.map((t) => t.restaurant)} extra={(r) => <Stars value={top.find((t) => t.restaurant === r)!.rating} />} onOpen={onOpenRestaurant} />
            </section>
          )}
        </>
      )}

      {favs.length > 0 && (
        <section>
          <h3>Favorites</h3>
          <RestaurantList items={favs} onOpen={onOpenRestaurant} />
        </section>
      )}
    </div>
  )
}

function PlaceList({ items, all, onToggle }: { items: { key: string; label: string; restaurants: number }[]; all: boolean; onToggle: () => void }) {
  const shown = all ? items : items.slice(0, PLACES_COLLAPSED)
  return (
    <>
      <ul className="place-list">
        {shown.map((x) => (
          <li key={x.key}>
            <span>{x.label}</span>
            <span className="muted">{x.restaurants}</span>
          </li>
        ))}
      </ul>
      {items.length > PLACES_COLLAPSED && (
        <button className="link" onClick={onToggle}>
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </>
  )
}

function RestaurantList({ items, extra, onOpen }: { items: Restaurant[]; extra?: (r: Restaurant) => React.ReactNode; onOpen: (r: Restaurant) => void }) {
  return (
    <ul className="restaurant-list">
      {items.map((r) => (
        <li key={r.id}>
          <button onClick={() => onOpen(r)}>
            <AwardBadge award={r.award} />
            <span className="result-main">
              {r.name}
              <small>
                {r.city}, {r.country}
              </small>
            </span>
            {extra?.(r)}
          </button>
        </li>
      ))}
    </ul>
  )
}
