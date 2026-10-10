import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type SVGProps } from 'react'
import { Page, CreditCards, Learning, MoreHoriz } from 'iconoir-react'

function DashboardIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="3" width="7" height="10" rx="1.5" />
    <rect x="14" y="3" width="7" height="6" rx="1.5" />
    <rect x="3" y="17" width="7" height="4" rx="1" />
    <rect x="14" y="13" width="7" height="8" rx="1.5" />
  </svg>
}

const tabs = [
  { view: 'dashboard' as const, label: 'Dashboard', Icon: DashboardIcon },
  { view: 'items' as const, label: 'Items', Icon: Page },
  { view: 'flashcards' as const, label: 'Flashcards', Icon: CreditCards },
  { view: 'colleges' as const, label: 'Collèges', Icon: Learning },
]

type NavigationGesture = { pointerId: number; startX: number; startY: number; firstCenter: number; step: number; dragging: boolean }

export function MobileNavigation({ active, moreOpen, onNavigate, onMore }: {
  active: string; moreOpen: boolean; onNavigate: (view: (typeof tabs)[number]['view']) => void; onMore: () => void
}) {
  const moreIndex = tabs.length
  const activeIndex = moreOpen ? moreIndex : tabs.findIndex(tab => tab.view === active)
  const selectedIndex = activeIndex < 0 ? moreIndex : activeIndex
  const navRef = useRef<HTMLElement | null>(null)
  const [tabStep, setTabStep] = useState(0)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const gesture = useRef<NavigationGesture | null>(null)
  const suppressClick = useRef(false)
  const visualIndex = dragIndex === null ? selectedIndex : Math.round(dragIndex)

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const measure = () => {
      const buttons = nav.querySelectorAll('button')
      setTabStep(buttons[1].getBoundingClientRect().left - buttons[0].getBoundingClientRect().left)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(nav)
    return () => observer.disconnect()
  }, [])

  const navigate = (index: number) => {
    if (index === moreIndex) onMore()
    else onNavigate(tabs[index].view)
  }
  const indexAt = (event: PointerEvent<HTMLElement>, current: NavigationGesture) =>
    Math.max(0, Math.min(moreIndex, (event.clientX - current.firstCenter) / current.step))
  const cancelGesture = () => { gesture.current = null; setDragIndex(null) }

  return <nav ref={navRef} className={`mobile-bottom-nav${dragIndex === null ? '' : ' is-dragging'}`} aria-label="Navigation mobile"
    style={{ '--mobile-nav-count': tabs.length + 1, '--mobile-nav-offset': `${(dragIndex ?? selectedIndex) * tabStep}px` } as CSSProperties}
    onPointerDown={event => {
      if (!event.isPrimary || event.button !== 0) return
      suppressClick.current = false
      const buttons = event.currentTarget.querySelectorAll('button')
      const first = buttons[0].getBoundingClientRect(), second = buttons[1].getBoundingClientRect()
      gesture.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, firstCenter: first.left + first.width / 2, step: second.left - first.left, dragging: false }
    }}
    onPointerMove={event => {
      const current = gesture.current
      if (!current || current.pointerId !== event.pointerId) return
      const dx = Math.abs(event.clientX - current.startX), dy = Math.abs(event.clientY - current.startY)
      if (!current.dragging) {
        // Let vertical scrolling and ordinary taps keep their native behavior.
        if (dy > 8 && dy > dx) { cancelGesture(); return }
        if (dx < 8) return
        current.dragging = true
        event.currentTarget.setPointerCapture(event.pointerId)
      }
      event.preventDefault()
      setDragIndex(indexAt(event, current))
    }}
    onPointerUp={event => {
      const current = gesture.current
      if (!current || current.pointerId !== event.pointerId) return
      if (current.dragging) {
        suppressClick.current = true
        navigate(Math.round(indexAt(event, current)))
      }
      cancelGesture()
    }}
    onPointerCancel={cancelGesture}
    onLostPointerCapture={event => {
      // Touch starts with implicit capture on the button. Its release bubbles
      // when capture moves to the nav; only losing the nav's capture cancels.
      if (event.target === event.currentTarget) cancelGesture()
    }}
    onClickCapture={event => {
      if (suppressClick.current && event.detail > 0) {
        event.preventDefault()
        event.stopPropagation()
      }
      suppressClick.current = false
    }}>
    <span className="mobile-bottom-nav-indicator" aria-hidden="true" />
    {tabs.map(({ view, label, Icon }, index) => <button type="button" key={view} className={visualIndex === index ? 'active' : ''} aria-current={selectedIndex === index ? 'page' : undefined} onClick={() => onNavigate(view)}><Icon aria-hidden="true" /><span>{label}</span></button>)}
    <button type="button" className={visualIndex === moreIndex ? 'active' : ''} aria-expanded={moreOpen} aria-haspopup="dialog" onClick={onMore}><MoreHoriz aria-hidden="true" /><span>Plus</span></button>
  </nav>
}
