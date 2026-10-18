import test from 'node:test'
import assert from 'node:assert/strict'
import { localUnitTrackingKey, normalizeLocalUnitTracking, normalizeLocalUnitTrackingMap } from '../src/lib/local-unit-tracking.ts'

test('Existing accounts start with no local UE tracking', () => {
  assert.deepEqual(normalizeLocalUnitTrackingMap(undefined), {})
  assert.deepEqual(normalizeLocalUnitTracking(), { reviews: 0, mastery: 'Non évalué', comments: '', lastReviewedAt: null })
})

test('Local tracking is isolated by faculty, year, academic term and UE', () => {
  const base = localUnitTrackingKey('dijon', 'Y4', '2026-2027', 'ue4')
  for (const args of [['lyon','Y4','2026-2027','ue4'], ['dijon','Y5','2026-2027','ue4'], ['dijon','Y4','2027-2028','ue4'], ['dijon','Y4','2026-2027','ue5']]) {
    assert.notEqual(localUnitTrackingKey(...args as [string,string,string,string]), base)
  }
})

test('Saved notes and feelings survive normalisation, invalid counts are clamped', () => {
  const entry = { reviews: 2, mastery: 'Parfait' as const, comments: 'À revoir : douleur neuropathique', lastReviewedAt: '2026-10-16T10:00:00Z' }
  assert.deepEqual(normalizeLocalUnitTrackingMap({ ue4: entry }).ue4, entry)
  assert.equal(normalizeLocalUnitTracking({ reviews: -2 }).reviews, 0)
  assert.equal(normalizeLocalUnitTracking({ reviews: Infinity }).reviews, 0)
  assert.equal(normalizeLocalUnitTracking({ reviews: 2.9 }).reviews, 2)
  assert.deepEqual(normalizeLocalUnitTrackingMap({ missing: null, invalid: [] }), {})
})
