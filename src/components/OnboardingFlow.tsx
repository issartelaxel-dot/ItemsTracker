import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Bank, Book, Check, GraduationCap, Link, NavArrowRight, Search } from 'iconoir-react'
import './onboarding.css'

export type AcademicYear = 'Y2' | 'Y3' | 'Y4' | 'Y5' | 'Y6'
export type AcademicProfile = {
  yearCode: AcademicYear | null
  facultyId: string | null
  facultyName: string | null
  legacyExempt: boolean
  completedAt: string | null
  required: boolean
  facultyChangeCount?: number
  facultyChangeLimit?: number
  facultyChangesRemaining?: number
  facultyChangeRequest?: { status: 'pending' | 'approved' | 'rejected'; facultyId: string | null; yearCode: AcademicYear } | null
}
export type AcademicCoverage = {
  nationalAccess: boolean
  localStatus: string
  publishedUnitCount: number
  rolloutStatus?: CoverageStatus | null
  academicTerm?: string
  sourceTerm: string | null
}
export type AcademicUnit = { id: number; localCode: string | null; label: string; academicTerm: string; itemNumbers: number[] }
type CoverageStatus = 'verified' | 'unconfirmed' | 'missing'
type Faculty = { id: string; name: string; registryStatus: string; coverage?: CoverageStatus | null }
const accessLabels = { verified: 'Accès normal', unconfirmed: 'Accès bêta', missing: 'Bientôt disponible' }
const foldFaculty = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const YEARS: { code: AcademicYear; label: string; number: string }[] = [
  { code: 'Y4', label: '4e année', number: '04' },
  { code: 'Y5', label: '5e année', number: '05' },
  { code: 'Y6', label: '6e année', number: '06' },
]

