// Checks the Vital Sheet's item numbering against the state form and the EDRS
// formatting rules against the state's handbook. No test framework needed:
//   npm run check:edrs
import ts from 'typescript'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert'
import { createRequire } from 'node:module'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edrs-check-'))
for (const f of ['vitalFields', 'edrsFormat']) {
  const src = fs.readFileSync(new URL(`../src/lib/${f}.ts`, import.meta.url), 'utf8')
  const out = ts.transpileModule(src, { compilerOptions: { module: 'CommonJS', target: 'ES2022' } }).outputText
  fs.writeFileSync(path.join(dir, `${f}.cjs`), out.replace(/require\("\.\/vitalFields"\)/g, 'require("./vitalFields.cjs")'))
}
const require = createRequire(import.meta.url)
const vf = require(path.join(dir, 'vitalFields.cjs'))
const E = require(path.join(dir, 'edrsFormat.cjs'))

let passed = 0
const failures = []
const t = (name, fn) => {
  try { fn(); passed++; console.log('  ok  ' + name) }
  catch (err) { failures.push(name); console.log('  FAIL ' + name + '\n       ' + String(err.message).split('\n')[0]) }
}

console.log('\n== item numbering ==')

// Numbers exactly as printed on the uploaded form, in the order they appear, for everything keyed into EDRS
const printedOrder = ['1','2','3','','4','5','','','6','9','9','9','10','11','12','7','8',
  '13','14','14','16','17','18','19','20','21','22','23','24','25','26','26','27',
  '28','29','30','31','32','33','34','35','36','37','38','39','40','41','101','104','105','106']
t('EDRS items carry the printed numbers, in paper-form order', () => {
  assert.deepStrictEqual(vf.VITAL_FIELDS.filter(f => f.edrs).map(f => f.number), printedOrder)
})
t('every internal id is unique, and each state item number is used once (except items split into sub-rows)', () => {
  const ids = vf.VITAL_FIELDS.map(f => f.id); assert.strictEqual(new Set(ids).size, ids.length)
  assert.strictEqual(vf.VITAL_FIELDS.filter(f => f.number === '34').length, 1)
  assert.strictEqual(vf.VITAL_FIELDS.find(f => f.id === 'motherMiddle').number, '36')
  assert.strictEqual(vf.VITAL_FIELDS.find(f => f.id === 'motherLast').number, '37')
})
t('only the SSN is flagged sensitive', () => {
  assert.deepStrictEqual(vf.VITAL_FIELDS.filter(f => f.sensitive).map(f => f.id), ['ssn'])
})
t('office-use extras that are not EDRS items are excluded from the EDRS list', () => {
  const ids = vf.VITAL_FIELDS.filter(f => !f.edrs).map(f => f.id).sort()
  assert.deepStrictEqual(ids, ['accVc','coronerCase','cvcDmpOther','language','obituary','pacemaker','weight'])
})

// Names
t('older single-box name splits into first / middle / last', () => {
  assert.deepStrictEqual(vf.splitName('Maria Elena Garcia'), { first: 'Maria', middle: 'Elena', last: 'Garcia' })
  assert.deepStrictEqual(vf.splitName('Joe Smith'), { first: 'Joe', middle: '', last: 'Smith' })
  assert.deepStrictEqual(vf.splitName('Prince'), { first: 'Prince', middle: '', last: '' })
  assert.deepStrictEqual(vf.splitName('  '), { first: '', middle: '', last: '' })
  assert.deepStrictEqual(vf.splitName(undefined), { first: '', middle: '', last: '' })
})
t('separate fields win over the old single-box name', () => {
  const r = vf.resolveName({ spouseName: 'Old Name Here', spouseFirstName: 'Ana', spouseLastName: 'Lopez' }, 'spouse')
  assert.deepStrictEqual(r, { first: 'Ana', middle: '', last: 'Lopez' })
})
t('old single-box name is still used when no separate fields exist', () => {
  assert.deepStrictEqual(vf.resolveName({ fatherName: 'Jose Luis Casillas' }, 'father'), { first: 'Jose', middle: 'Luis', last: 'Casillas' })
})
t('withSplitNames upgrades legacy names without touching other fields', () => {
  const out = vf.withSplitNames({ motherName: 'Rosa Diaz', race: 'X' })
  assert.strictEqual(out.motherFirstName, 'Rosa'); assert.strictEqual(out.motherLastName, 'Diaz'); assert.strictEqual(out.race, 'X')
})

