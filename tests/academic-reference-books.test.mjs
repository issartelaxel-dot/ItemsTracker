import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { academicCatalogFor, nationalItems, nationalColleges, referenceBooks } from '../server/academic-catalog.mjs'
import { buildReferenceBookIndex } from '../server/academic-reference-books.mjs'

const data = JSON.parse(readFileSync(new URL('../server/data/academic-reference-books.json', import.meta.url), 'utf8'))
const validItems = new Set(nationalItems.map(item => item.number))

test('documented books and unconfirmed leads remain separate from LiSA roles and local curricula', () => {
  assert.equal(nationalItems.reduce((n, item) => n + item.referenceLinks.length, 0), 96)
  assert.equal(nationalItems.reduce((n, item) => n + item.referenceCandidates.length, 0), 28)
  assert.equal(nationalItems.filter(item => item.referenceLinks.length).length, 76)
  assert.equal(referenceBooks.filter(book => book.itemCount > 0).length, 6)
  assert.equal(nationalColleges.length, 59)
  assert.equal(nationalItems.reduce((n, item) => n + item.collegeLinks.length, 0), 702)
  const bordeaux = academicCatalogFor('bordeaux', 'Y5')
  const nice = academicCatalogFor('nice', 'Y6')
  assert.equal(bordeaux.items.filter(item => item.unitLinks.length).length, 204)
  assert.equal(nice.items.every(item => item.unitLinks.length === 0), true)
  for (const item of nationalItems) {
    assert.equal(item.referenceLinks.every(link => link.relation === 'item_reference' && link.status === 'verified'), true)
    assert.equal(item.referenceCandidates.every(link => link.status === 'candidate'), true)
    assert.deepEqual(nice.items.find(entry => entry.number === item.number).referenceLinks, item.referenceLinks)
  }
})

test('V5.1 examples have precise edition evidence without promoting all suggested books', () => {
  const item = number => nationalItems.find(entry => entry.number === number)
  assert.deepEqual(item(325).referenceLinks.map(link => link.referenceId), ['cnpm-cnet-2024'])
  assert.equal(item(325).referenceLinks[0].sourcePage, 5)
  assert.equal(item(325).referenceCandidates.some(link => link.referenceId === 'cemir-2024'), true)
  assert.deepEqual(item(329).referenceLinks.map(link => link.referenceId), ['cemir-2024', 'cnear-2020-maj', 'cnpm-cnet-2024'])
  assert.equal(item(329).referenceCandidates.length, 2)
  assert.equal(item(330).referenceLinks.length, 3)
  assert.match(item(330).referenceLinks.find(link => link.referenceId === 'cemir-2024').coverageNote, /AVK et héparines/)
  assert.match(item(330).referenceLinks.find(link => link.referenceId === 'cuen-2025').coverageNote, /Portée partielle/)
  assert.equal(item(330).referenceCandidates.some(link => link.referenceId === 'couf-2025'), true)
  const glaucoma = item(84).referenceLinks.find(link => link.referenceId === 'couf-2025')
  assert.match(glaucoma.sourceUrl, /CH14_/)
  assert.equal(glaucoma.sourcePage, 1)
  assert.equal(item(84).referenceCandidates.some(link => link.referenceId === 'couf-2025'), false)
  assert.equal(referenceBooks.find(book => book.id === 'cnear-2020-maj').publicationYear, 2020)
  assert.equal(referenceBooks.find(book => book.id === 'cep-2026').itemCount, 21)
})

test('reference index rejects duplicates, unknown items, and secondary evidence promoted to verified', () => {
  const first = data.links.find(link => link.status === 'verified')
  assert.throws(() => buildReferenceBookIndex({ books: data.books, links: [first, first] }, validItems), /invalide/)
  assert.throws(() => buildReferenceBookIndex({ books: data.books, links: [{ ...first, itemNumber: 999 }] }, validItems), /invalide/)
  assert.throws(() => buildReferenceBookIndex({ books: data.books, links: [{ ...first, evidenceKind: 'secondary_example' }] }, validItems), /primaire/)
  assert.throws(() => buildReferenceBookIndex({ books: data.books, links: [{ ...first, sourceUrl: 'https://nexternat.fr/externat/les-items/' }] }, validItems), /primaire/)
  assert.throws(() => buildReferenceBookIndex({ books: data.books, links: [{ ...first, referenceId: 'geriatrie-candidate' }] }, validItems), /primaire/)
  assert.throws(() => buildReferenceBookIndex({ books: data.books, links: [{ ...first, sourcePage: 0 }] }, validItems), /invalide/)
  assert.throws(() => buildReferenceBookIndex({ books: [data.books[0], data.books[0]], links: [] }, validItems), /bibliographique/)
})
