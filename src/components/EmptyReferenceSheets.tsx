type Props = {
  kind: 'lisa' | 'platform'
  excluded: boolean
  onExclude: (excluded: boolean) => void
  onAdd: () => void
}

export function EmptyReferenceSheets({ kind, excluded, onExclude, onAdd }: Props) {
  const isLisa = kind === 'lisa'
  return <section className={`item-empty-sheets item-empty-sheets-${kind} item-detail-card item-detail-tab-panel item-detail-tab-panel-tracking`} aria-label={isLisa ? 'Fiches LISA' : 'Fiches Plateformes'}>
    <h3>{isLisa ? 'Fiches LISA' : 'Fiches Plateformes'}</h3>
    <label><input type="checkbox" checked={excluded} onChange={event => onExclude(event.target.checked)} />Pas de fiche</label>
    <button type="button" className="add-ref-btn" aria-label={isLisa ? '+ Ajouter fiche LISA' : '+ Ajouter fiche plateforme'} onClick={onAdd}>+ Ajouter</button>
  </section>
}
