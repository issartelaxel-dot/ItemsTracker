import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withRequestTimeout } from '../src/lib/request-timeout.ts'

test('a hung request is aborted and rejects without waiting forever', async () => {
  let signal: AbortSignal | undefined
  await assert.rejects(withRequestTimeout(value => {
    signal = value
    return new Promise<never>(() => {})
  }, 20), /serveur ne répond pas/)
  assert.equal(signal?.aborted, true)
})

test('successful requests return their result and are not aborted later', async () => {
  let signal: AbortSignal | undefined
  assert.equal(await withRequestTimeout(async value => { signal = value; return 123 }, 20), 123)
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(signal?.aborted, false)
})

test('the deadline covers response body loading as well as the initial request', async () => {
  await assert.rejects(withRequestTimeout(async () => {
    await Promise.resolve('headers received')
    await new Promise<never>(() => {})
  }, 20), /serveur ne répond pas/)
})
