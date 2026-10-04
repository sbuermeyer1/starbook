import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { useLeaderboard } from './leaderboard/useLeaderboard'
import { startAnalytics, track, trackView } from './analytics/analytics'
import { viewFor } from './analytics/views'
import type { Panel } from './analytics/views'
import { ConsentBanner } from './components/ConsentBanner'
import { changedFilters } from './data/filters'
import { useFriends } from './friends/useFriends'
import { friendsWhoVisited } from './friends/activity'
import { handleFromPath } from './friends/model'
import { EMPTY_TRACKED, groupVisits } from './tracking/model'

const INVITE_KEY = 'starbook:invite'

// An invite link (/add/sam) is remembered across the sign-in redirect, then the URL is tidied.
function takeInviteFromUrl(): string | null {
  const fromPath = handleFromPath(location.pathname)
  try {
    if (fromPath) {
      track('invite_opened')
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
  const [friendStatsUid, setFriendStatsUid] = useState<string | null>(null)
  const auth = useAuth()

  useEffect(() => {
    loadDataset().then(
      (d) => {
        setData(d)
        startAnalytics() // after the map has its data
      },
      (e: Error) => setError(e.message),
    )
  }, [])

  const all = useMemo(() => data?.restaurants ?? [], [data])
  const byId = useMemo(() => new Map(all.map((r) => [r.id, r])), [all])
  const cities = useMemo(() => buildCities(all), [all])
  const cuisines = useMemo(() => cuisineCounts(all), [all])
  const { tracked, signedIn } = useTracking()
  const { activity, friends: friendList, friendLists } = useFriends()
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
  // A friend's stats, opened from the Friends list. Unfriending them closes it.
  const statsFriend = friendList.find((p) => p.uid === friendStatsUid) ?? null
  const friendLoaded = statsFriend ? friendLists.get(statsFriend.uid) : undefined
  const friendTracked = useMemo(
    () => (friendLoaded ? { entries: friendLoaded.entries, visits: groupVisits(friendLoaded.visits) } : null),
    [friendLoaded],
  )
  const board = useLeaderboard(byId)

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
        if (!quiet) track('locate_me', { result: 'granted' })
        setTarget({ kind: 'point', lat: here[0], lng: here[1], zoom: 12 })
        setLocate('idle')
      },
      (err) => {
        const result = err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'
        if (!quiet) track('locate_me', { result })
        setLocate(quiet ? 'idle' : result)
      },
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

  const openRestaurant = (r: Restaurant, source = 'search') => {
    track('select_restaurant', { award: r.award, source })
    setSelectedId(r.id)
    setFiltersOpen(false)
    setStatsOpen(false)
    closeFriends()
    setTarget({ kind: 'point', lat: r.lat, lng: r.lng, zoom: 15 })
  }

  const filterCount = activeFilterCount(filters)

  // One virtual page view each time a different panel (or restaurant) comes up.
  const showFriends = friendsOpen || (invite !== null && auth.user !== null)
  const panel: Panel = filtersOpen
    ? { kind: 'filters' }
    : showFriends
      ? statsFriend
        ? { kind: 'friendStats' }
        : { kind: 'friends' }
      : statsOpen
        ? { kind: 'stats' }
        : selected
          ? { kind: 'restaurant', restaurant: selected }
          : null
  const view = viewFor(panel)
  // A restaurant counts once per opening: its panel reappearing after Filters closes is
  // the same view. Deselecting it ends the opening.
  const countedRestaurant = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedId) countedRestaurant.current = null
    if (!view) return
    if (panel?.kind === 'restaurant') {
      if (countedRestaurant.current === panel.restaurant.id) return
      countedRestaurant.current = panel.restaurant.id
    }
    trackView(view.path, view.title)
  }, [view?.path, selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Once signed in, an invite opens the Friends panel with that person looked up.
  const showInvite = invite !== null && auth.user !== null
  const openFriends = () => {
    setFiltersOpen(false)
    setStatsOpen(false)
    setSelectedId(null)
    setFriendsOpen(true)
  }
  const openStats = () => {
    track('stats_open')
    setFiltersOpen(false)
    closeFriends()
    setSelectedId(null)
    setStatsOpen(true)
  }
  function closeFriends() {
    setFriendsOpen(false)
    setFriendStatsUid(null)
    setInvite(null)
    try {
      sessionStorage.removeItem(INVITE_KEY)
    } catch {
      // storage unavailable: nothing to clear
    }
  }

  return (
    <div className="app">
      <MapView restaurants={visible} tracked={tracked} friendCounts={friendCounts} selectedId={selectedId} onSelect={(id) => {
          if (id) track('select_restaurant', { award: byId.get(id)?.award ?? 'unknown', source: 'map' })
          setSelectedId(id)
        }} target={target} userLocation={userLocation} />

      <header className="topbar">
        <div className="brand" aria-label="Starbook">
          ★<span>Starbook</span>
        </div>
        <SearchBar
          cities={cities}
          restaurants={all}
          onCity={(c) => {
            setSelectedId(null)
            track('search', { result_type: 'city' })
            setTarget({ kind: 'bounds', bounds: c.bounds })
          }}
          onRestaurant={(r) => {
            track('search', { result_type: 'restaurant' })
            openRestaurant(r, 'search')
          }}
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
      <ConsentBanner />

      {filtersOpen && (
        <FilterSheet filters={filters} onChange={(next) => {
          for (const name of changedFilters(filters, next)) track('filter_change', { filter: name })
          setFilters(next)
        }} cuisines={cuisines} shownCount={filtered.length} onClose={() => setFiltersOpen(false)} signedIn={signedIn} friends={friendList} />
      )}
      {selected && !filtersOpen && !statsOpen && !(friendsOpen || showInvite) && <RestaurantSheet r={selected} onClose={() => setSelectedId(null)} />}
      {(friendsOpen || showInvite) &&
        (statsFriend ? (
          <StatsSheet
            key={statsFriend.uid}
            friend={statsFriend}
            loading={!friendTracked}
            tracked={friendTracked ?? EMPTY_TRACKED}
            all={all}
            byId={byId}
            onBack={() => setFriendStatsUid(null)}
            onOpenRestaurant={(r) => openRestaurant(r, 'friend_stats')}
            onClose={closeFriends}
          />
        ) : (
          <FriendsSheet onClose={closeFriends} onOpenFriend={setFriendStatsUid} inviteHandle={invite} />
        ))}
      {statsOpen && <StatsSheet tracked={tracked} all={all} byId={byId} board={board} onOpenRestaurant={(r) => openRestaurant(r, 'stats')} onClose={() => setStatsOpen(false)} />}
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
