import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

// Validate every redirect and pin the connection to the checked DNS answer.
// https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
export function isPublicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number)
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0) || (a === 192 && b === 88 && c === 99) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113))
  }
  if (isIP(address) !== 6) return false
  const parts = address.toLowerCase().split(':')
  const first = parseInt(parts[0], 16)
  const second = parseInt(parts[1] || '0', 16)
  return first >= 0x2000 && first <= 0x3fff &&
    first !== 0x2002 && !(first === 0x2001 && (second < 0x200 || second === 0xdb8))
}

export function publicResourceUrl(value, base) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('INVALID_RESOURCE_URL')
  const url = new URL(value, base)
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80')) ||
      !host || host.includes('%') || host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || (!isIP(host) && !host.includes('.')) ||
      (isIP(host) && !isPublicAddress(host))) throw new Error('INVALID_RESOURCE_URL')
  url.hash = ''
  return url
}

function aborted(signal, promise) {
  if (signal.aborted) return Promise.reject(new Error('PREVIEW_TIMEOUT'))
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('PREVIEW_TIMEOUT'))
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export function createPublicResourceFetcher({ lookup = dnsLookup, http = httpRequest, https = httpsRequest } = {}) {
  return async function fetchResource(value, { signal, image = false, redirects = 0 } = {}) {
    const url = publicResourceUrl(value)
    const host = url.hostname.replace(/^\[|\]$/g, '')
    const addresses = await aborted(signal, lookup(host, { all: true, verbatim: true }))
    if (!addresses.length || addresses.some(entry => !isPublicAddress(entry.address))) throw new Error('PRIVATE_RESOURCE_ADDRESS')
    const chosen = addresses.find(entry => entry.family === 4) || addresses[0]
    const result = await new Promise((resolve, reject) => {
      let settled = false
      const finish = (error, value) => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', abort)
        error ? reject(error) : resolve(value)
      }
      const request = (url.protocol === 'https:' ? https : http)(url, {
        method: 'GET', agent: false, family: chosen.family, autoSelectFamily: false,
        lookup(_hostname, options, callback) {
          options.all ? callback(null, [chosen]) : callback(null, chosen.address, chosen.family)
        },
        headers: {
          'User-Agent': 'ItemsTracker-ResourcePreview/1.0',
          Accept: image ? 'image/png,image/jpeg,image/webp,image/gif,image/x-icon' : 'text/html,application/xhtml+xml,application/pdf',
          'Accept-Encoding': 'identity',
        },
      }, response => {
        const status = response.statusCode || 0
        if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
          finish(null, { redirect: new URL(response.headers.location, url).href })
          response.destroy()
          return
        }
        if (status < 200 || status >= 300) {
          finish(new Error('RESOURCE_UNAVAILABLE')); response.destroy(); return
        }
        const contentType = String(response.headers['content-type'] || '').split(';')[0].toLowerCase().trim()
        const length = Number(response.headers['content-length'])
        const byteSize = Number.isSafeInteger(length) && length > 0 ? length : null
        if (!image && contentType === 'application/pdf') {
          finish(null, { url: url.href, contentType, byteSize, body: Buffer.alloc(0) })
          response.destroy()
          return
        }
        const allowed = image
          ? ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon']
          : ['text/html', 'application/xhtml+xml']
        const limit = image ? 192 * 1024 : 512 * 1024
        if (!allowed.includes(contentType) || (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') ||
            (byteSize && byteSize > limit)) {
          finish(new Error('UNSUPPORTED_RESOURCE')); response.destroy(); return
        }
        let bytes = 0
        const chunks = []
        response.on('data', chunk => {
          bytes += chunk.length
          if (bytes > limit) { finish(new Error('RESOURCE_TOO_LARGE')); response.destroy(); return }
          chunks.push(chunk)
        })
        response.on('end', () => finish(null, { url: url.href, contentType, byteSize, body: Buffer.concat(chunks) }))
        response.on('error', error => finish(error))
        response.on('aborted', () => finish(new Error('RESOURCE_UNAVAILABLE')))
      })
      const abort = () => { finish(new Error('PREVIEW_TIMEOUT')); request.destroy() }
      request.on('error', error => finish(error))
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) { abort(); return }
      request.end()
    })
    if (result.redirect) {
      if (redirects >= 3) throw new Error('TOO_MANY_RESOURCE_REDIRECTS')
      return fetchResource(result.redirect, { signal, image, redirects: redirects + 1 })
    }
    return result
  }
}

