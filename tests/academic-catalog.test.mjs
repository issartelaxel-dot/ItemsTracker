import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { academicCatalogFor, academicCoverageFor, nationalColleges, nationalItems, nationalUnits } from '../server/academic-catalog.mjs'
import { academicPrograms2026 } from '../server/academic-units-2026-27.mjs'
import { buildCollegeIndex } from '../server/academic-college-links.mjs'
import { buildNationalUnitIndex } from '../server/academic-national-units.mjs'
import { applyLocalItemEvidence } from '../server/academic-local-item-evidence.mjs'

test('the academic catalogue uses the provisional LiSA 2026 copy, never the Dijon Y4 tag codes', () => {
  assert.equal(nationalItems.length, 367)
  assert.equal(nationalColleges.length, 59)
  assert.equal(nationalItems.every(item => item.collegeLinks.some(link => link.role === 'writing')), true)
  assert.equal(nationalItems.reduce((count, item) => count + item.collegeLinks.length, 0), 702)
  const legacyItems = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'))
  assert.equal(legacyItems.reduce((count, item) => count + item.tagCodes.length, 0), 950)
  assert.equal(nationalItems[0].collegeLinks[0].name, 'Médecine générale (CNGE)')
  assert.equal(nationalItems[0].collegeLinks[0].verificationStatus, 'secondary_copy_not_verified_against_uness')
  assert.equal(nationalItems.every(item => item.lisaUrl.startsWith('https://livret.uness.fr/lisa/2026/')), true)
  assert.equal(academicCatalogFor('dijon', 'Y4').items[0].colleges[0], 'Médecine générale (CNGE)')
  assert.equal(academicCatalogFor('bordeaux', 'Y3').items[0].colleges[0], 'Médecine générale (CNGE)')
})

test('sourced LiSA college roles form a many-to-many item index without duplicates', () => {
  const source = 'https://example.test/lisa'
  const links = [
    { itemNumber: 1, collegeName: 'Collège A', role: 'writing', sourceUrl: source, sourceEdition: '2026', verificationStatus: 'secondary_copy' },
    { itemNumber: 1, collegeName: 'Collège B', role: 'reviewing', sourceUrl: source, sourceEdition: '2026', verificationStatus: 'secondary_copy' },
    { itemNumber: 2, collegeName: 'Collège A', role: 'writing', sourceUrl: source, sourceEdition: '2026', verificationStatus: 'secondary_copy' },
  ]
  const index = buildCollegeIndex([...links, links[0]], new Set([1, 2]))
  assert.equal(index.byItem.get(1).length, 2)
  assert.deepEqual(index.colleges.find(college => college.name === 'Collège A').itemNumbers, [1, 2])
  assert.throws(() => buildCollegeIndex([{ ...links[0], itemNumber: 3 }], new Set([1, 2])))
})

