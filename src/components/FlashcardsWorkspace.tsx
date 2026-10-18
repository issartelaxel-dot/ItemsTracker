import { Bank, Circle, List, NavArrowDown, Notes, Page, Play, Plus, Refresh, Search, ViewGrid, Filter, Xmark } from 'iconoir-react'
import { useEffect, useRef, useState } from 'react'
import { useMediaQuery } from '../lib/use-responsive'
import type { FlashcardCatalogStatus, FlashcardOrganization } from '../lib/flashcard-catalog'

type Props = {
  themes: number; masteredItems: number; totalItems: number
  search: string; itemSearch: string; level: string; sort: string
  levels: { value: string; label: string }[]
  organization: FlashcardOrganization; layout: 'gallery' | 'list'; status: FlashcardCatalogStatus
  counts: Record<FlashcardCatalogStatus, number>; collegeFilterLabel: string | null; canReview: boolean
  onSearch: (value: string) => void; onItemSearch: (value: string) => void
  onLevel: (value: string) => void; onSort: (value: string) => void
  onOrganization: (value: FlashcardOrganization) => void; onLayout: (value: 'gallery' | 'list') => void
  onStatus: (value: FlashcardCatalogStatus) => void; onReset: () => void
  onReview: () => void; onCreate: () => void
}

const statuses: { value: FlashcardCatalogStatus; label: string }[] = [
  { value: 'all', label: 'Tous' }, { value: 'unmastered', label: 'Non maîtrisés' },
  { value: 'learning', label: 'En cours' }, { value: 'mastered', label: 'Maîtrisés' },
]

