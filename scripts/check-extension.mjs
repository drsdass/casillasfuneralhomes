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
 <input id="pw" type="password" value="secret"><input type="hidden" value="tok"></body>`, { url: 'https://x.test/p' })
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
console.log(fail ? `\n${fail} FAILED` : '\nall extension checks passed'); process.exit(fail ? 1 : 0)
