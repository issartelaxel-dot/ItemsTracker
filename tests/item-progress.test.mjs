import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateItemProgress } from '../src/lib/item-progress.ts'
const scores = { Moyen: 1, Bon: 2, 'Très bon': 3, Parfait: 4 }
const item = (patch = {}) => ({ assignedColleges: ['A'], byCollege: { A: { mastery: 'Bon' } }, lisaSheets: [], platformSheets: [], noLisaSheets: false, noPlatformSheets: false, ...patch })
const sheet = mastery => ({ tracking: { mastery } })
test('Absent sheets do not dilute college progress, without requiring exclusion checkboxes', () => {
  assert.equal(calculateItemProgress(item(), scores), .5)
  assert.equal(calculateItemProgress(item({ byCollege: { A: { mastery: 'Parfait' } } }), scores), 1)
  assert.equal(calculateItemProgress(item({ assignedColleges: [], byCollege: {} }), scores), 0)
})
test('Only present resource categories contribute, regardless of legacy exclusion flags', () => {
  assert.equal(calculateItemProgress(item({ lisaSheets: [sheet('Parfait')] }), scores), .75)
  assert.equal(calculateItemProgress(item({ platformSheets: [sheet('Parfait')] }), scores), .75)
  assert.equal(calculateItemProgress(item({ noLisaSheets: true, lisaSheets: [sheet('Moyen')] }), scores), .375)
  assert.equal(calculateItemProgress(item({ noPlatformSheets: true, platformSheets: [sheet('Moyen')] }), scores), .375)
})
test('Adding and removing resource categories updates their contribution', () => {
  const tracking = item()
  assert.equal(calculateItemProgress(tracking, scores), .5)
  tracking.lisaSheets.push(sheet('Moyen'))
  assert.equal(calculateItemProgress(tracking, scores), .375)
  tracking.platformSheets.push(sheet('Très bon'))
  assert.equal(calculateItemProgress(tracking, scores), .5)
  tracking.lisaSheets = []
  assert.equal(calculateItemProgress(tracking, scores), .625)
  tracking.platformSheets = []
  assert.equal(calculateItemProgress(tracking, scores), .5)
})
