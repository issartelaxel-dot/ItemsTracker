export type ItemCatalogStatus = 'all' | 'unmastered' | 'learning' | 'mastered'
export type ItemCatalogScope = 'national' | 'local'
export type ItemCatalogEntry = {
  itemNumber: number
  progress: number
  totalReviews: number
  tracking: { assignedColleges: string[]; itemMastery: string; quizCount: number; lastReviewDate: string | null }
}
export function itemCatalogStatus(item: ItemCatalogEntry): Exclude<ItemCatalogStatus, 'all'> {
  if (item.progress >= 1 || item.tracking.itemMastery === 'Parfait') return 'mastered'
  // Automatic college assignments contribute to progress but are not study activity.
  return item.totalReviews > 0 || item.tracking.quizCount > 0 || item.tracking.lastReviewDate || item.tracking.itemMastery !== 'Non évalué'
    ? 'learning' : 'unmastered'
}
export function countItemCatalogStatuses(items: ItemCatalogEntry[]) {
  const counts = { all: items.length, unmastered: 0, learning: 0, mastered: 0 }
  for (const item of items) counts[itemCatalogStatus(item)]++
  return counts
}
