import { hasCollegeFeeling } from '../lib/college-progress'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import './items-matrix.css'

type MatrixItem = {
  itemNumber: number; shortDescription: string; progress: number
  tracking: { assignedColleges: string[]; byCollege: Record<string, { reviews: number; mastery: string }> }
}
type Props = {
  items: MatrixItem[]; colleges: { value: string; label: string; progress: number }[]
  onOpenItem: (number: number) => void
  onFilterCollege: (college: string) => void
  selectedCollege: string
  masteryProgress: (mastery: string) => number
}
const tier = (value: number) => value >= 75 ? 'high' : value >= 50 ? 'mid-high' : value >= 25 ? 'mid' : value > 0 ? 'low' : 'zero'

export function ItemsMatrix({ items, colleges, onOpenItem, onFilterCollege, selectedCollege, masteryProgress }: Props) {
  const helpId = useId()
  const scrollRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)
  const highlighted = useRef<Element[]>([])
  const activeCell = useRef<HTMLTableCellElement | null>(null)
  const clearHighlight = () => {
    for (const element of highlighted.current) element.classList.remove('is-matrix-row', 'is-matrix-column', 'is-matrix-current')
    highlighted.current = []
    activeCell.current = null
  }
  const highlightCell = (target: EventTarget | null) => {
    const cell = target instanceof Element ? target.closest<HTMLTableCellElement>('td,th') : null
    const table = scrollRef.current?.querySelector('table')
    if (!cell || !table?.contains(cell) || cell.parentElement?.classList.contains('items-matrix-spacer')) { clearHighlight(); return }
    if (activeCell.current === cell) return
    clearHighlight()
    activeCell.current = cell
    const row = cell.parentElement!
    if (row.parentElement?.tagName === 'TBODY') {
      row.classList.add('is-matrix-row')
      highlighted.current.push(row)
    }
    if (cell.cellIndex > 0) {
      for (const matrixRow of table.rows) {
        if (matrixRow.classList.contains('items-matrix-spacer')) continue
        const columnCell = matrixRow.cells[cell.cellIndex]
        if (columnCell) { columnCell.classList.add('is-matrix-column'); highlighted.current.push(columnCell) }
      }
    }
    cell.classList.add('is-matrix-current')
    highlighted.current.push(cell)
  }

  const [viewport, setViewport] = useState({ top: 0, height: 600 })
  // Render only the visible rows, with a buffer for smooth trackpad/touch scrolling.
  const rowHeight = 44
  const overscan = 8
  const start = Math.min(Math.max(0, items.length - 1), Math.max(0, Math.floor(viewport.top / rowHeight) - overscan))
  const end = Math.min(items.length, Math.ceil((viewport.top + viewport.height) / rowHeight) + overscan)
  const visibleItems = items.slice(start, end)
  const rowsKey = items.map(item => item.itemNumber).join(',')
  useLayoutEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const measure = () => {
      clearHighlight()
      if (frameRef.current !== null) return
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null
        const top = Math.max(0, scroller.scrollTop - 170)
        const height = scroller.clientHeight
        setViewport(previous => Math.floor(previous.top / rowHeight) === Math.floor(top / rowHeight) && previous.height === height ? previous : { top, height })
      })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    scroller.addEventListener('scroll', measure, { passive: true })
    measure()
    return () => {
      observer.disconnect()
      scroller.removeEventListener('scroll', measure)
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [items.length])
  useLayoutEffect(() => {
    // Keep the horizontal position: filtering must not move the college headers.
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [rowsKey])
  const columns = colleges
  return <div className="items-matrix-view">
    {!items.length ? <div className="items-matrix-empty" role="status"><strong>Aucun item ne correspond aux filtres actuels.</strong>{selectedCollege !== 'ALL' ? <button type="button" onClick={() => onFilterCollege('ALL')}>Retirer le filtre de collège</button> : null}</div> : null}
    <p id={helpId} className="items-matrix-sr-only">Un point indique un collège associé sans ressenti évalué ; une cellule colorée indique le ressenti enregistré. Clique sur un collège pour filtrer ses items, puis reclique pour retirer le filtre, ou sur une cellule pour ouvrir l’item.</p>
    <div ref={scrollRef} className="items-matrix-scroll" tabIndex={0} role="region" aria-label="Matrice des items et collèges, défilement horizontal" aria-describedby={helpId}>
      <table className="items-matrix" aria-rowcount={items.length + 1}
        onPointerOver={event => { if (event.pointerType !== 'touch') highlightCell(event.target) }}
        onPointerLeave={clearHighlight}
        onFocusCapture={event => highlightCell(event.target)}
        onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) clearHighlight() }}>
        <caption className="items-matrix-sr-only">Associations des items aux collèges et suivi des révisions</caption>
        <thead><tr><th scope="col" className="items-matrix-corner">Item <span>Progression</span></th>{columns.map(college => <th scope="col" key={college.value}><button type="button" className={`items-matrix-college is-${tier(college.progress)}`} aria-label={`Filtrer les items du collège ${college.label}`} aria-pressed={selectedCollege === college.value} title={`${selectedCollege === college.value ? 'Retirer le filtre de collège' : `Afficher les items de ${college.label}`} · Progression personnelle : ${college.progress} %`} onClick={() => onFilterCollege(selectedCollege === college.value ? 'ALL' : college.value)}><span className="items-matrix-heading"><span>{college.label}</span></span></button></th>)}</tr></thead>
        <tbody>{start > 0 ? <tr className="items-matrix-spacer" aria-hidden="true"><td colSpan={columns.length + 1} style={{ height: start * rowHeight }} /></tr> : null}{visibleItems.map((item, index) => <tr key={item.itemNumber} className={(start + index) % 2 ? 'is-striped' : undefined} aria-rowindex={start + index + 2}>
          <th scope="row"><button type="button" className="items-matrix-item" title={item.shortDescription} aria-label={`Ouvrir l’item ${item.itemNumber} : ${item.shortDescription}`} onClick={() => onOpenItem(item.itemNumber)}><span className="items-matrix-number">{item.itemNumber}</span><span className="items-matrix-title">{item.shortDescription}</span><small>{Math.round(item.progress * 100)}%</small></button></th>
          {columns.map(college => {
            const assigned = item.tracking.assignedColleges.includes(college.value)
            if (!assigned) return <td key={college.value} aria-label="Non associé" />
            const entry = item.tracking.byCollege[college.value]
            const assessed = hasCollegeFeeling(entry)
            const percent = assessed ? masteryProgress(entry.mastery) : 0
            const description = assessed ? `${percent} % de ressenti · ${entry.reviews} révision${entry.reviews > 1 ? 's' : ''}` : 'Associé · ressenti non évalué'
            return <td key={college.value} className="is-associated"><button type="button" className={`items-matrix-cell is-${tier(percent)}`} title={`Item ${item.itemNumber} · ${college.label} · ${description}`} aria-label={`Item ${item.itemNumber} · ${college.label} · ${description}. Ouvrir l’item.`} onClick={() => onOpenItem(item.itemNumber)}>{assessed ? `${percent}%` : <span aria-hidden="true">•</span>}</button></td>
          })}
        </tr>)}{end < items.length ? <tr className="items-matrix-spacer" aria-hidden="true"><td colSpan={columns.length + 1} style={{ height: (items.length - end) * rowHeight }} /></tr> : null}</tbody>
      </table>
    </div>
  </div>
}
