import { flushSync } from 'react-dom'

/** A one-time transition from the completed onboarding into the application. */
export async function transitionFromOnboarding(update: () => void): Promise<void> {
  let committed = false
  function commit() {
    if (committed) return
    flushSync(update)
    committed = true
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    commit()
    return
  }

  if (typeof document.startViewTransition === 'function') {
    document.documentElement.classList.add('onboarding-dashboard-transition')
    try {
      const transition = document.startViewTransition(commit)
      await transition.finished
    } catch {
      // A skipped browser animation must never prevent entry into the app.
      commit()
    } finally {
      document.documentElement.classList.remove('onboarding-dashboard-transition')
    }
    return
  }

  // Older browsers use the same short fade without the View Transition API.
  const outgoing = document.querySelector<HTMLElement>('.onboarding-page')
  if (outgoing?.animate) {
    await outgoing.animate([
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(-6px)' },
    ], { duration: 180, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {})
  }
  commit()
  const incoming = document.querySelector<HTMLElement>('.dashboard-layout')
  if (incoming?.animate) {
    await incoming.animate([
      { opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 340, easing: 'cubic-bezier(.2,.7,.2,1)' }).finished.catch(() => {})
  }
}
