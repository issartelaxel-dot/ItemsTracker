import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import express from 'express'
import { isPublicAddress, publicResourceUrl, createPublicResourceFetcher, parseResourceMetadata, getResourcePreview, mountResourcePreview } from '../server/resource-preview.mjs'

const signal = () => new AbortController().signal
const transport = (pages, calls) => (url, options, callback) => {
  calls.push({ url: url.href, options })
  const req = new EventEmitter()
  req.destroy = () => {}
  req.end = () => queueMicrotask(() => {
    const page = pages[url.href]
    const response = Readable.from([Buffer.from(page.body || '')])
    response.statusCode = page.status || 200
    response.headers = page.headers || { 'content-type': 'text/html' }
    callback(response)
  })
  return req
}

test('rejects private, special and encoded internal addresses', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.0.1', '169.254.169.254', '100.64.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', '2001:db8::1']) assert.equal(isPublicAddress(address), false, address)
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700::1111']) assert.equal(isPublicAddress(address), true)
  for (const url of ['http://2130706433/', 'http://0x7f000001/', 'http://localhost/', 'http://test.local/', 'https://user:pass@example.com', 'https://example.com:8080', 'file:///etc/passwd']) assert.throws(() => publicResourceUrl(url))
  assert.equal(publicResourceUrl('https://example.com/a#b').href, 'https://example.com/a')
})

test('checks all DNS answers and pins the connection; rejects private redirects', async () => {
  const calls = []
  const pages = { 'https://example.com/': { body: '<title>Hello</title>' }, 'https://example.com/redirect': { status: 302, headers: { location: 'http://127.0.0.1/' } } }
  const mock = transport(pages, calls)
  const fetchResource = createPublicResourceFetcher({ lookup: async () => [{ address: '8.8.8.8', family: 4 }], http: mock, https: mock })
  const page = await fetchResource('https://example.com/', { signal: signal() })
  assert.match(page.body.toString(), /Hello/)
  calls[0].options.lookup('example.com', {}, (error, address, family) => { assert.equal(error, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4) })
  assert.equal(calls[0].options.headers.Authorization, undefined)
  await assert.rejects(fetchResource('https://example.com/redirect', { signal: signal() }))
  const mixed = createPublicResourceFetcher({ lookup: async () => [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }], https: mock })
  await assert.rejects(mixed('https://example.com/', { signal: signal() }), /PRIVATE_RESOURCE_ADDRESS/)
  assert.equal(calls.length, 2)
})

test('bounds response sizes, excludes SVG and honours cancellation', async () => {
  const calls = []
  const mock = transport({ 'https://example.com/large': { body: 'a'.repeat(513 * 1024) }, 'https://example.com/svg': { headers: { 'content-type': 'image/svg+xml' }, body: '<svg/>' } }, calls)
  const fetchResource = createPublicResourceFetcher({ lookup: async () => [{ address: '8.8.8.8', family: 4 }], https: mock })
  await assert.rejects(fetchResource('https://example.com/large', { signal: signal() }), /RESOURCE_TOO_LARGE/)
  await assert.rejects(fetchResource('https://example.com/svg', { signal: signal(), image: true }), /UNSUPPORTED_RESOURCE/)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(fetchResource('https://example.com/', { signal: controller.signal }), /PREVIEW_TIMEOUT/)
})

test('extracts plain metadata and resolves relative thumbnail URLs', () => {
  const metadata = parseResourceMetadata('<title>Fallback</title><meta content="Article &amp; science" property="og:title"><meta name="description" content="Résumé utile"><meta property="og:image" content="/preview.png">', 'https://example.com/article')
  assert.equal(metadata.title, 'Article & science')
  assert.equal(metadata.description, 'Résumé utile')
  assert.equal(metadata.imageUrl, 'https://example.com/preview.png')
  assert.equal(parseResourceMetadata('<title>Simple</title>', 'https://example.com').imageUrl, '')
})

test('falls back to favicon and obtains real PDF size without fetching its body', async () => {
  const preview = await getResourcePreview('https://example.com/article', { signal: signal(), fetchResource: async (url, options) => {
    if (!options.image) return { url, contentType: 'text/html', body: Buffer.from('<title>Article</title><meta property="og:image" content="/missing.png">') }
    if (url.endsWith('missing.png')) throw new Error('Not found')
    return { contentType: 'image/png', body: Buffer.from('test') }
  } })
  assert.equal(preview.title, 'Article')
  assert.equal(preview.image.kind, 'icon')
  const calls = []
  const mock = transport({ 'https://example.com/fiche.pdf': { headers: { 'content-type': 'application/pdf', 'content-length': '2300000' } } }, calls)
  const pdf = await getResourcePreview('https://example.com/fiche.pdf', { signal: signal(), fetchResource: createPublicResourceFetcher({ lookup: async () => [{ address: '8.8.8.8', family: 4 }], https: mock }) })
  assert.equal(pdf.kind, 'pdf'); assert.equal(pdf.byteSize, 2300000)
})

test('endpoint requires authentication and gracefully handles blocked previews', async () => {
  const app = express(); app.use(express.json())
  let calls = 0
  mountResourcePreview(app, { authenticate: req => req.headers.authorization === 'test', enforceClientVersion: (_req, _res, next) => next(), limiter: (_req, _res, next) => next(), fetchPreview: async () => { calls++; throw new Error('blocked') } })
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
  try {
    const request = (url, auth) => fetch(`http://127.0.0.1:${server.address().port}/api/resources/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: 'test' } : {}) }, body: JSON.stringify({ url }) })
    assert.equal((await request('https://example.com', false)).status, 401)
    assert.equal((await request('http://127.0.0.1', true)).status, 400)
    assert.equal(calls, 0)
    const response = await request('https://example.com', true)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.deepEqual(await response.json(), { preview: null })
    assert.equal(calls, 1)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
