import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createGlobalSearchEntry, normalizeSearchText, searchGlobalIndex } from '../src/lib/global-search.ts'

function entry(id, kind, label, fields = [label], ranking = [label], offset = 0) {
  return createGlobalSearchEntry({ id, kind, label, detail: '', meta: '' }, fields, ranking, offset)
}
const ids = results => results.map(result => result.id)

test('search preserves accent-insensitive matching across content fields', () => {
  assert.equal(normalizeSearchText('  Étiologie / pédiatrique—20  '), 'ETIOLOGIE PEDIATRIQUE 20')
  const index = [
    entry('item', 'item', 'Item #20', ['item', 20, 'Étiologie pédiatrique', null, undefined]),
    entry('card', 'flashcard', 'Question', ['Question', 'Réponse clinique', 'note personnelle']),
    entry('lisa', 'lisa', 'Fiche 150', ['fiche lisa', 'Fiche 150', 'https://example.test/lisa', 'surveillance annuelle']),
  ]
  assert.deepEqual(ids(searchGlobalIndex(index, 'ETIOLOGIE PEDIATRIQUE')), ['item'])
  assert.deepEqual(ids(searchGlobalIndex(index, 'question reponse')), ['card'])
  assert.deepEqual(ids(searchGlobalIndex(index, 'note personnelle')), ['card'])
  assert.deepEqual(ids(searchGlobalIndex(index, 'surveillance annuelle')), ['lisa'])
  assert.deepEqual(ids(searchGlobalIndex(index, 'example.test/lisa')), ['lisa'])
  assert.deepEqual(searchGlobalIndex(index, '---'), [])
  assert.deepEqual(searchGlobalIndex(index, '20', 0), [])
})

test('exact, prefix and contains ranks retain resource offsets and stable French ordering', () => {
  const index = [
    entry('contains', 'item', 'Item #120', ['120'], ['120']),
    entry('prefix', 'item', 'Item #200', ['200'], ['200']),
    entry('exact', 'item', 'Item #20', ['20'], ['20']),
    entry('card', 'flashcard', '20', ['20'], ['20'], 1),
    entry('college', 'college', '20', ['20'], ['20']),
  ]
  assert.deepEqual(ids(searchGlobalIndex(index, '20')), ['college', 'exact', 'card', 'prefix', 'contains'])
  const sameKind = [entry('e', 'college', 'École', ['commun']), entry('z', 'college', 'Zèbre', ['commun']),
    entry('a', 'college', 'Anatomie', ['commun']), entry('a2', 'college', 'Anatomie', ['commun'])]
  assert.deepEqual(ids(searchGlobalIndex(sameKind, 'commun')), ['a', 'a2', 'e', 'z'])
})

test('bounded results equal the previous full sort on a large mixed index', () => {
  const kinds = ['item', 'college', 'flashcard', 'youtube', 'link', 'lisa', 'platform']
  const labels = ['Étiologie', 'École', 'Anatomie', 'Pneumologie', 'Zèbre', '20', '200', '120']
  const index = Array.from({ length: 4000 }, (_, i) => entry(`result-${i}`, kinds[i % kinds.length], labels[i % labels.length],
    [labels[i % labels.length], i % 367, 'clinique', `note ${i % 17}`], [labels[i % labels.length], i % 367], i % 3 === 0 ? 1 : 0))
  for (const query of ['20', 'é', 'pneumo', 'note 1', 'clinique', 'inexistant', '']) {
    const normalized = normalizeSearchText(query)
    const reference = normalized ? index.filter(entry => entry.text.includes(normalized)).map(entry => ({
      result: entry.result,
      rank: entry.rankOffset + (entry.rankingTerms.some(term => term === normalized) ? 0
        : entry.rankingTerms.some(term => term.startsWith(normalized)) ? 1 : 2),
    })).sort((a, b) => a.rank - b.rank || a.result.kind.localeCompare(b.result.kind, 'fr') || a.result.label.localeCompare(b.result.label, 'fr')) : []
    for (const limit of [1, 12, 50, 5000]) {
      assert.deepEqual(searchGlobalIndex(index, query, limit), reference.slice(0, limit).map(hit => hit.result), `${query}, limit ${limit}`)
    }
  }
})

test('querying an index does not mutate documents or result identities', () => {
  const document = entry('item', 'item', 'Item #20')
  Object.freeze(document.result)
  Object.freeze(document.rankingTerms)
  Object.freeze(document)
  const index = Object.freeze([document])
  assert.equal(searchGlobalIndex(index, '20')[0], document.result)
  assert.deepEqual(searchGlobalIndex(index, '999'), [])
  assert.equal(searchGlobalIndex(index, '20')[0], document.result)
})
