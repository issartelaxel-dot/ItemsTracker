import { LOCAL_UNIT_LEVELS, localUnitTrackingKey, normalizeLocalUnitTracking, type LocalUnitTracking } from '../lib/local-unit-tracking'
import { Bank, NavArrowDown, OpenBook } from 'iconoir-react'
import type { AcademicProfile } from './OnboardingFlow'
import './academic-faculty-resources.css'

type ItemReference = { number: number; page: number | null; sourceUrl?: string; evidenceKind?: string }
type FacultyUnit = { id: string; code: string; label: string; kind?: string; page: number | null; sourceUrl?: string; slot?: string; site?: string; itemReferences: ItemReference[]; mappingIssues?: { note: string }[] }
export type FacultyProgram = { academicTerm: string; reviewStatus: string; sourceUrl: string; units: FacultyUnit[] }
export type FacultySource = { title: string; url: string; academicTerm: string | null; note?: string }
const kinds: Record<string, string> = { optionnelle: 'Option', choix: 'Au choix', stage: 'Stage', discipline: 'Discipline', conditionnel: 'Sous condition', evaluation: 'Évaluation' }

type Props = {
  profile: AcademicProfile
  expanded?: boolean
  program: FacultyProgram | null
  sources: FacultySource[]
  loading: boolean
  error: string
  onRetry: () => void
  onSettings: () => void
  onOpenItem: (number: number) => void
}

