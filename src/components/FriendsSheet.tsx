import { useEffect, useState } from 'react'
import { inviteUrl, normalizeHandle, validateHandle } from '../friends/model'
import type { Profile } from '../friends/model'
import { useFriends } from '../friends/useFriends'

export function Avatar({ p, size = 36 }: { p: Pick<Profile, 'displayName' | 'photoURL' | 'username'>; size?: number }) {
  const initial = (p.displayName || p.username || '?').charAt(0).toUpperCase()
  return (
    <span className="person-avatar" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden>
      {p.photoURL ? <img src={p.photoURL} alt="" referrerPolicy="no-referrer" /> : initial}
    </span>
  )
}

function PersonRow({ p, onOpen, children }: { p: Profile; onOpen?: () => void; children?: React.ReactNode }) {
  const who = (
    <>
      <Avatar p={p} />
      <span className="person-name">
        {p.displayName || 'Starbook user'}
        {p.username && <small>@{p.username}</small>}
      </span>
    </>
  )
  return (
    <li className="person">
      {onOpen ? (
        <button className="person-open" onClick={onOpen} aria-label={`See ${p.displayName || 'their'} stats`}>
          {who}
          <span className="chev" aria-hidden>
            ›
          </span>
        </button>
      ) : (
        who
      )}
      <span className="person-actions">{children}</span>
    </li>
  )
}

// One action at a time per button; the provider shows failures.
function useBusy() {
  const [busy, setBusy] = useState<string | null>(null)
  const act = (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    fn()
      .catch(() => {})
      .finally(() => setBusy(null))
  }
  return { busy, act }
}

