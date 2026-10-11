export type FlashcardCatalogStatus = 'all' | 'unmastered' | 'learning' | 'mastered'
export type FlashcardOrganization = 'status' | 'colleges' | 'items'

export function getFlashcardCatalogStatus(percent: number): Exclude<FlashcardCatalogStatus, 'all'> {
  return percent >= 100 ? 'mastered' : percent > 0 ? 'learning' : 'unmastered'
}

export function countFlashcardCatalogStatuses(rows: { masteryPercent: number }[]) {
  const counts = { all: rows.length, unmastered: 0, learning: 0, mastered: 0 }
  for (const row of rows) counts[getFlashcardCatalogStatus(row.masteryPercent)]++
  return counts
}

export function organizeFlashcardCatalog<T extends { masteryPercent: number }>(
  rows: T[], status: FlashcardCatalogStatus, organization: FlashcardOrganization,
) {
  const filtered = rows.filter(row => status === 'all' || getFlashcardCatalogStatus(row.masteryPercent) === status)
  if (organization !== 'status') return filtered
  // Stable ordering keeps the selected name/progress/item sort inside each status.
  const rank = { unmastered: 0, learning: 1, mastered: 2 }
  return filtered.sort((a, b) => rank[getFlashcardCatalogStatus(a.masteryPercent)] - rank[getFlashcardCatalogStatus(b.masteryPercent)])
}