export function AcademicFacultyResources({ profile, program, loading, error, onRetry, onSettings, onOpenItem, expanded = false }: Props) {
  return <details className="faculty-resources" open={expanded} key={`${profile.facultyId}:${profile.yearCode}`}>
    <summary><span className="faculty-resources-icon"><Bank aria-hidden="true" /></span><span><strong>Programme de ma faculté</strong><small>{profile.facultyName || 'Faculté à renseigner'} · {profile.yearCode?.slice(1)}e année · 2026–2027{program ? ` · ${program.units.length} enseignements` : ''}</small></span><NavArrowDown aria-hidden="true" /></summary>
    <div className="faculty-resources-content">
      {!profile.facultyId ? <><p>Renseigne ta faculté pour retrouver les enseignements de ton année.</p><button type="button" onClick={onSettings}>Choisir ma faculté</button></> : loading ? <p role="status">Chargement de ton programme…</p> : error ? <><p role="alert">{error}</p><button type="button" onClick={onRetry}>Réessayer</button></> : <>
        <p>Les UE et options ci-dessous sont propres à ta faculté. Le catalogue des items nationaux reste accessible via le bouton « Nationales ».</p>
        {program ? <>
          <div className={`faculty-program-status ${program.reviewStatus === 'extracted_needs_review' ? '' : 'is-beta'}`}>
            <span>{program.reviewStatus === 'draft_pending_vote' ? 'Accès bêta · projet en attente de validation' : program.reviewStatus === 'partial_confirmed' ? 'Accès bêta · programme partiel' : 'Programme transcrit depuis une source officielle · transcription à relire'}</span>
          </div>
          <div className="faculty-units">{program.units.length === 0 ? <p role="status">Aucun enseignement ne correspond aux filtres. Réinitialise les filtres pour revoir le programme.</p> : null}{program.units.map(unit => {
            const references = unit.itemReferences.filter(ref => ref.evidenceKind !== 'reference')
            const citations = unit.itemReferences.filter(ref => ref.evidenceKind === 'reference')
            return <details className="faculty-unit" key={unit.id}>
              <summary><span><strong>{[unit.code ? `${unit.kind === 'stage' ? 'Stage' : 'UE'} ${unit.code.replace(/^UE\s*/i, '')}` : '', unit.label].filter(Boolean).join(' · ')}</strong><small>{[kinds[unit.kind || ''] || 'Enseignement', unit.site, unit.slot, references.length ? `${references.length} items liés` : 'Liens aux items non documentés'].filter(Boolean).join(' · ')}</small></span><NavArrowDown aria-hidden="true" /></summary>
              <div className="faculty-unit-body">
                {references.length ? <><p>Items explicitement cités dans le programme :</p><div className="faculty-item-links">{references.map(ref => <button type="button" key={ref.number} onClick={() => onOpenItem(ref.number)}><OpenBook aria-hidden="true" />Item #{ref.number}</button>)}</div></> : <p>Aucun rattachement numéroté à un item n’est documenté pour cet enseignement.</p>}
                {citations.length ? <p>Références bibliographiques citées : {citations.map((ref, index) => <span key={ref.number}>{index ? ', ' : ''}item #{ref.number}</span>)}. Ces citations ne constituent pas une affectation pédagogique à l’UE.</p> : null}
                {unit.mappingIssues?.map((issue, index) => <p className="faculty-unit-warning" key={index}>{issue.note}</p>)}
              </div>
            </details>
          })}</div>
        </> : <p>Le programme détaillé 2026–2027 de cette année n’est pas encore documenté pour ta faculté.</p>}
      </>}
    </div>
  </details>
}

export function AcademicItemLocalResources({ itemNumber, profile, program, loading, error, onRetry, tracking, onChange }: Pick<Props, 'profile' | 'program' | 'loading' | 'error' | 'onRetry'> & {
  itemNumber: number
  tracking: Record<string, LocalUnitTracking>
  onChange: (key: string, updater: (entry: LocalUnitTracking) => LocalUnitTracking) => void
}) {
  const linked = program?.units.filter(unit => unit.itemReferences.some(ref => ref.number === itemNumber && ref.evidenceKind !== 'reference')) || []
  const isEmpty = !loading && !error && linked.length === 0
  return <section className={`faculty-item-resources ${isEmpty ? 'is-empty' : ''} item-detail-card item-detail-tab-panel item-detail-tab-panel-tracking`} aria-label="UE locales associées à cet item">
    <h3>Fiches locales</h3>{!isEmpty ? <p>{profile.facultyName || 'Faculté non renseignée'} · {profile.yearCode?.slice(1)}e année · {program?.academicTerm.replace('-', '–') || '2026–2027'}</p> : null}
    {loading ? <p role="status">Chargement des liens locaux…</p> : error ? <><p role="alert">{error}</p><button type="button" onClick={onRetry}>Réessayer</button></> : linked.length ? <ul>{linked.map(unit => {
      const key = localUnitTrackingKey(profile.facultyId || '', profile.yearCode || '', program!.academicTerm, unit.id)
      const data = normalizeLocalUnitTracking(tracking[key])
      const title = [unit.code ? `${unit.kind === 'stage' ? 'Stage' : 'UE'} ${unit.code.replace(/^UE\s*/i, '')}` : '', unit.label].filter(Boolean).join(' · ')
      return <li key={unit.id} aria-label={title}>
        <span className="faculty-item-unit-icon"><Bank aria-hidden="true" /></span>
        <span><strong>{title}</strong>{unit.slot || unit.site ? <small>{[unit.slot, unit.site].filter(Boolean).join(' · ')}</small> : null}</span>
        <div className="faculty-item-unit-tracking">
          <div className="faculty-item-unit-controls">
            <div className="faculty-item-unit-reviews" role="group" aria-label={`Révisions · ${title}`}>
              <span>Révisions</span>
              <div>
                <button type="button" aria-label={`Retirer une révision · ${title}`} disabled={data.reviews === 0} onClick={() => onChange(key, current => ({ ...current, reviews: Math.max(0, current.reviews - 1) }))}>−</button>
                <output aria-label={`Nombre de révisions · ${title}`}>{data.reviews}</output>
                <button type="button" aria-label={`Ajouter une révision · ${title}`} onClick={() => onChange(key, current => ({ ...current, reviews: current.reviews + 1, lastReviewedAt: new Date().toISOString() }))}>+</button>
              </div>
            </div>
            <label className="faculty-item-unit-feeling">Ressenti
              <select aria-label="Ressenti" value={data.mastery} onChange={event => { const mastery = event.target.value as LocalUnitTracking['mastery']; onChange(key, current => ({ ...current, mastery })) }}>
                {LOCAL_UNIT_LEVELS.map(level => <option key={level} value={level}>{({ 'Non évalué': 'Non évalué', Moyen: 'Difficile', Bon: 'Moyen', 'Très bon': 'Facile', Parfait: 'Très facile' })[level]}</option>)}
              </select>
            </label>
          </div>
          <label className="faculty-item-unit-notes">Notes
            <textarea value={data.comments} placeholder="Tes notes sur cette UE pour cet item…" onChange={event => { const comments = event.target.value; onChange(key, current => ({ ...current, comments })) }} />
          </label>
        </div>
      </li>
    })}</ul> : <p>Aucun lien UE–item documenté.</p>}
  </section>
}
