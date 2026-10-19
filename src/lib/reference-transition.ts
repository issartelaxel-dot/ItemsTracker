export type ReferenceTransition = {
  schemaVersion: 1
  policy: 'preserve-existing'
  sourceSha256: string
  migratedAt: string
  previousAssignments: string[]
  preservedColleges: string[]
  pendingColleges: string[]
  renamedColleges: Record<string, string>
  recoveredMissingAssignment?: boolean
}

type Tracking = { assignedColleges: string[]; referenceTransition?: ReferenceTransition }

// Existing additional references stay assigned; do not count duplicate keys.
export function reviewCollegeKeys(item: Tracking): string[] {
  return [...new Set(item.assignedColleges)]
}

// An added reference is not an assessment. It only affects progress after an
// actual review or a feeling selection, avoiding an artificial progress drop.
export function progressCollegeKeys(item: Tracking): string[] {
  const pending = new Set(item.referenceTransition?.pendingColleges || [])
  return reviewCollegeKeys(item).filter(name => !pending.has(name))
}
