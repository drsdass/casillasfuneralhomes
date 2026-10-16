// Pure DOM helpers (no chrome.* APIs) so they can be tested in jsdom.
;(function (root) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

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
  function fillElement(el, value) {
    if (!el) return 'missing'
    if (value === '' || value == null) return 'skipped-empty'
    if (el.disabled || el.readOnly) return 'skipped-locked'
    if (el instanceof el.ownerDocument.defaultView.HTMLSelectElement) {
      if (el.value && el.selectedIndex > 0) return 'skipped-has-value'
      const want = norm(value)
      const opt = Array.from(el.options).find((o) => norm(o.text) === want || norm(o.value) === want)
      if (!opt) return 'no-option'
      setNative(el, opt.value)
      return 'filled'
    }
    if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'file' || el.type === 'submit' || el.type === 'button') return 'skipped-locked'
    if (el.value && el.value.trim() !== '') return 'skipped-has-value'   // never overwrite typed data
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

  function fillScreen(doc, screen, rows) {
    const byKey = new Map(rows.map((r) => [r.key, r]))
    const results = []
    for (const f of screen.fields || []) {
      const row = byKey.get(f.key)
      const el = resolve(doc, f)
      // literal: a fixed choice made only when the case has a value for this row (e.g. age type "Years")
      const value = row && row.value !== '' ? (f.literal !== undefined ? f.literal : row.value) : ''
      const status = row ? fillElement(el, value) : 'skipped-empty'
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
