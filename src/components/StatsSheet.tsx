import { useMemo, useState } from 'react'
import { AWARD_LABEL } from '../data/restaurants'
import type { Award, Restaurant } from '../data/restaurants'
import type { Tracked } from '../tracking/model'
import { favorites, places, summarize, topRated, visitsByYear } from '../stats/stats'
import { AwardBadge } from './AwardBadge'
import { Stars } from './Stars'
import { LeaderboardSection } from './LeaderboardSection'
import { GoalsSection } from './GoalsSection'
import type { LeaderboardState } from '../leaderboard/useLeaderboard'
import type { Profile } from '../friends/model'
import { Avatar } from './FriendsSheet'

interface Props {
  tracked: Tracked
  all: Restaurant[]
  byId: Map<string, Restaurant>
  board?: LeaderboardState // your own stats only
  // Set when showing a friend's stats: no goals or leaderboard (those are yours), and a
  // back button to the Friends list.
  friend?: Profile
  onBack?: () => void
  loading?: boolean // a friend's lists haven't arrived yet
  onOpenRestaurant: (r: Restaurant) => void
  onClose: () => void
}

const TILES: Award[] = ['3', '2', '1', 'bib', 'selected']
const PLACES_COLLAPSED = 5

export function StatsSheet({ tracked, all, byId, board, friend, onBack, loading, onOpenRestaurant, onClose }: Props) {
  const s = useMemo(() => summarize(tracked.visits, byId), [tracked, byId])
  const p = useMemo(() => places(tracked.visits, byId), [tracked, byId])
  const years = useMemo(() => visitsByYear(tracked.visits), [tracked])
  const top = useMemo(() => topRated(tracked.visits, byId), [tracked, byId])
  const favs = useMemo(() => favorites(tracked, byId), [tracked, byId])
  const [allCountries, setAllCountries] = useState(false)
  const [allCities, setAllCities] = useState(false)
  const maxYear = Math.max(1, ...years.years.map(([, c]) => c))
  const title = friend ? friend.displayName || (friend.username ? `@${friend.username}` : 'Friend') : 'My stats'

  return (
    <div className="sheet stats" role="dialog" aria-label={friend ? `${title}'s stats` : 'My stats'}>
      <div className="sheet-head">
        {onBack && (
          <button className="icon-btn back-btn" onClick={onBack} aria-label="Back to friends">
            ‹
          </button>
        )}
        {friend ? (
          <h2 className="person-title">
            <Avatar p={friend} size={32} />
            <span className="person-name">
              {title}
              {friend.username && <small>@{friend.username}</small>}
            </span>
          </h2>
        ) : (
          <h2>My stats</h2>
        )}
        <button className="icon-btn" onClick={onClose} aria-label="Close stats">
          ✕
        </button>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : s.restaurants === 0 ? (
        <p className="hint">{friend ? `${title} hasn't logged any visits yet.` : "Log a visit from any restaurant's panel and your stats will appear here."}</p>
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
          <p className="hint">Each restaurant counts once, at the best award it had when {friend ? 'it was' : 'you'} logged{friend ? '' : ' it'}.</p>
        </>
      )}

      {!friend && <GoalsSection all={all} byId={byId} tracked={tracked} onOpenRestaurant={onOpenRestaurant} />}

      {s.restaurants > 0 && (
        <>
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

      {board && !friend && <LeaderboardSection board={board} byId={byId} />}

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
