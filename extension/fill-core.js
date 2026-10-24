// Pure DOM helpers (no chrome.* APIs) so they can be tested in jsdom.
;(function (root) {
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  // Spellings EDRS may use for the same Mexican state / city.
  const ALIASES = [['ciudad de mexico', 'distrito federal', 'mexico city', 'cdmx', 'df'], ['estado de mexico', 'mexico state', 'edomex'], ['michoacan', 'michoacan de ocampo'], ['veracruz', 'veracruz de ignacio de la llave'], ['coahuila', 'coahuila de zaragoza'], ['nuevo leon', 'nuevo leon']]

  function setNative(el, value) {
    const w = el.ownerDocument.defaultView
    const proto = el instanceof w.HTMLTextAreaElement ? w.HTMLTextAreaElement.prototype
      : el instanceof w.HTMLSelectElement ? w.HTMLSelectElement.prototype : w.HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
    setter.call(el, value)
    el.dispatchEvent(new w.Event('input', { bubbles: true }))
    el.dispatchEvent(new w.Event('change', { bubbles: true }))
  }

  // status: filled | skipped-has-value | skipped-empty | skipped-locked | missing | no-option
  // Picks the option for a wanted text: exact first; with `fuzzy`, then "starts with", then "contains" (only when one option fits).
  function pickOption(el, value, fuzzy) {
    const opts = Array.from(el.options).filter((o) => o.value !== '' && norm(o.text) !== '' && !/^-+$/.test(o.text.trim()))
    const want = norm(value)
    const wants = [want]
    for (const g of ALIASES) if (g.includes(want)) wants.push(...g)
    for (const w of wants) { const o = opts.find((x) => norm(x.text) === w || norm(x.value) === w); if (o) return o }
    if (!fuzzy) return null
    for (const w of wants) {
      const starts = opts.filter((x) => w.length >= 3 && (norm(x.text).startsWith(w + ' ') || (norm(x.text).length >= 3 && w.startsWith(norm(x.text) + ' '))))
      if (starts.length === 1) return starts[0]
    }
    for (const w of wants) {
      const has = opts.filter((x) => w.length >= 4 && (' ' + norm(x.text) + ' ').includes(' ' + w + ' '))
      if (has.length === 1) return has[0]
    }
    return null
  }

  function fillElement(el, value, o) {
    o = o || {}
    if (!el) return 'missing'
    if (value === '' || value == null) return 'skipped-empty'
    if (el.disabled || el.readOnly) return 'skipped-locked'
    if (el instanceof el.ownerDocument.defaultView.HTMLSelectElement) {
      if (el.value && el.selectedIndex > 0) return 'skipped-has-value'
      const opt = pickOption(el, value, o.fuzzy)
      if (!opt) return 'no-option'
      setNative(el, opt.value)
      return 'filled'
    }
    if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'file' || el.type === 'submit' || el.type === 'button') return 'skipped-locked'
    // never overwrite typed data (EDRS itself puts a 0 in the age box once the unit is chosen - that one is replaced)
    if (el.value && el.value.trim() !== '' && !(o.replaceZero && /^0+$/.test(el.value.trim()))) return 'skipped-has-value'
    setNative(el, String(value))
    return 'filled'
  }

  function screenMatches(doc, loc, screen) {
    const m = screen.match || {}
    if (m.urlIncludes && !String(loc.href).includes(m.urlIncludes)) return false
    if (m.textIncludes && !(doc.body.textContent || '').includes(m.textIncludes)) return false
    return true
  }

  const clipText = (t, n) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, n || 80)
  function isVisible(doc, el) {
    const win = doc.defaultView
    if (doc.body.getClientRects().length === 0) return true   // test DOM without a layout engine
    if (el.getClientRects().length === 0) return false
    const st = win.getComputedStyle(el)
    return st.visibility !== 'hidden' && st.display !== 'none'
  }
  // The text that sits just before a box (EDRS prints captions as plain text next to the input).
  function captionOf(el) {
    let n = el.previousSibling
    for (let i = 0; n && i < 6; i++, n = n.previousSibling) {
      const t = clipText(n.textContent)
      if (t && !(n.nodeType === 1 && /^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName))) return t
    }
    const cell = el.closest('td, th, div')
    const prevCell = cell && cell.previousElementSibling
    return prevCell ? clipText(prevCell.textContent) : ''
  }
  function sectionOf(doc, el) {
    let found = ''
    for (const h of Array.from(doc.querySelectorAll('h1,h2,h3,legend'))) {
      if (h.compareDocumentPosition(el) & 4 /* h precedes el */) found = clipText(h.textContent, 60)
    }
    return found
  }
  // A locator is { model, nth? } (Angular ng-model, exact), or { cap, section? } (caption text), or { selector }.
  function resolve(doc, loc) {
    const vis = (el) => isVisible(doc, el)
    if (loc.model) {
      const all = Array.from(doc.querySelectorAll('input, select, textarea')).filter((el) => el.getAttribute('ng-model') === loc.model || el.getAttribute('data-ng-model') === loc.model).filter(vis)
      return all[loc.nth || 0] || null
    }
    if (loc.cap) {
      const want = norm(loc.cap)
      const all = Array.from(doc.querySelectorAll('input, select, textarea')).filter(vis).filter((el) => norm(captionOf(el)) === want)
      const inSection = loc.section ? all.filter((el) => norm(sectionOf(doc, el)) === norm(loc.section)) : all
      return inSection[loc.nth || 0] || null
    }
    if (loc.selector) return doc.querySelector(loc.selector)
    return null
  }

  // The next visible box after `base` in page order (the list that appears beside a "type" box, the second zip box, ...).
  function nextField(doc, base, onlySelect) {
    if (!base) return null
    const all = Array.from(doc.querySelectorAll('input, select, textarea')).filter((el) => isVisible(doc, el) && el.type !== 'hidden')
    const i = all.indexOf(base)
    if (i < 0) return null
    for (let j = i + 1; j < all.length; j++) {
      if (onlySelect && all[j].tagName !== 'SELECT') continue
      if (all[j].type === 'checkbox' || all[j].type === 'radio') continue
      return all[j]
    }
    return null
  }

  // A tick box found by the caption printed beside it ("Mexican:"), or by a <label>.
  function resolveCheck(doc, text) {
    const want = norm(text)
    const boxes = Array.from(doc.querySelectorAll('input[type=checkbox]')).filter((el) => isVisible(doc, el))
    const direct = boxes.find((el) => norm(captionOf(el)) === want)
    if (direct) return direct
    for (const l of Array.from(doc.querySelectorAll('label'))) {
      if (norm(l.textContent) !== want) continue
      const c = l.control || (l.htmlFor && doc.getElementById(l.htmlFor)) || l.querySelector('input[type=checkbox]')
      if (c && c.type === 'checkbox') return c
    }
    return null
  }

  function tick(el) {
    if (el.disabled) return 'skipped-locked'
    if (el.checked) return 'skipped-has-value'
    const w = el.ownerDocument.defaultView
    el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }))   // lets the page's own scripts see the tick
    if (!el.checked) { el.checked = true; el.dispatchEvent(new w.Event('change', { bubbles: true })) }
    return 'filled'
  }

  function fillScreen(doc, screen, rows) {
    const byKey = new Map(rows.map((r) => [r.key, r]))
    const found = new Map()   // key -> the box found for it (so a later field can say "the box after that one")
    const results = []
    for (const f of screen.fields || []) {
      const row = byKey.get(f.key)
      // A group of tick boxes (Hispanic origin): the row says which ("Mexican, Cuban" or "Other — text").
      if (f.checks) {
        const raw = row ? String(row.value || '') : ''
        const other = /^other\s*[—-]\s*(.*)$/i.exec(raw)
        const wanted = other ? ['Other'] : raw.split(',').map((x) => x.trim()).filter(Boolean)
        let status = wanted.length ? 'skipped-empty' : 'skipped-empty'
        for (const name of wanted) {
          const box = resolveCheck(doc, f.checks[name] || name + ':')
          if (!box) { status = 'missing'; continue }
          const st = tick(box)
          if (name === 'Other' && other) { const t = nextField(doc, box); if (t && t.type !== 'checkbox') fillElement(t, other[1].trim() || 'UNKNOWN') }
          if (status !== 'missing') status = st
        }
        results.push({ key: f.key, number: row?.number || '', label: row?.label || f.key, status })
        continue
      }
      let el
      if (f.after) el = nextField(doc, found.get(f.after), !f.any)
      else if (f.next) { const base = resolve(doc, { cap: f.cap, section: f.section, nth: f.nth }); el = nextField(doc, base, false) }
      else el = resolve(doc, f)
      if (el) found.set(f.key, el)
      // literal: a fixed choice made only when the case has a value for this row (e.g. age type "Years")
      // always: a fixed choice made even with no matching row (e.g. parent relationship Father/Mother).
      // unkIfEmpty: the person said unknown parts are entered as UNK, so an empty row becomes that text.
      let value = row && row.value !== '' ? (f.literal !== undefined ? f.literal : row.value) : ''
      if (!value && f.always && f.literal !== undefined) value = f.literal
      if (!value && row && f.unkIfEmpty) value = f.unkIfEmpty
      // part: a zip row "92240-1234" goes in two boxes
      if (value && f.part) { const m = /^\s*(\d{5})(?:\D*(\d{4}))?/.exec(String(value)); value = m ? (f.part === 'zip5' ? m[1] : m[2] || '') : (f.part === 'zip5' ? value : '') }
      const status = row || f.always ? fillElement(el, value, { fuzzy: !!f.fuzzy, replaceZero: !!f.replaceZero }) : 'skipped-empty'
      results.push({ key: f.key, number: row?.number || '', label: row?.label || f.key, status })
    }
    return results
  }

  // Captures STRUCTURE only: tags, ids, names, label text, nearby text, framework bindings, select option labels.
  // Never values, passwords or hidden fields.
  function captureStructure(doc) {
    const clip = (t, n) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, n || 80)
    const labelFor = (el) => {
      if (el.id) { const l = doc.querySelector('label[for="' + (doc.defaultView.CSS?.escape ? doc.defaultView.CSS.escape(el.id) : el.id) + '"]'); if (l) return clip(l.textContent) }
      const p = el.closest('label'); if (p) return clip(p.textContent)
      return clip(el.getAttribute('aria-label') || el.getAttribute('title') || '')
    }
    // EDRS puts the caption as plain text beside the input: look left in the same cell/row, then at the cell before.
    const nearbyText = (el) => {
      let n = el.previousSibling
      for (let i = 0; n && i < 6; i++, n = n.previousSibling) {
        const t = clip(n.textContent)
        if (t && !(n.nodeType === 1 && /^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName))) return t
      }
      const cell = el.closest('td, th, div')
      const prevCell = cell && cell.previousElementSibling
      if (prevCell) { const t = clip(prevCell.textContent); if (t) return t }
      return ''
    }
    const bindings = (el) => {
      const o = {}
      for (const a of Array.from(el.attributes)) if (/^(data-)?ng-|^v-|^formcontrolname$|^placeholder$|^maxlength$|^data-field|^data-name/i.test(a.name)) o[a.name] = clip(a.value, 120)
      return Object.keys(o).length ? o : undefined
    }
    const win = doc.defaultView
    const hasLayout = doc.body.getClientRects().length > 0   // false only in a test DOM with no layout engine
    const visible = (el) => {
      if (!hasLayout) return true
      if (el.getClientRects().length === 0) return false
      const st = win.getComputedStyle(el)
      return st.visibility !== 'hidden' && st.display !== 'none'
    }
    const isField = (n) => n.nodeType === 1 && /^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName) && n.type !== 'hidden' && n.type !== 'password'
    const all = Array.from(doc.querySelectorAll('input, select, textarea')).filter((el) => el.type !== 'hidden' && el.type !== 'password')
    const els = all.filter(visible)   // fields of screens that are currently hidden are left out
    const indexOf = new Map(els.map((el, i) => [el, i]))
    // "layout": the visible page read top to bottom, captions and fields interleaved, so every box can be matched to its caption.
    const BLOCK = /^(TR|DIV|P|BR|FIELDSET|LEGEND|H1|H2|H3|H4|LI|TABLE|UL)$/
    const parts = []
    const walk = (node) => {
      if (node.nodeType === 3) { const t = clip(node.textContent, 100); if (t) parts.push(t); return }
      if (node.nodeType !== 1) return
      if (/^(SCRIPT|STYLE|NOSCRIPT|OPTION)$/.test(node.tagName)) return
      if (isField(node)) {
        if (indexOf.has(node)) parts.push('[#' + indexOf.get(node) + (node.tagName === 'SELECT' ? ' select' : node.type === 'checkbox' ? ' checkbox' : node.type === 'radio' ? ' radio' : node.tagName === 'INPUT' && node.type !== 'text' ? ' ' + node.type : '') + ']')
        return
      }
      if (!visible(node)) return
      const blk = BLOCK.test(node.tagName)
      if (blk) parts.push('\n')
      for (const c of Array.from(node.childNodes)) walk(c)
      if (blk) parts.push('\n')
    }
    walk(doc.body)
    let layout = parts.join(' ').replace(/ ?\n ?/g, '\n').replace(/\n{2,}/g, '\n').trim()
    // Drop the page header (it can show the decedent's name): start at the first section heading.
    const firstHeading = Array.from(doc.querySelectorAll('h1,h2,h3,legend')).filter(visible).map((h) => clip(h.textContent, 60)).find(Boolean)
    const at = firstHeading ? layout.indexOf(firstHeading) : -1
    if (at > 0) layout = layout.slice(at)
    const fields = els.map((el, index) => ({
      index, tag: el.tagName.toLowerCase(), type: el.type || '', id: el.id || '', name: el.name || '',
      label: labelFor(el), nearbyText: nearbyText(el),
      fieldset: clip(el.closest('fieldset')?.querySelector('legend')?.textContent, 60),
      bindings: bindings(el), disabled: !!(el.disabled || el.readOnly),
      options: el.tagName === 'SELECT' ? (el.options.length > 14 ? Array.from(el.options).slice(0, 6).map((o) => o.text.trim()).concat(['… (' + el.options.length + ' options)']) : Array.from(el.options).map((o) => o.text.trim())) : undefined,
    }))
    return {
      capturedAt: new Date().toISOString(),
      path: win.location.pathname, hash: win.location.hash,
      title: doc.title,
      iframes: doc.querySelectorAll('iframe').length,
      headings: Array.from(doc.querySelectorAll('h1,h2,h3,legend')).filter(visible).map((h) => clip(h.textContent, 60)).filter(Boolean).slice(0, 30),
      layout,
      fields,
    }
  }

  const api = { norm, fillElement, fillScreen, screenMatches, captureStructure, resolve }
  root.CasillasFillCore = api
})(typeof self !== 'undefined' ? self : globalThis)