export function AcademicSelection({
  value, onSave, request, submitLabel = 'Afficher mes ressources', compact = false,
}: {
  value?: AcademicProfile | null
  onSave: (yearCode: AcademicYear, facultyId: string | null, betaAcknowledged?: boolean, facultyName?: string | null) => Promise<void>
  request: (url: string, init?: RequestInit) => Promise<Record<string, unknown>>
  submitLabel?: string
  compact?: boolean
}) {
  const [year, setYear] = useState<AcademicYear | null>(YEARS.some(year => year.code === value?.yearCode) ? value!.yearCode : null)
  const [faculty, setFaculty] = useState<Faculty | null>(value?.facultyId ? {
    id: value.facultyId, name: value.facultyName || value.facultyId, registryStatus: 'needs_review',
  } : null)
  const [query, setQuery] = useState(value?.facultyName || '')
  const [facultyResult, setFacultyResult] = useState<{ key: string; faculties: Faculty[]; error: boolean } | null>(null)
  const [reload, setReload] = useState(0)
  const [betaAcknowledged, setBetaAcknowledged] = useState(false)
  const [inquiryOpen, setInquiryOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [inquiryPending, setInquiryPending] = useState(false)
  const [inquirySent, setInquirySent] = useState(false)
  const requestKey = `${year}:${reload}`
  const loading = facultyResult?.key !== requestKey
  const loadError = !loading && Boolean(facultyResult?.error)
  const faculties = !loading ? facultyResult?.faculties || [] : []
  const options = faculties.filter(option => foldFaculty(option.name).includes(foldFaculty(query)))
  const inquiryContext = useRef(0)
  const selectedStatus = faculty && year ? faculties.find(option => option.id === faculty.id)?.coverage : null
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const requestRef = useRef(request)
  useEffect(() => { requestRef.current = request }, [request])
  useEffect(() => {
    let cancelled = false
    void requestRef.current(`/api/onboarding/faculties?year=${year || ''}`)
      .then(result => { if (!cancelled) { setFacultyResult({ key: requestKey, faculties: (result.faculties || []) as Faculty[], error: false }); setActive(0) } })
      .catch(() => { if (!cancelled) setFacultyResult({ key: requestKey, faculties: [], error: true }) })
    return () => { cancelled = true }
  }, [year, requestKey])
  function resetSelectionFeedback() {
    inquiryContext.current += 1
    setBetaAcknowledged(false); setInquiryOpen(false); setInquirySent(false); setMessage(''); setError('')
  }
  async function sendInquiry() {
    if (!faculty || !year || inquiryPending) return
    const context = inquiryContext.current
    setInquiryPending(true); setError('')
    try {
      await requestRef.current('/api/onboarding/availability-requests', { method: 'POST', body: JSON.stringify({ facultyId: faculty.id, yearCode: year, message }) })
      if (inquiryContext.current === context) { setInquirySent(true); setInquiryOpen(false) }
    } catch (cause) { if (inquiryContext.current === context) setError(cause instanceof Error ? cause.message : 'Impossible d’enregistrer la demande. Réessaie.') }
    finally { setInquiryPending(false) }
  }
  const choose = (option: Faculty) => { resetSelectionFeedback(); setFaculty(option); setQuery(option.name); setOpen(false); inputRef.current?.focus() }
  const skip = () => { resetSelectionFeedback(); setFaculty(null); setQuery(''); setOpen(false); inputRef.current?.focus() }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!year) { setError('Choisis ton année pour continuer.'); return }
    if (query.trim() && !faculty) { setError('Sélectionne une faculté proposée ou efface la recherche pour continuer sans faculté.'); return }
    if (faculty && (loading || loadError || !selectedStatus)) { setError('Attends la vérification du cursus ou réessaie le chargement.'); return }
    if (selectedStatus === 'missing') { setError('Ce cursus est bientôt disponible. Tu peux enregistrer une demande.'); return }
    if (selectedStatus === 'unconfirmed' && !betaAcknowledged) { setError('Confirme que tu vérifieras le programme proposé en bêta.'); return }
    setError(''); setPending(true)
    try { await onSave(year, faculty?.id || null, betaAcknowledged, faculty?.name || null) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'La connexion a échoué. Réessaie.') }
    finally { setPending(false) }
  }
  return <form className={`academic-form ${compact ? 'academic-form-compact' : ''}`} onSubmit={submit}>
    <fieldset className="academic-years">
      <legend>{compact ? 'Année de médecine' : '01 · Ton année de médecine'}</legend>
      <div className="academic-year-grid">{YEARS.map(option => <label key={option.code} className={`academic-year ${year === option.code ? 'is-selected' : ''}`}>
        <input type="radio" name="academic-year" value={option.code} checked={year === option.code}
          onChange={() => { resetSelectionFeedback(); setYear(option.code) }} />
        <span className="academic-year-number">{option.number}</span>
        <strong>{option.label}</strong>
        {year === option.code ? <Check aria-hidden="true" className="academic-year-check" /> : null}
      </label>)}</div>
      <small>Disponible pour les 4e, 5e et 6e années de médecine.</small>
    </fieldset>
    <div className="academic-faculty-block">
      <label className="academic-section-label" htmlFor="academic-faculty-input">{compact ? 'Faculté' : '02 · Ta faculté'}</label>
      <p>Dans quelle faculté étudies-tu ? <span>Tu peux la renseigner plus tard.</span></p>
      <div className="academic-faculty-combo" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
        <Search aria-hidden="true" />
        <input ref={inputRef} id="academic-faculty-input" type="search" role="combobox"
          aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
          placeholder="Rechercher une faculté…" value={query} autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={event => { resetSelectionFeedback(); setQuery(event.target.value); setFaculty(null); setActive(0); setOpen(true) }}
          onKeyDown={event => {
            if (event.key === 'Escape') { setOpen(false); return }
            if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive(index => Math.min(index + 1, options.length - 1)) }
            if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, 0)) }
            if (event.key === 'Enter' && open && options[active]) { event.preventDefault(); choose(options[active]) }
          }} />
        {faculty ? <button type="button" className="academic-clear" onClick={skip} aria-label="Effacer la faculté">×</button> : null}
        {open ? <div className="academic-options" id={listId} role="listbox" aria-label="Facultés proposées">
          {loading ? <p className="academic-no-result">Chargement des facultés…</p> : loadError ? <button type="button" onClick={() => setReload(count => count + 1)}>Réessayer le chargement</button> : options.length ? options.map((option, index) => <button key={option.id} type="button" role="option" id={`${listId}-${index}`}
            aria-selected={active === index} className={active === index ? 'is-active' : ''}
            onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}><span>{option.name}</span>{option.coverage ? <small className={`academic-access-badge is-${option.coverage}`}>{accessLabels[option.coverage]}</small> : null}</button>)
            : <p className="academic-no-result">Aucune faculté trouvée dans cette liste indicative.</p>}
          <button type="button" className="academic-skip-option" onMouseDown={event => event.preventDefault()} onClick={skip}>Je ne trouve pas ma faculté / Je préfère ne pas préciser</button>
        </div> : null}
      </div>
      <p className="academic-faculty-help">{faculty ? 'Statut pour ton année · 2026–2027' : 'Facultatif · aucune localisation GPS n’est demandée.'}</p>
    </div>
    {faculty && year && selectedStatus !== 'verified' ? <section className={`academic-access-panel is-${selectedStatus || 'loading'}`} aria-live="polite">
      <strong>{loading ? 'Vérification du cursus…' : selectedStatus ? accessLabels[selectedStatus] : 'Vérification indisponible'}</strong>
      {loadError ? <button type="button" onClick={() => setReload(count => count + 1)}>Réessayer</button> : null}
      {selectedStatus === 'unconfirmed' ? <><p>Des informations ont été trouvées, mais le programme est partiel ou reste à confirmer. Vérifie sa correspondance avec celui de ta faculté.</p>
        <label className="academic-beta-check"><input type="checkbox" checked={betaAcknowledged} onChange={event => setBetaAcknowledged(event.target.checked)} />Je comprends que cet accès est en bêta et je vérifierai mon programme.</label></> : null}
      {selectedStatus === 'missing' ? <><p>Le programme local de cette année n’est pas encore disponible. Tu peux demander son ajout.</p>
        {inquirySent ? <p role="status">Ta demande a été enregistrée pour {faculty.name}, {YEARS.find(option => option.code === year)?.label}, 2026–2027.</p> : <button type="button" className="academic-inquiry-toggle" onClick={() => setInquiryOpen(!inquiryOpen)} aria-expanded={inquiryOpen}>Demander la disponibilité</button>}
        {inquiryOpen ? <div className="academic-inquiry"><label htmlFor={`${listId}-message`}>Message facultatif</label><textarea id={`${listId}-message`} maxLength={2000} rows={3} value={message} onChange={event => setMessage(event.target.value)} placeholder="Une précision sur ton cursus, un lien vers le programme…" />
          <button type="button" onClick={() => void sendInquiry()} disabled={inquiryPending}>{inquiryPending ? 'Enregistrement…' : 'Enregistrer ma demande'}</button></div> : null}
        <p>L’accès aux ressources, y compris au tronc commun national, n’est pas encore ouvert pour ce cursus. Enregistre une demande de disponibilité.</p></> : null}
    </section> : null}
    {!compact && selectedStatus !== 'verified' ? <div className="academic-info"><strong>Pourquoi cette information ?</strong><span>Pour proposer les UE locales vérifiées et des statistiques académiques agrégées. Aucun contenu local non publié ne sera affiché.</span></div> : null}
    {error ? <p className="academic-error" role="alert">{error}</p> : null}
    {selectedStatus !== 'missing' ? <button type="submit" className="academic-submit" disabled={pending || inquiryPending || Boolean(faculty && (loading || loadError)) || (selectedStatus === 'unconfirmed' && !betaAcknowledged)}>{pending ? 'Enregistrement…' : submitLabel}<NavArrowRight aria-hidden="true" /></button> : null}
  </form>
}

