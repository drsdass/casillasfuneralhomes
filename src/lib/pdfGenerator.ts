import jsPDF from 'jspdf'
import html2canvas from 'html2canvas-pro'

/**
 * Captures a rendered DOM element (one of the print-target form previews)
 * as a single-page-per-screen-height PDF. Used to turn the on-screen
 * fillable forms into an actual file before sending for e-signature or
 * saving to permanent storage — until now, "print" was the only output
 * format, which isn't something SignRequest's API can send to a signer.
 */
export async function pdfFromElement(el: HTMLElement): Promise<Blob> {
  return pdfFromElements([el])
}

/**
 * The page's fonts load a weight at a time, only once something uses it. Photographing a form before its bold (or italic)
 * font has arrived measures the words with a stand-in font and draws them with the real one, so words run together.
 * Make sure every weight the forms use is loaded first, then give the browser a moment to re-lay everything out.
 */
async function waitForFonts(): Promise<void> {
  try {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    if (!fonts) return
    const faces: string[] = []
    for (const family of ['"Open Sans"', '"Playfair Display"']) for (const w of [400, 500, 600, 700]) { faces.push(`${w} 16px ${family}`); faces.push(`italic ${w} 16px ${family}`) }
    await Promise.race([
      Promise.all(faces.map((f) => fonts.load(f, 'AaBbCc 0123 &').catch(() => []))).then(() => fonts.ready),
      new Promise((r) => setTimeout(r, 8000)),   // never hang on a slow connection
    ])
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
  } catch { /* capture anyway */ }
}

/** Several documents in one PDF: each starts on a fresh page. */
export async function pdfFromElements(els: HTMLElement[]): Promise<Blob> {
  await waitForFonts()
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  for (let i = 0; i < els.length; i++) {
    const canvas = await html2canvas(els[i], {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      // html2canvas clips the text inside <input> boxes (the bottoms of letters get cut off).
      // In the captured copy only, swap each box for plain text so nothing is clipped.
      onclone: (doc) => {
        doc.querySelectorAll('input, textarea').forEach((node) => {
          const el = node as HTMLInputElement | HTMLTextAreaElement
          if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) return
          const cs = doc.defaultView!.getComputedStyle(el)
          const span = doc.createElement('div')
          span.textContent = el.value || ''
          span.className = el.className
          span.style.cssText += `;display:block;box-sizing:border-box;height:auto;min-height:${Math.max(el.offsetHeight, 24)}px;line-height:1.4;padding-top:2px;padding-bottom:3px;white-space:pre-wrap;overflow:visible;font:${cs.font};color:${cs.color};background:transparent;`
          el.parentNode?.replaceChild(span, el)
        })
      },
    })
    const imgData = canvas.toDataURL('image/png')
    const imgWidth = pageWidth
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    if (i > 0) pdf.addPage()
    let heightLeft = imgHeight
    let position = 0
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight
    while (heightLeft > 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
    }
  }
  return pdf.output('blob')
}
