import fs from 'node:fs'
import { JSDOM } from 'jsdom'
let fail = 0
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m) } else console.log('ok  ', m) }
const rd = (f) => fs.readFileSync('extension/' + f, 'utf8')

// ---- static scans
const manifest = JSON.parse(rd('manifest.json'))
ok(manifest.manifest_version === 3, 'MV3')
ok(JSON.stringify(manifest.permissions) === '["storage"]', 'only storage permission')
ok(!manifest.host_permissions, 'no host_permissions')
const allMatches = manifest.content_scripts.flatMap((c) => c.matches)
ok(allMatches.includes('https://edrs.calivrs.org/ca-edrs/*') && !allMatches.some((m) => m.includes('REPLACE') || m.includes('casadm')), 'EDRS host set; admin site excluded')
const all = ['background.js', 'bridge.js', 'content.js', 'fill-core.js'].map(rd).join('\n')
ok(!/\.click\(|\.submit\(|requestSubmit|location\.(href|assign|replace)\s*=|fetch\(|XMLHttpRequest|sendBeacon|localStorage|chrome\.storage\.(local|sync)/.test(all), 'no clicks/submits/navigation/network/disk storage')
ok(/storage\.session/.test(rd('background.js')), 'memory-only session storage')
ok(/ev\.origin !== window\.location\.origin/.test(rd('bridge.js')), 'bridge checks origin')

// ---- behavior
// fill-core.js registers itself on globalThis (it is a plain browser script)
;(0, eval)(rd('fill-core.js'))
const core = globalThis.CasillasFillCore
const dom = new JSDOM(`<body><h2>Decedent Information</h2>
 <label for="a">First</label><input id="a"><input id="b" value="TYPED"><input id="c" disabled>
 <select id="s"><option value="">--</option><option value="1">Male</option><option value="2">Female</option></select>
 <select id="s2"><option value="">--</option><option value="1">Male</option></select>
 <table><tr><td>Last:</td><td><input id="ln" ng-model="dc.last" maxlength="40"></td></tr></table><input id="pw" type="password" value="secret"><input type="hidden" value="tok"></body>`, { url: 'https://x.test/p' })
const { window } = dom
globalThis.HTMLInputElement = window.HTMLInputElement; globalThis.HTMLSelectElement = window.HTMLSelectElement; globalThis.HTMLTextAreaElement = window.HTMLTextAreaElement
const d = window.document
let events = 0; d.getElementById('a').addEventListener('input', () => events++)
ok(core.fillElement(d.getElementById('a'), 'MARIA') === 'filled' && d.getElementById('a').value === 'MARIA' && events === 1, 'fills empty input + fires input')
ok(core.fillElement(d.getElementById('b'), 'X') === 'skipped-has-value' && d.getElementById('b').value === 'TYPED', 'never overwrites typed data')
ok(core.fillElement(d.getElementById('c'), 'X') === 'skipped-locked', 'skips disabled')
ok(core.fillElement(d.getElementById('s'), 'female') === 'filled' && d.getElementById('s').value === '2', 'select by option text')
ok(core.fillElement(d.getElementById('s2'), 'Nonbinary') === 'no-option' && d.getElementById('s2').value === '', 'unknown option not guessed')
ok(core.fillElement(null, 'x') === 'missing' && core.fillElement(d.getElementById('a'), '') === 'skipped-empty', 'missing/empty handled')
const res = core.fillScreen(d, { fields: [{ key: 'k', selector: '#nope' }] }, [{ key: 'k', value: 'v', number: '1', label: 'L' }])
ok(res[0].status === 'missing', 'fillScreen reports missing element')
ok(core.screenMatches(d, window.location, { match: { textIncludes: 'Decedent Information', urlIncludes: 'x.test' } }) && !core.screenMatches(d, window.location, { match: { textIncludes: 'Nope' } }), 'screen matching')
const cap = JSON.stringify(core.captureStructure(d))
ok(!cap.includes('secret') && !cap.includes('tok') && !cap.includes('TYPED') && !cap.includes('MARIA'), 'capture contains no values/passwords/hidden')
ok(cap.includes('"Female"') && cap.includes('First'), 'capture has option labels and field labels')
const capObj = JSON.parse(cap)
ok(/Last: \[#\d+\]/.test(capObj.layout), 'layout string pairs caption with field marker')
const f = capObj.fields.find((x) => x.id === 'ln')
ok(f && f.nearbyText === 'Last:' && f.bindings['ng-model'] === 'dc.last', 'capture finds caption beside input and ng-model binding')
// ---- field locators against an EDRS-like page
const d2 = new JSDOM(`<body><fieldset><legend>AKA</legend><table><tr><td>First Name:</td><td><input id=aka></td></tr></table></fieldset>
 <fieldset><legend>Surviving Spouse</legend><table><tr><td>28. First Name:</td><td><input id=sp></td></tr></table></fieldset>
 <table><tr><td>5. Age:</td><td><select id=ag ng-model="m.age"><option>--<option>Years</select></td></tr></table>
 <table><tr><td>4. DOB:</td><td><input id=dob ng-model="m.dob"></td></tr><tr><td>Typed:</td><td><input id=typed ng-model="m.typed" value="KEEP"></td></tr></table></body>`).window
globalThis.HTMLInputElement = d2.HTMLInputElement; globalThis.HTMLSelectElement = d2.HTMLSelectElement
const dd = d2.document
ok(core.resolve(dd, { model: 'm.dob' }).id === 'dob', 'locator by ng-model')
ok(core.resolve(dd, { cap: 'First Name:', section: 'AKA' }).id === 'aka' && core.resolve(dd, { cap: '28. First Name:' }).id === 'sp', 'locator by caption and section')
const rows2 = [{ key: 'age', value: '86', number: '5', label: 'AGE' }, { key: 'dob', value: '03/02/1940', number: '4', label: 'DOB' }, { key: 'typed', value: 'OVERWRITE', number: '', label: 'T' }]
const scr = { fields: [{ key: 'age', model: 'm.age', literal: 'Years' }, { key: 'dob', model: 'm.dob' }, { key: 'typed', model: 'm.typed' }] }
const res2 = core.fillScreen(dd, scr, rows2)
ok(dd.getElementById('ag').value === 'Years' && dd.getElementById('dob').value === '03/02/1940', 'fillScreen fills by locator, literal applied')
ok(dd.getElementById('typed').value === 'KEEP' && res2[2].status === 'skipped-has-value', 'fillScreen never overwrites typed value')
// ---- the cases that failed on a real certificate: age 0, second state list, origin tick boxes, zip + county
const d3 = new JSDOM(`<body><fieldset><legend>Name</legend></fieldset>
 <table><tr><td>5. Age:</td><td><select id=at ng-model="m.agetype"><option value="">--<option>Years<option>Months</select><input id=ageN value="0"></td></tr></table>
 <table><tr><td>34. Birth State/Foreign Country:</td><td><select id=bt ng-model="m.bt"><option value="">--<option>US State<option>Mexican State</select> ? : <select id=bv><option value="">--<option>AGUASCALIENTES<option>MICHOACAN DE OCAMPO<option>MEXICO<option>DISTRITO FEDERAL</select></td></tr></table>
 <div>14/15. Was Decedent HISPANIC: <select id=hs ng-model="m.h"><option value="">--<option>YES<option>NO</select></div>
 <div>Cuban: <input type=checkbox id=cu><br>Mexican: <input type=checkbox id=mx><br>Puerto Rican: <input type=checkbox id=pr><br>Other: <input type=checkbox id=ot><input id=ottxt></div>
 <table><tr><td>22. County:</td><td><select id=co><option value="">--<option>RIVERSIDE<option>IMPERIAL</select></td></tr></table>
 <div>23. Zip Code: <input id=z5> - <input id=z4></div></body>`).window
globalThis.HTMLInputElement = d3.HTMLInputElement; globalThis.HTMLSelectElement = d3.HTMLSelectElement; globalThis.HTMLTextAreaElement = d3.HTMLTextAreaElement
globalThis.MouseEvent = d3.MouseEvent
const x = d3.document
const rows3 = [
  { key: 'age-type', value: 'Years' }, { key: 'age', value: '61' }, { key: 'father-birth-type', value: 'Mexican State' }, { key: 'father-birth-value', value: 'Michoacán' },
  { key: 'hispanic', value: 'Yes' }, { key: 'hispanicSpecify', value: 'Mexican' }, { key: 'res-county', value: 'Riverside' }, { key: 'res-zip', value: '92240-1234' },
]
const scr3 = { fields: [
  { key: 'age-type', model: 'm.agetype' }, { key: 'age', after: 'age-type', any: true, replaceZero: true },
  { key: 'father-birth-type', model: 'm.bt' }, { key: 'father-birth-value', after: 'father-birth-type', fuzzy: true },
  { key: 'hispanic', model: 'm.h' },
  { key: 'hispanicSpecify', checks: { Mexican: 'Mexican:', Cuban: 'Cuban:', 'Puerto Rican': 'Puerto Rican:', Other: 'Other:' } },
  { key: 'res-county', cap: '22. County:', fuzzy: true },
  { key: 'res-zip', cap: '23. Zip Code:', part: 'zip5' }, { key: 'res-zip', cap: '23. Zip Code:', next: true, part: 'zip4' },
] }
core.fillScreen(x, scr3, rows3)
ok(x.getElementById('ageN').value === '61', 'age: the 0 that EDRS puts in is replaced by the real age')
ok(x.getElementById('bv').selectedOptions[0].text === 'MICHOACAN DE OCAMPO', 'Mexican state with accent matches the EDRS spelling (second list)')
ok(x.getElementById('mx').checked && !x.getElementById('cu').checked && !x.getElementById('ot').checked, 'Hispanic origin: Mexican ticked, others left')
ok(x.getElementById('co').value === 'RIVERSIDE', 'county picked')
ok(x.getElementById('z5').value === '92240' && x.getElementById('z4').value === '1234', 'zip split into the two boxes')
const rows4 = [{ key: 'hispanicSpecify', value: 'Other — Salvadoran' }, { key: 'father-birth-type', value: 'Mexican State' }, { key: 'father-birth-value', value: 'Ciudad de Mexico' }]
core.fillScreen(x, { fields: [scr3.fields[2], { key: 'father-birth-value', after: 'father-birth-type', fuzzy: true, }, scr3.fields[5]] }, rows4)
ok(x.getElementById('ot').checked && x.getElementById('ottxt').value === 'Salvadoran', 'Other origin ticks Other and types the origin')
const mp = {}; globalThis.self = mp; ;(0, eval)(rd('mapping.js'))
ok(Math.max(...mp.CASILLAS_EDRS_MAPPING.screens.map((s) => s.fields.length)) > 30 && mp.CASILLAS_EDRS_MAPPING.screens.some((s) => s.match.urlIncludes === '#!/dc/new/'), 'EDRS mapping loaded')
console.log(fail ? `\n${fail} FAILED` : '\nall extension checks passed'); process.exit(fail ? 1 : 0)
