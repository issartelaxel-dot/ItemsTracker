import { AdminFacultyChanges } from './AdminFacultyChanges'
import { useEffect, useMemo, useState } from 'react'
import { adminApi } from '../lib/admin-api'

type Year = 'Y2' | 'Y3' | 'Y4' | 'Y5' | 'Y6'
type Coverage = 'verified' | 'unconfirmed' | 'missing'
type Faculty = { id: string; name: string; coverage: Coverage }
type NationalUnit = { number: number; label: string; itemCount: number }
type LocalLink = { scope: 'local'; unitId: string; unitCode: string; unitLabel: string; unitKind: string; unitSite: string; unitSlot: string; evidenceKind: 'programme' | 'reference'; sourceUrl: string; sourcePage: number | null }
type ReferenceLink = { referenceId: string; title: string; edition: string; editionNote: string; status: 'verified' | 'candidate'; sourceUrl: string; sourcePage: number | null; checkedAt: string; coverageNote: string }
type ReferenceBook = { id: string; title: string; edition: string; itemCount: number }
type Item = { number: number; title: string; lisaUrl: string; nationalUnit: { unitNumber: number; unitLabel: string; sourceUrl: string; pdfUrl: string; sourcePage: number }; colleges: string[]; collegeLinks: { name: string; role: 'writing' | 'reviewing'; sourceUrl: string; sourceEdition: string; verificationStatus: string }[]; unitLinks: LocalLink[]; referenceLinks: ReferenceLink[]; referenceCandidates: ReferenceLink[] }
type College = { name: string; itemCount: number }
type Unit = { id: string; code: string; label: string; page: number | null; sourceUrl?: string; kind?: 'obligatoire' | 'optionnelle' | 'choix' | 'stage' | 'discipline' | 'conditionnel' | 'evaluation'; slot?: string; site?: string; itemNumbers: number[]; itemReferences: { number: number; page: number | null; sourceUrl?: string; evidenceKind?: 'programme' | 'reference' }[]; mappingIssues?: { note: string; declaredNumbers: number[]; sourceUrl: string; sourcePage: number }[] }
type LocalProgram = {
  academicTerm: string
  sourceUrl: string
  reviewStatus: string
  sharedFacultyProgram?: string
  units: Unit[]
}
type Catalog = {
  facultyId: string
  yearCode: Year
  scope: 'national_second_cycle' | 'local_first_cycle'
  academicTerm: string | null
  reviewedMapping: boolean
  nationalUnits: NationalUnit[]
  nationalUnitSource: { title: string; originalUrl: string; publicationDate: string }
  referenceBooks: ReferenceBook[]
  collegeSource: { edition: string; originalUrl: string; mirrorUrl: string; verificationStatus: string }
  items: Item[]
  colleges: College[]
  localProgram: LocalProgram | null
  candidateSources: { title: string; url: string; academicTerm: string | null; note: string }[]
}
type Response = { faculties: Faculty[]; catalog: Catalog }

