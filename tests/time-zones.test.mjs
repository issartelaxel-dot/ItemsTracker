import test from 'node:test'
import assert from 'node:assert/strict'
import { getTimeZoneGroups, getTimeZoneLabel, getTimeZoneDescription, normalizeTimeZonePreference } from '../src/lib/time-zones.ts'
import { defaultState, persistSchema } from '../server/state-model.mjs'

test('Worldwide time zones are selectable and accepted by server persistence', () => {
  const values = getTimeZoneGroups().flatMap(group => group.options.map(option => option.value))
  assert.ok(values.length > 400)
  assert.equal(new Set(values).size, values.length)
  for (const value of values) {
    assert.equal(normalizeTimeZonePreference(value), value)
    assert.equal(persistSchema.parse({ ...defaultState(), timeZone: value }).timeZone, value)
  }
  for (const value of ['UTC', 'Europe/Paris', 'Asia/Ho_Chi_Minh', 'Asia/Bangkok', 'America/New_York', 'Africa/Cairo', 'Pacific/Auckland', 'Australia/Sydney']) assert.ok(values.includes(value), value)
})
test('Auto remains the default and invalid zones are rejected safely', () => {
  assert.equal(defaultState().timeZone, 'auto')
  for (const value of [null, undefined, '', 'Mars/Unknown', 42]) {
    assert.equal(normalizeTimeZonePreference(value), 'auto')
    if (value !== undefined) assert.equal(persistSchema.safeParse({ ...defaultState(), timeZone: value }).success, false)
  }
})
test('An existing valid alias stays available and is not reset on reload', () => {
  const value = 'US/Eastern'
  assert.equal(normalizeTimeZonePreference(value), value)
  assert.ok(getTimeZoneGroups(value).flatMap(group => group.options).some(option => option.value === value))
})

test('Worldwide labels and time zone names are displayed in French', () => {
  assert.equal(getTimeZoneLabel('Asia/Kabul'), 'Asie · Kaboul')
  assert.equal(getTimeZoneLabel('Asia/Jerusalem'), 'Asie · Jérusalem')
  assert.equal(getTimeZoneLabel('Europe/London'), 'Europe · Londres')
  assert.match(getTimeZoneDescription('Asia/Tokyo'), /Japon/)
})
