import { readFileSync } from 'node:fs'

const dataset = JSON.parse(readFileSync(new URL('./data/academic-national-ue-items.json', import.meta.url), 'utf8'))
export const nationalUnitSource = dataset.source

// The national section belongs to the item, never to a faculty/year. Fail at
// startup if a source assigns an item twice or silently omits a catalogue item.
export function buildNationalUnitIndex(source, expectedNumbers) {
  const byItem = new Map()
  const units = source.units.map(unit => {
    for (const reference of unit.itemReferences) {
      if (!expectedNumbers.has(reference.number) || byItem.has(reference.number) ||
        !Number.isInteger(reference.page) || reference.page < 1) {
        throw new Error(`Association nationale UE–item invalide : ${reference.number}`)
      }
      byItem.set(reference.number, {
        scope: 'national', unitNumber: unit.number, unitLabel: unit.label,
        sourceUrl: source.source.originalUrl, pdfUrl: source.source.pdfUrl,
        sourcePage: reference.page,
      })
    }
    return {
      number: unit.number, label: unit.label,
      itemNumbers: unit.itemReferences.map(reference => reference.number),
      itemCount: unit.itemReferences.length,
      sourceUrl: source.source.originalUrl, pdfUrl: source.source.pdfUrl,
      sourcePage: unit.sourcePage,
    }
  })
  if (byItem.size !== expectedNumbers.size) throw new Error('Référentiel national UE–item incomplet')
  return { byItem, units }
}

export const createNationalUnitIndex = expectedNumbers => buildNationalUnitIndex(dataset, expectedNumbers)
