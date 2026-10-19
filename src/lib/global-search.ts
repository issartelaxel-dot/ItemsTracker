export type GlobalSearchResultKind = 'item' | 'college' | 'flashcard' | 'youtube' | 'link' | 'lisa' | 'platform'
export type GlobalSearchResult = {
  id: string
  kind: GlobalSearchResultKind
  label: string
  detail: string
  meta: string
  itemNumber?: number
  college?: string
  cardId?: string
  sheetKind?: 'lisaSheets' | 'platformSheets'
  href?: string
}
type SearchValue = string | number | null | undefined
export type GlobalSearchEntry = {
  result: GlobalSearchResult
  text: string
  rankingTerms: readonly string[]
  rankOffset: number
}

export function normalizeSearchText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim().toUpperCase()
}

// Compile when the underlying data changes, never once per typed character.
export function createGlobalSearchEntry(result: GlobalSearchResult, values: readonly SearchValue[], rankingValues: readonly SearchValue[], rankOffset = 0): GlobalSearchEntry {
  return {
    result,
    text: normalizeSearchText(values.filter(value => value !== null && value !== undefined).join(' ')),
    rankingTerms: rankingValues.map(value => normalizeSearchText(String(value ?? ''))).filter(Boolean),
    rankOffset,
  }
}

const collator = new Intl.Collator('fr')
type Hit = { entry: GlobalSearchEntry; rank: number }
const compare = (a: Hit, b: Hit) => a.rank - b.rank || collator.compare(a.entry.result.kind, b.entry.result.kind) || collator.compare(a.entry.result.label, b.entry.result.label)

export function searchGlobalIndex(index: readonly GlobalSearchEntry[], query: string, limit = 12): GlobalSearchResult[] {
  const normalized = normalizeSearchText(query)
  if (!normalized || limit <= 0) return []
  const best: Hit[] = []
  for (const entry of index) {
    if (!entry.text.includes(normalized)) continue
    const rank = entry.rankingTerms.some(term => term === normalized) ? 0
      : entry.rankingTerms.some(term => term.startsWith(normalized)) ? 1 : 2
    const hit = { entry, rank: rank + entry.rankOffset }
    if (best.length === limit && compare(hit, best[best.length - 1]) >= 0) continue
    let position = best.length
    while (position > 0 && compare(hit, best[position - 1]) < 0) position--
    best.splice(position, 0, hit)
    if (best.length > limit) best.pop()
  }
  return best.map(hit => hit.entry.result)
}
