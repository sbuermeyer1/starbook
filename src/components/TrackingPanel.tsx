import { useState } from 'react'
import { AWARD_LABEL } from '../data/restaurants'
import type { Restaurant } from '../data/restaurants'
import { useAuth } from '../auth/useAuth'
import { useTracking } from '../tracking/useTracking'
import { awardChange, statusOf } from '../tracking/model'
import type { Visit } from '../tracking/model'
import { AwardBadge } from './AwardBadge'
import { Stars } from './Stars'
import { VisitForm } from './VisitForm'

const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

export function TrackingPanel({ r }: { r: Restaurant }) {
  const { signIn } = useAuth()
  const t = useTracking()
  // 'new' = logging a visit; a visit id = editing that visit
  const [editing, setEditing] = useState<'new' | string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  if (!t.signedIn) {
    return (
      <div className="tracking">
        <button className="secondary wide" onClick={signIn}>
          Sign in to track this restaurant
        </button>
      </div>
    )
  }
  if (!t.ready) return <div className="tracking muted">Loading your list…</div>

  const status = statusOf(t.tracked, r.id)
  const visits = t.tracked.visits.get(r.id) ?? []
  const entry = { want: status.want, favorite: status.favorite }

  return (
    <div className="tracking">
      {t.error && (
        <p className="form-error" onClick={t.clearError}>
          {t.error}
        </p>
      )}

      <div className="track-buttons">
        <button className="track" onClick={() => setEditing('new')} disabled={editing !== null}>
          {status.visited ? '+ Log another visit' : '✓ Log a visit'}
        </button>
        {!status.visited && (
          <button className="track" aria-pressed={status.want} onClick={() => t.setEntry(r.id, { ...entry, want: !status.want })}>
            {status.want ? '● Want to go' : '○ Want to go'}
          </button>
        )}
        <button className="track fav" aria-pressed={status.favorite} onClick={() => t.setEntry(r.id, { ...entry, favorite: !status.favorite })}>
          {status.favorite ? '♥ Favorite' : '♡ Favorite'}
        </button>
      </div>

      {editing === 'new' && (
        <VisitForm submitLabel="Save visit" onSubmit={(v) => t.addVisit(r, v).then(() => setEditing(null))} onCancel={() => setEditing(null)} />
      )}

      {visits.length > 0 && (
        <section className="visits">
          <h3>
            Your visits <span className="muted">{visits.length}</span>
          </h3>
          <ul>
            {visits.map((v) =>
              editing === v.id ? (
                <li key={v.id}>
                  <VisitForm
                    initial={v}
                    submitLabel="Save changes"
                    onSubmit={(input) => t.updateVisit(v.id, input).then(() => setEditing(null))}
                    onCancel={() => setEditing(null)}
                  />
                </li>
              ) : (
                <VisitRow
                  key={v.id}
                  v={v}
                  r={r}
                  confirming={confirmDelete === v.id}
                  onEdit={() => {
                    setConfirmDelete(null)
                    setEditing(v.id)
                  }}
                  onAskDelete={() => setConfirmDelete(v.id)}
                  onCancelDelete={() => setConfirmDelete(null)}
                  onDelete={() => t.deleteVisit(v.id).then(() => setConfirmDelete(null))}
                />
              ),
            )}
          </ul>
        </section>
      )}
    </div>
  )
}

interface RowProps {
  v: Visit
  r: Restaurant
  confirming: boolean
  onEdit: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onDelete: () => void
}

function VisitRow({ v, r, confirming, onEdit, onAskDelete, onCancelDelete, onDelete }: RowProps) {
  const change = awardChange(v, r)
  return (
    <li className="visit">
      <div className="visit-head">
        <strong>{v.date ? formatDate(v.date) : 'Date unknown'}</strong>
        <Stars value={v.rating} />
      </div>
      {change && (
        <div className="award-change" title={`Recorded as ${AWARD_LABEL[change.was]} when you logged this visit`}>
          was <AwardBadge award={change.was} />
          {change.now ? (
            <>
              {' '}
              · now <AwardBadge award={change.now} />
            </>
          ) : (
            ' · no longer in the guide'
          )}
        </div>
      )}
      {v.notes && <p className="visit-notes">{v.notes}</p>}
      {confirming ? (
        <div className="visit-actions">
          <span>Delete this visit?</span>
          <button className="link danger" onClick={onDelete}>
            Delete
          </button>
          <button className="link" onClick={onCancelDelete}>
            Keep
          </button>
        </div>
      ) : (
        <div className="visit-actions">
          <button className="link" onClick={onEdit}>
            Edit
          </button>
          <button className="link" onClick={onAskDelete}>
            Delete
          </button>
        </div>
      )}
    </li>
  )
}
