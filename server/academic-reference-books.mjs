import { readFileSync } from 'node:fs'

const dataset = JSON.parse(readFileSync(new URL('./data/academic-reference-books.json', import.meta.url), 'utf8'))
export const referenceProvenance = dataset.provenance

export function buildReferenceBookIndex(data, validItems) {
  const books = new Map()
  const byItem = new Map()
  const candidatesByItem = new Map()
  const seen = new Set()
  const primaryEvidence = new Set(['chapter', 'publisher_contents', 'college_contents'])
  for (const book of data.books) {
    if (!book.id || books.has(book.id) || !book.title || !book.edition || !/^https:\/\//.test(book.editionSourceUrl || '')) {
      throw new Error('Métadonnée bibliographique invalide')
    }
    books.set(book.id, { ...book, itemNumbers: [], candidateItemNumbers: [] })
  }
  for (const link of data.links) {
    const book = books.get(link.referenceId)
    const key = `${link.itemNumber}:${link.referenceId}`
    if (!book || !validItems.has(link.itemNumber) || seen.has(key) || link.relation !== 'item_reference' ||
      !['verified', 'candidate'].includes(link.status) || !/^https:\/\//.test(link.sourceUrl || '') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(link.checkedAt || '') ||
      (link.sourcePage !== null && (!Number.isInteger(link.sourcePage) || link.sourcePage < 1))) {
      throw new Error(`Lien item–ouvrage invalide : ${key}`)
    }
    if (link.status === 'verified' && (!primaryEvidence.has(link.evidenceKind) ||
      !Number.isInteger(book.publicationYear) || /(^|\.)nexternat\.fr$/i.test(new URL(link.sourceUrl).hostname))) {
      throw new Error(`Preuve primaire item–ouvrage manquante : ${key}`)
    }
    seen.add(key)
    const index = link.status === 'verified' ? byItem : candidatesByItem
    if (!index.has(link.itemNumber)) index.set(link.itemNumber, [])
    index.get(link.itemNumber).push({ ...link, title: book.title, edition: book.edition,
      publicationYear: book.publicationYear, editionNote: book.editionNote, organisms: book.organisms })
    book[link.status === 'verified' ? 'itemNumbers' : 'candidateItemNumbers'].push(link.itemNumber)
  }
  return { byItem, candidatesByItem, books: [...books.values()].map(book => ({ ...book,
    itemCount: book.itemNumbers.length, candidateItemCount: book.candidateItemNumbers.length,
  })) }
}

export const createReferenceBookIndex = validItems => buildReferenceBookIndex(dataset, validItems)
