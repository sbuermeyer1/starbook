import Supercluster from 'supercluster'
import { AWARD_RANK, AWARDS } from '../data/restaurants'
import type { Award, Restaurant } from '../data/restaurants'

interface PointProps {
  id: string
  rank: number
}
interface ClusterProps {
  best: number // lowest award rank inside the cluster
}

export type ClusterIndex = Supercluster<PointProps, ClusterProps>

export type MapItem =
  | { kind: 'cluster'; id: number; lat: number; lng: number; count: number; best: Award }
  | { kind: 'point'; id: string; lat: number; lng: number }

export function buildIndex(rs: Restaurant[]): ClusterIndex {
  const index = new Supercluster<PointProps, ClusterProps>({
    radius: 60,
    maxZoom: 13, // past this, every restaurant is its own pin
    map: (p) => ({ best: p.rank }),
    reduce: (acc, p) => {
      acc.best = Math.min(acc.best, p.best)
    },
  })
  index.load(
    rs.map((r) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
      properties: { id: r.id, rank: AWARD_RANK[r.award] },
    })),
  )
  return index
}

export function itemsInView(index: ClusterIndex, bbox: [number, number, number, number], zoom: number): MapItem[] {
  return index.getClusters(bbox, Math.round(zoom)).map((f) => {
    const [lng, lat] = f.geometry.coordinates
    const p = f.properties
    if ('cluster' in p && p.cluster) return { kind: 'cluster', id: p.cluster_id, lat, lng, count: p.point_count, best: AWARDS[p.best] }
    return { kind: 'point', id: (p as PointProps).id, lat, lng }
  })
}
