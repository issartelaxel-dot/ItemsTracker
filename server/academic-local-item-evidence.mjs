// Attach a documented list to one local unit. The selector includes the year
// and unit kind so an optional course never changes the compulsory curriculum.
export function applyLocalItemEvidence(programs, evidence) {
  const resolve = row => {
    const program = programs.find(entry => entry.facultyId === row.facultyId && entry.yearCode === row.yearCode)
    const matches = program?.units.filter(unit => unit.label === row.unitLabel && unit.kind === row.unitKind) || []
    if (!program || matches.length !== 1) throw new Error(`UE locale ambiguë ou absente : ${row.facultyId} ${row.yearCode} ${row.unitLabel}`)
    return { program, unit: matches[0] }
  }
  for (const row of evidence.associations) {
    const { program, unit } = resolve(row)
    if (program.academicTerm !== row.academicTerm || !/^https:\/\//.test(row.sourceUrl)) {
      throw new Error(`Preuve annuelle UE–item invalide : ${row.unitLabel}`)
    }
    const numbers = new Set(unit.itemNumbers)
    for (const reference of row.itemReferences) {
      if (!Number.isInteger(reference.number) || reference.number < 1 || reference.number > 367 ||
        !Number.isInteger(reference.page) || reference.page < 1 || numbers.has(reference.number) ||
        !['programme', 'reference'].includes(reference.evidenceKind)) {
        throw new Error(`Preuve UE–item invalide : ${row.unitLabel} ${reference.number}`)
      }
      numbers.add(reference.number)
      unit.itemReferences.push({ ...reference, sourceUrl: row.sourceUrl })
    }
    unit.itemNumbers = [...numbers].sort((a, b) => a - b)
    unit.associationCheckedAt = row.checkedAt
  }
  for (const issue of evidence.issues) {
    const { unit } = resolve(issue)
    unit.mappingIssues = [...(unit.mappingIssues || []), { ...issue }]
  }
}
