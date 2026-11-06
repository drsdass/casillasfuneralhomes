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

/** Several documents in one PDF: each starts on a fresh page. */
export async function pdfFromElements(els: HTMLElement[]): Promise<Blob> {
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
