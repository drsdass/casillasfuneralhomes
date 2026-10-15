// Runs on the Casillas OS site only. Lets the "Send to EDRS Assist" button hand the
// current case's EDRS-formatted values to the extension. Nothing is sent unless the
// page asks (user clicked the button).
window.addEventListener('message', (ev) => {
  if (ev.source !== window || ev.origin !== window.location.origin) return
  const m = ev.data
  if (!m || m.channel !== 'casillas-edrs-assist') return
  if (m.type === 'ping') {
    window.postMessage({ channel: 'casillas-edrs-assist', type: 'pong', version: chrome.runtime.getManifest().version }, window.location.origin)
  } else if (m.type === 'send') {
    const rows = Array.isArray(m.rows) ? m.rows.filter((r) => r && typeof r.key === 'string').map((r) => ({
      key: r.key, number: String(r.number ?? ''), label: String(r.label ?? ''), value: String(r.value ?? ''),
    })) : []
    chrome.runtime.sendMessage({ type: 'store', caseLabel: m.caseLabel, rows }, (res) => {
      window.postMessage({ channel: 'casillas-edrs-assist', type: 'sent', ok: !!res?.ok, count: rows.length }, window.location.origin)
    })
  } else if (m.type === 'clear') {
    chrome.runtime.sendMessage({ type: 'clear' })
  }
})
