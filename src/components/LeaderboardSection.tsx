import { useEffect, useMemo, useState } from 'react'
import type { Restaurant } from '../data/restaurants'
import { useFriends } from '../friends/useFriends'
import { useTracking } from '../tracking/useTracking'
import { groupVisits } from '../tracking/model'
import { summarize } from '../stats/stats'
import { boardFields, compareEntries } from '../leaderboard/model'
import type { BoardEntry } from '../leaderboard/model'
import type { LeaderboardState } from '../leaderboard/useLeaderboard'
import { Avatar } from './FriendsSheet'

function BoardList({ rows, meUid, startRank = 1 }: { rows: BoardEntry[]; meUid: string | null; startRank?: number }) {
  return (
    <ol className="board">
      {rows.map((e, i) => (
        <li key={e.uid} className={e.uid === meUid ? 'me' : ''}>
          <span className="rank">{startRank + i}</span>
          <Avatar p={e} size={30} />
          <span className="person-name">
            {e.uid === meUid ? 'You' : e.displayName || (e.username ? `@${e.username}` : 'Starbook user')}
            <small>
              3★ {e.three} · Bib {e.bib} · {e.countries} countr{e.countries === 1 ? 'y' : 'ies'}
            </small>
          </span>
          <strong className="board-stars">★ {e.stars}</strong>
        </li>
      ))}
    </ol>
  )
}

function FriendsBoard({ byId }: { byId: Map<string, Restaurant> }) {
  const f = useFriends()
  const { tracked } = useTracking()
  const rows = useMemo(() => {
    if (!f.me) return []
    const mine = { uid: f.me.uid, ...boardFields(f.me, summarize(tracked.visits, byId)) }
    const theirs = f.friends.map((p) => {
      const lists = f.friendLists.get(p.uid)
      return { uid: p.uid, ...boardFields(p, summarize(groupVisits(lists?.visits ?? []), byId)) }
    })
    return [mine, ...theirs].sort(compareEntries)
  }, [f.me, f.friends, f.friendLists, tracked, byId])

  if (!f.friends.length) return <p className="hint">Add friends from the avatar menu to compare.</p>
  return <BoardList rows={rows} meUid={f.me?.uid ?? null} />
}

function GlobalBoard({ board }: { board: LeaderboardState }) {
  const [top, setTop] = useState<BoardEntry[] | null>(null)
  const [rank, setRank] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ownStars = board.own?.stars ?? null

  const { joined, fetchTop, rankOf } = board
  useEffect(() => {
    if (!joined) return
    let live = true
    Promise.all([fetchTop(), ownStars !== null ? rankOf(ownStars) : Promise.resolve(null)])
      .then(([t, r]) => {
        if (!live) return
        setTop([...t].sort(compareEntries))
        setRank(r)
      })
      .catch((e) => {
        console.error(e)
        if (live) setError("Couldn't load the leaderboard.")
      })
    return () => {
      live = false
    }
  }, [joined, fetchTop, rankOf, ownStars])

  const act = (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    fn()
      .catch((e) => {
        console.error(e)
        setError("Couldn't update the leaderboard. Please try again.")
      })
      .finally(() => setBusy(false))
  }

  if (!board.available) return <p className="hint">Loading…</p>
  if (!board.joined) {
    return (
      <div className="board-join">
        <p>
          Join the public leaderboard to see how you rank. Signed-in users will see your name, photo, username and totals. Your visits stay
          private.
        </p>
        <button className="primary small" disabled={busy} onClick={() => act(board.join)}>
          Join the leaderboard
        </button>
        {error && <p className="form-error">{error}</p>}
      </div>
    )
  }

  const meUid = board.own?.uid ?? null
  const inTop = top?.some((e) => e.uid === meUid)
  return (
    <>
      {error && <p className="form-error">{error}</p>}
      {!top ? (
        <p className="hint">Loading…</p>
      ) : (
        <>
          <BoardList rows={top} meUid={meUid} />
          {!inTop && board.own && rank !== null && (
            <>
              <p className="hint board-gap">⋯</p>
              <BoardList rows={[board.own]} meUid={meUid} startRank={rank} />
            </>
          )}
        </>
      )}
      <p className="hint">
        Totals are self-reported.{' '}
        <button className="link" disabled={busy} onClick={() => act(board.leave)}>
          Leave the leaderboard
        </button>
      </p>
    </>
  )
}

export function LeaderboardSection({ board, byId }: { board: LeaderboardState; byId: Map<string, Restaurant> }) {
  const [tab, setTab] = useState<'friends' | 'everyone'>('friends')
  return (
    <section>
      <h3>Leaderboard</h3>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'friends'} onClick={() => setTab('friends')}>
          Friends
        </button>
        <button role="tab" aria-selected={tab === 'everyone'} onClick={() => setTab('everyone')}>
          Everyone
        </button>
      </div>
      {tab === 'friends' ? <FriendsBoard byId={byId} /> : <GlobalBoard board={board} />}
    </section>
  )
}
