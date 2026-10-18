import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildReferenceAliases, planReferenceTransition, assertReferenceTransitionPreserved } from '../server/reference-transition.mjs'
import { calculateItemProgress } from '../src/lib/item-progress.ts'
import { reviewCollegeKeys, progressCollegeKeys } from '../src/lib/reference-transition.ts'

const read = file => JSON.parse(readFileSync(new URL(file, import.meta.url)))
const source = read('../src/data/item-reference-assignments.json')
const aliases = buildReferenceAliases(source, read('../src/data/items.json'), read('../src/data/college-tag-aliases.json'))
const now = '2026-10-18T18:00:00.000Z'
const tracker = (patch={}) => ({ favorite:false, reviews:0, mastery:'Moyen', comments:'', lastReviewedAt:null, reviewHistory:[], ...patch })
const item = (assignedColleges, byCollege) => ({ assignedColleges, byCollege, itemMastery:'Bon', itemComment:'Item note',
  lisaSheets:[], platformSheets:[], localUnits:{ untouched:{ notes:'UE note' } },
  quizCount:7, quiz:{ cards:[{ id:'saved', answer:'Keep answer', personalNotes:'Card note' }] }, actionLogs:[{ at:now,action:'Previous action' }] })

test('Nexternat becomes the reference while each previous tracker and every unrelated item field survive', () => {
  const kept = tracker({reviews:2, mastery:'Bon', favorite:true, comments:'Original note', lastReviewedAt:now, reviewHistory:[{date:now,delta:2}]})
  const old = item(['PÉDIATRIE','NEUROLOGIE'], {PÉDIATRIE:kept, NEUROLOGIE:tracker({reviews:1,mastery:'Parfait'})})
  const state = {items:{99:old}, otherRootField:'Keep'}
  const snapshot = structuredClone(state)
  const result = planReferenceTransition(state,source,aliases,now).state
  assert.deepEqual(result.items[99].assignedColleges,[...source.items[99],'PÉDIATRIE'])
  assert.deepEqual(result.items[99].byCollege.PÉDIATRIE,kept)
  assert.deepEqual(result.items[99].referenceTransition.preservedColleges,['PÉDIATRIE'])
  const {assignedColleges:a,byCollege:b,...beforeRest}=old
  const {assignedColleges:c,byCollege:d,referenceTransition:marker,...afterRest}=result.items[99]
  assert.deepEqual(afterRest,beforeRest)
  assert.deepEqual(state,snapshot,'Input never mutated')
  const count=(i,keys)=>keys.reduce((sum,key)=>sum+i.byCollege[key].reviews,0)
  assert.equal(count(result.items[99],reviewCollegeKeys(result.items[99])),count(old,old.assignedColleges))
  const scores={Moyen:1,Bon:2,'Très bon':3,Parfait:4}
  assert.equal(calculateItemProgress(result.items[99],scores),calculateItemProgress(old,scores))
  assert.ok(!progressCollegeKeys(result.items[99]).includes('ORL'),'New unreviewed references do not count as feelings')
  assert.equal(result.otherRootField,'Keep')
})

test('Explicit spelling equivalences transfer the complete tracker; collisions never merge or overwrite histories', () => {
  const oldName='Médecine du Travail - Médecine Légale', canonical='MÉDECINE LÉGALE - MÉDECINE DU TRAVAIL'
  const original=tracker({reviews:3,mastery:'Très bon',comments:'Previous history'})
  const renamed=planReferenceTransition({items:{7:item([oldName],{[oldName]:original})}},source,aliases,now).state.items[7]
  assert.deepEqual(renamed.byCollege[canonical],original)
  assert.deepEqual(renamed.referenceTransition.renamedColleges,{[oldName]:canonical})
  assert.deepEqual(renamed.referenceTransition.preservedColleges,[])
  assert.equal(aliases('Médecine interne (CEMI)'),'MÉDECINE INTERNE')
  assert.equal(aliases('A made up medical book'),null)
  const conflict=planReferenceTransition({items:{7:item([oldName,canonical],{[oldName]:original,[canonical]:tracker({reviews:1})})}},source,aliases,now).state.items[7]
  assert.equal(conflict.byCollege[canonical].reviews,1)
  assert.deepEqual(conflict.byCollege[oldName],original)
  assert.deepEqual(conflict.referenceTransition.preservedColleges,[oldName])
})

test('One-time migration respects later manual choices, keeps dormant trackers and never invents item10 references', () => {
  const original=item([],{DORMANT:tracker({reviews:5,comments:'Keep even when not assigned'})})
  const result=planReferenceTransition({items:{7:original}},source,aliases,now).state
  assert.deepEqual(result.items[7].byCollege.DORMANT,original.byCollege.DORMANT)
  assert.deepEqual(result.items[10].assignedColleges,[])
  result.items[7].assignedColleges=[]
  assert.equal(planReferenceTransition(result,source,aliases,now).state,result)
  assert.throws(()=>planReferenceTransition({items:{7:{...original,byCollege:{BAD:null}}}},source,aliases,now),/Invalid tracker/)
})

test('Obsolete saves cannot strip historical metadata or delete previous trackers; normal saves and starting a new reference work', () => {
  const previous=planReferenceTransition({items:{99:item(['PÉDIATRIE'],{PÉDIATRIE:tracker({reviews:1})})}},source,aliases,now).state
  const next=structuredClone(previous)
  next.items[99].itemComment='Updated note'
  next.items[99].referenceTransition.pendingColleges=[]
  assert.doesNotThrow(()=>assertReferenceTransitionPreserved(previous,next))
  const stripped=structuredClone(previous);delete stripped.items[99].referenceTransition
  assert.throws(()=>assertReferenceTransitionPreserved(previous,stripped),error=>error.code==='CLIENT_STALE')
  const lost=structuredClone(previous);delete lost.items[99].byCollege.PÉDIATRIE
  assert.throws(()=>assertReferenceTransitionPreserved(previous,lost),error=>error.code==='CLIENT_STALE')
})
