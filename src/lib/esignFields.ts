/** A box staff place on a document for the family to fill in. Position and size are fractions of the page (0-1), measured from its top-left corner. */
export type SignFieldType = 'signature' | 'initials' | 'date' | 'name' | 'text' | 'checkbox'
export interface SignField { id: string; type: SignFieldType; page: number; x: number; y: number; w: number; h: number; label?: string; required?: boolean }

export const FIELD_TOOLS: { type: SignFieldType; label: string; hint: string; w: number; h: number }[] = [
  { type: 'signature', label: 'Signature', hint: 'Sign here', w: 0.3, h: 0.055 },
  { type: 'initials', label: 'Initials', hint: 'Initial here', w: 0.1, h: 0.045 },
  { type: 'date', label: 'Date', hint: 'Date (filled in for them)', w: 0.18, h: 0.03 },
  { type: 'name', label: 'Printed name', hint: 'Their typed name', w: 0.3, h: 0.03 },
  { type: 'text', label: 'Text line', hint: 'They type something', w: 0.34, h: 0.03 },
  { type: 'checkbox', label: 'Checkbox', hint: 'They tick it', w: 0.035, h: 0.027 },
]
export const toolOf = (t: SignFieldType) => FIELD_TOOLS.find((x) => x.type === t)!
export const newFieldId = () => Math.random().toString(36).slice(2, 10)

export function makeField(type: SignFieldType, page: number, cx: number, cy: number, label?: string): SignField {
  const t = toolOf(type)
  const x = Math.min(Math.max(cx - t.w / 2, 0.01), 0.99 - t.w)
  const y = Math.min(Math.max(cy - t.h / 2, 0.01), 0.99 - t.h)
  return { id: newFieldId(), type, page, x, y, w: t.w, h: t.h, label, required: type !== 'checkbox' }
}
