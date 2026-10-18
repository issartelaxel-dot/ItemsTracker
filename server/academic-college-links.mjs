// La copie publique du tableau LiSA 2026 indique les rôles éditoriaux des
// collèges. Son original UNESS exige une connexion : ces données restent
// provisoires jusqu'à une vérification directe. Aucun tag Dijon Y4 n'est importé.
import { readFileSync } from 'node:fs'
export const lisaCollegeSource = JSON.parse(readFileSync(new URL('./data/academic-lisa-2026-college-links.json', import.meta.url), 'utf8'))
export const provisionalCollegeAssignments = Object.entries(lisaCollegeSource.items).flatMap(([number, item]) => [
  ...item.writers.map(collegeName => ({ itemNumber: Number(number), collegeName, role: 'writing', sourceUrl: item.url, sourceEdition: lisaCollegeSource.sourceEdition, verificationStatus: lisaCollegeSource.validationStatus })),
  ...item.reviewers.map(collegeName => ({ itemNumber: Number(number), collegeName, role: 'reviewing', sourceUrl: item.url, sourceEdition: lisaCollegeSource.sourceEdition, verificationStatus: lisaCollegeSource.validationStatus })),
])

export function buildCollegeIndex(assignments, knownItemNumbers) {
  const byItem = new Map()
  const byCollege = new Map()
  const seen = new Set()
  for (const link of assignments) {
    const { itemNumber, collegeName, role, sourceUrl, sourceEdition, verificationStatus } = link
    if (!knownItemNumbers.has(itemNumber) || !collegeName?.trim() || !['writing', 'reviewing'].includes(role) ||
      !/^https:\/\//.test(sourceUrl || '') || !/^20\d\d$/.test(sourceEdition || '') || !verificationStatus) {
      throw new Error('Association item–collège sans item valide, rôle, millésime ou provenance.')
    }
    const key = `${itemNumber}:${collegeName}:${role}:${sourceEdition}`
    if (seen.has(key)) continue
    seen.add(key)
    if (!byItem.has(itemNumber)) byItem.set(itemNumber, [])
    byItem.get(itemNumber).push({ name: collegeName, role, sourceUrl, sourceEdition, verificationStatus })
    if (!byCollege.has(collegeName)) byCollege.set(collegeName, new Set())
    byCollege.get(collegeName).add(itemNumber)
  }
  return {
    byItem,
    colleges: [...byCollege].map(([name, itemNumbers]) => ({ name, itemCount: itemNumbers.size, itemNumbers: [...itemNumbers].sort((a, b) => a - b) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
  }
}
