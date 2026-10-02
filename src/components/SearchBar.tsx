import { useDeferredValue, useMemo, useState } from 'react'
import { search } from '../data/search'
import type { City } from '../data/search'
import type { Restaurant } from '../data/restaurants'
import { AwardBadge } from './AwardBadge'

interface Props {
  cities: City[]
  restaurants: Restaurant[]
  onCity: (c: City) => void
  onRestaurant: (r: Restaurant) => void
}

export function SearchBar({ cities, restaurants, onCity, onRestaurant }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const deferred = useDeferredValue(query)
  const results = useMemo(() => search(deferred, cities, restaurants), [deferred, cities, restaurants])
  const empty = results.cities.length === 0 && results.restaurants.length === 0

  const pick = (fn: () => void) => {
    fn()
    setOpen(false)
    setQuery('')
    ;(document.activeElement as HTMLElement | null)?.blur()
  }

  return (
    <div className="search">
      <input
        type="search"
        placeholder="Search a city or restaurant"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
          if (e.key === 'Enter') {
            // Search the typed text now: the deferred results may still be for an older query.
            const fresh = search(e.currentTarget.value, cities, restaurants)
            const city = fresh.cities[0]
            const restaurant = fresh.restaurants[0]
            if (city) pick(() => onCity(city))
            else if (restaurant) pick(() => onRestaurant(restaurant))
          }
        }}
        aria-label="Search a city or restaurant"
      />
      {open && query.trim().length >= 2 && (
        <ul className="search-results" role="listbox">
          {empty && <li className="search-empty">No matches</li>}
          {results.cities.map((c) => (
            <li key={c.key}>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => pick(() => onCity(c))}>
                <span className="result-icon" aria-hidden>
                  ⌖
                </span>
                <span className="result-main">{c.label}</span>
                <span className="result-meta">{c.count}</span>
              </button>
            </li>
          ))}
          {results.restaurants.map((r) => (
            <li key={r.id}>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => pick(() => onRestaurant(r))}>
                <AwardBadge award={r.award} />
                <span className="result-main">
                  {r.name}
                  <small>
                    {r.city}, {r.country}
                    {!r.inGuide && ' · no longer in guide'}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
