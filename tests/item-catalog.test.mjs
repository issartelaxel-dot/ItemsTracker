import test from 'node:test'
import assert from 'node:assert/strict'
import { itemCatalogStatus, countItemCatalogStatuses } from '../src/lib/item-catalog.ts'
const item = (patch = {}) => ({ itemNumber: 1, progress: .08, totalReviews: 0, tracking: { assignedColleges: ['College'], itemMastery: 'Non évalué', quizCount: 0, lastReviewDate: null }, ...patch })
test('Default college assignments do not count as learning activity', () => {
  assert.equal(itemCatalogStatus(item()), 'unmastered')
  assert.equal(itemCatalogStatus(item({ totalReviews: 1 })), 'learning')
  assert.equal(itemCatalogStatus(item({ progress: 1 })), 'mastered')
  assert.deepEqual(countItemCatalogStatuses([item(), item({ totalReviews: 2 }), item({ progress: 1 })]), { all: 3, unmastered: 1, learning: 1, mastered: 1 })
})