const years: Array<{ code: Year; label: string }> = [
  { code: 'Y4', label: '4e année · DFASM1' },
  { code: 'Y5', label: '5e année · DFASM2' },
  { code: 'Y6', label: '6e année · DFASM3' },
]
const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr')
const coverageDot: Record<Coverage, string> = { verified: '🟢', unconfirmed: '🟠', missing: '🔴' }
const coverageText: Record<Coverage, string> = {
  verified: 'Source du programme 2026–2027 vérifiée',
  unconfirmed: 'Source trouvée, programme à confirmer ou incomplet',
  missing: 'Aucun programme trouvé',
}
const sourceLink = (url: string, page: number | null) => page ? `${url}#page=${page}` : url
const localCode = (code: string) => code ? /^UE\s*/i.test(code) ? code.replace(/^UE\s*/i, 'UE ') : `UE ${code}` : ''
const itemUnitLinks = (item: Item) => <div className="admin-catalog-item-units">
  <p className="admin-catalog-national-unit"><a href={sourceLink(item.nationalUnit.pdfUrl, item.nationalUnit.sourcePage)} target="_blank" rel="noopener noreferrer">UE nationale {item.nationalUnit.unitNumber} · {item.nationalUnit.unitLabel} ↗</a></p>
  {item.unitLinks.length ? item.unitLinks.map(link => <p className="admin-catalog-local-link" key={link.unitId}>
    <a href={sourceLink(link.sourceUrl, link.sourcePage)} target="_blank" rel="noopener noreferrer">{link.evidenceKind === 'reference' ? 'Référence locale citée' : 'UE locale'}{link.unitKind === 'optionnelle' ? ' · optionnelle' : ''} · {[localCode(link.unitCode), link.unitLabel, link.unitSite, link.unitSlot].filter(Boolean).join(' · ')} ↗</a>
  </p>) : <p className="admin-catalog-no-local-link">Aucun lien à une UE locale documenté pour cette année.</p>}
</div>
const unitTag = (unit: Unit) => [unit.kind === 'stage' ? `Stage ${unit.code}` : unit.kind === 'discipline' ? 'Discipline' : unit.code ? `UE ${unit.code}` : 'Enseignement', unit.site || '', unit.kind === 'optionnelle' ? 'optionnel' : unit.kind === 'choix' ? 'à choisir' : unit.kind === 'conditionnel' ? 'selon résultat' : '', unit.slot || ''].filter(Boolean).join(' · ')
const collegeRoles = (item: Item) => item.collegeLinks.length ? <p>{item.collegeLinks.map((link, index) => <span key={`${link.name}:${link.role}`}>{index ? ' · ' : ''}<a href={link.sourceUrl} target="_blank" rel="noopener noreferrer">{link.name}</a> ({link.role === 'writing' ? 'écriture' : 'relecture'})</span>)}</p> : <p>Collèges LiSA à vérifier</p>
const referenceRow = (link: ReferenceLink) => <li key={link.referenceId}>
  <strong>{link.title}</strong><span>{link.edition}</span>
  {link.editionNote && <small>{link.editionNote}</small>}
  {link.coverageNote && <small>{link.coverageNote}</small>}
  <a href={sourceLink(link.sourceUrl, link.sourcePage)} target="_blank" rel="noopener noreferrer">{link.status === 'verified' ? 'Preuve' : 'Source de la piste'}{link.sourcePage ? ` · p. ${link.sourcePage}` : ''} ↗</a>
  <small>{link.status === 'verified' ? 'Vérifié' : 'Contrôlé, à confirmer'} le {link.checkedAt}</small>
</li>
const itemReferences = (item: Item) => <div className="admin-catalog-references">
  {item.referenceLinks.length > 0 && <details className="admin-catalog-reference-verified"><summary>Ouvrages documentés ({item.referenceLinks.length})</summary><ul>{item.referenceLinks.map(referenceRow)}</ul></details>}
  {item.referenceCandidates.length > 0 && <details className="admin-catalog-reference-candidate"><summary>Pistes à confirmer ({item.referenceCandidates.length})</summary><ul>{item.referenceCandidates.map(referenceRow)}</ul></details>}
