import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useLanguage } from '@/i18n/LanguageContext'
import { computeWorkflow, type Workflow } from '@/lib/workflow'
import type { FuneralCase } from '@/types'

/** For screens that show many cases at once: returns a function that works out any case's checklist from shared, cached data. */
export function useWorkflowFor(): (c: FuneralCase) => Workflow {
  const { language } = useLanguage()
  const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: api.getContracts })
  const { data: tasks = [] } = useQuery({ queryKey: ['all-case-tasks'], queryFn: api.getAllCaseTasks })
  const { data: docs = [] } = useQuery({ queryKey: ['all-case-docs'], queryFn: api.getAllCaseDocuments })
  const { data: signoffs = {} } = useQuery({ queryKey: ['all-signoffs'], queryFn: api.getAllSignoffs })
  const maps = useMemo(() => {
    const k = new Map(contracts.map((c) => [c.caseId, c]))
    const t = new Map<string, typeof tasks>(); for (const x of tasks) t.set(x.caseId, [...(t.get(x.caseId) ?? []), x])
    const d = new Map<string, typeof docs>(); for (const x of docs) d.set(x.caseId, [...(d.get(x.caseId) ?? []), x])
    return { k, t, d }
  }, [contracts, tasks, docs])
  return useCallback((c: FuneralCase) => computeWorkflow(c, { contract: maps.k.get(c.id), tasks: maps.t.get(c.id) ?? [], docs: maps.d.get(c.id) ?? [], signoffs: signoffs[c.id] }, language), [maps, signoffs, language])
}
