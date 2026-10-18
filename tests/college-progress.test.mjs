import test from 'node:test'
import assert from 'node:assert/strict'
import { hasCollegeFeeling, isCollegeItemCompleted } from '../src/lib/college-progress.ts'

test('A feeling alone can complete a college item without adding a revision', () => {
  for (const mastery of ['Bon', 'Très bon', 'Parfait']) {
    assert.equal(isCollegeItemCompleted({ mastery, reviews: 0 }), true)
    assert.equal(hasCollegeFeeling({ mastery, reviews: 0 }), true)
  }
  const sevenItems = Array.from({ length: 7 }, () => ({ mastery: 'Parfait', reviews: 0 }))
  assert.equal(sevenItems.filter(isCollegeItemCompleted).length / sevenItems.length, 1)
})
test('Untouched default entries remain unevaluated and do not complete items', () => {
  assert.equal(hasCollegeFeeling({ mastery: 'Moyen', reviews: 0 }), false)
  assert.equal(isCollegeItemCompleted({ mastery: 'Moyen', reviews: 0 }), false)
  assert.equal(hasCollegeFeeling(undefined), false)
  assert.equal(isCollegeItemCompleted(undefined), false)
  assert.equal(hasCollegeFeeling({ mastery: 'Moyen', reviews: 1 }), true)
  assert.equal(isCollegeItemCompleted({ mastery: 'Moyen', reviews: 1 }), false)
})
