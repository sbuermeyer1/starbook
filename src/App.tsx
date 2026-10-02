import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadDataset } from './data/restaurants'
import type { Dataset, Restaurant } from './data/restaurants'
import { activeFilterCount, applyFilters, cuisineCounts, DEFAULT_FILTERS } from './data/filters'
import { buildCities } from './data/search'
import { MapView } from './map/MapView'
import type { MapTarget } from './map/MapView'
import { SearchBar } from './components/SearchBar'
import { FilterSheet } from './components/FilterSheet'
import { RestaurantSheet } from './components/RestaurantSheet'

type LocateState = 'idle' | 'locating' | 'denied' | 'unavailable'

export default function App() {
  const [data, setData] = useState<Dataset | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [target, setTarget] = useState<MapTarget | null>(null)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [locate, setLocate] = useState<LocateState>('idle')

  useEffect(() => {
    loadDataset().then(setData, (e: Error) => setError(e.message))
  }, [])

  const all = useMemo(() => data?.restaurants ?? [], [data])
  const byId = useMemo(() => new Map(all.map((r) => [r.id, r])), [all])
  const cities = useMemo(() => buildCities(all), [all])
  const cuisines = useMemo(() => cuisineCounts(all), [all])
  const filtered = useMemo(() => applyFilters(all, filters), [all, filters])
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null

  // A restaurant picked from search stays on the map even if the filters exclude it.
  const visible = useMemo(
    () => (selected && !filtered.includes(selected) ? [...filtered, selected] : filtered),
    [filtered, selected],
  )

  const locateMe = useCallback((quiet = false) => {
    if (!('geolocation' in navigator)) return setLocate('unavailable')
    setLocate('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        setUserLocation(here)
        setTarget({ kind: 'point', lat: here[0], lng: here[1], zoom: 12 })
        setLocate('idle')
      },
      (err) => setLocate(quiet ? 'idle' : err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }, [])

  // Center on the user at startup only if they already granted location; never prompt unasked.
  useEffect(() => {
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((p) => p.state === 'granted' && locateMe(true))
      .catch(() => {})
  }, [locateMe])

  const openRestaurant = (r: Restaurant) => {
    setSelectedId(r.id)
    setFiltersOpen(false)
    setTarget({ kind: 'point', lat: r.lat, lng: r.lng, zoom: 15 })
  }

  const filterCount = activeFilterCount(filters)

  return (
    <div className="app">
      <MapView restaurants={visible} selectedId={selectedId} onSelect={setSelectedId} target={target} userLocation={userLocation} />

      <header className="topbar">
        <div className="brand" aria-label="Starbook">
          ★<span>Starbook</span>
        </div>
        <SearchBar
          cities={cities}
          restaurants={all}
          onCity={(c) => {
            setSelectedId(null)
            setTarget({ kind: 'bounds', bounds: c.bounds })
          }}
          onRestaurant={openRestaurant}
        />
      </header>

      <div className="fabs">
        <button className="fab" onClick={() => setFiltersOpen(true)} aria-label="Filters">
          ☰ Filters{filterCount > 0 && <span className="count">{filterCount}</span>}
        </button>
        <button className="fab" onClick={() => locateMe()} aria-label="Show my location" disabled={locate === 'locating'}>
          {locate === 'locating' ? '…' : '◎'}
        </button>
      </div>

      {(locate === 'denied' || locate === 'unavailable') && (
        <div className="toast" role="status" onClick={() => setLocate('idle')}>
          {locate === 'denied' ? 'Location is blocked. Search for a city instead.' : "Couldn't get your location. Search for a city instead."}
        </div>
      )}

      {!data && !error && <div className="toast">Loading restaurants…</div>}
      {error && <div className="toast error">{error}</div>}

      {filtersOpen && (
        <FilterSheet filters={filters} onChange={setFilters} cuisines={cuisines} shownCount={filtered.length} onClose={() => setFiltersOpen(false)} />
      )}
      {selected && !filtersOpen && <RestaurantSheet r={selected} onClose={() => setSelectedId(null)} />}
    </div>
  )
}
