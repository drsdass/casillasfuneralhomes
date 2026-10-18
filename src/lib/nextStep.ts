import type { FuneralCase, Contract, CaseTask, DispositionType } from '@/types'

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
  /** One-tap answers (e.g. Burial / Cremation) shown instead of a single button. */
  choices?: { label: string; value: DispositionType }[]
}

/** The single next thing staff should do on a case, worked out from what is (and isn't) filled in. Pure — easy to test. */
export function nextStep(c: FuneralCase, o: { contract?: Contract; tasks: CaseTask[] }, lang: 'en' | 'es' = 'en'): NextStep {
  const tx = (en: string, es: string) => (lang === 'es' ? es : en)
  const id = c.id
  if (c.status === 'completed') return { text: tx('This case is complete.', 'Este caso está completo.'), done: true }
  if (c.status === 'on_hold') return { text: tx('This case is on hold.', 'Este caso está en espera.') }
  if (c.status === 'first_call') return { text: tx('Finish the first call details.', 'Termine los detalles de la primera llamada.'), button: tx('Open First Call', 'Abrir primera llamada'), to: `/cases/${id}/first-call` }
  if (!c.contacts || c.contacts.length === 0) return { text: tx('Add the family contact (who is making the arrangements).', 'Agregue el contacto de la familia (quién hace los arreglos).'), button: tx('Add contact', 'Agregar contacto'), to: `/cases/${id}/edit` }
  if (c.disposition === 'undetermined') {
    return {
      text: tx('What did the family choose?', '¿Qué eligió la familia?'),
      choices: [
        { label: tx('Burial', 'Entierro'), value: 'burial' },
        { label: tx('Cremation', 'Cremación'), value: 'cremation' },
        { label: tx('Entombment', 'Mausoleo'), value: 'entombment' },
        { label: tx('Donation', 'Donación'), value: 'donation' },
      ],
    }
  }
  if (!c.vitalSheet) return { text: tx('Fill out the Vital Sheet.', 'Llene la hoja de datos vitales.'), button: tx('Open Vital Sheet', 'Abrir hoja vital'), to: `/cases/${id}/vital-sheet` }
  const fin = tx('Go to Financials', 'Ir a Finanzas')
  if (!o.contract) return { text: tx('Sit down with the family and prepare the arrangement and prices.', 'Reúnase con la familia y prepare el arreglo y los precios.'), button: fin, tab: 'Financials' }
  if (o.contract.status === 'draft' || o.contract.status === 'sent') {
    return { text: tx('Get the contract signed by the family.', 'Pida a la familia que firme el contrato.'), button: fin, tab: 'Financials' }
  }
  if (!c.serviceDate && c.disposition !== 'donation') return { text: tx('Set the service date.', 'Fije la fecha del servicio.'), button: tx('Set the date', 'Fijar la fecha'), to: `/cases/${id}/edit` }
  const open = o.tasks.find((t) => t.status !== 'confirmed')
  if (open) return { text: tx(`Next on the checklist: ${open.label}.`, `Siguiente en la lista: ${open.label}.`), button: tx('Open checklist', 'Abrir lista'), tab: 'Tasks' }
  if (!o.contract.paid && o.contract.amountPaid < o.contract.total) {
    return { text: tx('Collect the remaining balance.', 'Cobre el saldo pendiente.'), button: fin, tab: 'Financials' }
  }
  return { text: tx('Everything looks done. Mark the case complete after the service.', 'Todo listo. Marque el caso como completo después del servicio.'), done: true }
}