</div>
const unitEvidence = (unit: Unit, items: Map<number, Item>, programUrl: string) => <>
  {unit.itemReferences.length > 0 ? <details className="admin-catalog-unit-items">
    <summary>{unit.itemReferences.length} items cités · voir les items et collèges</summary>
    <div>{unit.itemReferences.map(reference => {
      const item = items.get(reference.number)
      return <div className="admin-catalog-unit-item" key={reference.number}>
        <a href={sourceLink(reference.sourceUrl || unit.sourceUrl || programUrl, reference.page)} target="_blank" rel="noopener noreferrer">#{reference.number} ↗</a>
        <span>{item?.title || `Item ${reference.number}`}<small>{reference.evidenceKind === 'reference' ? 'Référence bibliographique citée · ' : ''}{item?.nationalUnit ? `UE nationale ${item.nationalUnit.unitNumber} · ` : ''}{item?.colleges.length ? item.colleges.join(' · ') : 'Collèges LiSA à vérifier'}</small></span>
      </div>
    })}</div>
  </details> : <p className="admin-catalog-no-local-link">Aucun lien numéroté à un item documenté.</p>}
  {unit.mappingIssues?.map((issue, index) => <details key={index} className="admin-catalog-mapping-issue">
    <summary>Numérotation à vérifier · {issue.declaredNumbers.length} numéros cités</summary>
    <p>{issue.note}</p><a href={sourceLink(issue.sourceUrl, issue.sourcePage)} target="_blank" rel="noopener noreferrer">Vérifier le document, page {issue.sourcePage} ↗</a>
  </details>)}
</>