export function FlashcardsWorkspace(p: Props) {
  const mobile = useMediaQuery('(max-width: 1023px)')
  const sheet = useRef<HTMLDialogElement>(null)
  const filterTrigger = useRef<HTMLButtonElement>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  useEffect(() => {
    const dialog = sheet.current
    if (!mobile || !sheetOpen || !dialog) return
    const trigger = filterTrigger.current
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => { dialog.close(); document.body.style.overflow = previous; trigger?.focus() }
  }, [mobile, sheetOpen])
  const [filtersOpen, setFiltersOpen] = useState(true)
  const levelSelect = (label: string) => <select aria-label={label} value={p.level} onChange={e => p.onLevel(e.target.value)}>
    <option value="ALL">Tous les niveaux</option>
    {p.levels.map(level => <option key={level.value} value={level.value}>{level.label}</option>)}
  </select>
  const sortSelect = (label: string, full = false) => <select aria-label={label} value={p.sort} onChange={e => p.onSort(e.target.value)}>
    <option value="progress">{full ? 'Trier par : ' : ''}Progression</option>
    <option value="name">{full ? 'Trier par : ' : ''}Nom</option>
    <option value="items">{full ? 'Trier par : ' : ''}Items</option>
  </select>
  const filterPanel = (<aside className="flash-workspace-filters" aria-label="Filtres des flashcards">
      <div className="flash-workspace-filter-head"><h2>Filtres</h2><button type="button" aria-label={filtersOpen ? 'Masquer les filtres' : 'Afficher les filtres'}
        aria-expanded={filtersOpen} aria-controls="flash-workspace-filter-body" onClick={() => setFiltersOpen(value => !value)}>
        <NavArrowDown aria-hidden="true" style={{ transform: filtersOpen ? 'rotate(180deg)' : undefined }} /></button></div>
      <div id="flash-workspace-filter-body" className="flash-workspace-filter-body" hidden={!mobile && !filtersOpen}>

        {mobile ? <label className="flash-workspace-search"><Search aria-hidden="true" /><input type="search" aria-label="Rechercher un item dans les flashcards" placeholder="Rechercher un item..." value={p.itemSearch} onChange={e => p.onItemSearch(e.target.value)} /></label> : <details className="flash-workspace-associated-search" open={p.itemSearch ? true : undefined}><summary>Limiter aux items associés</summary><label className="flash-workspace-search"><Search aria-hidden="true" /><input type="search" aria-label="Rechercher un item dans les flashcards" placeholder="Numéro ou titre de l’item..." value={p.itemSearch} onChange={e => p.onItemSearch(e.target.value)} /></label></details>}
        <label className="flash-workspace-field"><span><Notes aria-hidden="true" />Niveaux</span>{levelSelect('Niveau des flashcards')}</label>
        <label className="flash-workspace-field"><span><List aria-hidden="true" />Trier par</span>{sortSelect('Tri des flashcards')}</label>
        <fieldset className="flash-workspace-status"><legend><Circle aria-hidden="true" />Statut</legend>
          {statuses.map(status => <button type="button" key={status.value} className={`flash-status-${status.value}`} aria-pressed={p.status === status.value} onClick={() => p.onStatus(status.value)}>
            <i aria-hidden="true" /><span>{status.label}</span><small>{p.counts[status.value]}</small></button>)}
        </fieldset>
        <div className="flash-workspace-quick"><h3>Actions rapides</h3>
          <button type="button" onClick={() => p.onOrganization(p.organization === 'items' ? 'colleges' : 'items')}><List aria-hidden="true" />Afficher par {p.organization === 'items' ? 'collèges' : 'items'}</button>
          <button type="button" onClick={p.onReset}><Refresh aria-hidden="true" />Réinitialiser les filtres</button>
        </div>
      </div>
    </aside>)
  return <>
    <header className="flash-workspace-head">
      <div><h1>Flashcards</h1><p>{p.themes} thématique{p.themes > 1 ? 's' : ''}<span aria-hidden="true"> · </span>{p.masteredItems}/{p.totalItems} items maîtrisés</p></div>
      <div className="flash-workspace-actions">
        <button className="flashcards-create-btn" type="button" onClick={p.onCreate}><Plus aria-hidden="true" />{mobile ? 'Créer' : 'Créer une flashcard'}</button>
        <button className="flashcards-session-btn" type="button" onClick={p.onReview} disabled={!p.canReview}
          title={p.canReview ? 'Lancer une révision globale' : 'Ajoute une flashcard pour lancer une révision'}><Play aria-hidden="true" />{mobile ? 'Réviser' : 'Lancer une révision'}</button>
      </div>
    </header>
    {mobile ? <dialog ref={sheet} className="flash-mobile-sheet" aria-label="Filtres des flashcards" onCancel={() => setSheetOpen(false)} onClick={e => { if(e.target === e.currentTarget) setSheetOpen(false) }}>
      <div className="flash-mobile-sheet-head"><h2>Filtres des flashcards</h2><button type="button" aria-label="Fermer les filtres" onClick={() => setSheetOpen(false)}><Xmark aria-hidden="true" /></button></div>
      {filterPanel}
      <button type="button" className="flash-mobile-apply" onClick={() => setSheetOpen(false)}>Afficher les résultats</button>
    </dialog> : filterPanel}
    <div className="flash-workspace-controls">
      <div className="flash-workspace-search-toolbar">
        <label className="flash-workspace-search"><Search aria-hidden="true" /><input type="search" aria-label="Rechercher une thématique ou un item" placeholder={p.organization === 'items' ? 'Rechercher un item…' : 'Rechercher une thématique…'} value={p.search} onChange={e => p.onSearch(e.target.value)} /></label>
        <div className={`flash-workspace-layout${p.organization === 'status' ? ' flash-layout-unavailable' : ''}`} role="group" aria-label="Présentation des flashcards" aria-hidden={p.organization === 'status'} inert={p.organization === 'status'}>
          <button type="button" aria-label="Galerie" title="Grille" aria-pressed={p.layout === 'gallery'} onClick={() => p.onLayout('gallery')}><ViewGrid aria-hidden="true" /><span>Galerie</span></button>
          <button type="button" aria-label="Ligne" title="Lignes" aria-pressed={p.layout === 'list'} onClick={() => p.onLayout('list')}><List aria-hidden="true" /><span>Ligne</span></button>
        </div>
        {mobile ? <button ref={filterTrigger} type="button" aria-label="Filtres" className="flash-mobile-filter-trigger" aria-expanded={sheetOpen} onClick={() => setSheetOpen(true)}><Filter aria-hidden="true" /><span>Filtres</span></button> : null}
      </div>
      <div className="flash-workspace-organize"><span>Organiser par</span><div role="group" aria-label="Organisation des flashcards">
        {([{value:'status',label:'Statut',Icon:Circle},{value:'colleges',label:'Collège',Icon:Bank},{value:'items',label:'Item',Icon:Page}] as const).map(({value,label,Icon}) =>
          <button type="button" key={value} aria-pressed={p.organization === value} onClick={() => p.onOrganization(value)}><Icon aria-hidden="true" />{label}</button>)}
      </div></div>
      {p.collegeFilterLabel ? <div className="flash-workspace-scope">Collège : {p.collegeFilterLabel}<button type="button" onClick={p.onReset}>Effacer les filtres</button></div> : null}
    </div>
  </>
}
