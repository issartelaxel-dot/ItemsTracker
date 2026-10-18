import { readFileSync } from 'node:fs'
import { academicPrograms2026 } from './academic-units-2026-27.mjs'
import { buildCollegeIndex, lisaCollegeSource, provisionalCollegeAssignments } from './academic-college-links.mjs'
import { onboardingSources } from './onboarding-sources.mjs'
import { createNationalUnitIndex, nationalUnitSource } from './academic-national-units.mjs'
import { createReferenceBookIndex, referenceProvenance } from './academic-reference-books.mjs'

const readJson = file => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'))
const catalogItems = readJson('../src/data/items.json')
const nationalUnitIndex = createNationalUnitIndex(new Set(catalogItems.map(item => item.itemNumber)))
const referenceIndex = createReferenceBookIndex(new Set(catalogItems.map(item => item.itemNumber)))
export const referenceBooks = referenceIndex.books
export const nationalUnits = nationalUnitIndex.units
const collegeIndex = buildCollegeIndex(provisionalCollegeAssignments, new Set(catalogItems.map(item => item.itemNumber)))
export const collegeSource = {
  edition: lisaCollegeSource.sourceEdition,
  originalUrl: lisaCollegeSource.originalUrl,
  mirrorUrl: lisaCollegeSource.mirrorUrl,
  verificationStatus: lisaCollegeSource.validationStatus,
}

export const nationalItems = catalogItems.map(item => ({
  number: item.itemNumber,
  title: item.shortDescription,
  nationalUnit: nationalUnitIndex.byItem.get(item.itemNumber),
  referenceLinks: referenceIndex.byItem.get(item.itemNumber) || [],
  referenceCandidates: referenceIndex.candidatesByItem.get(item.itemNumber) || [],
  lisaUrl: lisaCollegeSource.items[String(item.itemNumber)]?.url || lisaCollegeSource.originalUrl,
  // The college tags in items.json belong to the legacy Dijon Y4 context.
  // They cannot be used as a national or faculty/year LiSA mapping.
  colleges: [...new Set((collegeIndex.byItem.get(item.itemNumber) || []).map(link => link.name))],
  collegeLinks: collegeIndex.byItem.get(item.itemNumber) || [],
})).sort((a, b) => a.number - b.number)

export const nationalColleges = collegeIndex.colleges

// Statut du programme LOCAL pour une faculté et une année, distinct du
// référentiel national de 367 items disponible à toutes les facultés.
export function academicCoverageFor(facultyId, yearCode) {
  const program = academicPrograms2026.find(entry => entry.facultyId === facultyId && entry.yearCode === yearCode)
  if (program?.reviewStatus === 'extracted_needs_review') return 'verified'
  if (program || onboardingSources.some(source => source.facultyId === facultyId && source.years.includes(yearCode))) return 'unconfirmed'
  return 'missing'
}

export function academicLocalProgramFor(facultyId, yearCode) {
  const storedProgram = academicPrograms2026.find(program => program.facultyId === facultyId && program.yearCode === yearCode)
  return storedProgram ? {
    ...storedProgram,
    units: storedProgram.units.map((unit, index) => ({ ...unit, id: `${storedProgram.sharedFacultyProgram || facultyId}:${yearCode}:${index}` })),
  } : null
}

export function academicCatalogFor(facultyId, yearCode) {
  if (!['Y2', 'Y3', 'Y4', 'Y5', 'Y6'].includes(yearCode)) return null
  const localProgram = academicLocalProgramFor(facultyId, yearCode)
  const unitLinksByItem = new Map()
  for (const unit of localProgram?.units || []) {
    for (const reference of unit.itemReferences) {
      if (!unitLinksByItem.has(reference.number)) unitLinksByItem.set(reference.number, [])
      unitLinksByItem.get(reference.number).push({
        scope: 'local', unitId: unit.id, unitKind: unit.kind || 'obligatoire',
        unitSite: unit.site || '', unitSlot: unit.slot || '',
        unitCode: unit.code, unitLabel: unit.label, sourceUrl: reference.sourceUrl || unit.sourceUrl || localProgram.sourceUrl,
        sourcePage: reference.page, evidenceKind: reference.evidenceKind || 'programme',
      })
    }
  }
  const withLocalLinks = item => ({ ...item, unitLinks: unitLinksByItem.get(item.number) || [] })
  const candidateSources = onboardingSources.filter(source => source.facultyId === facultyId && source.years.includes(yearCode))
  if (yearCode === 'Y4' || yearCode === 'Y5' || yearCode === 'Y6') {
    return {
      facultyId, yearCode, scope: 'national_second_cycle', academicTerm: '2026-2027',
      provenance: 'items_existing_titles_lisa_2026_secondary_copy',
      reviewedMapping: false,
      nationalUnits, nationalUnitSource, referenceBooks, referenceProvenance,
      collegeSource,
      items: nationalItems.map(withLocalLinks),
      colleges: nationalColleges,
      localProgram,
      candidateSources,
    }
  }
  const items = nationalItems.filter(item => unitLinksByItem.has(item.number)).map(withLocalLinks)
  const localColleges = nationalColleges.map(college => ({
    name: college.name,
    itemNumbers: college.itemNumbers.filter(number => unitLinksByItem.has(number)),
  })).filter(college => college.itemNumbers.length).map(college => ({ ...college, itemCount: college.itemNumbers.length }))
  return {
    facultyId, yearCode, scope: 'local_first_cycle', academicTerm: '2026-2027',
    provenance: localProgram ? 'document_universitaire_2026_2027' : 'aucun_programme_confirme',
    reviewedMapping: false,
    nationalUnits, nationalUnitSource, referenceBooks, referenceProvenance,
    collegeSource,
    items, colleges: localColleges, localProgram,
    candidateSources,
  }
}
