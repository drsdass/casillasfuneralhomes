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
  const canvas = await html2canvas(el, {
    scale: 2, // sharper text than the default 1x
    useCORS: true,
    backgroundColor: '#ffffff',
  })

  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const imgWidth = pageWidth
  const imgHeight = (canvas.height * imgWidth) / canvas.width

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

  return pdf.output('blob')
}