// Values
const regCase = {
  decedent: { firstName: 'Angelina', middleName: 'M', lastName: 'Casillas', dateOfBirth: '1930-03-17', dateOfDeath: '2026-07-22', sex: 'female', veteran: false, placeOfDeath: 'Chicago' },
  firstCall: { timeOfDeath: '14:05', weight: '150' },
  vitalSheet: { birthCity: 'Mexicali', hispanicLatino: true, hispanicSpecify: 'Mexican', dispositionDate: '2026-07-30', accidentOrViolentCause: false, spouseName: 'Pedro Luis Casillas' },
  contacts: [],
}
const getReg = (id, ctx) => vf.VITAL_FIELDS.find(f => f.id === id).get(regCase, ctx)
t('dates print month/day/year', () => { assert.strictEqual(getReg('dob'), '03/17/1930'); assert.strictEqual(getReg('dod'), '07/22/2026'); assert.strictEqual(getReg('dispositionDate'), '07/30/2026') })
t('age respects whether the birthday has happened yet', () => {
  assert.strictEqual(getReg('age'), '96')
  assert.strictEqual(vf.computeAge({ decedent: { dateOfBirth: '1930-08-01', dateOfDeath: '2026-07-22' } }), '95')
  assert.strictEqual(vf.computeAge({ decedent: {} }), '')
})
t('yes/no, sex, time, place values', () => {
  assert.strictEqual(getReg('armedForces'), 'No'); assert.strictEqual(getReg('sex'), 'Female')
  assert.strictEqual(getReg('timeOfDeath'), '14:05'); assert.strictEqual(getReg('placeOfDeath'), 'Chicago')
  assert.strictEqual(getReg('hispanic'), 'Yes'); assert.strictEqual(getReg('hispanicSpecify'), 'Mexican')
})
t('ACC/VC distinguishes "No" from "not answered"', () => {
  assert.strictEqual(getReg('accVc'), 'No')
  assert.strictEqual(vf.VITAL_FIELDS.find(f => f.id === 'accVc').get({ ...regCase, vitalSheet: {} }), '')
})
t('spouse name from an older case flows into items 28-30', () => {
  assert.strictEqual(getReg('spouseFirst'), 'Pedro'); assert.strictEqual(getReg('spouseMiddle'), 'Luis'); assert.strictEqual(getReg('spouseLast'), 'Casillas')
})
t('SSN comes only from the separately-fetched value, never the case', () => {
  assert.strictEqual(getReg('ssn'), ''); assert.strictEqual(getReg('ssn', { ssn: '123-45-6789' }), '123-45-6789')
  assert.strictEqual(vf.maskSsn('123-45-6789'), '•••-••-6789')
})


console.log('\n== EDRS formatting rules ==')
const row = (rows, key) => rows.find(r => r.key === key)
const hasNote = (r, level, re) => r.notes.some(x => x.level === level && re.test(x.text))

const base = () => ({
  disposition: 'cremation', locationId: 'L1',
  decedent: { firstName: 'María', middleName: 'de los Ángeles', lastName: 'Muñoz-García', dateOfBirth: '1930-03-17', dateOfDeath: '2026-07-22', sex: 'female', veteran: false, maritalStatus: 'Widowed', placeOfDeath: 'Chicago' },
  firstCall: { timeOfDeath: '14:05', locationType: 'residence', locationAddress: '1234B Palm Canyon Dr Apt 4' },
  vitalSheet: { birthState: 'BC', birthCountry: 'Mexico', hispanicLatino: true, hispanicSpecify: 'Mexican', education: 'High school', race: 'Hispanic',
    occupation: 'Retired', kindOfBusiness: 'Agriculture', yearsInOccupation: '30', residenceAddress: '1234B Palm Canyon Dr Apt 4', residenceCity: 'Cathedral City', residenceCounty: 'Riverside', residenceZip: '92234', yearsInCounty: '40', residenceState: 'CA',
    informantName: 'Araceli Casillas', informantRelationship: 'daughter', informantMailingAddress: '123 Main St, Cathedral City, CA 92234',
    spouseName: 'Pedro Luis Casillas', fatherFirstName: 'José', fatherLastName: 'Muñoz', fatherBirthState: 'Jalisco', motherFirstName: 'Rosa', motherLastName: 'Díaz', motherBirthState: 'CA',
    dispositionDate: '2026-07-30', placeOfFinalDisposition: 'Desert Memorial Park', deathCounty: 'Riverside', placeOfDeathType: 'home', homeless: 'no', embalmed: 'no' },
  contacts: [],
})
const ctx = { ssn: '123-45-6789', location: { name: 'Casillas Funeral Home', licenseNumber: 'FD 2117' } }
const rows = E.buildEdrsRows(base(), ctx)

