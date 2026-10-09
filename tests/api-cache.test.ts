import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getFreshApiUrl } from '../src/lib/api-cache.ts'

test('GET cache bypass preserves API parameters and generates a different URL for each request', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { href: 'https://setup-hub.com/itemstracker/app.html' } } })
  try {
    const first = getFreshApiUrl('https://api.setup-hub.com/api/state?imageMode=metadata', 'GET', 123)
    const second = getFreshApiUrl('https://api.setup-hub.com/api/state?imageMode=metadata', 'GET', 123)
    assert.notEqual(first, second)
    assert.equal(new URL(first).searchParams.get('imageMode'), 'metadata')
    assert.equal(new URL(first).origin, 'https://api.setup-hub.com')
    assert.equal(getFreshApiUrl('/api/auth/me', 'GET', 123).startsWith('https://setup-hub.com/api/auth/me?'), true)
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('login and save requests keep their original URL', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'post']) {
    assert.equal(getFreshApiUrl('https://api.setup-hub.com/api/auth/login', method), 'https://api.setup-hub.com/api/auth/login')
  }
})
