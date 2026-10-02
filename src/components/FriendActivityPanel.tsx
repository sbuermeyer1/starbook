import type { Restaurant } from '../data/restaurants'
import { useFriends } from '../friends/useFriends'
import { Avatar } from './FriendsSheet'
import { Stars } from './Stars'

const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

export function FriendActivityPanel({ r }: { r: Restaurant }) {
  const { activity, profileOf } = useFriends()
  const list = activity.get(r.id)
  if (!list?.length) return null

  return (
    <section className="friend-activity">
      <h3>Friends</h3>
      <ul className="people">
        {list.map((a) => {
          const p = profileOf(a.uid)
          const flags = [a.favorite && '♥ Favorite', a.want && !a.visits.length && 'Wants to go'].filter(Boolean).join(' · ')
          return (
            <li key={a.uid} className="person friend-entry">
              <Avatar p={p} size={32} />
              <div className="friend-body">
                <div className="friend-line">
                  <strong>{p.displayName.split(' ')[0] || (p.username ? `@${p.username}` : 'Friend')}</strong>
                  {flags && <span className="muted"> · {flags}</span>}
                </div>
                {a.visits.map((v) => (
                  <div key={v.id} className="friend-visit">
                    <span className="muted">{v.date ? formatDate(v.date) : 'Date unknown'}</span> <Stars value={v.rating} />
                    {v.notes && <p className="visit-notes">{v.notes}</p>}
                  </div>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
