// Holds the case data in MEMORY ONLY (chrome.storage.session is never written to disk
// and is cleared when the browser closes). Data also expires after 30 minutes.
const TTL_MS = 30 * 60 * 1000
const KEY = 'casillasEdrsPayload'

chrome.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' })

async function getPayload() {
  const o = await chrome.storage.session.get(KEY)
  const p = o[KEY]
  if (!p) return null
  if (Date.now() - p.storedAt > TTL_MS) { await chrome.storage.session.remove(KEY); return null }
  return p
}

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  (async () => {
    if (msg?.type === 'store') {
      // only the OS bridge may store
      if (!sender.tab) return respond({ ok: false })
      await chrome.storage.session.set({ [KEY]: { storedAt: Date.now(), caseLabel: String(msg.caseLabel || ''), rows: msg.rows } })
      return respond({ ok: true })
    }
    if (msg?.type === 'get') return respond({ ok: true, payload: await getPayload() })
    if (msg?.type === 'clear') { await chrome.storage.session.remove(KEY); return respond({ ok: true }) }
    respond({ ok: false })
  })()
  return true
})