function decodeText(value) {
  return String(value || '').replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_, entity) => {
    const names = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }
    if (entity[0] !== '#') return names[entity.toLowerCase()] || ''
    const hex = entity[1].toLowerCase() === 'x'
    const point = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10)
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : ''
  }).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function parseResourceMetadata(html, pageUrl) {
  const meta = new Map()
  let icon = ''
  for (const tag of html.match(/<(?:meta|link)\b[^>]*>/gi) || []) {
    const attributes = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
      .map(match => [match[1].toLowerCase(), decodeText(match[2] ?? match[3] ?? match[4])]))
    const name = (attributes.property || attributes.name || '').toLowerCase()
    if (attributes.content && !meta.has(name)) meta.set(name, attributes.content)
    if (!icon && /(?:^|\s)(?:icon|apple-touch-icon)(?:\s|$)/i.test(attributes.rel || '')) icon = attributes.href || ''
  }
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const clean = (value, limit) => decodeText(value).replace(/<[^>]*>/g, '').slice(0, limit)
  const imageUrl = value => { if (!value) return ''; try { return publicResourceUrl(value, pageUrl).href } catch { return '' } }
  return {
    title: clean(meta.get('og:title') || meta.get('twitter:title') || titleTag, 180),
    description: clean(meta.get('og:description') || meta.get('twitter:description') || meta.get('description'), 240),
    siteName: clean(meta.get('og:site_name') || new URL(pageUrl).hostname.replace(/^www\./, ''), 100),
    imageUrl: imageUrl(meta.get('og:image') || meta.get('twitter:image') || ''),
    iconUrl: imageUrl(icon || '/favicon.ico'),
  }
}

export async function getResourcePreview(value, { signal, fetchResource = createPublicResourceFetcher() } = {}) {
  const requested = publicResourceUrl(value)
  const page = await fetchResource(requested.href, { signal })
  if (page.contentType === 'application/pdf') {
    const filename = decodeURIComponent(new URL(page.url).pathname.split('/').pop() || 'Document PDF').slice(0, 180)
    return { title: filename, description: '', siteName: requested.hostname, kind: 'pdf', byteSize: page.byteSize, image: null }
  }
  const metadata = parseResourceMetadata(page.body.toString('utf8'), page.url)
  let image = null
  for (const source of [metadata.imageUrl, metadata.iconUrl].filter(Boolean)) {
    try {
      const asset = await fetchResource(source, { signal, image: true })
      image = { dataUrl: 'data:' + asset.contentType + ';base64,' + asset.body.toString('base64'), kind: source === metadata.imageUrl ? 'thumbnail' : 'icon' }
      break
    } catch { if (signal.aborted) break }
  }
  return { title: metadata.title, description: metadata.description, siteName: metadata.siteName, kind: 'link', byteSize: null, image }
}

export function mountResourcePreview(app, { authenticate, enforceClientVersion, limiter, fetchPreview = getResourcePreview }) {
  let active = 0
  app.post('/api/resources/preview', enforceClientVersion, (req, res, next) => {
    if (!authenticate(req)) return res.status(401).json({ error: 'Unauthorized' })
    next()
  }, limiter, async (req, res) => {
    res.set('Cache-Control', 'private, no-store')
    try { publicResourceUrl(req.body?.url) } catch { return res.status(400).json({ error: 'INVALID_RESOURCE_URL' }) }
    if (active >= 8) return res.status(429).json({ error: 'PREVIEW_BUSY' })
    active++
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const onClose = () => { if (!res.writableEnded) controller.abort() }
    res.on('close', onClose)
    try {
      const preview = await fetchPreview(req.body.url, { signal: controller.signal })
      if (!res.destroyed) res.json({ preview })
    } catch {
      // A site without usable metadata must not prevent opening its resource.
      if (!res.destroyed) res.json({ preview: null })
    } finally {
      clearTimeout(timer)
      res.removeListener('close', onClose)
      active--
    }
  })
}
