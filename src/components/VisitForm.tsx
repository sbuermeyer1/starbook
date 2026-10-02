import { useState } from 'react'
import { MAX_NOTES, todayISO, validateVisit } from '../tracking/model'
import type { VisitInput } from '../tracking/model'
import { Stars } from './Stars'

interface Props {
  initial?: VisitInput
  submitLabel: string
  onSubmit: (v: VisitInput) => Promise<void>
  onCancel: () => void
}

export function VisitForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [date, setDate] = useState<string | null>(initial ? initial.date : todayISO())
  const [rating, setRating] = useState<number | null>(initial?.rating ?? null)
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const input = { date, rating, notes: notes.trim() }
    const problem = validateVisit(input)
    if (problem) return setError(problem)
    setSaving(true)
    try {
      await onSubmit(input)
    } catch {
      setSaving(false) // the provider shows the error
    }
  }

  return (
    <form className="visit-form" onSubmit={submit}>
      <label>
        <span>Date</span>
        {date !== null ? (
          <span className="date-row">
            <input type="date" value={date} max={todayISO()} min="1900-01-01" onChange={(e) => setDate(e.target.value)} required />
            <button type="button" className="link" onClick={() => setDate(null)}>
              Don't remember
            </button>
          </span>
        ) : (
          <span className="date-row">
            <em className="muted">Date unknown</em>
            <button type="button" className="link" onClick={() => setDate(todayISO())}>
              Add date
            </button>
          </span>
        )}
      </label>
      <div className="field">
        <span>Your rating</span>
        <Stars value={rating} onChange={setRating} />
      </div>
      <label>
        <span>Notes</span>
        <textarea value={notes} maxLength={MAX_NOTES} rows={3} placeholder="Dishes, wine, company…" onChange={(e) => setNotes(e.target.value)} />
        {notes.length > MAX_NOTES - 200 && (
          <small className="muted">
            {notes.length}/{MAX_NOTES}
          </small>
        )}
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
