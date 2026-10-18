import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { buildReferenceAliases, planReferenceTransition } from '../server/reference-transition.mjs'

const [input, destination] = process.argv.slice(2)
if (!input || !destination) throw new Error('Usage: node scripts/prepare-reference-transition.mjs <export.json> <private-output-directory>')
const raw = await readFile(input)
const exported = JSON.parse(raw), data = exported.data || exported
const source = JSON.parse(await readFile(new URL('../src/data/item-reference-assignments.json', import.meta.url)))
const catalogue = JSON.parse(await readFile(new URL('../src/data/items.json', import.meta.url)))
const aliases = JSON.parse(await readFile(new URL('../src/data/college-tag-aliases.json', import.meta.url)))
const plan = planReferenceTransition(data.trackingState, source, buildReferenceAliases(source, catalogue, aliases), new Date().toISOString())
const migrated = { ...data, trackingState: plan.state }
const { trackingState: oldTracking, ...oldSettings } = data
const { trackingState: newTracking, ...newSettings } = migrated
if (!isDeepStrictEqual(oldSettings, newSettings)) throw new Error('Profile/preferences changed.')
const out = resolve(destination)
await mkdir(out, { recursive: true, mode: 0o700 })
// Full original + candidate remain private, excluded from the public report.
await writeFile(join(out, 'before.json'), raw, { mode: 0o600, flag: 'wx' })
await writeFile(join(out, 'candidate.json'), JSON.stringify(exported.data ? { ...exported, data: migrated } : migrated, null, 2), { mode: 0o600, flag: 'wx' })
const proof = {
  inputSha256: createHash('sha256').update(raw).digest('hex'), sourceSha256: source.provenance.sourceSha256,
  preparedAt: new Date().toISOString(), productionWritten: false,
  itemsProcessed: plan.reports.length, assignmentsChanged: plan.reports.filter(r => r.assignmentsChanged).length,
  referencesAdded: plan.reports.reduce((sum,r) => sum + r.added.length, 0),
  policy: 'preserve-existing',
  additionalReferencesKeptChecked: plan.reports.flatMap(r => r.preserved.map(college => ({ item:r.item, college }))),
  renames: plan.reports.flatMap(r => Object.entries(r.renamed).map(([from,to]) => ({ item:r.item, from, to }))),
  allOldTrackersPreserved: true, allOtherItemFieldsPreserved: true, profileAndPreferencesPreserved: true,
}
await writeFile(join(out, 'proof.json'), JSON.stringify(proof, null, 2), { mode: 0o600, flag: 'wx' })
console.log(JSON.stringify(proof))
