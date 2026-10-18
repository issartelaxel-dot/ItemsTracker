import { progressCollegeKeys, type ReferenceTransition } from './reference-transition'

type ProgressTracking = {
  assignedColleges: string[]
  byCollege: Record<string, { mastery: string }>
  lisaSheets: { tracking: { mastery: string } }[]
  platformSheets: { tracking: { mastery: string } }[]
  referenceTransition?: ReferenceTransition
}

export function calculateItemProgress(itemTracking: ProgressTracking, MASTERY_SCORE: Readonly<Record<string, number>>): number {
  const excludeLisaAxis = itemTracking.lisaSheets.length === 0
  const excludePlatformAxis = itemTracking.platformSheets.length === 0

  const progressKeys = progressCollegeKeys(itemTracking)
  const hasPerfectCollege = progressKeys.some((college) => {
    const tracking = itemTracking.byCollege[college]
    return tracking?.mastery === 'Parfait'
  })
  const hasPerfectLisa =
    excludeLisaAxis || itemTracking.lisaSheets.some((sheet) => sheet.tracking.mastery === 'Parfait')
  const hasPerfectPlatform =
    excludePlatformAxis || itemTracking.platformSheets.some((sheet) => sheet.tracking.mastery === 'Parfait')

  // If all required axes have at least one "Parfait", item is fully completed.
  if (hasPerfectCollege && hasPerfectLisa && hasPerfectPlatform) {
    return 1
  }

  const normalizeMastery = (mastery: string) => MASTERY_SCORE[mastery] / MASTERY_SCORE.Parfait

  const collegeValues = progressKeys
    .map((college) => itemTracking.byCollege[college])
    .filter(Boolean)
    .map((tracking) => normalizeMastery(tracking.mastery))

  const lisaValues = itemTracking.lisaSheets.map((sheet) => normalizeMastery(sheet.tracking.mastery))
  const platformValues = itemTracking.platformSheets.map((sheet) => normalizeMastery(sheet.tracking.mastery))

  const average = (values: number[]) => {
    if (values.length === 0) {
      return 0
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }

  const collegeProgress = average(collegeValues)
  const lisaProgress = average(lisaValues)
  const platformProgress = average(platformValues)

  const axes = [collegeProgress]
  if (!excludeLisaAxis) {
    axes.push(lisaProgress)
  }
  if (!excludePlatformAxis) {
    axes.push(platformProgress)
  }

  return average(axes)
}