console.log('\n-- the formatting rules the handbook spells out')
t('time is four digits, no colon', () => { assert.strictEqual(row(rows,'timeOfDeath').value, '1405'); assert.strictEqual(E.edrsTime('2:05').value, '0205'); assert.strictEqual(E.edrsTime('1405').value, '1405'); assert.strictEqual(E.edrsTime('unk').value, 'UNK') })
t('SSN loses its dashes; UNK/NONE pass; short ones are blocked', () => {
  assert.strictEqual(row(rows,'ssn').value, '123456789'); assert.strictEqual(E.edrsSsn('none').value, 'NONE')
  assert.ok(hasNote({ notes: [E.edrsSsn('12345').note] }, 'error', /9 digits/)) })
t('accents are stripped from names, and the change is explained', () => {
  assert.strictEqual(row(rows,'firstName').value, 'Maria'); assert.strictEqual(row(rows,'lastName').value, 'Munoz-Garcia'); assert.strictEqual(row(rows,'middleName').value, 'de los Angeles')
  assert.ok(hasNote(row(rows,'lastName'), 'info', /Muñoz-García/))
  assert.strictEqual(row(rows,'fatherFirst').value, 'Jose') })
t('characters EDRS forbids are removed with a warning, not silently', () => {
  const r = E.edrsName('Ana 2nd & Co'); assert.strictEqual(r.value, 'Ana nd Co'); assert.strictEqual(r.note.level, 'warn') })
t('a missing middle name becomes a dash', () => {
  const c = base(); delete c.decedent.middleName; const r = row(E.buildEdrsRows(c, ctx), 'middleName'); assert.strictEqual(r.value, '-') })