type AvailabilityRequest = { id: string; facultyName: string; yearCode: Year; academicTerm: string; message: string; createdAt: string }
function AvailabilityRequests() {
  const [requests, setRequests] = useState<AvailabilityRequest[] | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function load() {
    setPending(true); setError('')
    try { setRequests((await adminApi<{ requests: AvailabilityRequest[] }>('/api/onboarding/admin/availability-requests')).requests) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Chargement impossible.') }
    finally { setPending(false) }
  }
  return <details className="admin-availability-requests"><summary>Demandes de disponibilité des cursus</summary>
    <p>Demandes enregistrées depuis l’onboarding, avec message facultatif.</p>
    <button type="button" onClick={() => void load()} disabled={pending}>{pending ? 'Chargement…' : requests ? 'Actualiser les demandes' : 'Afficher les demandes'}</button>
    {error ? <p role="alert">{error}</p> : null}
    {requests ? <><p>{requests.length} demande(s){requests.length === 500 ? ' · 500 plus récentes' : ''}</p><ul>{requests.map(request => <li key={request.id}>
      <strong>{request.facultyName} · {request.yearCode.replace('Y', '')}e année · {request.academicTerm}</strong>
      <small>{new Date(request.createdAt).toLocaleString('fr-FR')}</small>{request.message ? <p>{request.message}</p> : <p>Sans message</p>}
    </li>)}</ul></> : null}
  </details>
}

export function AdminSources() {
  const [year, setYear] = useState<Year>('Y4')
  const [faculty, setFaculty] = useState('bordeaux')
  const [faculties, setFaculties] = useState<Faculty[]>([])
  const [facultyCoverageYear, setFacultyCoverageYear] = useState<Year | null>(null)
  const [response, setResponse] = useState<{ key: string; catalog: Catalog } | null>(null)
  const [college, setCollege] = useState('')
  const [query, setQuery] = useState('')
  const [site, setSite] = useState('')
  const [nationalUnit, setNationalUnit] = useState('')
  const [localUnit, setLocalUnit] = useState('')
  const [linkState, setLinkState] = useState('')
  const [referenceBook, setReferenceBook] = useState('')
  const [visible, setVisible] = useState(40)
  const [requestError, setRequestError] = useState<{ key: string; message: string } | null>(null)
  const key = `${year}:${faculty}`
  const catalog = response?.key === key ? response.catalog : null
  const error = requestError?.key === key ? requestError.message : ''
  const loading = !catalog && !error

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ yearCode: year, facultyId: faculty })
    adminApi<Response>(`/api/admin/academic-catalog?${params}`, { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return
        setFaculties(result.faculties)
        setFacultyCoverageYear(year)
        setResponse({ key, catalog: result.catalog })
      })
      .catch(cause => {
        if (!controller.signal.aborted) setRequestError({ key, message: cause instanceof Error ? cause.message : 'Chargement impossible.' })
      })
    return () => controller.abort()
  }, [year, faculty, key])

  const selectedFacultyName = faculties.find(entry => entry.id === faculty)?.name || faculty
  const selectedCoverage = facultyCoverageYear === year ? faculties.find(entry => entry.id === faculty)?.coverage : undefined
  const resetUnitFilters = () => { setNationalUnit(''); setLocalUnit(''); setLinkState(''); setReferenceBook('') }
  const filteredItems = useMemo(() => (catalog?.items || []).filter(item =>
    (!college || item.colleges.includes(college)) &&
    (!referenceBook || item.referenceLinks.some(link => link.referenceId === referenceBook)) &&
    (!nationalUnit || String(item.nationalUnit.unitNumber) === nationalUnit) &&
    (!localUnit || item.unitLinks.some(link => link.unitId === localUnit)) &&
    (!site || item.unitLinks.some(link => link.unitSite === site)) &&
    (!linkState || (linkState === 'linked' ? item.unitLinks.length > 0 : item.unitLinks.length === 0)) &&
    (!query || fold(`#${item.number} ${item.title} ${item.colleges.join(' ')} UE nationale ${item.nationalUnit.unitNumber} ${item.nationalUnit.unitLabel} ${item.unitLinks.map(link => `${localCode(link.unitCode)} ${link.unitLabel}`).join(' ')} ${item.referenceLinks.map(link => `${link.title} ${link.edition}`).join(' ')}`).includes(fold(query))),
  ), [catalog, college, query, nationalUnit, localUnit, linkState, site, referenceBook])
  const localItemByNumber = useMemo(() => new Map((catalog?.items || []).map(item => [item.number, item])), [catalog])
  const sites = useMemo(() => [...new Set((catalog?.localProgram?.units || []).map(unit => unit.site).filter((value): value is string => !!value))], [catalog])
  const units = useMemo(() => (catalog?.localProgram?.units || []).filter(unit =>
    (!site || unit.site === site) && (!localUnit || unit.id === localUnit) && (!query || fold(`${unit.code} ${unit.label} ${unit.itemNumbers.join(' ')} ${unit.itemNumbers.map(number => localItemByNumber.get(number)?.title || '').join(' ')}`).includes(fold(query)))), [catalog, localItemByNumber, query, site, localUnit])

  return <section className="admin-catalog" aria-label="Collèges et items par année et faculté">
    <AvailabilityRequests />
    <AdminFacultyChanges />
    <div className="admin-catalog-intro">
      <h2>Collèges et items</h2>
      <p>Deuxième cycle : choisis la 4e, 5e ou 6e année et une faculté.</p>
    </div>
    <div className="admin-catalog-controls">
      <label>Année
        <select value={year} onChange={event => { setYear(event.target.value as Year); setCollege(''); setQuery(''); setSite(''); setVisible(40); resetUnitFilters() }}>
          {years.map(entry => <option key={entry.code} value={entry.code}>{entry.label}</option>)}
        </select>
      </label>
      <label>Faculté
        <select className={selectedCoverage ? `coverage-${selectedCoverage}` : ''} value={faculty} onChange={event => { setFaculty(event.target.value); setCollege(''); setQuery(''); setSite(''); setVisible(40); resetUnitFilters() }}>
          {faculties.length ? faculties.map(entry => <option key={entry.id} value={entry.id} title={facultyCoverageYear === year ? coverageText[entry.coverage] : undefined}>{facultyCoverageYear === year ? `${coverageDot[entry.coverage]} ` : ''}{entry.name}</option>) : <option value={faculty}>{selectedFacultyName}</option>}
        </select>
      </label>
      <label>Rechercher
        <input type="search" value={query} placeholder="Item, UE ou numéro…" onChange={event => { setQuery(event.target.value); setVisible(40) }} />
      </label>
    </div>
    <div className="admin-catalog-coverage-legend" aria-label="Légende des facultés pour l’année sélectionnée">
      <span><i className="coverage-verified" /> Source du programme 2026–2027 vérifiée</span>
      <span><i className="coverage-unconfirmed" /> Source trouvée, à confirmer ou incomplète</span>
      <span><i className="coverage-missing" /> Aucun programme trouvé</span>
    </div>
    {loading && <p role="status" className="admin-sources-feedback">Chargement du référentiel…</p>}
    {error && <p role="alert" className="admin-sources-feedback admin-sources-error">{error}</p>}
    {catalog?.scope === 'national_second_cycle' && <>
      <p className="admin-catalog-context">Chaque item est relié à son UE nationale, commune aux facultés. Les UE locales et les options dépendent de la faculté et de l’année : seuls leurs liens numérotés dans une source sont affichés. « Aucun lien local documenté » indique une preuve manquante, pas un item absent du cursus.</p>
      <div className="admin-catalog-controls admin-catalog-link-controls">
        <label>UE nationale<select value={nationalUnit} onChange={event => { setNationalUnit(event.target.value); setVisible(40) }}><option value="">Toutes les UE nationales</option>{catalog.nationalUnits.map(unit => <option key={unit.number} value={unit.number}>UE {unit.number} · {unit.label} ({unit.itemCount} items)</option>)}</select></label>
        <label>UE locale<select value={localUnit} disabled={!catalog.localProgram} onChange={event => { setLocalUnit(event.target.value); setVisible(40) }}><option value="">{catalog.localProgram ? 'Tous les enseignements locaux' : 'Programme local non documenté'}</option>{catalog.localProgram?.units.map(unit => <option key={unit.id} value={unit.id}>{[localCode(unit.code), unit.label, unit.site, unit.slot, unit.kind === 'optionnelle' ? 'optionnelle' : ''].filter(Boolean).join(' · ')} ({unit.itemNumbers.length} items cités)</option>)}</select></label>
        <label>Liens locaux<select value={linkState} onChange={event => { setLinkState(event.target.value); setVisible(40) }}><option value="">Tous les items</option><option value="linked">Avec un lien local documenté</option><option value="unlinked">Sans lien local documenté</option></select></label>
        <label>Ouvrage de référence<select value={referenceBook} onChange={event => { setReferenceBook(event.target.value); setVisible(40) }}><option value="">Tous les ouvrages documentés</option>{catalog.referenceBooks.filter(book => book.itemCount > 0).map(book => <option value={book.id} key={book.id}>{book.title} · {book.edition} ({book.itemCount} items)</option>)}</select></label>
      </div>
      <div className="admin-catalog-summary">
        <span><strong>{catalog.items.length}</strong> items reliés à {catalog.nationalUnits.length} UE nationales</span>
        <span><strong>{catalog.localProgram?.units.length || 0}</strong> enseignements locaux documentés</span>
        <span><strong>{catalog.items.filter(item => item.unitLinks?.length).length}</strong> items avec un lien local documenté, options incluses</span>
        <span><strong>{catalog.colleges.length}</strong> collèges LiSA 2026 repérés</span>
        <span><strong>{catalog.items.reduce((count, item) => count + item.referenceLinks.length, 0)}</strong> liens documentés vers des ouvrages</span>
      </div>
      <p className="admin-catalog-national-source">Classement national : <a href={catalog.nationalUnitSource.originalUrl} target="_blank" rel="noopener noreferrer">annexe 1 de l’arrêté du 24 juillet 2023 ↗</a>. Il ne détermine pas l’année d’enseignement dans chaque faculté.</p>
      <p className="admin-catalog-national-source">Les ouvrages sont reliés aux items par une preuve de chapitre ou de sommaire. Leur année d’édition est distincte de l’année universitaire ; un lien documentaire ne valide ni un rôle de collège LiSA, ni une UE locale. Les pistes orange restent à confirmer.</p>
      <p className="admin-catalog-provenance">Collèges en écriture et en relecture : <a href={catalog.collegeSource.mirrorUrl} target="_blank" rel="noopener noreferrer">copie publique du tableau LiSA {catalog.collegeSource.edition} ↗</a>. La <a href={catalog.collegeSource.originalUrl} target="_blank" rel="noopener noreferrer">source UNESS ↗</a> demande une connexion ; cette copie et son adéquation à 2026–2027 restent à valider. Les anciennes associations de Dijon Y4 ne sont pas utilisées.</p>
      <div className={`admin-catalog-grid${catalog.colleges.length ? '' : ' has-no-colleges'}`}>
        {catalog.colleges.length > 0 && <aside className="admin-catalog-colleges" aria-label="Liste des collèges">
          <h3>Collèges</h3>
          <div className="admin-catalog-college-list">
            <button type="button" className={!college ? 'is-active' : ''} aria-pressed={!college} onClick={() => { setCollege(''); setVisible(40) }}><span>Tous les collèges</span><b>{catalog.items.length}</b></button>
            {catalog.colleges.map(entry => <button type="button" key={entry.name} className={college === entry.name ? 'is-active' : ''} aria-pressed={college === entry.name} onClick={() => { setCollege(entry.name); setVisible(40) }}>
              <span>{entry.name}</span><b>{entry.itemCount}</b>
            </button>)}
          </div>
        </aside>}
        <div className="admin-catalog-items">
          <h3>{college || 'Items nationaux'} <small>{filteredItems.length} résultat{filteredItems.length > 1 ? 's' : ''}</small></h3>
          {filteredItems.slice(0, visible).map(item => <article className="admin-catalog-item" key={item.number}>
            <strong>#{item.number}</strong><div><h4>{item.title}</h4><p><a href={item.lisaUrl} target="_blank" rel="noopener noreferrer">Fiche LiSA 2026 ↗</a></p>{collegeRoles(item)}{itemUnitLinks(item)}{itemReferences(item)}</div>
          </article>)}
          {!filteredItems.length && <p className="admin-sources-empty">Aucun item ne correspond à cette sélection.</p>}
          {visible < filteredItems.length && <button className="admin-catalog-more" type="button" onClick={() => setVisible(count => count + 40)}>Afficher 40 items de plus</button>}
        </div>
      </div>
      {catalog.localProgram && <div className="admin-catalog-program-head"><div><h3>Programme local · {selectedFacultyName} · {years.find(entry => entry.code === year)?.label}</h3><p>2026–2027 · {units.length} enseignements affichés · transcription à relire ; association aux items uniquement si citée dans la source{catalog.localProgram.reviewStatus === 'partial_confirmed' ? ' · liste partielle, maquette annuelle non trouvée' : catalog.localProgram.reviewStatus === 'draft_pending_vote' ? ' · projet de règlement, vote annoncé après la date de l’audit' : ''}</p>{catalog.localProgram.sharedFacultyProgram && <p>Maquette commune à Purpan et Rangueil : {catalog.localProgram.sharedFacultyProgram}. Les deux choix affichent le même cursus.</p>}</div><a href={catalog.localProgram.sourceUrl} target="_blank" rel="noopener noreferrer">Document officiel ↗</a></div>}
      {sites.length > 1 && <label className="admin-catalog-site-filter">Site <select value={site} onChange={event => setSite(event.target.value)}><option value="">Tous les sites</option>{sites.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
      {catalog.localProgram && <div className="admin-catalog-units">{units.map((unit, index) => <article key={`${unit.code}:${unit.label}:${index}`} className="admin-catalog-unit"><div className="admin-catalog-unit-heading"><span>{unitTag(unit)}</span><strong>{unit.label}</strong><a href={sourceLink(unit.sourceUrl || catalog.localProgram!.sourceUrl, unit.page)} target="_blank" rel="noopener noreferrer">Source ↗</a></div>{unitEvidence(unit, localItemByNumber, catalog.localProgram!.sourceUrl)}</article>)}</div>}
      {!catalog.localProgram && <div className="admin-sources-empty"><p>Aucun programme local 2026–2027 confirmé pour cette faculté et cette année ; les 367 items nationaux restent consultables sans répartition locale.</p>{catalog.candidateSources.length > 0 && <><p>Sources officielles à vérifier pour cette année :</p><ul>{catalog.candidateSources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a> · {source.academicTerm || 'millésime non confirmé'} — {source.note}</li>)}</ul></>}</div>}
    </>}
    {catalog?.scope === 'local_first_cycle' && <>
      <p className="admin-catalog-context">En 2e et 3e années, le programme dépend de la faculté : consulte d’abord les UE, stages et choix ci-dessous. Les 367 items LiSA sont le référentiel du deuxième cycle ; ici, un compteur d’items à zéro signifie que le document universitaire ne donne pas de correspondance numérotée, pas que l’année est vide. Lorsqu’un item est cité, ses collèges viennent d’une <a href={catalog.collegeSource.mirrorUrl} target="_blank" rel="noopener noreferrer">copie publique du tableau LiSA 2026 ↗</a>, encore à confronter à la source UNESS et au millésime 2026–2027.</p>
      {catalog.localProgram ? <>
        <div className="admin-catalog-summary"><span><strong>{catalog.localProgram.units.length}</strong> enseignements repérés</span><span><strong>{catalog.items.length}</strong> items explicitement cités</span><span><strong>{catalog.colleges.length}</strong> collèges LiSA 2026 liés à ces items</span></div>
        <div className="admin-catalog-program-head"><div><h3>{selectedFacultyName} · {years.find(entry => entry.code === year)?.label}</h3><p>{catalog.localProgram.reviewStatus === 'partial_confirmed' ? 'Liste partielle 2026–2027 : seuls les enseignements datés et confirmés sont affichés' : 'Programme 2026–2027 · transcription à relire avant publication dans l’application'}</p></div><a href={catalog.localProgram.sourceUrl} target="_blank" rel="noopener noreferrer">Document officiel ↗</a></div>
        <div className="admin-catalog-units">{units.map((unit, index) => <article key={`${unit.code}:${unit.label}:${index}`} className="admin-catalog-unit">
          <div className="admin-catalog-unit-heading"><span>{unitTag(unit)}</span><strong>{unit.label}</strong><a href={sourceLink(unit.sourceUrl || catalog.localProgram!.sourceUrl, unit.page)} target="_blank" rel="noopener noreferrer">{unit.page ? `p. ${unit.page}` : 'Source'} ↗</a></div>
          {unitEvidence(unit, localItemByNumber, catalog.localProgram!.sourceUrl)}
        </article>)}</div>
        {!units.length && <p className="admin-sources-empty">Aucun enseignement ne correspond à la recherche.</p>}
        {catalog.items.length > 0 && <div className="admin-catalog-items"><h3>Items explicitement cités <small>{filteredItems.length} résultat{filteredItems.length > 1 ? 's' : ''}</small></h3>{filteredItems.slice(0, visible).map(item => <article className="admin-catalog-item" key={item.number}><strong>#{item.number}</strong><div><h4>{item.title}</h4>{itemUnitLinks(item)}{itemReferences(item)}{collegeRoles(item)}</div></article>)}{visible < filteredItems.length && <button className="admin-catalog-more" type="button" onClick={() => setVisible(count => count + 40)}>Afficher 40 items de plus</button>}</div>}
      </> : <p className="admin-sources-empty">Aucune liste d’UE 2026–2027 confirmée pour {selectedFacultyName} en {year === 'Y2' ? '2e' : '3e'} année. Aucun item ni collège n’est attribué par supposition.</p>}
    </>}
  </section>
}
