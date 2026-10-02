import { AWARD_LABEL } from '../data/restaurants'
import type { Award } from '../data/restaurants'

const TEXT: Record<Award, string> = { '3': '★★★', '2': '★★', '1': '★', bib: 'Bib', selected: 'Sel' }

export function AwardBadge({ award, long = false }: { award: Award; long?: boolean }) {
  return (
    <span className={`badge badge-${award}`} title={AWARD_LABEL[award]}>
      {long ? AWARD_LABEL[award] : TEXT[award]}
    </span>
  )
}
