import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export function HabitGrid({ weeks, children }: { weeks: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState({ cell: 6, columns: weeks })
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const fit = (width: number) => {
      let best = { cell: 0, columns: weeks }
      for (let rows = 1; rows <= weeks; rows++) {
        // Choose fewer rows first; when wrapping, distribute weeks evenly.
        const columns = Math.ceil(weeks / rows)
        const cell = Math.max(1, Math.min(10, width / (columns * 1.35 - 0.35), (140 - (rows - 1) * 10) / (rows * 9.1)))
        const candidate = { cell: Math.floor(cell * 100) / 100, columns }
        if (candidate.cell > best.cell) best = candidate
        if (candidate.cell >= 6) { best = candidate; break }
      }
      setLayout(current => current.cell === best.cell && current.columns === best.columns ? current : best)
    }
    fit(element.clientWidth)
    const observer = new ResizeObserver(entries => fit(entries[0].contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [weeks])
  return <div ref={ref} className="habit-tracker-wrap dashboard-habit-wrap" style={{
    '--habit-cell-size': `${layout.cell}px`, '--habit-gap': `${layout.cell * 0.35}px`,
    gridTemplateColumns: `repeat(${layout.columns}, var(--habit-cell-size))`,
  } as CSSProperties}>{children}</div>
}
