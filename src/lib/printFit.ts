/**
 * Typed-in form boxes are single-line <input>s, and a browser prints only what fits inside them. Right before printing, any box whose
 * text is longer than the box is swapped for plain wrapped text (same line, same underline) so nothing is cut off; it is put back
 * as soon as printing is done.
 */
const SKIP = new Set(['checkbox', 'radio', 'date', 'time', 'datetime-local', 'button', 'submit', 'file', 'hidden', 'range', 'color'])

export function installPrintFit(): void {
  const w = window as unknown as { __printFit?: boolean }
  if (w.__printFit) return
  w.__printFit = true
  let swapped: { input: HTMLInputElement; span: HTMLElement }[] = []
  const restore = () => { for (const s of swapped) { s.span.remove(); s.input.style.display = s.input.dataset.pfDisplay ?? ''; delete s.input.dataset.pfDisplay }; swapped = [] }
  window.addEventListener('beforeprint', () => {
    restore()
    document.querySelectorAll<HTMLInputElement>('.print-target input, .print-only input').forEach((inp) => {
      if (SKIP.has(inp.type) || !inp.value || inp.scrollWidth <= inp.clientWidth + 1) return
      const span = document.createElement('span')
      span.textContent = inp.value
      span.className = inp.className
      span.style.cssText = inp.style.cssText
      Object.assign(span.style, { whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word', height: 'auto', minWidth: '0', display: 'block', flex: '1 1 0%' })
      inp.dataset.pfDisplay = inp.style.display
      inp.style.display = 'none'
      inp.after(span)
      swapped.push({ input: inp, span })
    })
  })
  window.addEventListener('afterprint', restore)
}
