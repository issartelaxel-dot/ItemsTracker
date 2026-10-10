import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function MobileSheet({ title, onClose, children, restoreFocusSelector }: { title: string; onClose: () => void; children: ReactNode; restoreFocusSelector: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const previous = document.querySelector<HTMLElement>(restoreFocusSelector) ?? document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      previous?.focus({ preventScroll: true })
    }
  }, [restoreFocusSelector])
  return createPortal(<dialog ref={ref} className="mobile-sheet" aria-label={title}
    onKeyDown={event => {
      if (event.key !== 'Tab') return
      const targets = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(element => element.getClientRects().length)
      const first = targets[0], last = targets.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => {
      if (event.target !== event.currentTarget) return
      const box = event.currentTarget.getBoundingClientRect()
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose()
    }}>
    <div className="mobile-sheet-handle" aria-hidden="true" />
    <header className="mobile-sheet-head"><h2>{title}</h2><button type="button" className="ghost-btn" aria-label={`Fermer ${title}`} onClick={onClose}>×</button></header>
    <div className="mobile-sheet-body">{children}</div>
  </dialog>, document.body)
}
