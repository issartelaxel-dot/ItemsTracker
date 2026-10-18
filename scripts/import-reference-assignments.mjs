import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Stable tracking keys: changing a book title must not rename saved user data.
export const REFERENCE_COLLEGES = {
  ACP: 'ANATOMIE ET CYTOLOGIE PATHOLOGIQUES', AR: 'ANESTHÉSIE - RÉANIMATION', Can: 'CANCÉROLOGIE',
  CVD: 'CHIRURGIE DIGESTIVE', CMF: 'CHIRURGIE MAXILLO-FACIALE', Der: 'DERMATOLOGIE',
  DSP: 'DOULEUR - SOINS PALLIATIFS', ED: 'ENDOCRINOLOGIE', GeM: 'GÉNÉTIQUE', Ger: 'GÉRIATRIE',
  GyM: 'GYNÉCOLOGIE MÉDICALE', GyO: 'GYNÉCOLOGIE OBSTÉTRIQUE', Hem: 'HÉMATOLOGIE',
  HGE: 'HÉPATO-GASTRO-ENTÉROLOGIE', IM: 'IMAGERIE MÉDICALE', IP: 'IMMUNOPATHOLOGIE',
  MIT: 'INFECTIOLOGIE', MCV: 'MÉDECINE CARDIOVASCULAIRE', MG: 'MÉDECINE GÉNÉRALE',
  MIR: 'MÉDECINE INTENSIVE - RÉANIMATION - URGENCES', MI: 'MÉDECINE INTERNE',
  MLT: 'MÉDECINE LÉGALE - MÉDECINE DU TRAVAIL', MM: 'MÉDECINE MOLÉCULAIRE',
  MPR: 'MÉDECINE PHYSIQUE ET RÉADAPTATION', MV: 'MÉDECINE VASCULAIRE', Nep: 'NÉPHROLOGIE',
  NC: 'NEUROCHIRURGIE', NL: 'NEUROLOGIE', Nut: 'NUTRITION', Oph: 'OPHTALMOLOGIE', ORL: 'ORL',
  OT: 'ORTHOPÉDIE - TRAUMATOLOGIE', Par: 'PARASITOLOGIE', Ped: 'PÉDIATRIE', Pne: 'PNEUMOLOGIE',
  Psy: 'PSYCHIATRIE - ADDICTOLOGIE', Rhu: 'RHUMATOLOGIE', SP: 'SANTÉ PUBLIQUE',
  The: 'THÉRAPEUTIQUE', Uro: 'UROLOGIE',
}

export function buildReferenceAssignments(raw, { checkedAt, sourceSha256 } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkedAt || '') || !/^[a-f0-9]{64}$/.test(sourceSha256 || '')) throw new Error('Provenance requise.')
  if (!Array.isArray(raw.items) || !Array.isArray(raw.referentiels)) throw new Error('Catalogue invalide.')
  const numbers = raw.items.map(item => Number(item.items))
  const valid = new Set(numbers)
  if (valid.size !== 367 || numbers.length !== 367 || numbers.some(n => !Number.isInteger(n) || n < 1 || n > 367)) throw new Error('Les 367 items doivent être présents une fois chacun.')
  const items = Object.fromEntries([...valid].sort((a, b) => a - b).map(n => [n, []]))
  const codes = new Set(), references = [], duplicates = []
  for (const ref of raw.referentiels) {
    const college = REFERENCE_COLLEGES[ref.code]
    if (!college || codes.has(ref.code) || typeof ref.titre !== 'string' || !ref.titre.trim()) throw new Error(`Référentiel inconnu ou dupliqué : ${ref.code}`)
    codes.add(ref.code)
    references.push({ code: ref.code, title: ref.titre, college })
    const tokens = Array.isArray(ref.items) ? ref.items : typeof ref.items === 'string' ? ref.items.split(',') : null
    if (!tokens) throw new Error(`Liste d’items invalide : ${ref.code}`)
    const seen = new Set()
    for (const token of tokens) {
      const text = String(token).trim()
      if (text === '/' || text === '') continue
      if (!/^\d+$/.test(text) || !valid.has(Number(text))) throw new Error(`Item non reconnu : ${ref.code}/${text}`)
      const n = Number(text)
      if (seen.has(n)) { duplicates.push({ code: ref.code, item: n }); continue }
      seen.add(n)
      items[n].push(college)
    }
  }
  if (codes.size !== Object.keys(REFERENCE_COLLEGES).length) throw new Error('Référentiel manquant : import incomplet.')
  return {
    schemaVersion: 1,
    provenance: {
      pageUrl: 'https://nexternat.fr/externat/les-items/',
      dataUrl: 'https://nexternat.fr/wp-content/uploads/items_et_referentiels.json',
      checkedAt, sourceSha256, relation: 'item_study_reference', status: 'secondary_source',
    },
    references, items,
    audit: { itemCount: numbers.length, referenceCount: references.length,
      linkCount: Object.values(items).reduce((sum, list) => sum + list.length, 0),
      itemsWithoutReferences: Object.keys(items).filter(n => !items[n].length).map(Number), duplicates },
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, checkedAt] = process.argv.slice(2)
  if (!input || !checkedAt) throw new Error('Usage : node scripts/import-reference-assignments.mjs <source.json> <YYYY-MM-DD>')
  const body = await readFile(input)
  const data = buildReferenceAssignments(JSON.parse(body), { checkedAt, sourceSha256: createHash('sha256').update(body).digest('hex') })
  await writeFile(new URL('../src/data/item-reference-assignments.json', import.meta.url), JSON.stringify(data, null, 2) + '\n')
  console.log(JSON.stringify(data.audit))
}
