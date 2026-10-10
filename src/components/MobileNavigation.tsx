import { Dashboard, Page, CreditCards, MoreHoriz } from 'iconoir-react'
export function MobileNavigation({ active, moreOpen, onNavigate, onMore }: {
  active: string; moreOpen: boolean; onNavigate: (view: 'dashboard' | 'items' | 'flashcards') => void; onMore: () => void
}) {
  const tabs = [{ view: 'dashboard' as const, label: 'Accueil', Icon: Dashboard }, { view: 'items' as const, label: 'Items', Icon: Page }, { view: 'flashcards' as const, label: 'Flashcards', Icon: CreditCards }]
  return <nav className="mobile-bottom-nav" aria-label="Navigation mobile">
    {tabs.map(({ view, label, Icon }) => <button type="button" key={view} className={active === view && !moreOpen ? 'active' : ''} aria-current={active === view && !moreOpen ? 'page' : undefined} onClick={() => onNavigate(view)}><Icon aria-hidden="true" /><span>{label}</span></button>)}
    <button type="button" className={moreOpen || !tabs.some(tab => tab.view === active) ? 'active' : ''} aria-expanded={moreOpen} aria-haspopup="dialog" onClick={onMore}><MoreHoriz aria-hidden="true" /><span>Plus</span></button>
  </nav>
}