t('"Retired" is blocked as an occupation', () => { assert.ok(hasNote(row(rows,'occupation'), 'error', /doesn't accept "Retired"/)) })
t('"Unemployed" blocked too, a real occupation is fine', () => {
  const c = base(); c.vitalSheet.occupation = 'unemployed'; assert.ok(hasNote(row(E.buildEdrsRows(c, ctx),'occupation'),'error',/Unemployed|unemployed/))
  c.vitalSheet.occupation = 'Farm worker'; assert.strictEqual(row(E.buildEdrsRows(c, ctx),'occupation').notes.length, 0) })

console.log('\n-- dropdown vocabularies')
t('free text maps onto EDRS choices, with a "confirm" note when it had to guess', () => {
  assert.strictEqual(row(rows,'education').value, 'High School diploma'); assert.ok(hasNote(row(rows,'education'),'info',/confirm/))
  assert.strictEqual(row(rows,'race').value, 'Other Hispanic'); assert.ok(hasNote(row(rows,'race'),'info',/confirm with the informant/))
  assert.strictEqual(row(rows,'inf-rel').value, 'Daughter') })
t('numeric grades, degrees and exact choices', () => {
  assert.strictEqual(E.normalizeEducation('8th').value, '8th Grade'); assert.strictEqual(E.normalizeEducation('0').value, '0 (zero)')
  assert.strictEqual(E.normalizeEducation('associates').value, "Associate's degree"); assert.strictEqual(E.normalizeEducation('Master\u2019s degree').value, "Master's degree")
  assert.strictEqual(E.normalizeEducation('12').value, undefined) })
t('something that is not an EDRS choice is a blocker, not a silent pass-through', () => {
  const c = base(); c.vitalSheet.education = 'trade school'; assert.ok(hasNote(row(E.buildEdrsRows(c, ctx),'education'),'error',/isn't an EDRS choice/))
  c.decedent.maritalStatus = 'complicated'; assert.ok(hasNote(row(E.buildEdrsRows(c, ctx),'maritalStatus'),'error',/isn't an EDRS choice/)) })
t('"Separated" is entered as Married, and says so', () => {
  const c = base(); c.decedent.maritalStatus = 'Separated'; const r = row(E.buildEdrsRows(c, ctx),'maritalStatus'); assert.strictEqual(r.value, 'Married'); assert.ok(hasNote(r,'info',/separated/i)) })
t('sex maps to EDRS wording, including Nonbinary', () => {
  const c = base(); c.decedent.sex = 'nonbinary'; assert.strictEqual(row(E.buildEdrsRows(c, ctx),'sex').value, 'Nonbinary'); assert.strictEqual(row(rows,'sex').value, 'Female')
  c.decedent.sex = 'unknown'; assert.strictEqual(row(E.buildEdrsRows(c, ctx),'sex').value, 'Unknown/Undetermined') })
t('Hispanic origin reduces to the EDRS boxes, else Other + text, else Other + UNKNOWN', () => {
  assert.strictEqual(row(rows,'hispanicSpecify').value, 'Mexican')
  const c = base(); c.vitalSheet.hispanicSpecify = 'Guatemalan'; assert.strictEqual(row(E.buildEdrsRows(c, ctx),'hispanicSpecify').value, 'Other — Guatemalan')
  c.vitalSheet.hispanicSpecify = ''; assert.strictEqual(row(E.buildEdrsRows(c, ctx),'hispanicSpecify').value, 'Other — UNKNOWN')
  c.vitalSheet.hispanicLatino = false; assert.strictEqual(row(E.buildEdrsRows(c, ctx),'hispanicSpecify'), undefined) })

console.log('\n-- spouse fields depend on marital status (item 12)')
t('widowed → spouse fields are a locked dash, even though a spouse name was collected', () => {
  for (const k of ['spouseFirst','spouseMiddle','spouseLast']) { assert.strictEqual(row(rows,k).value, '-'); assert.ok(hasNote(row(rows,k),'info',/locks it/)) } })
t('married → the spouse name is used, accents stripped, middle dashed', () => {
  const c = base(); c.decedent.maritalStatus = 'Married'; c.vitalSheet.spouseName = 'José Casillas'; const r = E.buildEdrsRows(c, ctx)
  assert.strictEqual(row(r,'spouseFirst').value, 'Jose'); assert.strictEqual(row(r,'spouseMiddle').value, '-'); assert.strictEqual(row(r,'spouseLast').value, 'Casillas') })

console.log('\n-- places and addresses')
t('birth place picks the right EDRS type', () => {
  assert.deepStrictEqual([row(rows,'birth-type').value, row(rows,'birth-value').value], ['Mexican State', 'BC'])
  const c = base(); c.vitalSheet.birthState = 'tx'; c.vitalSheet.birthCountry = ''; let r = E.buildEdrsRows(c, ctx)
  assert.deepStrictEqual([row(r,'birth-type').value, row(r,'birth-value').value], ['US State', 'Texas'])
  c.vitalSheet.birthState = ''; c.vitalSheet.birthCountry = 'Guatemala'; r = E.buildEdrsRows(c, ctx)
  assert.deepStrictEqual([row(r,'birth-type').value, row(r,'birth-value').value], ['Other Country', 'Guatemala']) })
t('birth CITY is not an EDRS item and is left out', () => { assert.ok(!rows.some(r => /birth.?city/i.test(r.key + r.label))) })
t('residence street splits into number / name / unit', () => {
  assert.deepStrictEqual([row(rows,'res-number').value, row(rows,'res-name').value, row(rows,'res-unit').value], ['1234B', 'Palm Canyon Dr', '4'])
  assert.deepStrictEqual(E.splitStreet('RR 2 Box 18'), { number: '', name: 'RR 2 Box 18', unit: '' })
  assert.deepStrictEqual(E.splitStreet('45 Elm St #7'), { number: '45', name: 'Elm St', unit: '7' }) })
t('informant mailing address splits into the seven EDRS pieces, flagged "check"', () => {
  assert.deepStrictEqual(['inf-type','inf-state','inf-num','inf-street','inf-city','inf-zip'].map(k => row(rows,k).value), ['US State','California','123','Main St','Cathedral City','92234'])
  assert.ok(hasNote(row(rows,'inf-num'),'info',/check/)) })
t('an address it cannot split is flagged rather than guessed at', () => {
  const c = base(); c.vitalSheet.informantMailingAddress = '123 Main St Cathedral City CA 92234'; const r = row(E.buildEdrsRows(c, ctx),'inf-addr')
  assert.ok(r && hasNote(r,'warn',/split/)) })
t('informant: one name only goes in Last with dashes before it', () => {
  const c = base(); c.vitalSheet.informantName = 'Cher'; const r = E.buildEdrsRows(c, ctx)
  assert.deepStrictEqual(['inf-first','inf-middle','inf-last'].map(k => row(r,k).value), ['-','-','Cher']) })
t('a relationship that is not in the list becomes Other + the text', () => {
  const c = base(); c.vitalSheet.informantRelationship = 'niece'; const r = E.buildEdrsRows(c, ctx)
  assert.strictEqual(row(r,'inf-rel').value, 'Other'); assert.strictEqual(row(r,'inf-rel-other').value, 'Niece') })

console.log('\n-- disposition, funeral home, place of death')
t('type of disposition is derived from the case when not set, with a "confirm" note', () => {
  const r = row(rows,'typeOfDisposition'); assert.strictEqual(r.value, 'Cremation'); assert.ok(hasNote(r,'info',/Taken from the case's disposition/)) })
t('an explicit choice wins; an unknown one is a blocker', () => {
  const c = base(); c.vitalSheet.typeOfDisposition = 'cremation/burial'; assert.strictEqual(row(E.buildEdrsRows(c, ctx),'typeOfDisposition').value, 'Cremation/Burial')
  c.vitalSheet.typeOfDisposition = 'urn at home'; assert.ok(hasNote(row(E.buildEdrsRows(c, ctx),'typeOfDisposition'),'error',/isn't an EDRS choice/)) })
t('license numbers lose spaces and hyphens', () => {
  assert.strictEqual(row(rows,'fd-license').value, 'FD2117'); assert.strictEqual(E.edrsLicense('emb-0456','EMB').value, 'EMB0456'); assert.strictEqual(E.edrsLicense('2117','FD').value, 'FD2117') })
t('no embalming → nothing more to enter; embalmed → name and license required', () => {
  assert.ok(!row(rows,'embalmer-license'))
  const c = base(); c.vitalSheet.embalmed = 'yes'; const r = E.buildEdrsRows(c, ctx)
  assert.ok(hasNote(row(r,'embalmer-name'),'error',/Required/)); assert.ok(hasNote(row(r,'embalmer-license'),'error',/Required/)) })
t('death at home → EDRS-filled items are derived from the residence', () => {
  assert.strictEqual(row(rows,'placeOfDeath').value, 'RESIDENCE'); assert.strictEqual(row(rows,'pod-type').value, "DECEDENT'S HOME")
  assert.strictEqual(row(rows,'facilityAddress').value, '1234B Palm Canyon Dr Apt 4'); assert.strictEqual(row(rows,'deathCity').value, 'Cathedral City') })
t('unamendable items carry their warning (year of death, county of death)', () => {
  assert.ok(hasNote(row(rows,'dod'),'info',/Can't be amended/)); assert.ok(hasNote(row(rows,'deathCounty'),'info',/Can't be amended/)) })
t('a missing license number blocks, with where to set it', () => {
  const r = row(E.buildEdrsRows(base(), { ...ctx, location: { name: 'X' } }),'fd-license'); assert.ok(hasNote(r,'error',/license_number/)) })

console.log('\n-- readiness')
t('the Spanish-name widow case has exactly the blockers a careful person would expect', () => {
  const rd = E.readiness(rows)
  assert.ok(!rd.ready); assert.deepStrictEqual(rd.blockers.map(r => r.key), ['occupation'])
})
t('fixing the occupation makes it ready', () => {
  const c = base(); c.vitalSheet.occupation = 'Farm worker'; const rd = E.readiness(E.buildEdrsRows(c, ctx)); assert.ok(rd.ready, JSON.stringify(rd.blockers.map(r=>r.key))) })
t('a bare First Call case is blocked on the placeholder names and the missing basics', () => {
  const c = { disposition: 'undetermined', locationId: 'L1', decedent: { firstName: 'Unknown', lastName: 'Unknown' }, contacts: [] }
  const rd = E.readiness(E.buildEdrsRows(c, {})); const keys = rd.blockers.map(r => r.key)
  for (const k of ['firstName','lastName','dob','dod','sex','maritalStatus','fd-license','typeOfDisposition']) assert.ok(keys.includes(k), k + ' should block: ' + keys.join(','))
  assert.ok(!rd.ready) })


fs.rmSync(dir, { recursive: true, force: true })
console.log(`\n${passed} passed, ${failures.length} failed`)
process.exit(failures.length ? 1 : 0)
