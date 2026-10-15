// EDRS side. Shows a small panel. Does nothing until the person clicks a button.
// It never clicks Save/Submit/Next, never navigates, and never overwrites typed values.
;(function () {
  const core = self.CasillasFillCore
  const mapping = self.CASILLAS_EDRS_MAPPING
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647'
  const shadow = host.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
    <style>
      .p{font:13px system-ui,sans-serif;background:#fff;color:#222;border:1px solid #3b4a35;border-radius:8px;padding:10px;width:260px;box-shadow:0 4px 14px rgba(0,0,0,.2)}
      b{display:block;margin-bottom:4px} small{color:#666;display:block;margin:4px 0}
      button{display:block;width:100%;margin:4px 0;padding:6px;border:1px solid #3b4a35;background:#f4f6f2;border-radius:6px;cursor:pointer}
      button:hover{background:#e6ebe1} ul{margin:6px 0;padding-left:16px;max-height:180px;overflow:auto} .x{float:right;cursor:pointer;width:auto;border:0;background:none;display:inline}
    </style>
    <div class="p"><button class="x" id="min">–</button><b>Casillas EDRS Assist</b>
      <div id="body">
        <small id="info"></small>
        <button id="fill">Fill this screen (empty fields only)</button>
        <button id="cap">Capture this screen's structure</button>
        <button id="clr">Clear case data</button>
        <ul id="res"></ul>
      </div></div>`
  const $ = (id) => shadow.getElementById(id)
  const get = () => new Promise((r) => chrome.runtime.sendMessage({ type: 'get' }, (x) => r(x?.payload || null)))

  async function refresh() {
    const p = await get()
    $('info').textContent = p ? `Case loaded: ${p.caseLabel || '(unnamed)'} — ${p.rows.length} values. Expires 30 min after sending.` : 'No case loaded. Use "Send to EDRS Assist" in Casillas OS.'
  }
  $('min').onclick = () => { const b = $('body'); b.style.display = b.style.display === 'none' ? '' : 'none' }
  $('fill').onclick = async () => {
    const p = await get(); const out = $('res'); out.textContent = ''
    if (!p) return refresh()
    const screen = (mapping.screens || []).find((s) => core.screenMatches(document, location, s))
    if (!screen) { out.innerHTML = '<li>No field mapping for this screen yet. Use "Capture structure".</li>'; return }
    const res = core.fillScreen(document, screen, p.rows)
    for (const r of res) { const li = document.createElement('li'); li.textContent = `${r.number ? 'Item ' + r.number + ' ' : ''}${r.label}: ${r.status}`; out.appendChild(li) }
  }
  $('cap').onclick = async () => {
    const json = JSON.stringify(core.captureStructure(document), null, 2)
    try { await navigator.clipboard.writeText(json); $('res').innerHTML = '<li>Structure copied (no values). Paste it to Claude.</li>' }
    catch { const w = window.open('', '_blank'); if (w) { w.document.body.textContent = json } }
  }
  $('clr').onclick = () => chrome.runtime.sendMessage({ type: 'clear' }, refresh)
  document.documentElement.appendChild(host)
  refresh()
})()
