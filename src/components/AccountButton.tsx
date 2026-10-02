import { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { useFriends } from '../friends/useFriends'

export function AccountButton({ onOpenFriends }: { onOpenFriends: () => void }) {
  const { user, ready, error, signIn, signOut } = useAuth()
  const { incoming } = useFriends()
  const [open, setOpen] = useState(false)

  if (!ready) return <div className="account placeholder" aria-hidden />

  if (!user) {
    return (
      <div className="account">
        <button className="signin" onClick={signIn}>
          Sign in
        </button>
        {error && <div className="account-error">{error}</div>}
      </div>
    )
  }

  const initial = (user.displayName ?? user.email ?? '?').charAt(0).toUpperCase()
  return (
    <div className="account">
      <button className="avatar" onClick={() => setOpen(!open)} aria-label="Account" aria-expanded={open}>
        {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : initial}
      </button>
      {incoming.length > 0 && (
        <span className="avatar-badge" aria-label={`${incoming.length} friend request${incoming.length > 1 ? 's' : ''}`}>
          {incoming.length}
        </span>
      )}
      {open && (
        <div className="account-menu" role="menu">
          <div className="account-name">{user.displayName}</div>
          <div className="account-email">{user.email}</div>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onOpenFriends()
            }}
          >
            Friends{incoming.length > 0 && ` (${incoming.length} new)`}
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              signOut()
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
