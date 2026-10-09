// Match the minimum-version comparison used by the API, rather than its release version.
export function isClientBelowMinimum(client: string, minimum: string): boolean {
  const parse = (value: string) => {
    const result: number[] = []
    for (const segment of value.trim().replace(/^v/i, '').split('.')) {
      const match = segment.match(/^(\d+)/)
      if (!match) break
      result.push(Number(match[1]))
    }
    return result
  }
  const required = parse(minimum)
  if (!required.length) return false
  const current = parse(client)
  if (!current.length) return true
  for (let index = 0; index < Math.max(current.length, required.length); index++) {
    const difference = (current[index] ?? 0) - (required[index] ?? 0)
    if (difference) return difference < 0
  }
  return false
}

export function getClientRefreshUrl(href: string, minimum: string, now = Date.now()): string | null {
  const url = new URL(href)
  const target = minimum || 'latest'
  // The URL guard also works when Safari disallows sessionStorage.
  if (url.searchParams.get('__it_refresh') === target) return null
  url.searchParams.set('__it_refresh', target)
  url.searchParams.set('__it_cache', String(now))
  return url.href
}

export function refreshObsoleteClient(minimum: string): boolean {
  const url = getClientRefreshUrl(window.location.href, minimum)
  if (!url) return false
  const key = `itemstracker:client-refresh:${minimum || 'latest'}`
  try {
    const previous = Number(window.sessionStorage.getItem(key))
    if (previous && Date.now() - previous < 300_000) return false
    window.sessionStorage.setItem(key, String(Date.now()))
  } catch { /* The URL remains the reload-loop guard in private browsing. */ }
  // A new URL bypasses Safari's cached document; deploy assets also have content hashes.
  window.location.replace(url)
  return true
}
