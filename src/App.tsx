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
import { AccountButton } from './components/AccountButton'
import { useTracking } from './tracking/useTracking'
import { useAuth } from './auth/useAuth'
import { FriendsSheet } from './components/FriendsSheet'
import { StatsSheet } from './components/StatsSheet'
import { useFriends } from './friends/useFriends'
import { friendsWhoVisited } from './friends/activity'
import { handleFromPath } from './friends/model'

const INVITE_KEY = 'starbook:invite'

// An invite link (/add/sam) is remembered across the sign-in redirect, then the URL is tidied.
function takeInviteFromUrl(): string | null {
  const fromPath = handleFromPath(location.pathname)
  try {
    if (fromPath) {
      sessionStorage.setItem(INVITE_KEY, fromPath)
      history.replaceState(null, '', '/')
    }
    return sessionStorage.getItem(INVITE_KEY)
  } catch {
    return fromPath
  }
}

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
  const [invite, setInvite] = useState<string | null>(takeInviteFromUrl)
  const [friendsOpen, setFriendsOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const auth = useAuth()

  useEffect(() => {
    loadDataset().then(setData, (e: Error) => setError(e.message))
  }, [])

  const all = useMemo(() => data?.restaurants ?? [], [data])
  const byId = useMemo(() => new Map(all.map((r) => [r.id, r])), [all])
  const cities = useMemo(() => buildCities(all), [all])
  const cuisines = useMemo(() => cuisineCounts(all), [all])
  const { tracked, signedIn } = useTracking()
  const { activity, friends: friendList } = useFriends()
  const filtered = useMemo(() => applyFilters(all, filters, tracked, activity), [all, filters, tracked, activity])
  const friendCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const rid of activity.keys()) {
      const n = friendsWhoVisited(activity, rid).length
      if (n) m.set(rid, n)
    }
    return m
  }, [activity])
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
    setStatsOpen(false)
    closeFriends()
    setTarget({ kind: 'point', lat: r.lat, lng: r.lng, zoom: 15 })
  }

  const filterCount = activeFilterCount(filters)

  // Once signed in, an invite opens the Friends panel with that person looked up.
  const showInvite = invite !== null && auth.user !== null
  const openFriends = () => {
    setFiltersOpen(false)
    setStatsOpen(false)
    setSelectedId(null)
    setFriendsOpen(true)
  }
  const openStats = () => {
    setFiltersOpen(false)
    closeFriends()
    setSelectedId(null)
    setStatsOpen(true)
  }
  function closeFriends() {
    setFriendsOpen(false)
    setInvite(null)
    try {
      sessionStorage.removeItem(INVITE_KEY)
    } catch {
      // storage unavailable: nothing to clear
    }
  }

  return (
    <div className="app">
      <MapView restaurants={visible} tracked={tracked} friendCounts={friendCounts} selectedId={selectedId} onSelect={setSelectedId} target={target} userLocation={userLocation} />

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
        <AccountButton onOpenFriends={openFriends} onOpenStats={openStats} />
      </header>

      <div className="fabs">
        <button className="fab" onClick={() => {
            closeFriends()
            setStatsOpen(false)
            setFiltersOpen(true)
          }} aria-label="Filters">
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
        <FilterSheet filters={filters} onChange={setFilters} cuisines={cuisines} shownCount={filtered.length} onClose={() => setFiltersOpen(false)} signedIn={signedIn} friends={friendList} />
      )}
      {selected && !filtersOpen && !statsOpen && !(friendsOpen || showInvite) && <RestaurantSheet r={selected} onClose={() => setSelectedId(null)} />}
      {(friendsOpen || showInvite) && <FriendsSheet onClose={closeFriends} inviteHandle={invite} />}
      {statsOpen && <StatsSheet tracked={tracked} byId={byId} onOpenRestaurant={openRestaurant} onClose={() => setStatsOpen(false)} />}
      {invite && auth.ready && !auth.user && (
        <div className="toast invite-toast" role="status">
          Sign in to add @{invite} as a friend
          <button className="primary small" onClick={auth.signIn}>
            Sign in
          </button>
        </div>
      )}
    </div>
  )
}