export type OnboardingPreparationStage = 0 | 1 | 2 | 3

function OnboardingPreparation({ year, stage, ready = false, onContinue }: { year: AcademicYear; stage: OnboardingPreparationStage; ready?: boolean; onContinue: () => void | Promise<void> }) {
  const heading = useRef<HTMLHeadingElement>(null)
  const [entering, setEntering] = useState(false)
  useEffect(() => { heading.current?.focus() }, [ready])
  const national = ['Y4', 'Y5', 'Y6'].includes(year)
  const steps = [
    { icon: Book, label: `Parcours de ${YEARS.find(option => option.code === year)?.label}` },
    { icon: Bank, label: national ? 'Items et collèges disponibles' : 'UE locales disponibles' },
    { icon: Link, label: 'Associations et espace personnel' },
  ]
  return <div className={`onboarding-preparation ${ready ? 'is-ready' : ''}`} aria-busy={!ready}>
    <div className="onboarding-preparation-art" aria-hidden="true">
      <div className="onboarding-art-orbit" />
      <div className="onboarding-art-sheet is-back" />
      <div className="onboarding-art-sheet is-front"><span /><span /><span /><span /></div>
      <span className="onboarding-art-icon is-book"><Book /></span>
      <span className="onboarding-art-icon is-bank"><Bank /></span>
      <span className="onboarding-art-icon is-link"><Link /></span>
    </div>
    <h1 id="onboarding-preparation-title" ref={heading} tabIndex={-1}>{ready ? 'Ton espace est prêt' : 'Préparation de ton espace'}</h1>
    <p>{ready ? `Ton parcours de ${YEARS.find(option => option.code === year)?.label} est configuré. Tu peux accéder à ton dashboard.` : `Nous préparons les ressources et associations disponibles pour la ${YEARS.find(option => option.code === year)?.label}.`}</p>
    <ol className="onboarding-preparation-steps" aria-label="Étapes de préparation">
      {steps.map((step, index) => <li key={step.label} className={stage > index ? 'is-done' : stage === index ? 'is-current' : 'is-waiting'} aria-current={stage === index ? 'step' : undefined}>
        <step.icon aria-hidden="true" /><span>{step.label}</span>
        <span className="onboarding-step-status" aria-hidden="true">{stage > index ? <Check /> : stage === index ? <span className="onboarding-step-spinner" /> : <Check />}</span>
        <span className="onboarding-step-sr">{stage > index ? 'Terminé' : stage === index ? 'En cours' : 'À venir'}</span>
      </li>)}
    </ol>
    <div className="onboarding-preparation-footer">
      {ready ? <button type="button" className="academic-submit onboarding-ready-button" disabled={entering} onClick={() => {
        if (entering) return
        setEntering(true)
        void Promise.resolve(onContinue()).finally(() => setEntering(false))
      }}>{entering ? 'Ouverture…' : 'Accéder au dashboard'}<NavArrowRight aria-hidden="true" /></button> : <p className="onboarding-preparation-note" role="status">{stage === 3 ? 'Finalisation de ton espace…' : 'Cela peut prendre quelques secondes…'}</p>}
    </div>
  </div>
}

