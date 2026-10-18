import { isDeepStrictEqual } from 'node:util'
import { StateError } from './state-model.mjs'

export const TRANSITION_VERSION = 1
const blank = () => ({ favorite: false, reviews: 0, mastery: 'Moyen', comments: '', lastReviewedAt: null, reviewHistory: [] })
const normal = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase()
const unique = values => [...new Set(values)]
const sameSet = (a, b) => isDeepStrictEqual(unique(a).sort(), unique(b).sort())

// Only deterministic spelling equivalences and the reviewed historical tag
// aliases. Never guess a medical equivalence or merge two existing trackers.
export function buildReferenceAliases(source, catalogue, tagAliases) {
  const aliases = new Map()
  const canonical = new Set(source.references.map(ref => ref.college))
  const add = (name, target) => {
    const key = normal(name)
    if (aliases.has(key) && aliases.get(key) !== target) throw new Error(`Ambiguous alias: ${name}`)
    aliases.set(key, target)
  }
  for (const name of canonical) add(name, name)
  for (const item of catalogue) {
    item.tagCodes.forEach((code, index) => {
      if (tagAliases[code] && canonical.has(tagAliases[code])) add(item.tagLabels[index], tagAliases[code])
    })
  }
  return name => aliases.get(normal(name)) || aliases.get(normal(name.replace(/\s*\([^()]*\)\s*$/, ''))) || null
}

export function planReferenceTransition(state, source, resolveAlias, migratedAt) {
  if (!state?.items || typeof state.items !== 'object' || Array.isArray(state.items)) throw new Error('Invalid tracking state.')
  if (!/^[a-f0-9]{64}$/.test(source?.provenance?.sourceSha256 || '') || Object.keys(source.items || {}).length !== 367) throw new Error('Unverified reference source.')
  if (!Number.isFinite(Date.parse(migratedAt))) throw new Error('Migration timestamp required.')
  const items = { ...state.items }, reports = []
  for (let number = 1; number <= 367; number++) {
    const target = source.items[number]
    if (!Array.isArray(target) || target.some(name => typeof name !== 'string') || new Set(target).size !== target.length) throw new Error(`Invalid references: ${number}`)
    const old = state.items[number]
    if (old?.referenceTransition) {
      if (old.referenceTransition.schemaVersion !== TRANSITION_VERSION) throw new Error(`Unknown migration version: ${number}`)
      continue // Once only: later manual selections always take precedence.
    }
    if (old && (!Array.isArray(old.assignedColleges) || old.assignedColleges.some(name => typeof name !== 'string') || !old.byCollege || typeof old.byCollege !== 'object' || Array.isArray(old.byCollege))) throw new Error(`Invalid saved item: ${number}`)
    const previous = old || { assignedColleges: [], byCollege: {} }
    if (Object.values(previous.byCollege).some(value => !value || typeof value !== 'object' || Array.isArray(value))) throw new Error(`Invalid tracker: ${number}`)
    const byCollege = { ...previous.byCollege }, renamedColleges = {}
    for (const name of previous.assignedColleges) {
      const canonical = resolveAlias(name)
      if (!canonical || canonical === name || !target.includes(canonical) || !Object.hasOwn(byCollege, name) || Object.hasOwn(byCollege, canonical)) continue
      byCollege[canonical] = byCollege[name]
      delete byCollege[name]
      renamedColleges[name] = canonical
    }
    const previousKeys = unique(previous.assignedColleges.map(name => renamedColleges[name] || name))
    // Existing accounts keep their checked references, even when Nexternat no
    // longer lists them. New accounts use the unmodified Nexternat defaults.
    const preservedColleges = previousKeys.filter(name => !target.includes(name))
    const assignments = unique([...target, ...previousKeys])
    for (const name of previousKeys) if (!Object.hasOwn(byCollege, name)) byCollege[name] = blank()
    const pendingColleges = []
    for (const name of target) {
      if (!Object.hasOwn(byCollege, name)) {
        byCollege[name] = blank()
        if (!previousKeys.includes(name)) pendingColleges.push(name)
      }
    }
    const next = { ...previous, assignedColleges: assignments, byCollege, referenceTransition: {
      schemaVersion: TRANSITION_VERSION, policy: 'preserve-existing', sourceSha256: source.provenance.sourceSha256,
      migratedAt, previousAssignments: [...previous.assignedColleges],
      preservedColleges, pendingColleges, renamedColleges,
    } }
    // Every old tracker, including unassigned/dormant trackers, must survive
    // byte-for-byte structurally. A name conflict keeps both independent data.
    for (const [name, tracker] of Object.entries(previous.byCollege)) {
      if (!isDeepStrictEqual(next.byCollege[renamedColleges[name] || name], tracker)) throw new Error(`Tracking loss: ${number}/${name}`)
    }
    const { assignedColleges: a, byCollege: b, ...oldRest } = previous
    const { assignedColleges: c, byCollege: d, referenceTransition: marker, ...newRest } = next
    if (!isDeepStrictEqual(oldRest, newRest)) throw new Error(`Item data changed: ${number}`)
    items[number] = next
    reports.push({ item: number, assignmentsChanged: !sameSet(a, c), added: target.filter(name => !previousKeys.includes(name)),
      preserved: preservedColleges, renamed: renamedColleges, pending: pendingColleges })
  }
  return { state: reports.length ? { ...state, items } : state, reports }
}

// Protect the preservation metadata when an obsolete browser serializes only
// the old ItemTracking fields. Version checks alone cannot detect that case.
export function assertReferenceTransitionPreserved(previous, next) {
  for (const [number, item] of Object.entries(previous.items || {})) {
    const marker = item.referenceTransition
    if (!marker) continue
    const incoming = next.items?.[number]?.referenceTransition
    const { pendingColleges: beforePending, ...fixed } = marker
    const { pendingColleges: afterPending, ...afterFixed } = incoming || {}
    if (!incoming || !isDeepStrictEqual(fixed, afterFixed) || !Array.isArray(afterPending) ||
      afterPending.some(name => !beforePending.includes(name))) {
      throw new StateError(409, 'CLIENT_STALE', 'Recharge l’application pour conserver tes suivis historiques.')
    }
    for (const name of Object.keys(item.byCollege || {})) {
      if (!Object.hasOwn(next.items[number].byCollege || {}, name)) throw new StateError(409, 'CLIENT_STALE', 'Un suivi historique ne peut pas être supprimé par cette sauvegarde.')
    }
  }
}
