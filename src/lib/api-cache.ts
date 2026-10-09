let requestSequence = 0

// Avoid stale GET responses without cache-mode headers in Safari's CORS preflight.
export function getFreshApiUrl(candidate: string, method = 'GET', now = Date.now()): string {
  if (!['GET', 'HEAD'].includes(method.toUpperCase())) return candidate
  const url = new URL(candidate, window.location.href)
  url.searchParams.set('__it_request', `${now}-${++requestSequence}`)
  return url.href
}
