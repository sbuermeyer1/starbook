export interface Profile {
  uid: string
  displayName: string
  photoURL: string | null
  username: string | null
}

export interface FriendRequest {
  from: string
  to: string
}

// Mirrors isHandle() in firestore.rules.
export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/

// Accepts "@Sam", " sam " etc. and returns the stored form.
export const normalizeHandle = (s: string) => s.trim().replace(/^@/, '').toLowerCase()

export function validateHandle(input: string): string | null {
  const h = normalizeHandle(input)
  if (h.length < 3) return 'At least 3 characters.'
  if (h.length > 20) return 'At most 20 characters.'
  if (!HANDLE_PATTERN.test(h)) return 'Use letters, numbers and _ only.'
  return null
}

// Friendship document ID: the two uids in sorted order (mirrors pairId() in the rules).
export const pairId = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`)

export const inviteUrl = (origin: string, handle: string) => `${origin}/add/${handle}`

// The handle in an invite link path ("/add/sam"), or null.
export function handleFromPath(pathname: string): string | null {
  const m = /^\/add\/([^/]+)\/?$/.exec(pathname)
  if (!m) return null
  const h = normalizeHandle(decodeURIComponent(m[1]))
  return HANDLE_PATTERN.test(h) ? h : null
}
