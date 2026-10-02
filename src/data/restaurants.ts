export type Award = '3' | '2' | '1' | 'bib' | 'selected'

export const AWARDS: Award[] = ['3', '2', '1', 'bib', 'selected']

export const AWARD_LABEL: Record<Award, string> = {
  '3': 'Three Stars',
  '2': 'Two Stars',
  '1': 'One Star',
  bib: 'Bib Gourmand',
  selected: 'Selected',
}

// Lower is better; used to order results and to color a cluster by its best member.
export const AWARD_RANK: Record<Award, number> = { '3': 0, '2': 1, '1': 2, bib: 3, selected: 4 }

export interface Restaurant {
  id: string
  path: string
  name: string
  address: string
  city: string
  country: string
  lat: number
  lng: number
  award: Award
  green: boolean
  price: number | null
  currency: string | null
  cuisine: string
  website: string | null
  phone: string | null
  inGuide: boolean
}

export interface Dataset {
  snapshot: string
  restaurants: Restaurant[]
}

const REQUIRED: (keyof Restaurant)[] = [
  'id', 'path', 'name', 'address', 'city', 'country', 'lat', 'lng', 'award',
  'green', 'price', 'currency', 'cuisine', 'website', 'phone', 'inGuide',
]

// The payload is array-of-arrays keyed by its own `fields` list, so the client
// follows whatever column order the pipeline wrote.
export function decodePayload(payload: { snapshot: string; fields: string[]; rows: unknown[][] }): Dataset {
  const index = new Map(payload.fields.map((f, i) => [f, i]))
  const missing = REQUIRED.filter((f) => !index.has(f))
  if (missing.length) throw new Error(`restaurant data is missing fields: ${missing.join(', ')}`)
  const restaurants = payload.rows.map((row) => {
    const r = {} as Record<string, unknown>
    for (const f of REQUIRED) r[f] = row[index.get(f)!]
    return r as unknown as Restaurant
  })
  return { snapshot: payload.snapshot, restaurants }
}

export async function loadDataset(url = '/data/restaurants.json'): Promise<Dataset> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`could not load restaurants (HTTP ${res.status})`)
  return decodePayload(await res.json())
}

export const guideUrl = (r: Pick<Restaurant, 'path'>) =>
  `https://guide.michelin.com/en/${r.path.split('/').map(encodeURIComponent).join('/')}`

export const directionsUrl = (r: Pick<Restaurant, 'lat' | 'lng'>) =>
  `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`

export const priceLabel = (r: Pick<Restaurant, 'price' | 'currency'>) =>
  r.price && r.currency ? r.currency.repeat(r.price) : null
