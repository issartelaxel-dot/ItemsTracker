import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import { createOnboarding } from '../server/onboarding.mjs'

async function freePort() {
  const socket = net.createServer()
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  return port
}

test('academic onboarding is additive, idempotent, scoped and honest about unpublished resources', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'itemstracker-onboarding-'))
  const port = await freePort()
  const cluster = new EmbeddedPostgres({ databaseDir: path.join(directory, 'pg'), port,
    user: 'postgres', password: 'test-only', persistent: false,
    postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} })
  let pool
  try {
    await cluster.initialise(); await cluster.start()
    pool = new pg.Pool({ connectionString: `postgresql://postgres:test-only@127.0.0.1:${port}/postgres` })
    await pool.query(`CREATE TABLE users(id BIGSERIAL PRIMARY KEY,email TEXT UNIQUE,display_name TEXT,password_hash TEXT,created_at TEXT);
      CREATE TABLE preserved_work(user_id BIGINT PRIMARY KEY,body JSONB NOT NULL);
      INSERT INTO users(email,display_name,created_at) VALUES('old@local.test','Old','2026-01-01T00:00:00Z');
      INSERT INTO preserved_work(user_id,body) VALUES(1,'{"notes":["important"],"flashcards":[1]}'::jsonb);`)
    const onboarding = createOnboarding(pool)
    await onboarding.init()
    const old = await onboarding.state(1)
    assert.equal(old.yearCode, 'Y4')
    assert.equal(old.legacyExempt, true)
    assert.equal(old.required, false)
    assert.equal((await pool.query('SELECT COUNT(*)::int count FROM academic_legacy_cohort')).rows[0].count, 1)
    await onboarding.init()
    assert.equal((await pool.query('SELECT COUNT(*)::int count FROM academic_legacy_cohort')).rows[0].count, 1)
    assert.equal((await pool.query('SELECT COUNT(*)::int count FROM academic_profiles')).rows[0].count, 1)
    await pool.query("UPDATE academic_profiles SET year_code='Y3' WHERE user_id=1")
    const audit = await onboarding.init()
    assert.equal(audit.exceptions, 1)
    assert.equal((await onboarding.state(1)).yearCode, 'Y3')
    assert.equal((await onboarding.state(1)).required, true, 'Archived first-cycle profiles must choose a supported year')
    assert.deepEqual((await onboarding.resources(1)).units, [])
    assert.equal((await onboarding.save(1, { yearCode: 'Y4' }, { firstOnly: true })).status, 200)
    assert.equal((await onboarding.state(1)).yearCode, 'Y4')
    assert.equal((await pool.query('SELECT explicit_year_code FROM academic_migration_exceptions WHERE user_id=1')).rows[0].explicit_year_code, 'Y3')
    const created = await pool.query("INSERT INTO users(email,display_name,created_at) VALUES('new@local.test','New',NOW()::text) RETURNING id")
    const uid = created.rows[0].id
    await pool.query('INSERT INTO academic_profiles(user_id) VALUES($1)', [uid])
    // This fixture explores many curricula; quotas have dedicated integration coverage.
    await pool.query('UPDATE academic_profiles SET faculty_change_limit=50 WHERE user_id=$1', [uid])
    await pool.query('INSERT INTO preserved_work(user_id,body) VALUES($1,$2)', [uid, { notes: ['new'], flashcards: [152] }])
    assert.equal((await onboarding.state(uid)).required, true)
    assert.equal((await onboarding.save(uid, { yearCode: 'Y1' })).status, 400)
    assert.equal((await onboarding.save(uid, { yearCode: 'Y7' })).status, 400)
    assert.equal((await onboarding.save(uid, { yearCode: 'Y2', userId: 1 })).status, 400)
    assert.equal((await onboarding.save(uid, { yearCode: 'Y2', facultyId: 'fictional' })).status, 400)
    assert.equal((await onboarding.save(uid, { yearCode: 'Y4', facultyId: 'rennes', betaAcknowledged: true }, { firstOnly: true })).status, 200)
    assert.equal((await onboarding.state(uid)).required, false)
    assert.deepEqual((await onboarding.resources(uid)).units, [])
    assert.equal((await onboarding.coverage('Y2', 'rennes')).publishedUnitCount, 0)
    assert.equal((await onboarding.coverage('Y2', 'rennes')).nationalAccess, false)
    assert.equal((await onboarding.save(uid, { yearCode: 'Y3' }, { firstOnly: true })).status, 400)
    assert.equal((await onboarding.save(uid, { yearCode: 'Y2' })).status, 400)
    assert.equal((await onboarding.save(uid, { yearCode: 'Y5' }, { firstOnly: true })).body.alreadyCompleted, true)
    assert.equal((await onboarding.state(uid)).yearCode, 'Y4')
    assert.equal((await onboarding.save(uid, { yearCode: 'Y5', facultyId: 'lyon-est', betaAcknowledged: true })).status, 200)
    assert.deepEqual((await pool.query('SELECT body FROM preserved_work WHERE user_id=$1', [uid])).rows[0].body,
      { notes: ['new'], flashcards: [152] })
    assert.equal((await onboarding.save(uid, { yearCode: 'Y5', facultyId: null })).status, 200)
    assert.equal((await onboarding.state(uid)).facultyId, null)
    assert.equal((await onboarding.coverage('Y5', 'lyon-est')).nationalAccess, true)
    assert.equal((await onboarding.save(uid, { yearCode: 'Y6', facultyId: 'bordeaux' })).status, 200)
    assert.equal((await onboarding.state(uid)).yearCode, 'Y6')
    assert.equal((await onboarding.coverage('Y6', 'bordeaux')).nationalAccess, true)
    const bordeauxY6 = await onboarding.resources(uid)
    assert.equal(bordeauxY6.facultyProgram.yearCode, 'Y6')
    assert.equal(bordeauxY6.facultyProgram.facultyId, 'bordeaux')
    assert.equal(bordeauxY6.facultyProgram.academicTerm, '2026-2027')
    assert.equal(bordeauxY6.units.length, 0, 'Collected programme does not bypass publication of teaching resources')
    await onboarding.save(uid, { yearCode: 'Y4', facultyId: 'bordeaux' })
    const bordeauxY4 = await onboarding.resources(uid)
    assert.equal(bordeauxY4.facultyProgram.yearCode, 'Y4')
    assert.equal(bordeauxY4.facultyProgram.units[0].itemReferences[0].number, 9)
    assert.match(bordeauxY4.facultyProgram.sourceUrl, /^https:/)
    await onboarding.save(uid, { yearCode: 'Y4', facultyId: 'nice' })
    const nice = await onboarding.resources(uid)
    assert.equal(nice.facultyProgram.facultyId, 'nice')
    assert.equal(nice.facultyProgram.units[0].label, 'Dermatologie et revêtement cutané')
    assert.deepEqual(nice.facultyProgram.units[0].itemReferences, [], 'Missing local links are never inferred')

    assert.notEqual((await onboarding.listFaculties('lyon'))[0].id, (await onboarding.listFaculties('lyon'))[1].id)
    assert.equal((await onboarding.listFaculties('reunion')).some(row => row.name === 'La Réunion'), true)
    assert.equal((await onboarding.listFaculties('')).length, 38)
    assert.equal((await onboarding.listFaculties('orleans')).some(row => row.name === 'Orléans'), true)
    assert.equal((await onboarding.listFaculties('bordeaux', 'Y4'))[0].coverage, 'verified')
    assert.equal((await onboarding.listFaculties('amiens', 'Y4'))[0].coverage, 'unconfirmed')
    assert.equal((await onboarding.listFaculties('val-de-grace', 'Y4'))[0].coverage, 'missing')
    assert.equal((await onboarding.save(uid, { yearCode: 'Y4', facultyId: 'amiens' })).status, 400)
    assert.equal((await onboarding.save(uid, { yearCode: 'Y4', facultyId: 'amiens', betaAcknowledged: true })).status, 200)
    assert.ok((await pool.query('SELECT beta_acknowledged_at FROM academic_profiles WHERE user_id=$1', [uid])).rows[0].beta_acknowledged_at)
    assert.equal((await onboarding.coverage('Y4', 'amiens')).rolloutStatus, 'unconfirmed')
    assert.equal((await onboarding.requestAvailability(uid, { yearCode: 'Y4', facultyId: 'val-de-grace' })).status, 200)
    assert.equal((await onboarding.requestAvailability(uid, { yearCode: 'Y4', facultyId: 'val-de-grace', message: 'Voici mon programme' })).status, 200)
    assert.equal((await onboarding.availabilityRequests()).length, 1)
    assert.equal((await onboarding.availabilityRequests())[0].message, 'Voici mon programme')
    assert.equal((await onboarding.requestAvailability(uid, { yearCode: 'Y4', facultyId: 'bordeaux' })).status, 409)
    assert.equal((await onboarding.requestAvailability(uid, { yearCode: 'Y4', facultyId: 'unknown' })).status, 400)
    assert.equal((await onboarding.requestAvailability(uid, { yearCode: 'Y4', facultyId: 'val-de-grace', message: 'a'.repeat(2001) })).status, 400)
    assert.equal((await onboarding.state(uid)).facultyId, 'amiens', 'A request does not replace the selected profile')
    assert.equal((await onboarding.save(uid, { yearCode: 'Y4', facultyId: 'val-de-grace' })).status, 409)
    assert.equal((await onboarding.coverage('Y4', 'val-de-grace')).nationalAccess, false)
    assert.equal((await onboarding.coverage('Y4', 'val-de-grace')).rolloutStatus, 'missing')
    await pool.query("UPDATE academic_profiles SET faculty_id='val-de-grace',year_code='Y4' WHERE user_id=$1", [uid])
    assert.equal((await onboarding.state(uid)).required, true, 'Existing red profiles must return to onboarding')
    assert.equal((await onboarding.resources(uid)).coverage.nationalAccess, false)
    assert.deepEqual((await onboarding.resources(uid)).units, [])

    const concurrent = await pool.query("INSERT INTO users(email,display_name,created_at) VALUES('concurrent@local.test','Concurrent',NOW()::text) RETURNING id")
    const concurrentId = concurrent.rows[0].id
    const submissions = await Promise.all([
      onboarding.save(concurrentId, { yearCode: 'Y4' }, { firstOnly: true }),
      onboarding.save(concurrentId, { yearCode: 'Y5' }, { firstOnly: true }),
    ])
    assert.equal(submissions.every(result => result.status === 200), true)
    assert.equal(submissions.filter(result => result.body.alreadyCompleted).length, 1)
    const curriculum = await pool.query(`INSERT INTO academic_curricula(faculty_id,year_code,academic_term)
      VALUES('rennes','Y4','2026-27') RETURNING id`)
    const unit = await pool.query(`INSERT INTO academic_units(curriculum_id,local_code,label)
      VALUES($1,'UE-1','UE test non publiée') RETURNING id`, [curriculum.rows[0].id])
    await pool.query("INSERT INTO academic_unit_item_links(unit_id,item_number) VALUES($1,152)", [unit.rows[0].id])
    await onboarding.save(uid, { yearCode: 'Y4', facultyId: 'rennes', betaAcknowledged: true })
    assert.equal((await onboarding.resources(uid)).units.length, 0)
    await pool.query("UPDATE academic_curricula SET publication_status='published',rights_status='approved',reviewed_by='reviewer',source_url='https://example.edu/programme',published_at=NOW() WHERE id=$1", [curriculum.rows[0].id])
    await pool.query("UPDATE academic_units SET publication_status='published' WHERE id=$1", [unit.rows[0].id])
    const published = await onboarding.resources(uid)
    assert.equal(published.units.length, 1)
    assert.deepEqual(published.units[0].itemNumbers, [])
    assert.equal(published.coverage.publishedUnitCount, 1)
    await pool.query("UPDATE academic_unit_item_links SET review_status='published',source_url='https://example.edu/programme',reviewed_by='reviewer' WHERE unit_id=$1", [unit.rows[0].id])
    assert.deepEqual((await onboarding.resources(uid)).units[0].itemNumbers, [152])
    assert.deepEqual((await pool.query('SELECT body FROM preserved_work WHERE user_id=1')).rows[0].body,
      { notes: ['important'], flashcards: [1] })
    const analytics = await onboarding.analytics()
    assert.equal(analytics.facultyMeaning, 'Établissement déclaré, non une géolocalisation')
    assert.equal(analytics.facultyCompletionRate, null)
    assert.equal(analytics.facultyGroups.every(group => group.count === null && group.suppressed), true)
  } finally {
    if (pool) await pool.end()
    await cluster.stop().catch(() => {})
    await rm(directory, { recursive: true, force: true })
  }
})
