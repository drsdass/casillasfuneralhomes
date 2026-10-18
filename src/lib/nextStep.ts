import type { FuneralCase, Contract, CaseTask } from '@/types'

export type CaseTab = 'Overview' | 'Tasks' | 'Orders' | 'Notes' | 'Documents' | 'Emails' | 'Financials'

export interface NextStep {
  /** One plain sentence: what to do next. */
  text: string
  /** Button label (omitted when there is nothing to click). */
  button?: string
  /** Go to another page… */
  to?: string
  /** …or open a tab on this case. */
  tab?: CaseTab
  done?: boolean
}

/** The single next thing staff should do on a case, worked out from what is (and isn't) filled in. Pure — easy to test. */
export function nextStep(c: FuneralCase, o: { contract?: Contract; tasks: CaseTask[] }): NextStep {
  const id = c.id
  if (c.status === 'completed') return { text: 'This case is complete.', done: true }
  if (c.status === 'on_hold') return { text: 'This case is on hold.' }
  if (c.status === 'first_call') return { text: 'Finish the first call details.', button: 'Open First Call', to: `/cases/${id}/first-call` }
  if (!c.contacts || c.contacts.length === 0) return { text: 'Add the family contact (who is making the arrangements).', button: 'Add contact', to: `/cases/${id}/edit` }
  if (!c.vitalSheet) return { text: 'Fill out the Vital Sheet.', button: 'Open Vital Sheet', to: `/cases/${id}/vital-sheet` }
  if (!o.contract) return { text: 'Sit down with the family and prepare the arrangement and prices.', button: 'Go to Financials', tab: 'Financials' }
  if (o.contract.status === 'draft' || o.contract.status === 'sent') {
    return { text: 'Get the contract signed by the family.', button: 'Go to Financials', tab: 'Financials' }
  }
  if (!c.serviceDate && c.disposition !== 'donation') return { text: 'Set the service date.', button: 'Set the date', to: `/cases/${id}/edit` }
  const open = o.tasks.find((t) => t.status !== 'confirmed')
  if (open) return { text: `Next on the checklist: ${open.label}.`, button: 'Open checklist', tab: 'Tasks' }
  if (!o.contract.paid && o.contract.amountPaid < o.contract.total) {
    return { text: 'Collect the remaining balance.', button: 'Go to Financials', tab: 'Financials' }
  }
  return { text: 'Everything looks done. Mark the case complete after the service.', done: true }
}
