import { Play } from 'iconoir-react'

type Group = { value: string; label: string; cards: { key: string }[] }

export function FlashcardStatusGroups({ groups, onReview }: {
  groups: Group[]; onReview: (keys: string[], label: string) => void
}) {
  return <div className="flash-status-groups">{groups.map(group => <section key={group.value} className={`flash-status-group flash-feeling-${group.value}`} aria-label={group.label}>
    <header>
      <h2><i aria-hidden="true" />{group.label}<small className="flash-status-count">{group.cards.length} carte{group.cards.length === 1 ? '' : 's'}</small></h2>
      <button className="flash-status-review" type="button" disabled={!group.cards.length} aria-label={`Réviser le groupe ${group.label}`} onClick={() => onReview(group.cards.map(card => card.key), group.label)}><Play aria-hidden="true" /><span>Réviser le groupe</span></button>
    </header>
  </section>)}</div>
}
