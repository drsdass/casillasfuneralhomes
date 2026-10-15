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

  function fillScreen(doc, screen, rows) {
    const byKey = new Map(rows.map((r) => [r.key, r]))
    const results = []
    for (const f of screen.fields || []) {
      const row = byKey.get(f.key)
      const el = doc.querySelector(f.selector)
      const status = row ? fillElement(el, row.value) : 'skipped-empty'
      results.push({ key: f.key, number: row?.number || '', label: row?.label || f.key, status })
    }
    return results
  }

  // Captures STRUCTURE only: tags, ids, names, label text, select option labels. Never values.
  function captureStructure(doc) {
    const labelFor = (el) => {
      if (el.id) { const l = doc.querySelector('label[for="' + ((doc.defaultView.CSS?.escape ? doc.defaultView.CSS.escape(el.id) : el.id)) + '"]'); if (l) return l.textContent.trim() }
      const p = el.closest('label'); if (p) return p.textContent.trim().slice(0, 120)
      return (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim()
    }
    const fields = Array.from(doc.querySelectorAll('input, select, textarea')).filter((el) => el.type !== 'hidden' && el.type !== 'password').map((el) => ({
      tag: el.tagName.toLowerCase(), type: el.type || '', id: el.id || '', name: el.name || '',
      label: labelFor(el), disabled: !!(el.disabled || el.readOnly),
      options: el.tagName === 'SELECT' ? Array.from(el.options).map((o) => o.text.trim()) : undefined,
    }))
    return {
      capturedAt: new Date().toISOString(),
      path: doc.defaultView.location.pathname,
      title: doc.title,
      headings: Array.from(doc.querySelectorAll('h1,h2,h3,legend')).map((h) => h.textContent.trim()).filter(Boolean).slice(0, 30),
      fields,
    }
  }

  const api = { norm, fillElement, fillScreen, screenMatches, captureStructure }
  root.CasillasFillCore = api
})(typeof self !== 'undefined' ? self : globalThis)
