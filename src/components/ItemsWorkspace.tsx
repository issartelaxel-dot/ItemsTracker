import { useState, type ReactNode } from 'react'
import { Bank, Circle, Filter, List, NavArrowDown, Page, Refresh, Search, Sort, Table2Columns, ViewGrid } from 'iconoir-react'
import { useMediaQuery } from '../lib/use-responsive'
import { MobileSheet } from './MobileSheet'
import type { ItemCatalogScope, ItemCatalogStatus } from '../lib/item-catalog'
import './items-workspace.css'

type Props = {
  scope: ItemCatalogScope; onScope: (scope: ItemCatalogScope) => void
  query: string; onQuery: (value: string) => void
  college: string; colleges: { value: string; label: string }[]; onCollege: (value: string) => void
  level: string; levels: { value: string; label: string }[]; onLevel: (value: string) => void
  sort: string; onSort: (value: string) => void
  status: ItemCatalogStatus; onStatus: (value: ItemCatalogStatus) => void
  counts: Record<ItemCatalogStatus, number>
  onReset: () => void
  national: ReactNode; local: ReactNode; matrix: ReactNode
  compact?: boolean
}
const statuses: { value: ItemCatalogStatus; label: string }[] = [
  { value: 'all', label: 'Tous' }, { value: 'unmastered', label: 'Non maîtrisés' },
  { value: 'learning', label: 'En cours' }, { value: 'mastered', label: 'Maîtrisés' },
]
export function ItemsWorkspace(p: Props) {
  const narrow = useMediaQuery('(max-width: 1023px)')
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [layout, setLayout] = useState<'gallery' | 'list' | 'matrix'>('gallery')
  const activeLayout = p.scope === 'local' && layout === 'matrix' ? 'gallery' : layout
  const activeFilters = p.college !== 'ALL' || p.level !== 'ALL' || p.status !== 'all'
  const filters = <div className="items-workspace-filter-body">
    <label><span><Bank aria-hidden="true" />Collèges</span><select aria-label="Filtrer les items par collège" value={p.college} onChange={event => p.onCollege(event.target.value)}><option value="ALL">Tous les collèges</option>{p.colleges.map(college => <option value={college.value} key={college.value}>{college.label}</option>)}</select></label>
    <label><span><List aria-hidden="true" />Niveaux</span><select aria-label="Ressenti des collèges" value={p.level} onChange={event => p.onLevel(event.target.value)}><option value="ALL">Tous les ressentis</option>{p.levels.map(level => <option value={level.value} key={level.value}>{level.label}</option>)}</select></label>
    <label><span><Sort aria-hidden="true" />Trier par</span><select aria-label="Trier les items" value={p.sort} onChange={event => p.onSort(event.target.value)}>
      <option value="itemAsc">Numéro croissant</option><option value="itemDesc">Numéro décroissant</option><option value="reviews">Révisions</option><option value="progress">Progression</option><option value="lastReviewAsc">Dernière révision croissante</option><option value="lastReviewDesc">Dernière révision décroissante</option>
    </select></label>
    <fieldset><legend><Circle aria-hidden="true" />Statut des items</legend>{statuses.map(status => <button type="button" key={status.value} className={`items-workspace-status is-${status.value}`} aria-pressed={p.status === status.value} onClick={() => p.onStatus(status.value)}><span className="items-status-dot" /><span>{status.label}</span><small>{p.counts[status.value]}</small></button>)}</fieldset>
    {p.scope === 'local' ? <p className="items-local-filter-note">Les filtres de suivi concernent uniquement les items explicitement liés aux enseignements locaux.</p> : null}
    <div className="items-workspace-quick"><strong>Actions rapides</strong><button type="button" onClick={p.onReset}><Refresh aria-hidden="true" />Réinitialiser les filtres</button></div>
  </div>
  return <div className={`items-workspace items-layout-${activeLayout} ${p.compact ? 'is-compact' : ''}`}>
    <div className="items-workspace-top">
      <div className="items-workspace-scope" role="group" aria-label="Origine des ressources"><button type="button" aria-pressed={p.scope === 'national'} onClick={() => p.onScope('national')}><Page aria-hidden="true" />Nationales</button><button type="button" aria-pressed={p.scope === 'local'} onClick={() => p.onScope('local')}><Bank aria-hidden="true" />Locales</button></div>
      <div className="items-workspace-search-row"><label><Search aria-hidden="true" /><input type="search" aria-label="Rechercher un item" placeholder={p.scope === 'national' ? 'Rechercher un item par numéro, titre ou collège…' : 'Rechercher une UE, un enseignement ou un item…'} value={p.query} onChange={event => p.onQuery(event.target.value)} /></label>
        <div className="items-workspace-layout" role="group" aria-label="Présentation des items"><button type="button" aria-label="Grille" aria-pressed={activeLayout === 'gallery'} onClick={() => setLayout('gallery')}><ViewGrid aria-hidden="true" /><span>Grille</span></button><button type="button" aria-label="Lignes" aria-pressed={activeLayout === 'list'} onClick={() => setLayout('list')}><List aria-hidden="true" /><span>Lignes</span></button><button type="button" aria-label="Matrice" aria-pressed={activeLayout === 'matrix'} disabled={p.scope === 'local'} title={p.scope === 'local' ? 'La matrice items × collèges est disponible dans Nationales' : 'Matrice items × collèges'} onClick={() => setLayout('matrix')}><Table2Columns aria-hidden="true" /><span>Matrice</span></button></div>
        {narrow || p.compact ? <button type="button" className="items-workspace-mobile-filter" aria-label="Ouvrir les filtres des items" aria-haspopup="dialog" onClick={() => setSheetOpen(true)}><Filter aria-hidden="true" /><span>Filtres</span>{activeFilters ? <span className="items-filter-active" aria-label="Filtres actifs" /> : null}</button> : null}
      </div>
    </div>
    {!narrow && !p.compact ? <aside className="items-workspace-filters"><button type="button" className="items-workspace-filter-toggle" aria-expanded={filtersOpen} aria-controls="items-workspace-filters" onClick={() => setFiltersOpen(!filtersOpen)}>Filtres<NavArrowDown aria-hidden="true" /></button><div id="items-workspace-filters" hidden={!filtersOpen}>{filters}</div></aside> : null}
    {sheetOpen ? <MobileSheet title="Filtres des items" restoreFocusSelector=".items-workspace-mobile-filter" onClose={() => setSheetOpen(false)}>{filters}<button type="button" className="items-workspace-apply" onClick={() => setSheetOpen(false)}>Afficher les résultats</button></MobileSheet> : null}
    <div className="items-workspace-main">
      {p.scope === 'local' ? p.local : layout === 'matrix' ? p.matrix : p.national}
    </div>
  </div>
}
