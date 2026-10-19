import { useDeferredValue, useId, useMemo, useState } from 'react'
import { Book, CreditCards, Learning, NavArrowRight, OpenBook, Page, Play, Search } from 'iconoir-react'
import { searchGlobalIndex, type GlobalSearchEntry, type GlobalSearchResult, type GlobalSearchResultKind } from '../lib/global-search'

const labels: Record<GlobalSearchResultKind, string> = {
  item: 'Item', college: 'Collège', flashcard: 'Flashcard', youtube: 'YouTube', link: 'Lien', lisa: 'Fiche LISA', platform: 'Fiche plateforme',
}
const icons = { item: Page, college: Learning, flashcard: CreditCards, youtube: Play, link: NavArrowRight, lisa: Book, platform: OpenBook }

export function GlobalSearch({ index, onSelect, onBlurOutside }: {
  index: readonly GlobalSearchEntry[]
  onSelect: (result: GlobalSearchResult) => void
  onBlurOutside: () => void
}) {
  // Keystrokes belong to this small component, not the whole tracker screen.
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const deferredQuery = useDeferredValue(query)
  const results = useMemo(() => searchGlobalIndex(index, deferredQuery), [index, deferredQuery])
  const stale = query !== deferredQuery
  const expanded = open && query.trim().length > 0
  const panelId = useId()
  function select(result: GlobalSearchResult) {
    setOpen(false)
    setQuery('')
    onSelect(result)
  }
  return <div className="topbar-search-wrap" onBlur={event => {
    const target = event.relatedTarget
    if (!(target instanceof Node) || !event.currentTarget.contains(target)) {
      setOpen(false)
      onBlurOutside()
    }
  }}>
    <label className="topbar-search">
      <span aria-hidden="true"><Search className="ui-icon" aria-hidden="true" /></span>
      <input type="search" placeholder="Recherche globale..." value={query} aria-label="Recherche globale"
        aria-expanded={expanded} aria-controls={expanded ? panelId : undefined}
        onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true) }}
        onKeyDown={event => {
          if (event.key === 'Escape') { setOpen(false); return }
          if (event.key === 'Enter') {
            // Enter must use the current text even if a background render is pending.
            const first = (stale ? searchGlobalIndex(index, query) : results)[0]
            if (first) { event.preventDefault(); select(first) }
          }
        }} />
    </label>
    {expanded ? <div id={panelId} className="global-search-panel" role="listbox" aria-label="Résultats de recherche globale" aria-busy={stale}>
      <div className="global-search-panel-head"><strong>Recherche globale</strong><span>{stale ? 'Recherche…' : `${results.length} résultat${results.length > 1 ? 's' : ''}`}</span></div>
      {results.length > 0 ? <div className="global-search-list">{results.map(result => {
        const Icon = icons[result.kind]
        return <button key={result.id} type="button" className={`global-search-result result-${result.kind}`} role="option"
          disabled={stale} onMouseDown={event => event.preventDefault()} onClick={() => select(result)}>
          <span className="global-search-result-icon"><Icon className="ui-icon" aria-hidden="true" /></span>
          <span className="global-search-result-main"><span className="global-search-result-title">{result.label}</span><span className="global-search-result-detail">{result.detail}</span></span>
          <span className="global-search-result-meta"><span>{labels[result.kind]}</span>{result.meta ? <small>{result.meta}</small> : null}</span>
        </button>
      })}</div> : <div className="global-search-empty">{stale ? 'Recherche…' : 'Aucun résultat dans les items, collèges, flashcards ou ressources.'}</div>}
    </div> : null}
  </div>
}
