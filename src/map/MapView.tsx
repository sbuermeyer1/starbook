import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { CircleMarker, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { buildIndex, itemsInView } from './clusters'
import type { MapItem } from './clusters'
import { AWARD_RANK } from '../data/restaurants'
import type { Award, Restaurant } from '../data/restaurants'

export type MapTarget =
  | { kind: 'point'; lat: number; lng: number; zoom: number }
  | { kind: 'bounds'; bounds: [[number, number], [number, number]] }

interface Props {
  restaurants: Restaurant[] // already filtered
  selectedId: string | null
  onSelect: (id: string | null) => void
  target: MapTarget | null
  userLocation: [number, number] | null
}

const WORLD_VIEW = { center: [30, 10] as [number, number], zoom: 2 }

const PIN_TEXT: Record<Award, string> = { '3': '3★', '2': '2★', '1': '★', bib: 'B', selected: '' }

const iconCache = new Map<string, L.DivIcon>()
function cachedIcon(key: string, make: () => L.DivIcon) {
  let icon = iconCache.get(key)
  if (!icon) iconCache.set(key, (icon = make()))
  return icon
}

function pinIcon(r: Restaurant, selected: boolean) {
  return cachedIcon(`p:${r.award}:${r.green}:${r.inGuide}:${selected}`, () => {
    const size = r.award === 'selected' ? 14 : 26
    const cls = ['pin', `pin-${r.award}`, r.green && 'pin-green', !r.inGuide && 'pin-retired', selected && 'is-selected'].filter(Boolean).join(' ')
    return L.divIcon({
      className: '',
      html: `<div class="${cls}">${PIN_TEXT[r.award]}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    })
  })
}

function clusterIcon(count: number, best: Award) {
  const size = count < 10 ? 30 : count < 100 ? 36 : count < 1000 ? 44 : 52
  const label = count < 1000 ? String(count) : `${(count / 1000).toFixed(count < 10000 ? 1 : 0)}k`
  return cachedIcon(`c:${label}:${best}:${size}`, () =>
    L.divIcon({
      className: '',
      html: `<div class="cluster cluster-${best}" style="width:${size}px;height:${size}px">${label}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    }),
  )
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function readView(map: L.Map) {
  const b = map.getBounds()
  // Leaflet bounds run past ±180 when the world wraps; supercluster wants a clamped box.
  const wide = b.getEast() - b.getWest() >= 360
  const bbox: [number, number, number, number] = [
    wide ? -180 : clamp(b.getWest(), -180, 180),
    clamp(b.getSouth(), -85, 85),
    wide ? 180 : clamp(b.getEast(), -180, 180),
    clamp(b.getNorth(), -85, 85),
  ]
  return { bbox, zoom: map.getZoom() }
}

function Pins({ restaurants, selectedId, onSelect }: Pick<Props, 'restaurants' | 'selectedId' | 'onSelect'>) {
  const map = useMap()
  const index = useMemo(() => buildIndex(restaurants), [restaurants])
  const byId = useMemo(() => new Map(restaurants.map((r) => [r.id, r])), [restaurants])
  const [view, setView] = useState(() => readView(map))
  useMapEvents({ moveend: () => setView(readView(map)), click: () => onSelect(null) })
  // Derived from both, so a filter change re-clusters without waiting for a pan.
  const items: MapItem[] = useMemo(() => itemsInView(index, view.bbox, view.zoom), [index, view])

  return items.map((it) => {
    if (it.kind === 'cluster') {
      return (
        <Marker
          key={`c${it.id}`}
          position={[it.lat, it.lng]}
          icon={clusterIcon(it.count, it.best)}
          eventHandlers={{ click: () => map.flyTo([it.lat, it.lng], Math.min(index.getClusterExpansionZoom(it.id), 18), { duration: 0.5 }) }}
        />
      )
    }
    const r = byId.get(it.id)!
    const selected = r.id === selectedId
    return (
      <Marker
        key={r.id}
        position={[r.lat, r.lng]}
        icon={pinIcon(r, selected)}
        zIndexOffset={selected ? 1000 : -100 * AWARD_RANK[r.award]}
        title={r.name}
        eventHandlers={{ click: () => onSelect(r.id) }}
      />
    )
  })
}

function FlyTo({ target }: { target: MapTarget | null }) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    if (target.kind === 'point') map.flyTo([target.lat, target.lng], target.zoom, { duration: 0.8 })
    else map.flyToBounds(target.bounds, { padding: [40, 40], maxZoom: 15, duration: 0.8 })
  }, [map, target])
  return null
}

export function MapView({ restaurants, selectedId, onSelect, target, userLocation }: Props) {
  return (
    <MapContainer
      center={WORLD_VIEW.center}
      zoom={WORLD_VIEW.zoom}
      minZoom={2}
      worldCopyJump
      zoomControl={false}
      className="map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <Pins restaurants={restaurants} selectedId={selectedId} onSelect={onSelect} />
      {userLocation && (
        <CircleMarker center={userLocation} radius={7} pathOptions={{ color: '#fff', weight: 2, fillColor: '#2a7de1', fillOpacity: 1 }} />
      )}
      <FlyTo target={target} />
    </MapContainer>
  )
}