export function OnboardingFlow({ profile, request, onSave, onContinue, mode = 'choose' }: {
  profile: AcademicProfile | null
  coverage: AcademicCoverage | null
  request: (url: string, init?: RequestInit) => Promise<Record<string, unknown>>
  onSave: (year: AcademicYear, facultyId: string | null, betaAcknowledged?: boolean, onProgress?: (stage: OnboardingPreparationStage) => void) => Promise<void>
  onContinue: () => void | Promise<void>
  mode?: 'choose' | 'success'
}) {
  const [preparation, setPreparation] = useState<{ year: AcademicYear; stage: OnboardingPreparationStage } | null>(null)
  async function prepare(year: AcademicYear, facultyId: string | null, beta?: boolean) {
    setPreparation({ year, stage: 0 })
    try {
      await onSave(year, facultyId, beta, stage => setPreparation({ year, stage }))
    } finally { setPreparation(null) }
  }
  const showPreparation = Boolean(preparation) || mode === 'success'
  const preparationYear = preparation?.year || profile?.yearCode
  return <main className="onboarding-page">
    <header className="onboarding-brand"><span className="onboarding-logo" aria-hidden="true"><span /></span><strong>ItemsTracker</strong><small>Ton espace de révision</small></header>
    <section className={`onboarding-card ${showPreparation ? 'is-preparing' : ''}`} aria-labelledby={showPreparation ? 'onboarding-preparation-title' : 'onboarding-title'}>
      {showPreparation && preparationYear ? <OnboardingPreparation year={preparationYear} stage={mode === 'success' ? 3 : preparation?.stage || 0} ready={mode === 'success'} onContinue={onContinue} /> : null}
      {mode === 'choose' ? <div hidden={Boolean(preparation)}>
        <div className="onboarding-heading"><span className="onboarding-heading-icon"><GraduationCap aria-hidden="true" /></span><div><p className="onboarding-eyebrow">PARCOURS INITIAL</p><h1 id="onboarding-title"><span className="onboarding-title-desktop">Personnalisons ton espace de révision</span><span className="onboarding-title-mobile">En quelle année de médecine es-tu ?</span></h1><p className="onboarding-title-desktop">Choisis ton année et, si tu le souhaites, ta faculté.</p><p className="onboarding-title-mobile">Ton espace s’adapte à ton parcours.</p></div></div>
        <AcademicSelection value={profile} request={request} onSave={prepare} />
      </div> : null}
    </section>
  </main>
}

export function AcademicLocalResources({ title, coverage, units }: {
  title: string; coverage: AcademicCoverage | null; units: AcademicUnit[]
}) {
  return <section className="academic-local-panel" aria-labelledby="academic-local-title">
    <span className="onboarding-heading-icon"><GraduationCap aria-hidden="true" /></span>
    <h1 id="academic-local-title">{title}</h1>
    {units.length ? <>
      <p>Voici les UE locales publiées pour ton année et ta faculté. La couverture peut être partielle.</p>
      <ul>{units.map(unit => <li key={unit.id}><strong>{unit.localCode ? `${unit.localCode} · ` : ''}{unit.label}</strong><small>Année universitaire {unit.academicTerm}</small>
        {unit.itemNumbers.length ? <span>Items explicitement liés : {unit.itemNumbers.join(', ')}</span> : <span>Aucun lien vers un item national publié pour cette UE.</span>}</li>)}</ul>
    </> : <><p>Ressources locales en préparation.</p><p>Aucune UE de ton cursus n’est encore publiée. Ton compte reste utilisable et tu peux modifier ta faculté dans les paramètres.</p></>}
    {coverage?.sourceTerm ? <small>Dernier millésime publié : {coverage.sourceTerm}</small> : null}
  </section>
}
