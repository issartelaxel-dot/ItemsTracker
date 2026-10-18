export const LOCAL_UNIT_LEVELS = ['Non évalué', 'Moyen', 'Bon', 'Très bon', 'Parfait'] as const
export type LocalUnitTracking = {
  reviews: number
  mastery: typeof LOCAL_UNIT_LEVELS[number]
  comments: string
  lastReviewedAt: string | null
}

export function normalizeLocalUnitTracking(value?: Partial<LocalUnitTracking> | null): LocalUnitTracking {
  return {
    reviews: typeof value?.reviews === 'number' && Number.isFinite(value.reviews) ? Math.max(0, Math.floor(value.reviews)) : 0,
    mastery: LOCAL_UNIT_LEVELS.includes(value?.mastery as LocalUnitTracking['mastery']) ? value!.mastery! : 'Non évalué',
    comments: typeof value?.comments === 'string' ? value.comments : '',
    lastReviewedAt: typeof value?.lastReviewedAt === 'string' ? value.lastReviewedAt : null,
  }
}

export function normalizeLocalUnitTrackingMap(value: unknown): Record<string, LocalUnitTracking> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry && typeof entry === 'object' && !Array.isArray(entry)).map(([key, entry]) => [key, normalizeLocalUnitTracking(entry)]))
}

export function localUnitTrackingKey(facultyId: string, yearCode: string, term: string, unitId: string) {
  return JSON.stringify([facultyId, yearCode, term, unitId])
}
