import type { ReactNode } from 'react'
import type { CaseStatus, ContractStatus } from '@/types'
import { useLanguage } from '@/i18n/LanguageContext'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  )
}

export function SectionHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h1 className="text-xl font-display font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

const caseStatusStyles: Record<CaseStatus, string> = {
  first_call: 'bg-slate-100 text-slate-700',
  arrangement_pending: 'bg-amber-100 text-amber-800',
  arrangement_scheduled: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-indigo-100 text-indigo-800',
  service_scheduled: 'bg-purple-100 text-purple-800',
  completed: 'bg-emerald-100 text-emerald-800',
  on_hold: 'bg-red-100 text-red-800',
}

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const { t } = useLanguage()
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${caseStatusStyles[status]}`}>
      {t(`enums.caseStatus.${status}`)}
    </span>
  )
}

const contractStatusStyles: Record<ContractStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-amber-100 text-amber-800',
  signed: 'bg-blue-100 text-blue-800',
  paid: 'bg-emerald-100 text-emerald-800',
  void: 'bg-red-100 text-red-800',
}

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  const { t } = useLanguage()
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${contractStatusStyles[status]}`}>
      {t(`enums.contractStatus.${status}`)}
    </span>
  )
}

export function formatCurrency(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}
