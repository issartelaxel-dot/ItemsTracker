import source from '../data/item-reference-assignments.json' with { type: 'json' }

// Books that cover each item. LiSA writing/reviewing organisations remain
// separate editorial metadata and must never become study assignments.
export const referenceProvenance = source.provenance
export const referenceAssignments: Record<number, string[]> = source.items
export const referenceCollegeNames = source.references.map(ref => ref.college).sort((a, b) => a.localeCompare(b, 'fr'))

export function usesReferenceDefaults(profile: { yearCode: string | null; legacyExempt?: boolean } | null) {
  return Boolean(profile && ['Y4', 'Y5', 'Y6'].includes(profile.yearCode || '') && !profile.legacyExempt)
}

type Tracking = { assignedColleges: string[]; byCollege: Record<string, unknown> }
export function hydrateReferenceDefaults<T extends { items: Record<number, Tracking> }>(state: T, enabled: boolean, createCollege: () => unknown, createItem?: () => T['items'][number]): T {
  if (!enabled || !createItem) return state
  let changed = false
  const items = { ...state.items }
  for (const [number, colleges] of Object.entries(referenceAssignments)) {
    // Even a saved empty selection is a user-owned state. Only create missing
    // items; never refill, rename or replace an existing item's assignments.
    if (Object.hasOwn(items, number)) continue
    items[Number(number)] = { ...createItem(), assignedColleges: [...colleges],
      byCollege: Object.fromEntries(colleges.map(college => [college, createCollege()])) }
    changed = true
  }
  return changed ? { ...state, items } : state
}
