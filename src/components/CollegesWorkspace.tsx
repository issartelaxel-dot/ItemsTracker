import { hasCollegeFeeling } from '../lib/college-progress'
import { useState, type ReactNode } from 'react'
import { Circle, Filter, List, NavArrowDown, Refresh, Search, Sort, ViewGrid } from 'iconoir-react'
import { useMediaQuery } from '../lib/use-responsive'
import { MobileSheet } from './MobileSheet'
import './items-workspace.css'

type CollegeRow = { college: string; completion: number; totalReviews: number; items: { mastery: string; reviews: number }[] }
type Status = 'all' | 'zero' | 'low' | 'mid' | 'mid-high' | 'high'
const statuses: { value: Status; label: string }[] = [
  { value: 'all', label: 'Tous' }, { value: 'zero', label: '0 %' },
  { value: 'low', label: '1–24 %' }, { value: 'mid', label: '25–49 %' },
  { value: 'mid-high', label: '50–74 %' }, { value: 'high', label: '75 %+' },
]
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr')
const statusOf = (row: CollegeRow): Status => row.completion >= 75 ? 'high' : row.completion >= 50 ? 'mid-high' : row.completion >= 25 ? 'mid' : row.completion > 0 ? 'low' : 'zero'

export function CollegesWorkspace<T extends CollegeRow>({ rows, levels, sort, onSort, children }: {
  rows: T[]; levels: { value: string; label: string }[]; sort: string; onSort: (value: string) => void; children: (rows: T[]) => ReactNode
}) {
  const narrow = useMediaQuery('(max-width: 1023px)')
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('ALL')
  const [status, setStatus] = useState<Status>('all')
  const [open, setOpen] = useState(true)
  const [sheet, setSheet] = useState(false)
  const [statusHelp, setStatusHelp] = useState(false)
  const [layout, setLayout] = useState<'gallery' | 'list'>('gallery')
  const base = rows.filter(row => normalize(row.college).includes(normalize(query.trim())) && (level === 'ALL' || (level === 'none' ? !row.items.some(hasCollegeFeeling) : row.items.some(item => hasCollegeFeeling(item) && item.mastery === level))))
  const filtered = base.filter(row => status === 'all' || statusOf(row) === status)
  const reset = () => { setQuery(''); setLevel('ALL'); setStatus('all'); onSort('name') }
  const filters = <div className="items-workspace-filter-body">
    <label><span><List aria-hidden="true" />Ressenti des items</span><select aria-label="Filtrer les collèges par ressenti" value={level} onChange={event => setLevel(event.target.value)}><option value="ALL">Tous les ressentis</option><option value="none">Non évalués</option>{levels.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    <label><span><Sort aria-hidden="true" />Trier par</span><select aria-label="Trier les collèges" value={sort} onChange={event => onSort(event.target.value)}><option value="name">Nom</option><option value="progress">Progression</option><option value="recentReviews">Révisions récentes</option></select></label>
    <fieldset><legend className="colleges-status-help" onMouseEnter={() => setStatusHelp(true)} onMouseLeave={() => setStatusHelp(false)}><button type="button" className="colleges-status-help-trigger" aria-describedby={statusHelp ? 'colleges-status-tooltip' : undefined} onFocus={() => setStatusHelp(true)} onBlur={() => setStatusHelp(false)} onClick={() => setStatusHelp(true)} onKeyDown={event => { if (event.key === 'Escape' && statusHelp) { event.preventDefault(); event.stopPropagation(); setStatusHelp(false) } }}><Circle aria-hidden="true" /><span>Statut des collèges</span></button>{statusHelp ? <span id="colleges-status-tooltip" role="tooltip">Le ressenti sélectionne les collèges ayant au moins un item évalué à ce niveau. Le statut correspond au pourcentage de progression du collège.</span> : null}</legend>{statuses.map(option => <button type="button" key={option.value} className={`items-workspace-status is-${option.value}`} aria-pressed={status === option.value} onClick={() => setStatus(option.value)}><span className="items-status-dot" /><span>{option.label}</span><small>{option.value === 'all' ? base.length : base.filter(row => statusOf(row) === option.value).length}</small></button>)}</fieldset>
    <div className="items-workspace-quick"><strong>Actions rapides</strong><button type="button" onClick={reset}><Refresh aria-hidden="true" />Réinitialiser les filtres</button></div>
  </div>
  return <div className={`items-workspace colleges-workspace colleges-layout-${layout}`}>
    <div className="items-workspace-top"><div className="items-workspace-search-row"><label><Search aria-hidden="true" /><input type="search" aria-label="Rechercher un collège" placeholder="Rechercher un collège, une spécialité ou un sigle…" value={query} onChange={event => setQuery(event.target.value)} /></label><div className="items-workspace-layout" role="group" aria-label="Présentation des collèges"><button type="button" aria-label="Grille" aria-pressed={layout === 'gallery'} onClick={() => setLayout('gallery')}><ViewGrid aria-hidden="true" /><span>Grille</span></button><button type="button" aria-label="Lignes" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><List aria-hidden="true" /><span>Lignes</span></button></div>{narrow ? <button type="button" className="items-workspace-mobile-filter colleges-mobile-filter" aria-haspopup="dialog" onClick={() => setSheet(true)}><Filter aria-hidden="true" />Filtres{level !== 'ALL' || status !== 'all' ? <span className="items-filter-active" aria-label="Filtres actifs" /> : null}</button> : null}</div></div>
    {!narrow ? <aside className="items-workspace-filters"><button type="button" className="items-workspace-filter-toggle" aria-expanded={open} aria-controls="colleges-filter-body" onClick={() => setOpen(!open)}>Filtres<NavArrowDown aria-hidden="true" /></button><div id="colleges-filter-body" hidden={!open}>{filters}</div></aside> : null}
    {sheet ? <MobileSheet title="Filtres des collèges" restoreFocusSelector=".colleges-mobile-filter" onClose={() => setSheet(false)}>{filters}<button type="button" className="items-workspace-apply" onClick={() => setSheet(false)}>Afficher les résultats</button></MobileSheet> : null}
    <div className="items-workspace-main">{filtered.length ? children(filtered) : <p className="colleges-empty">Aucun collège ne correspond à ces filtres.<button type="button" onClick={reset}>Réinitialiser les filtres</button></p>}</div>
  </div>
}
