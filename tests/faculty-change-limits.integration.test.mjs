import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import { createOnboarding } from '../server/onboarding.mjs'

test('Faculty changes are limited atomically, with initial choice free and one additional change per admin approval', async () => {
  const socket = net.createServer()
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  const directory = await mkdtemp(path.join(os.tmpdir(), 'faculty-limit-'))
  const cluster = new EmbeddedPostgres({ databaseDir: path.join(directory, 'pg'), port, user: 'postgres', password: 'local-only', persistent: false, postgresFlags: ['-h','127.0.0.1'], onLog: () => {}, onError: () => {} })
  let pool
  try {
    await cluster.initialise(); await cluster.start()
    pool = new pg.Pool({ connectionString: `postgresql://postgres:local-only@127.0.0.1:${port}/postgres` })
    await pool.query('CREATE TABLE users(id BIGSERIAL PRIMARY KEY,email TEXT)')
    const admin = (await pool.query("INSERT INTO users(email) VALUES('hello@setup-hub.com') RETURNING id")).rows[0].id
    const onboarding = createOnboarding(pool)
    await onboarding.init()
    const newUser = async () => (await pool.query('INSERT INTO users(email) VALUES($1) RETURNING id', [`${crypto.randomUUID()}@local.test`])).rows[0].id
    const uid = await newUser()
    assert.equal((await onboarding.save(uid, { yearCode:'Y4', facultyId:'bordeaux' }, { firstOnly:true })).status, 200)
    assert.equal((await onboarding.state(uid)).facultyChangeCount, 0)
    assert.equal((await onboarding.save(uid, { yearCode:'Y5', facultyId:'bordeaux' })).status, 200)
    assert.equal((await onboarding.state(uid)).facultyChangesRemaining, 2)
    assert.equal((await onboarding.save(uid, { yearCode:'Y5', facultyId:'unknown' })).status, 400)
    assert.equal((await onboarding.state(uid)).facultyChangeCount, 0)
    assert.equal((await onboarding.save(uid, { yearCode:'Y4', facultyId:'nice' })).status, 200)
    const races = await Promise.all([
      onboarding.save(uid, { yearCode:'Y4', facultyId:'dijon', betaAcknowledged:true }),
      onboarding.save(uid, { yearCode:'Y4', facultyId:'lyon-est', betaAcknowledged:true }),
    ])
    assert.deepEqual(races.map(result => result.status).sort(), [200,409])
    assert.equal((await onboarding.state(uid)).facultyChangeCount, 2)
    await onboarding.init()
    assert.equal((await onboarding.state(uid)).facultyChangeCount, 2, 'Reinitialization never resets the counter')
    const current = await onboarding.state(uid)
    assert.equal((await onboarding.save(uid, { yearCode:'Y5', facultyId:current.facultyId, betaAcknowledged:true })).status, 200, 'Year-only changes remain allowed')
    const blocked = await onboarding.save(uid, { yearCode:'Y4', facultyId:'bordeaux' })
    assert.equal(blocked.status, 409)
    assert.equal(blocked.body.code, 'FACULTY_CHANGE_LIMIT')
    assert.equal((await onboarding.save(uid, { yearCode:'Y4', facultyId:null })).status, 409, 'Clearing the faculty cannot bypass the limit')
    assert.equal((await onboarding.save(uid, { yearCode:'Y4', facultyId:'bordeaux', facultyChangeCount:0 })).status, 400)
    const request = await onboarding.requestFacultyChange(uid, { yearCode:'Y4', facultyId:'bordeaux', message:'Mutation universitaire' })
    assert.equal(request.status, 200)
    const duplicate = await onboarding.requestFacultyChange(uid, { yearCode:'Y4', facultyId:'bordeaux', message:'Précision' })
    assert.equal(duplicate.body.requestId, request.body.requestId)
    assert.equal((await onboarding.state(uid)).facultyId, current.facultyId, 'A request never changes the selected faculty')
    assert.equal((await onboarding.facultyChangeRequests()).length, 1)
    assert.equal((await onboarding.reviewFacultyChange(request.body.requestId, admin, 'approved')).status, 200)
    assert.equal((await onboarding.reviewFacultyChange(request.body.requestId, admin, 'approved')).status, 409, 'Approval cannot grant a second credit on replay')
    assert.equal((await onboarding.state(uid)).facultyChangesRemaining, 1)
    assert.equal((await onboarding.save(uid, { yearCode:'Y4', facultyId:'bordeaux' })).status, 200)
    assert.equal((await onboarding.state(uid)).facultyChangeCount, 3)
    assert.equal((await onboarding.save(uid, { yearCode:'Y4', facultyId:'nice' })).status, 409)
    const rejected = await onboarding.requestFacultyChange(uid, { yearCode:'Y4', facultyId:'nice' })
    assert.equal((await onboarding.reviewFacultyChange(rejected.body.requestId, admin, 'rejected')).status, 200)
    assert.equal((await onboarding.state(uid)).facultyChangesRemaining, 0)
    const nullFirst = await newUser()
    await onboarding.save(nullFirst, { yearCode:'Y4', facultyId:null }, { firstOnly:true })
    await onboarding.save(nullFirst, { yearCode:'Y4', facultyId:'bordeaux' })
    assert.equal((await onboarding.state(nullFirst)).facultyChangeCount, 0, 'The first faculty choice stays free after skipping onboarding')
    await onboarding.save(nullFirst, { yearCode:'Y4', facultyId:null })
    await onboarding.save(nullFirst, { yearCode:'Y4', facultyId:'nice' })
    assert.equal((await onboarding.state(nullFirst)).facultyChangeCount, 2, 'Removing and restoring a faculty still consumes changes')
  } finally {
    await pool?.end(); await cluster.stop().catch(() => {}); await rm(directory,{recursive:true,force:true})
  }
})
