type CollegeFeeling = { mastery: string; reviews: number }

// « Moyen » is the stored default (displayed as « Difficile »), not an assessment.
// A changed feeling is sufficient; a revision counter is not required.
export function hasCollegeFeeling(entry: CollegeFeeling | undefined): boolean {
  return Boolean(entry && (entry.reviews > 0 || entry.mastery !== 'Moyen'))
}

export function isCollegeItemCompleted(entry: CollegeFeeling | undefined): boolean {
  return Boolean(entry && ['Bon', 'Très bon', 'Parfait'].includes(entry.mastery))
}
