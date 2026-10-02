import { useMemo, useState } from 'react'
import type { Restaurant } from '../data/restaurants'
import type { Tracked } from '../tracking/model'
import { fold } from '../data/search'
import { cityKey } from '../stats/stats'
import { fraction, GOAL_AWARD_LABEL, GOAL_AWARDS, goalId, goalLabel, matchesAward, MAX_GOALS, progress, suggestions } from '../goals/model'
import type { Goal, GoalAward, GoalScope, Progress } from '../goals/model'
import { useGoals } from '../goals/useGoals'
import { AwardBadge } from './AwardBadge'

interface Props {
  all: Restaurant[]
  byId: Map<string, Restaurant>
  tracked: Tracked
  onOpenRestaurant: (r: Restaurant) => void
}

const REMAINING_COLLAPSED = 8
const SUGGESTIONS_SHOWN = 5

function GoalCard({ p, all, action, onOpen }: { p: Progress; all: Restaurant[]; action: React.ReactNode; onOpen: (r: Restaurant) => void }) {
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const pct = Math.round(100 * fraction(p))
  const done = p.target.length > 0 && p.remaining.length === 0
  const remaining = showAll ? p.remaining : p.remaining.slice(0, REMAINING_COLLAPSED)
  return (
    <li className={`goal ${done ? 'goal-done' : ''}`}>
      <div className="goal-head">
        <button className="goal-title" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span>{goalLabel(p.goal, all)}</span>
          <small>
            {done ? 'Complete!' : `${p.done.length} of ${p.target.length} · ${pct}%`}
            {p.remaining.length > 0 && (open ? ' · hide' : ' · show the rest')}
          </small>
        </button>
        {action}
      </div>
      <div className="goal-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
      {open && p.remaining.length > 0 && (
        <ul className="restaurant-list compact">
          {remaining.map((r) => (
            <li key={r.id}>
              <button onClick={() => onOpen(r)}>
                <AwardBadge award={r.award} />
                <span className="result-main">
                  {r.name}
                  <small>{r.city}</small>
                </span>
              </button>
            </li>
          ))}
          {p.remaining.length > REMAINING_COLLAPSED && (
            <li>
              <button className="link" onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Show fewer' : `Show all ${p.remaining.length}`}
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  )
}

interface PlaceOption {
  scope: GoalScope
  key: string
  label: string
}

function AddGoal({ all, onAdd, onCancel }: { all: Restaurant[]; onAdd: (g: Goal) => void; onCancel: () => void }) {
  const [scope, setScope] = useState<GoalScope>('country')
  const [query, setQuery] = useState('')
  const [place, setPlace] = useState<PlaceOption | null>(null)
  const [award, setAward] = useState<GoalAward>('3')

  const options = useMemo(() => {
    const m = new Map<string, PlaceOption>()
    for (const r of all) {
      if (!r.inGuide) continue
      const key = scope === 'country' ? r.country : cityKey(r)
      if (!m.has(key)) m.set(key, { scope, key, label: scope === 'country' ? r.country : `${r.city}, ${r.country}` })
    }
    return [...m.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [all, scope])

  const q = fold(query.trim())
  const matches = q.length >= 1 ? options.filter((o) => fold(o.label).includes(q)).slice(0, 8) : []
  const count = place ? all.filter((r) => r.inGuide && (place.scope === 'country' ? r.country === place.key : cityKey(r) === place.key) && matchesAward(r, award)).length : 0

  return (
    <div className="add-goal">
      <div className="tabs" role="tablist">
        {(['country', 'city'] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={scope === s}
            onClick={() => {
              setScope(s)
              setPlace(null)
              setQuery('')
            }}
          >
            {s === 'country' ? 'Country' : 'City'}
          </button>
        ))}
      </div>
      {place ? (
        <div className="picked">
          <strong>{place.label}</strong>
          <button className="link" onClick={() => setPlace(null)}>
            Change
          </button>
        </div>
      ) : (
        <>
          <input type="search" className="goal-search" placeholder={scope === 'country' ? 'Find a country' : 'Find a city'} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a place" />
          {matches.length > 0 && (
            <ul className="place-options">
              {matches.map((o) => (
                <li key={o.key}>
                  <button onClick={() => setPlace(o)}>{o.label}</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="chips">
        {GOAL_AWARDS.map((a) => (
          <button key={a} className="chip" aria-pressed={award === a} onClick={() => setAward(a)}>
            {GOAL_AWARD_LABEL[a]}
          </button>
        ))}
      </div>
      {place && <p className="hint">{count === 0 ? 'No restaurants match there yet.' : `${count} restaurant${count === 1 ? '' : 's'} to visit in total.`}</p>}
      <div className="form-actions">
        <button className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary" disabled={!place || count === 0} onClick={() => place && onAdd({ scope: place.scope, key: place.key, award })}>
          Pin goal
        </button>
      </div>
    </div>
  )
}

export function GoalsSection({ all, byId, tracked, onOpenRestaurant }: Props) {
  const g = useGoals()
  const [adding, setAdding] = useState(false)
  const pinned = useMemo(() => g.pinned.map((goal) => progress(goal, all, tracked)), [g.pinned, all, tracked])
  const suggested = useMemo(
    () => suggestions(all, tracked, byId).filter((p) => !g.isPinned(p.goal)).slice(0, SUGGESTIONS_SHOWN),
    // isPinned changes with pinned
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, tracked, byId, g.pinned],
  )

  return (
    <section className="goals">
      <h3>
        Goals
        {!adding && g.pinned.length < MAX_GOALS && (
          <button className="link" onClick={() => setAdding(true)}>
            + Add a goal
          </button>
        )}
      </h3>
      {g.error && <p className="form-error">{g.error}</p>}
      {adding && (
        <AddGoal
          all={all}
          onCancel={() => setAdding(false)}
          onAdd={(goal) => {
            g.pin(goal)
            setAdding(false)
          }}
        />
      )}
      {pinned.length > 0 && (
        <ul className="goal-list">
          {pinned.map((p) => (
            <GoalCard
              key={goalId(p.goal)}
              p={p}
              all={all}
              onOpen={onOpenRestaurant}
              action={
                <button className="icon-btn small" onClick={() => g.unpin(p.goal)} aria-label={`Unpin ${goalLabel(p.goal, all)}`}>
                  ✕
                </button>
              }
            />
          ))}
        </ul>
      )}
      {suggested.length > 0 && (
        <>
          <p className="subhead">Suggested from places you've been</p>
          <ul className="goal-list">
            {suggested.map((p) => (
              <GoalCard
                key={goalId(p.goal)}
                p={p}
                all={all}
                onOpen={onOpenRestaurant}
                action={
                  <button className="secondary small" onClick={() => g.pin(p.goal)}>
                    Pin
                  </button>
                }
              />
            ))}
          </ul>
        </>
      )}
      {!pinned.length && !suggested.length && !adding && <p className="hint">Pin a goal like "every 3★ in Japan" and track your progress here.</p>}
    </section>
  )
}
