import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { NavArrowDown, Search, Check } from 'iconoir-react'
import { getTimeZoneDescription, getTimeZoneGroups } from '../lib/time-zones'
import './time-zone-picker.css'

const common = [
  ['auto', 'Automatique'], ['UTC', 'UTC · Temps universel'], ['Europe/Paris', 'Paris · France'],
  ['Europe/London', 'Londres · Royaume-Uni'], ['America/New_York', 'New York · États-Unis'],
  ['America/Los_Angeles', 'Los Angeles · États-Unis'], ['America/Sao_Paulo', 'São Paulo · Brésil'],
  ['Africa/Cairo', 'Le Caire · Égypte'], ['Asia/Dubai', 'Dubaï · Émirats arabes unis'],
  ['Asia/Bangkok', 'Bangkok · Thaïlande'], ['Asia/Ho_Chi_Minh', 'Hô Chi Minh · Vietnam'],
  ['Asia/Tokyo', 'Tokyo · Japon'], ['Australia/Sydney', 'Sydney · Australie'],
].map(([value, label]) => ({ value, label }))
const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replaceAll('_', ' ')

export function TimeZonePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const id = useId()
  const all = useMemo(() => [...new Map([...getTimeZoneGroups(value).flatMap(group => group.options), ...common].map(option => [option.value, option])).values()], [value])
  const selected = all.find(option => option.value === value)
  const options = query.trim() ? all.filter(option => fold(`${option.value} ${option.label}`).includes(fold(query.trim()))).sort((a, b) => a.label.localeCompare(b.label, 'fr')) : common.some(option => option.value === value) ? common : [...common, ...(selected ? [selected] : [])]
  const close = (restoreFocus = false) => { setOpen(false); setQuery(''); setActive(0); if (restoreFocus) trigger.current?.focus() }
  const choose = (zone: string) => { onChange(zone); close(true) }
  useEffect(() => {
    if (!open) return
    search.current?.focus()
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) { setOpen(false); setQuery(''); setActive(0) } }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  useEffect(() => { if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' }) }, [active, open, id])
  return <div className="time-zone-picker" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close() }} onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(true) } }}>
    <button ref={trigger} type="button" className="time-zone-trigger" aria-label={`Fuseau horaire : ${selected?.label || value}`} aria-expanded={open} aria-controls={id} aria-haspopup="listbox" onClick={() => open ? close() : setOpen(true)}><span>{selected?.label || value}</span><NavArrowDown aria-hidden="true" /></button>
    {open ? <div className="time-zone-dropdown"><label className="time-zone-search"><Search aria-hidden="true" /><input ref={search} type="search" role="combobox" aria-label="Rechercher un fuseau horaire" aria-expanded="true" aria-controls={id} aria-autocomplete="list" aria-activedescendant={options[active] ? `${id}-${active}` : undefined} value={query} placeholder="Rechercher une ville ou un fuseau…" onChange={event => { setQuery(event.target.value); setActive(0) }} onKeyDown={event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(index + 1, options.length - 1)) }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(0, index - 1)) }
      if (event.key === 'Enter') { event.preventDefault(); if (options[active]) choose(options[active].value) }
    }} /></label><p>{query.trim() ? 'Résultats dans le monde entier' : 'Fuseaux courants · recherche pour les autres'}</p><div id={id} role="listbox" aria-label="Fuseaux horaires" className="time-zone-options">{options.length ? options.map((option, index) => <button key={option.value} id={`${id}-${index}`} type="button" role="option" aria-selected={value === option.value} className={active === index ? 'is-active' : undefined} onMouseDown={event => event.preventDefault()} onClick={() => choose(option.value)}><span>{option.label}<small>{getTimeZoneDescription(option.value)}</small></span>{value === option.value ? <Check aria-hidden="true" /> : null}</button>) : <p role="status">Aucun fuseau trouvé.</p>}</div></div> : null}
  </div>
}