test('Y4 to Y6 share the national catalogue; first-cycle data stays local and sourced', () => {
  assert.deepEqual(academicCatalogFor('amiens', 'Y4').items.map(item => item.number), academicCatalogFor('bordeaux', 'Y5').items.map(item => item.number))
  assert.deepEqual(academicCatalogFor('amiens', 'Y4').items.map(item => item.number), academicCatalogFor('dijon', 'Y6').items.map(item => item.number))
  assert.equal(academicCatalogFor('bordeaux', 'Y2').localProgram.units.length, 26)
  assert.equal(academicCatalogFor('bordeaux', 'Y3').localProgram.units.length, 18)
  assert.equal(academicCatalogFor('bordeaux', 'Y2').localProgram.units.filter(unit => unit.kind === 'optionnelle').length, 6)
  assert.equal(academicCatalogFor('bordeaux', 'Y3').localProgram.units.filter(unit => unit.kind === 'optionnelle').length, 4)
  assert.equal(academicCatalogFor('bordeaux', 'Y3').localProgram.units.some(unit => unit.label.startsWith('Formation et stage du service sanitaire')), true)
  assert.equal(academicCatalogFor('bordeaux', 'Y3').items.length, 53)
  assert.equal(academicCatalogFor('bordeaux', 'Y3').items.find(item => item.number === 1).unitLinks[0].unitLabel, 'Apprentissage de l’exercice médical')
  assert.deepEqual(academicCatalogFor('bordeaux', 'Y3').localProgram.units.find(unit => unit.label === 'Apprentissage de l’exercice médical').itemReferences[0], { number: 1, page: 40 })
  assert.equal(academicCatalogFor('bordeaux', 'Y3').localProgram.units.find(unit => unit.label === 'Addictologie et psychiatrie').itemNumbers.length, 30)
  assert.equal(academicCatalogFor('limoges', 'Y2').localProgram.units.length, 14)
  assert.equal(academicCatalogFor('limoges', 'Y3').localProgram.units.length, 12)
  assert.equal(academicCatalogFor('strasbourg', 'Y2').localProgram.units.length, 14)
  assert.equal(academicCatalogFor('strasbourg', 'Y3').localProgram.units.length, 18)
  assert.equal(academicCatalogFor('strasbourg', 'Y4').localProgram.units.length, 14)
  assert.equal(academicCatalogFor('strasbourg', 'Y5').localProgram.units.length, 14)
  assert.equal(academicCatalogFor('sorbonne-universite', 'Y2').localProgram.units.length, 16)
  assert.equal(academicCatalogFor('sorbonne-universite', 'Y3').localProgram.units.length, 16)
  assert.equal(academicCatalogFor('sorbonne-universite', 'Y4').localProgram.units.length, 15)
  assert.equal(academicCatalogFor('sorbonne-universite', 'Y5').localProgram.units.length, 7)
  assert.equal(academicCatalogFor('lyon-sud', 'Y2').localProgram.units.length, 20)
  assert.equal(academicCatalogFor('lyon-sud', 'Y3').localProgram.units.length, 14)
  assert.equal(academicCatalogFor('lyon-sud', 'Y4').localProgram.units.length, 9)
  assert.equal(academicCatalogFor('lyon-sud', 'Y5').localProgram.units.length, 10)
  const bordeauxY4 = academicCatalogFor('bordeaux', 'Y4')
  const bordeauxY5 = academicCatalogFor('bordeaux', 'Y5')
  assert.equal(bordeauxY4.localProgram.units.length, 21)
  assert.equal(bordeauxY5.localProgram.units.length, 20)
  assert.equal(bordeauxY4.localProgram.units.filter(unit => unit.kind === 'optionnelle').length, 12)
  assert.equal(bordeauxY5.localProgram.units.filter(unit => unit.kind === 'optionnelle').length, 11)
  assert.equal(bordeauxY4.localProgram.units.some(unit => unit.kind === 'stage'), true)
  assert.equal(bordeauxY5.localProgram.units.some(unit => unit.kind === 'stage'), true)
  assert.equal(bordeauxY4.items.filter(item => item.unitLinks.length).length, 165)
  assert.equal(bordeauxY5.items.filter(item => item.unitLinks.length).length, 204)
  const bordeauxY6 = academicCatalogFor('bordeaux', 'Y6')
  assert.equal(bordeauxY6.localProgram.units.length, 5)
  assert.equal(bordeauxY6.items.filter(item => item.unitLinks.length).length, 0)
  assert.equal(bordeauxY6.localProgram.units.find(unit => unit.kind === 'stage').label.includes('cinq stages'), true)
  assert.deepEqual(bordeauxY4.items.find(item => item.number === 94).unitLinks[0], {
    scope: 'local', unitId: 'bordeaux:Y4:0', unitKind: 'obligatoire', unitSite: '', unitSlot: '', evidenceKind: 'programme',
    unitCode: 'ME ALDVG', unitLabel: 'Appareil locomoteur, Dépendance, Vieillissement, Gériatrie',
    sourceUrl: 'https://sante.u-bordeaux.fr/download_file/view/98316a97-72d8-422a-9031-4becd4b03223/535', sourcePage: 26,
  })
  assert.equal(academicCatalogFor('amiens', 'Y2').localProgram, null)
  for (const program of academicPrograms2026) {
    assert.equal(program.academicTerm, '2026-2027')
    assert.match(program.sourceUrl, /^https:\/\//)
    assert.equal(program.units.every(unit => unit.itemNumbers.every(number => nationalItems.some(item => item.number === number))), true)
    assert.equal(program.units.every(unit => unit.itemReferences.every(reference => (Number.isInteger(reference.page) && reference.page > 0) || /^https:\/\//.test(reference.sourceUrl || ''))), true)
    if (!['bordeaux', 'dijon'].includes(program.facultyId) || program.yearCode === 'Y2') assert.equal(program.units.every(unit => unit.itemNumbers.length === 0), true)
  }
})

test('all national items belong to exactly one sourced national unit, independent of faculty/year', () => {
  assert.equal(nationalUnits.length, 11)
  assert.deepEqual(nationalUnits.map(unit => unit.itemCount), [22, 32, 26, 37, 27, 40, 36, 69, 31, 10, 37])
  const assigned = nationalUnits.flatMap(unit => unit.itemNumbers)
  assert.equal(new Set(assigned).size, 367)
  assert.deepEqual(assigned, Array.from({ length: 367 }, (_, index) => index + 1))
  for (const item of nationalItems) {
    assert.equal(item.nationalUnit.scope, 'national')
    assert.equal(nationalUnits.find(unit => unit.number === item.nationalUnit.unitNumber).itemNumbers.includes(item.number), true)
    assert.match(item.nationalUnit.sourceUrl, /^https:\/\/www\.legifrance\.gouv\.fr\//)
    assert.equal(Number.isInteger(item.nationalUnit.sourcePage), true)
  }
  // Preserve the placement published in the legal annex, even for an unusual topic.
  assert.equal(nationalItems.find(item => item.number === 367).nationalUnit.unitNumber, 11)
  assert.equal(nationalItems.find(item => item.number === 75).nationalUnit.unitNumber, 3)
  assert.equal(nationalItems.find(item => item.number === 150).nationalUnit.unitNumber, 6)
  assert.equal(nationalItems.find(item => item.number === 239).nationalUnit.unitNumber, 8)
  assert.deepEqual(academicCatalogFor('nice', 'Y6').items[0].nationalUnit, academicCatalogFor('bordeaux', 'Y4').items[0].nationalUnit)
  assert.equal(academicCatalogFor('nice', 'Y6').items[0].unitLinks.length, 0)

  const source = { source: { originalUrl: 'https://example.test/source', pdfUrl: 'https://example.test/source.pdf' }, units: [{ number: 1, label: 'Test', itemReferences: [{ number: 1, page: 2 }] }] }
  assert.throws(() => buildNationalUnitIndex(source, new Set([1, 2])), /incomplet/)
  assert.throws(() => buildNationalUnitIndex({ ...source, units: [...source.units, ...source.units] }, new Set([1])), /invalide/)
})

test('Bordeaux optional item evidence remains local and preserves conflicts without guessing numbers', () => {
  const fourth = academicCatalogFor('bordeaux', 'Y4')
  const fifth = academicCatalogFor('bordeaux', 'Y5')
  const ethics = fifth.localProgram.units.find(unit => unit.label === 'Éthique à l’EDN')
  assert.equal(ethics.kind, 'optionnelle')
  assert.equal(ethics.itemNumbers.length, 14)
  assert.equal(ethics.itemReferences.every(reference => reference.page === 60 && reference.evidenceKind === 'programme'), true)
  const ethicsLink = fifth.items.find(item => item.number === 1).unitLinks.find(link => link.unitId === ethics.id)
  assert.equal(ethicsLink.scope, 'local')
  assert.equal(ethicsLink.unitKind, 'optionnelle')
  assert.equal(fourth.items.find(item => item.number === 1).unitLinks.length, 0)
  const hypnosisLink = fifth.items.find(item => item.number === 327).unitLinks.find(link => link.unitLabel === 'Sensibilisation à l’hypnose médicale')
  assert.equal(hypnosisLink.evidenceKind, 'reference')
  assert.equal(hypnosisLink.sourcePage, 62)
  const legal = fourth.localProgram.units.find(unit => unit.label === 'Médecine légale')
  assert.equal(legal.itemReferences.length, 0)
  assert.equal(legal.mappingIssues[0].status, 'numbering_conflict')
  assert.deepEqual(legal.mappingIssues[0].declaredNumbers, [5, 8, 9, 10, 12, 55])
  assert.equal(fourth.items.some(item => item.unitLinks.some(link => link.unitId === legal.id)), false)
  for (const item of fifth.items) for (const link of item.unitLinks) {
    assert.equal(fifth.localProgram.units.find(unit => unit.id === link.unitId).itemNumbers.includes(item.number), true)
  }
  const evidence = JSON.parse(readFileSync(new URL('../server/data/academic-bordeaux-complementary-item-links-2026-27.json', import.meta.url), 'utf8'))
  assert.throws(() => applyLocalItemEvidence([{ facultyId: 'bordeaux', yearCode: 'Y5', academicTerm: '2025-2026', units: [{ label: evidence.associations[0].unitLabel, kind: 'optionnelle' }] }], { associations: [evidence.associations[0]], issues: [] }), /annuelle/)
  assert.throws(() => applyLocalItemEvidence([{ facultyId: 'bordeaux', yearCode: 'Y5', units: [{ label: evidence.associations[0].unitLabel, kind: 'obligatoire' }] }], { associations: [evidence.associations[0]], issues: [] }), /absente/)
})

test('Dijon 2026-2027 lists its five years with only explicit item links, while Rennes remains partial', () => {
  for (const year of ['Y2', 'Y3', 'Y4', 'Y5', 'Y6']) {
    const catalog = academicCatalogFor('dijon', year)
    assert.match(catalog.localProgram.sourceUrl, /formations\.ube\.fr/)
    assert.equal(catalog.localProgram.units.some(unit => unit.kind === 'optionnelle'), true)
    assert.equal(catalog.localProgram.units.some(unit => unit.kind === 'obligatoire'), true)
    assert.equal(catalog.localProgram.units.filter(unit => unit.itemNumbers.length > 0).length, year === 'Y4' ? 4 : 0)
  }
  assert.equal(academicCatalogFor('dijon', 'Y2').localProgram.units.some(unit => unit.label === 'Séminaire handicap obligatoire'), true)
  assert.equal(academicCatalogFor('dijon', 'Y5').localProgram.units.some(unit => unit.label === 'Cancérologie, oncologie, hématologie'), true)
  assert.equal(academicCatalogFor('dijon', 'Y6').localProgram.units.length, 12)
  const dijonY4 = academicCatalogFor('dijon', 'Y4')
  assert.equal(dijonY4.items.filter(item => item.unitLinks.length).length, 117)
  assert.match(dijonY4.items.find(item => item.number === 81).unitLinks[0].sourceUrl, /ue-4-perception-systeme-nerveux-dermatologie/)
  assert.equal(academicCatalogFor('rennes', 'Y2').localProgram.reviewStatus, 'partial_confirmed')
  assert.equal(academicCatalogFor('rennes', 'Y3').localProgram.reviewStatus, 'partial_confirmed')
  assert.equal(academicCatalogFor('rennes', 'Y4').localProgram, null)
  assert.equal(academicCatalogFor('rennes', 'Y5').localProgram, null)
  assert.equal(academicCatalogFor('rennes', 'Y6').localProgram, null)
  assert.equal(academicCatalogFor('rennes', 'Y6').candidateSources.some(source => source.url.endsWith('/dfasm3')), true)
})

test('new 2026-2027 faculty programs remain distinct, sourced and explicit about gaps', () => {
  const dfasm = academicPrograms2026.filter(program => ['Y4', 'Y5', 'Y6'].includes(program.yearCode))
  assert.equal(dfasm.length, 45)
  assert.equal(new Set(dfasm.map(program => `${program.facultyId}:${program.yearCode}`)).size, dfasm.length)
  assert.equal(academicCatalogFor('orleans', 'Y4').localProgram.units.some(unit => unit.code === 'MAA1U01'), true)
  assert.equal(academicCatalogFor('orleans', 'Y5').localProgram.units.some(unit => unit.code === 'MAA6EF1'), true)
  assert.equal(academicCatalogFor('orleans', 'Y6').localProgram.reviewStatus, 'partial_confirmed')
  assert.deepEqual(academicCatalogFor('orleans', 'Y6').localProgram.units.map(unit => unit.label),
    ['ECOS facultaires DFASM3', 'Stages hospitaliers DFASM3', 'Gardes du second cycle'])
  assert.equal(academicCatalogFor('orleans', 'Y6').candidateSources.some(source => source.note.includes('DFASM3')), true)
  assert.equal(academicCatalogFor('marseille', 'Y4').localProgram.units.find(unit => unit.code === 'UE4').label.includes('dermatologie'), true)
  assert.equal(academicCatalogFor('lille', 'Y4').localProgram.units.filter(unit => unit.slot === 'Première période').length, 3)
  assert.equal(academicCatalogFor('lille', 'Y5').localProgram.units.filter(unit => unit.slot === 'Première période').length, 4)
  assert.equal(academicCatalogFor('lille', 'Y4').localProgram.units.filter(unit => unit.kind === 'stage').length, 2)
  assert.equal(academicCatalogFor('lille', 'Y5').localProgram.units.filter(unit => unit.kind === 'stage').length, 2)
  assert.equal(academicCatalogFor('marseille', 'Y5').localProgram.units.some(unit => unit.label === 'Séminaires de thérapeutique'), true)
  assert.equal(academicCatalogFor('marseille', 'Y6').localProgram.units.filter(unit => unit.kind === 'stage').length, 2)
  for (const year of ['Y4', 'Y5', 'Y6']) {
    const purpan = academicCatalogFor('toulouse-purpan', year).localProgram
    const rangueil = academicCatalogFor('toulouse-rangueil', year).localProgram
    assert.deepEqual(purpan.units, rangueil.units)
    assert.equal(purpan.sharedFacultyProgram, 'Université de Toulouse · Faculté de santé')
    assert.equal(purpan.units.every(unit => unit.page >= 16 && unit.page <= 41), true)
  }
  for (const year of ['Y4', 'Y5', 'Y6']) {
    const montpellier = academicCatalogFor('montpellier-nimes', year).localProgram
    assert.equal(montpellier.units.filter(unit => unit.site === 'Montpellier').length,
      montpellier.units.filter(unit => unit.site === 'Nîmes').length)
    assert.equal(montpellier.units.every(unit => unit.sourceUrl.endsWith('.pdf') && unit.page > 0), true)
    assert.equal(academicCatalogFor('limoges', year).localProgram.units.length > 0, true)
    assert.equal(academicCatalogFor('reims', year).localProgram.units.length > 0, true)
    assert.equal(academicCatalogFor('tours', year).localProgram.units.length > 0, true)
  }
  assert.equal(academicCatalogFor('montpellier-nimes', 'Y4').localProgram.units.find(unit => unit.site === 'Montpellier').code,
    'M0MJ3B5L')
  assert.equal(academicCatalogFor('montpellier-nimes', 'Y4').localProgram.units.find(unit => unit.site === 'Nîmes').code,
    'M0MJ6L3K')
  assert.equal(dfasm.filter(program => !['bordeaux', 'dijon'].includes(program.facultyId))
    .every(program => program.units.every(unit => unit.itemReferences.length === 0)), true)
})

test('faculty coverage colors follow the selected year and never count a draft or partial list as verified', () => {
  assert.equal(academicCoverageFor('bordeaux', 'Y4'), 'verified')
  assert.equal(academicCoverageFor('lille', 'Y4'), 'unconfirmed')
  assert.equal(academicCoverageFor('lille', 'Y6'), 'verified')
  assert.equal(academicCoverageFor('orleans', 'Y5'), 'verified')
  assert.equal(academicCoverageFor('orleans', 'Y6'), 'unconfirmed')
  assert.equal(academicCoverageFor('besancon', 'Y4'), 'unconfirmed')
  assert.equal(academicCoverageFor('nantes', 'Y5'), 'unconfirmed')
  assert.equal(academicCoverageFor('rennes', 'Y6'), 'unconfirmed')
  assert.equal(academicCoverageFor('nice', 'Y4'), 'verified')
  assert.equal(academicCoverageFor('nice', 'Y5'), 'verified')
  assert.equal(academicCoverageFor('nice', 'Y6'), 'verified')
  assert.equal(academicCoverageFor('clermont-ferrand', 'Y4'), 'unconfirmed')
  assert.equal(academicCoverageFor('clermont-ferrand', 'Y5'), 'missing')
})
