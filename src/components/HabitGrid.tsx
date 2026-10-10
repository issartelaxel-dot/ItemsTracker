import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export function HabitGrid({ weeks, children }: { weeks: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [cell, setCell] = useState(10)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const fit = (width: number) => {
      // Keep the annual calendar below 140px, instead of stretching every stat card.
      for (let tenths = 100; tenths >= 40; tenths--) {
        const size = tenths / 10
        const gap = size * 0.35
        const columns = Math.max(1, Math.floor((width + gap) / (size + gap)))
        const rows = Math.ceil(weeks / columns)
        const height = rows * (7 * size + 6 * gap) + Math.max(0, rows - 1) * 10
        if (height <= 140 || tenths === 40) { setCell(size); break }
      }
    }
    fit(element.clientWidth)
    const observer = new ResizeObserver(entries => fit(entries[0].contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [weeks])
  return <div ref={ref} className="habit-tracker-wrap dashboard-habit-wrap" style={{ '--habit-cell-size': `${cell}px`, '--habit-gap': `${cell * 0.35}px` } as CSSProperties}>{children}</div>
}