function UsernameForm({ current, onDone }: { current: string | null; onDone?: () => void }) {
  const f = useFriends()
  const [value, setValue] = useState(current ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const invalid = validateHandle(value)
    if (invalid) return setProblem(invalid)
    setSaving(true)
    setProblem(null)
    try {
      await f.claimUsername(value)
      onDone?.()
    } catch (err) {
      if ((err as Error).name === 'UsernameTakenError') setProblem(`@${normalizeHandle(value)} is taken. Try another.`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <span className="handle-input">
        <span aria-hidden>@</span>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={21} aria-label="Username" />
      </span>
      <button className="primary small" disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      {problem && <p className="form-error">{problem}</p>}
      <p className="hint">3–20 letters, numbers or _. Friends find you by this.</p>
    </form>
  )
}

function InviteLink({ handle }: { handle: string }) {
  const [copied, setCopied] = useState(false)
  const url = inviteUrl(location.origin, handle)
  // Typed as always present, but missing in many desktop browsers.
  const canShare = typeof (navigator as { share?: unknown }).share === 'function'
  const share = async () => {
    if (canShare) {
      try {
        await navigator.share({ title: 'Starbook', text: 'Add me on Starbook', url })
        return
      } catch {
        // dismissed, or not allowed here: fall back to copying
      }
    }
    await navigator.clipboard?.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="invite">
      <code>{url.replace(/^https?:\/\//, '')}</code>
      <button className="secondary small" onClick={share}>
        {copied ? 'Copied' : canShare ? 'Share' : 'Copy'}
      </button>
    </div>
  )
}

function AddFriend({ initial }: { initial: string }) {
  const f = useFriends()
  const { busy, act } = useBusy()
  const [query, setQuery] = useState(initial)
  const [result, setResult] = useState<Profile | null | 'none' | 'loading'>(null)

  const search = async (handle: string) => {
    const invalid = validateHandle(handle)
    if (invalid) return setResult('none')
    setResult('loading')
    try {
      setResult((await f.lookup(handle)) ?? 'none')
    } catch {
      setResult(null)
    }
  }

  // An invite link opens the panel with the handle already looked up.
  useEffect(() => {
    if (initial) search(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

  const relation = result && typeof result === 'object' ? f.relationTo(result.uid) : null

  return (
    <section>
      <h3>Add a friend</h3>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          search(query)
        }}
      >
        <span className="handle-input">
          <span aria-hidden>@</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="their username" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Friend's username" />
        </span>
        <button className="secondary small">Find</button>
      </form>
      {result === 'loading' && <p className="hint">Looking…</p>}
      {result === 'none' && <p className="hint">No one has that username.</p>}
      {result && typeof result === 'object' && (
        <ul className="people">
          <PersonRow p={result}>
            {relation === 'self' && <span className="muted">That's you</span>}
            {relation === 'friend' && <span className="muted">Friends</span>}
            {relation === 'outgoing' && <span className="muted">Requested</span>}
            {relation === 'incoming' && (
              <button className="primary small" disabled={busy !== null} onClick={() => act('accept', () => f.accept(result.uid))}>
                Accept
              </button>
            )}
            {relation === 'none' && (
              <button className="primary small" disabled={busy !== null} onClick={() => act('send', () => f.send(result.uid))}>
                {busy === 'send' ? 'Sending…' : 'Add friend'}
              </button>
            )}
          </PersonRow>
        </ul>
      )}
    </section>
  )
}

export function FriendsSheet({ onClose, onOpenFriend, inviteHandle }: { onClose: () => void; onOpenFriend: (uid: string) => void; inviteHandle: string | null }) {
  const f = useFriends()
  const { busy, act } = useBusy()
  const [editingName, setEditingName] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  return (
    <div className="sheet friends" role="dialog" aria-label="Friends">
      <div className="sheet-head">
        <h2>Friends</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close friends">
          ✕
        </button>
      </div>

      {f.error && (
        <p className="form-error" onClick={f.clearError}>
          {f.error}
        </p>
      )}

      {!f.ready ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          {!f.me?.username || editingName ? (
            <section>
              <h3>{f.me?.username ? 'Change your username' : 'Choose a username'}</h3>
              <UsernameForm current={f.me?.username ?? null} onDone={() => setEditingName(false)} />
            </section>
          ) : (
            <section>
              <h3>
                You are @{f.me.username}
                <button className="link" onClick={() => setEditingName(true)}>
                  Change
                </button>
              </h3>
              <InviteLink handle={f.me.username} />
            </section>
          )}

          <AddFriend initial={inviteHandle ?? ''} />

          {f.incoming.length > 0 && (
            <section>
              <h3>Requests</h3>
              <ul className="people">
                {f.incoming.map((p) => (
                  <PersonRow key={p.uid} p={p}>
                    <button className="primary small" disabled={busy !== null} onClick={() => act(`a${p.uid}`, () => f.accept(p.uid))}>
                      Accept
                    </button>
                    <button className="link" disabled={busy !== null} onClick={() => act(`d${p.uid}`, () => f.decline(p.uid))}>
                      Decline
                    </button>
                  </PersonRow>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3>
              Your friends <span className="muted">{f.friends.length}</span>
            </h3>
            {f.friends.length === 0 ? (
              <p className="hint">No friends yet. Share your link, or add someone by username.</p>
            ) : (
              <p className="hint">Tap a friend to see their stats.</p>
            )}
            <ul className="people">
              {f.friends.map((p) => (
                <PersonRow key={p.uid} p={p} onOpen={() => onOpenFriend(p.uid)}>
                  {confirmRemove === p.uid ? (
                    <>
                      <button className="link danger" disabled={busy !== null} onClick={() => act(`r${p.uid}`, () => f.remove(p.uid).then(() => setConfirmRemove(null)))}>
                        Remove
                      </button>
                      <button className="link" onClick={() => setConfirmRemove(null)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <button className="link muted-link" onClick={() => setConfirmRemove(p.uid)} aria-label={`Remove ${p.displayName}`}>
                      ⋯
                    </button>
                  )}
                </PersonRow>
              ))}
            </ul>
          </section>

          {f.outgoing.length > 0 && (
            <section>
              <h3>Sent</h3>
              <ul className="people">
                {f.outgoing.map((p) => (
                  <PersonRow key={p.uid} p={p}>
                    <button className="link" disabled={busy !== null} onClick={() => act(`c${p.uid}`, () => f.cancel(p.uid))}>
                      Cancel
                    </button>
                  </PersonRow>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
