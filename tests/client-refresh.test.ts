import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getClientRefreshUrl, isClientBelowMinimum, refreshObsoleteClient } from '../src/lib/client-refresh.ts'

test('only an incompatible client is obsolete, using numeric minimum versions', () => {
  assert.equal(isClientBelowMinimum('0.1.0', '0.1.0'), false)
  assert.equal(isClientBelowMinimum('0.2.0', '0.1.0'), false)
  assert.equal(isClientBelowMinimum('0.9.0', '0.10.0'), true)
  assert.equal(isClientBelowMinimum('v1.2', '1.2.0'), false)
  assert.equal(isClientBelowMinimum('0.1.0', ''), false)
  assert.equal(isClientBelowMinimum('', '0.1.0'), true)
})

test('reload bypasses cached HTML, preserves login parameters and cannot loop', () => {
  const href = getClientRefreshUrl('https://example.test/itemstracker/app.html?auth=register#login', '0.2.0', 123)!
  const url = new URL(href)
  assert.equal(url.searchParams.get('auth'), 'register')
  assert.equal(url.hash, '#login')
  assert.equal(url.searchParams.get('__it_cache'), '123')
  assert.equal(getClientRefreshUrl(href, '0.2.0'), null)
  assert.ok(getClientRefreshUrl(href, '0.3.0'))
})

test('Safari private browsing still has a URL guard when storage is unavailable', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window')
  let navigation = ''
  const location = { href: 'https://example.test/app.html', replace: (href: string) => { navigation = href } }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    location, get sessionStorage() { throw new Error('Storage denied') },
  } })
  try {
    assert.equal(refreshObsoleteClient('0.2.0'), true)
    location.href = navigation
    assert.equal(refreshObsoleteClient('0.2.0'), false)
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
