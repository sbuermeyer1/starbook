// A 1-5 rating: read-only, or an input where tapping the current value clears it.
export function Stars({ value, onChange }: { value: number | null; onChange?: (v: number | null) => void }) {
  if (!onChange) {
    if (value === null) return null
    return (
      <span className="stars" aria-label={`${value} out of 5`}>
        {'★'.repeat(value)}
        <span className="stars-off">{'★'.repeat(5 - value)}</span>
      </span>
    )
  }
  return (
    <span className="stars input" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={value !== null && n <= value ? 'on' : ''}
          onClick={() => onChange(value === n ? null : n)}
        >
          ★
        </button>
      ))}
    </span>
  )
}
