import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { TASK_STATUS_LABELS } from '@/types'
import { useSession } from '@/context/SessionContext'
import { Card, CaseStatusBadge, formatCurrency } from '@/components/ui/Primitives'
import { ArrowLeft, CheckSquare, Square, Pin, Link2, FileText, Pencil, Upload, Printer, Trash2, Truck, Clock, CheckCircle2, Plus, FileSignature, Mail, Paperclip, Copy, Check as CheckIcon, Users2, Send, X, AlertTriangle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useState, useRef } from 'react'
import { canEditCases } from '@/lib/permissions'
import { ReleaseAuthorizationForm, EmbalmingAuthorizationForm, PreneedDisclosureForm, FirstCallForm, VitalSheetForm } from '@/components/documents/FormTemplates'
import { ActivityPanel } from '@/components/activity/ActivityPanel'
import { QuoteBuilder } from '@/components/quote/QuoteBuilder'
import type { CaseDocument, OrderStatus, Vendor, VendorCategory, CaseTask, TaskStatus } from '@/types'

const tabs = ['Overview', 'Tasks', 'Orders', 'Notes', 'Documents', 'Emails', 'Financials'] as const
type Tab = typeof tabs[number]

const orderStatusStyles: Record<OrderStatus, string> = {
  pending: 'bg-slate-100 text-slate-600',
  ordered: 'bg-amber-100 text-amber-800',
  delivered: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-emerald-100 text-emerald-800',
}
const taskCategoryLabels: Record<CaseTask['category'], string> = {
  permits: 'Permits', merchandise: 'Merchandise', service_prep: 'Service Prep',
  family: 'Family', documents: 'Documents', transport: 'Transport', other: 'Other',
}
const commonOrderItems = ['Flowers', 'Doves / Birds', 'Horse & Carriage', 'Motorcycle Escort', 'Easels', 'Memorial Video']

type DocTemplate = 'release' | 'embalming' | 'preneed' | 'first_call' | 'vital_sheet'

const templateLabels: Record<DocTemplate, string> = {
  release: 'Authorization for Release of Human Remains',
  embalming: 'Authorization to Accept or Decline Embalming',
  preneed: 'Disclosure of Preneed Funeral Agreement',
  first_call: 'First Call Sheet',
  vital_sheet: 'Vital Sheet',
}

/** Best-guess vendor category from a document's name — just a sort/highlight hint in the picker, staff can always pick a different one. */
function suggestVendorCategory(docName: string | undefined): VendorCategory | undefined {
  if (!docName) return undefined
  const n = docName.toLowerCase()
  if (n.includes('first call')) return 'removal_company'
  if (n.includes('cremat')) return 'crematory'
  if (n.includes('cemetery') || n.includes('burial')) return 'cemetery'
  if (n.includes('flower')) return 'florist'
  return undefined
}

const docCategoryLabels: Record<CaseDocument['category'], string> = {
  permit: 'Permit', contract: 'Contract', authorization: 'Authorization',
  photo: 'Photo', obituary: 'Obituary', music: 'Music', other: 'Other',
}

export default function CaseDetail() {
  const { caseId } = useParams<{ caseId: string }>()
  const { currentUser } = useSession()
  const [tab, setTab] = useState<Tab>('Overview')
  const [noteText, setNoteText] = useState('')
  const [uploadCategory, setUploadCategory] = useState<CaseDocument['category']>('other')
  const [previewTemplate, setPreviewTemplate] = useState<DocTemplate | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const formPreviewRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const canEdit = currentUser ? canEditCases(currentUser.role) : false

  const { data: c } = useQuery({ queryKey: ['case', caseId], queryFn: () => api.getCase(caseId!), enabled: !!caseId })
  const { data: linkedFamily } = useQuery({ queryKey: ['family', c?.familyId], queryFn: () => api.getFamily(c!.familyId!), enabled: !!c?.familyId })
  const { data: tasks = [] } = useQuery({ queryKey: ['case-tasks', caseId], queryFn: () => api.getCaseTasks(caseId!), enabled: !!caseId })
  const { data: notes = [] } = useQuery({ queryKey: ['case-notes', caseId], queryFn: () => api.getCaseNotes(caseId!), enabled: !!caseId })
  const { data: documents = [] } = useQuery({ queryKey: ['case-documents', caseId], queryFn: () => api.getCaseDocuments(caseId!), enabled: !!caseId })
  const { data: vendors = [] } = useQuery({ queryKey: ['vendors'], queryFn: api.getVendors })
  const [sendingDocId, setSendingDocId] = useState<string | null>(null)
  const { data: orders = [] } = useQuery({ queryKey: ['case-orders', caseId], queryFn: () => api.getOrders(caseId!), enabled: !!caseId })
  const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: api.getContracts })
  const { data: gplItems = [] } = useQuery({ queryKey: ['gpl', c?.locationId], queryFn: () => api.getGplItems(c?.locationId), enabled: !!c })
  const { data: caseEmails = [] } = useQuery({ queryKey: ['case-emails', caseId], queryFn: () => api.getEmails({ caseId: caseId! }), enabled: !!caseId })
  const { data: signatureRequests = [] } = useQuery({ queryKey: ['signature-requests', caseId], queryFn: () => api.getSignatureRequests(caseId!), enabled: !!caseId })
  const { data: allStaff = [] } = useQuery({ queryKey: ['staff'], queryFn: api.getStaff })
  const { data: allLocations = [] } = useQuery({ queryKey: ['locations'], queryFn: api.getLocations })

  const updateTaskStatusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) => api.updateTaskStatus(taskId, status, currentUser!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-tasks', caseId] })
      queryClient.invalidateQueries({ queryKey: ['case-orders', caseId] })
    },
  })

  const addNoteMutation = useMutation({
    mutationFn: (body: string) => api.addNote(caseId!, currentUser!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-notes', caseId] })
      setNoteText('')
    },
  })

  const addDocumentMutation = useMutation({
    mutationFn: (doc: Omit<CaseDocument, 'id' | 'uploadedAt'>) => api.addDocument(doc, currentUser!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['case-documents', caseId] }),
  })

  const deleteDocumentMutation = useMutation({
    mutationFn: (id: string) => api.deleteDocument(id, currentUser!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['case-documents', caseId] }),
  })

  const resolveDiscrepancyMutation = useMutation({
    mutationFn: async ({ field, useValue }: { field: string; useValue: string | null }) => {
      const remaining = (c?.fieldDiscrepancies ?? []).filter((d) => d.field !== field)
      const patch: Record<string, unknown> = { fieldDiscrepancies: remaining }
      if (useValue !== null) {
        if (field === 'dateOfBirth') patch.decedent = { ...c!.decedent, dateOfBirth: useValue }
        if (field === 'veteran') patch.decedent = { ...c!.decedent, veteran: useValue === 'Yes' }
      }
      await api.updateCase(caseId!, patch, currentUser!)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['case', caseId] }),
  })

  const [newTaskLabel, setNewTaskLabel] = useState('')
  const [newTaskCategory, setNewTaskCategory] = useState<CaseTask['category']>('other')
  const addTaskMutation = useMutation({
    mutationFn: () => api.addTask(caseId!, newTaskLabel.trim(), newTaskCategory, currentUser!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-tasks', caseId] })
      setNewTaskLabel('')
    },
  })

  const addOrderMutation = useMutation({
    mutationFn: (item: string) => api.addOrder(caseId!, item, currentUser!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['case-orders', caseId] }),
  })

  const updateOrderMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: OrderStatus }) => api.updateOrderStatus(orderId, status, currentUser!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['case-orders', caseId] }),
  })

  const updateOrderPriceMutation = useMutation({
    mutationFn: ({ orderId, price }: { orderId: string; price: number | undefined }) => api.updateOrderPrice(orderId, price, currentUser!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-orders', caseId] })
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
    },
  })

  const deleteOrderMutation = useMutation({
    mutationFn: (orderId: string) => api.deleteOrder(orderId, currentUser!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-orders', caseId] })
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
    },
  })

  const addGplToQuoteMutation = useMutation({
    mutationFn: (item: { id: string; name: string; price: number }) => api.addGplItemToQuote(caseId!, c!.locationId, item, currentUser!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contracts'] }),
  })

  const adjustLineMutation = useMutation({
    mutationFn: ({ lineItemId, contractId, amount }: { lineItemId: string; contractId: string; amount: number }) =>
      api.updateLineItemAdjustment(lineItemId, contractId, amount, currentUser!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contracts'] }),
  })

  const removeLineMutation = useMutation({
    mutationFn: ({ lineItemId, contractId }: { lineItemId: string; contractId: string }) =>
      api.removeQuoteLineItem(lineItemId, contractId, currentUser!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contracts'] }),
  })

  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const generateLinkMutation = useMutation({
    mutationFn: () => api.createFamilyPortalLink(caseId!, c?.contacts[0]?.id, 90, currentUser!),
    onSuccess: ({ url }) => {
      setGeneratedLink(url)
      setLinkCopied(false)
    },
  })

  const sendForSignatureMutation = useMutation({
    mutationFn: async (documentName: string) => {
      const contact = c?.contacts[0]
      let pdfBlob: Blob | undefined
      if (formPreviewRef.current) {
        const { pdfFromElement } = await import('@/lib/pdfGenerator')
        pdfBlob = await pdfFromElement(formPreviewRef.current)
      }
      return api.createSignatureRequest({
        caseId: caseId!, documentName,
        signerName: contact?.name ?? 'Family Contact',
        signerEmail: contact?.email ?? '',
        sentBy: currentUser!.id,
      }, currentUser!, pdfBlob)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['signature-requests', caseId] }),
  })

  const simulateSignedMutation = useMutation({
    mutationFn: (requestId: string) => api.simulateSignatureComplete(requestId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['signature-requests', caseId] }),
  })

  if (!c) return <div className="text-slate-400 text-sm">Loading case…</div>

  const director = allStaff.find((s) => s.id === c.assignedDirectorId)
  const embalmer = allStaff.find((s) => s.id === c.assignedEmbalmerId)
  const location = allLocations.find((l) => l.id === c.locationId)
  const caseContract = contracts.find((ct) => ct.caseId === c.id)
  const doneCount = tasks.filter((t) => t.status === 'confirmed').length

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !currentUser || !caseId) return
    if (fileInputRef.current) fileInputRef.current.value = ''
    const path = await api.uploadCaseFile(caseId, file, file.name)
    addDocumentMutation.mutate({
      caseId, name: file.name, category: uploadCategory, url: path, uploadedBy: currentUser.id,
    })
  }

  async function handleSaveGenerated(kind: DocTemplate) {
    if (!currentUser || !caseId) return
    let path = ''
    if (formPreviewRef.current) {
      const { pdfFromElement } = await import('@/lib/pdfGenerator')
      const pdfBlob = await pdfFromElement(formPreviewRef.current)
      path = await api.uploadCaseFile(caseId, pdfBlob, `${templateLabels[kind]}.pdf`)
    }
    addDocumentMutation.mutate({
      caseId, name: templateLabels[kind], category: 'authorization', url: path, uploadedBy: currentUser.id,
    })
    setPreviewTemplate(null)
  }

  /** Same save as above, but skips returning to the documents list — goes straight to picking a vendor, since that's the whole point of generating this from a form that's about to go out (First Call → removal company, etc). */
  async function handleSendGeneratedToVendor(kind: DocTemplate) {
    if (!currentUser || !caseId || !formPreviewRef.current) return
    const { pdfFromElement } = await import('@/lib/pdfGenerator')
    const pdfBlob = await pdfFromElement(formPreviewRef.current)
    const path = await api.uploadCaseFile(caseId, pdfBlob, `${templateLabels[kind]}.pdf`)
    const saved = await api.addDocument({
      caseId, name: templateLabels[kind], category: 'authorization', url: path, uploadedBy: currentUser.id,
    }, currentUser)
    queryClient.invalidateQueries({ queryKey: ['case-documents', caseId] })
    setPreviewTemplate(null)
    setSendingDocId(saved.id)
  }

  return (
    <>
    <div className="grid grid-cols-[1fr_280px] gap-6 items-start">
    <div>
      <Link to="/cases" className="no-print inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={15} /> Back to cases
      </Link>

      <div className="no-print flex items-start justify-between mb-1">
        <div>
          <h1 className="text-2xl font-display font-semibold text-slate-900">
            {c.decedent.firstName} {c.decedent.middleName ? c.decedent.middleName + ' ' : ''}{c.decedent.lastName}
          </h1>
          <div className="text-sm text-slate-500 mt-1">
            {c.caseNumber} · {c.type.replace('_', '-')} · {c.disposition}
          </div>
          {linkedFamily && (
            <Link to={`/families/${linkedFamily.id}`} className="inline-flex items-center gap-1 text-xs text-[#3b4a35] hover:underline mt-1">
              <Users2 size={11} /> {linkedFamily.name}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          <CaseStatusBadge status={c.status} />
          {canEdit && (
            <>
              <Link
                to={`/cases/${c.id}/first-call`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-50"
              >
                First Call
              </Link>
              <Link
                to={`/cases/${c.id}/vital-sheet`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-50"
              >
                Vital Sheet
              </Link>
              <Link
                to={`/cases/${c.id}/slideshow`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-50"
              >
                Slideshow
              </Link>
              <Link
                to={`/cases/${c.id}/edit`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-50"
              >
                <Pencil size={12} /> Edit
              </Link>
            </>
          )}
        </div>
      </div>

      {c.fieldDiscrepancies && c.fieldDiscrepancies.length > 0 && (
        <Card className="no-print p-4 mb-5 border-red-300 bg-red-50">
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle size={16} className="text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm font-medium text-red-800">Does not match — the family submitted different information than what's on file</div>
          </div>
          <div className="space-y-2 ml-6">
            {c.fieldDiscrepancies.map((d, i) => (
              <div key={i} className="text-sm text-red-900 flex items-center justify-between gap-3 bg-white rounded-md px-3 py-2 border border-red-100">
                <div>
                  <span className="font-medium">{d.fieldLabel}:</span> on file "{d.existingValue}" — family says "{d.submittedValue}"
                </div>
                {canEdit && (
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => resolveDiscrepancyMutation.mutate({ field: d.field, useValue: d.submittedValue })}
                      className="text-xs font-medium text-emerald-700 border border-emerald-200 rounded-md px-2 py-1 hover:bg-emerald-50"
                    >
                      Use family's answer
                    </button>
                    <button
                      onClick={() => resolveDiscrepancyMutation.mutate({ field: d.field, useValue: null })}
                      className="text-xs font-medium text-slate-600 border border-slate-200 rounded-md px-2 py-1 hover:bg-slate-50"
                    >
                      Keep existing
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tabs */}
      <div className="no-print flex gap-1 border-b border-slate-200 mt-5 mb-5">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setPreviewTemplate(null) }}
            className={`px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab === t ? 'border-[#b3925a] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-5">
            <h3 className="text-sm font-medium text-slate-800 mb-3">Decedent Information</h3>
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <Field label="Date of Birth" value={c.decedent.dateOfBirth ? format(parseISO(c.decedent.dateOfBirth), 'MMM d, yyyy') : '—'} />
              <Field label="Date of Death" value={c.decedent.dateOfDeath ? format(parseISO(c.decedent.dateOfDeath), 'MMM d, yyyy') : '—'} />
              <Field label="Place of Death" value={c.decedent.placeOfDeath ?? '—'} />
              <Field label="Sex" value={c.decedent.sex ?? '—'} />
              <Field label="Marital Status" value={c.decedent.maritalStatus ?? '—'} />
              <Field label="Veteran" value={c.decedent.veteran ? 'Yes' : 'No'} />
            </dl>

            <h3 className="text-sm font-medium text-slate-800 mt-6 mb-3">Assigned Staff</h3>
            <div className="flex gap-6 text-sm">
              <Field label="Funeral Director" value={director?.name ?? 'Unassigned'} />
              <Field label="Embalmer" value={embalmer?.name ?? 'Unassigned'} />
            </div>

            {c.visitationDate && (
              <>
                <h3 className="text-sm font-medium text-slate-800 mt-6 mb-3">Visitation</h3>
                <div className="flex gap-6 text-sm">
                  <Field label="Date & Time" value={format(parseISO(c.visitationDate), 'MMM d, yyyy · h:mm a')} />
                  <Field label="Location" value={c.visitationLocation ?? '—'} />
                </div>
              </>
            )}

            {c.serviceDate && (
              <>
                <h3 className="text-sm font-medium text-slate-800 mt-6 mb-3">Service</h3>
                <div className="flex gap-6 text-sm">
                  <Field label="Date & Time" value={format(parseISO(c.serviceDate), 'MMM d, yyyy · h:mm a')} />
                  <Field label="Location" value={c.serviceLocation ?? '—'} />
                </div>
              </>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-medium text-slate-800 mb-3">Family Contacts</h3>
            <div className="space-y-3">
              {c.contacts.map((ct) => (
                <div key={ct.id} className="text-sm border-b border-slate-50 last:border-0 pb-3 last:pb-0">
                  <div className="font-medium text-slate-900">{ct.name}</div>
                  <div className="text-slate-500">{ct.relationship}{ct.isAuthorizingAgent && ' · Authorizing Agent'}</div>
                  {ct.phone && <div className="text-slate-500">{ct.phone}</div>}
                  {ct.email && <div className="text-slate-500">{ct.email}</div>}
                </div>
              ))}
              {c.contacts.length === 0 && <div className="text-sm text-slate-400">No contacts on file.</div>}
            </div>
            <button
              onClick={() => generateLinkMutation.mutate()}
              disabled={generateLinkMutation.isPending}
              className="mt-4 w-full inline-flex items-center justify-center gap-1.5 text-sm font-medium text-[#3b4a35] border border-slate-200 rounded-md py-2 hover:bg-slate-50 transition disabled:opacity-60"
            >
              <Link2 size={14} /> {generateLinkMutation.isPending ? 'Generating…' : 'Generate Family Portal Link'}
            </button>
            {generatedLink && (
              <div className="mt-3 flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-md px-2.5 py-2">
                <input readOnly value={generatedLink} className="flex-1 min-w-0 bg-transparent text-xs text-slate-600 focus:outline-none" />
                <button
                  onClick={() => { navigator.clipboard.writeText(generatedLink); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000) }}
                  className="shrink-0 text-slate-500 hover:text-slate-700"
                  title="Copy link"
                >
                  {linkCopied ? <CheckIcon size={14} className="text-emerald-600" /> : <Copy size={14} />}
                </button>
              </div>
            )}
            {generateLinkMutation.isError && (
              <div className="mt-2 text-xs text-red-600">
                Couldn't generate a link: {generateLinkMutation.error instanceof Error ? generateLinkMutation.error.message : 'Unknown error'}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'Tasks' && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-800">Checklist</h3>
            <span className="text-xs text-slate-500">{doneCount} of {tasks.length} complete</span>
          </div>
          {canEdit && (
            <div className="flex gap-2 mb-4">
              <input
                value={newTaskLabel}
                onChange={(e) => setNewTaskLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && newTaskLabel.trim() && addTaskMutation.mutate()}
                placeholder="Add a task…"
                className="flex-1 border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]"
              />
              <select
                value={newTaskCategory}
                onChange={(e) => setNewTaskCategory(e.target.value as CaseTask['category'])}
                className="border border-slate-200 rounded-md px-2 py-2 text-sm"
              >
                {(Object.keys(taskCategoryLabels) as CaseTask['category'][]).map((cat) => (
                  <option key={cat} value={cat}>{taskCategoryLabels[cat]}</option>
                ))}
              </select>
              <button
                onClick={() => newTaskLabel.trim() && addTaskMutation.mutate()}
                disabled={!newTaskLabel.trim() || addTaskMutation.isPending}
                className="shrink-0 bg-[#3b4a35] text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-[#4d5f45] disabled:opacity-50"
              >
                <Plus size={15} />
              </button>
            </div>
          )}
          {tasks.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-6">No tasks yet.</div>
          ) : (
            <div className="space-y-5">
              {(Object.keys(taskCategoryLabels) as CaseTask['category'][]).map((cat) => {
                const catTasks = tasks.filter((t) => t.category === cat)
                if (catTasks.length === 0) return null
                return (
                  <div key={cat}>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{taskCategoryLabels[cat]}</div>
                    <div className="space-y-1">
                      {catTasks.map((t) => {
                        const isOverdue = t.status !== 'confirmed' && t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10)
                        return (
                          <div key={t.id} className={`flex items-center gap-3 px-2 py-2 rounded-md text-sm ${isOverdue ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
                            <div className="min-w-0 flex-1">
                              <span className={t.status === 'confirmed' ? 'text-slate-400 line-through' : isOverdue ? 'text-red-800 font-medium' : 'text-slate-800'}>
                                {t.label}
                              </span>
                              {t.linkedOrderId && <span className="text-[10px] text-slate-400 ml-1.5">(from Orders)</span>}
                              {t.dueDate && (
                                <span className={`text-xs ml-2 ${isOverdue ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
                                  {isOverdue ? 'Overdue — ' : ''}{format(parseISO(t.dueDate), 'MMM d')}
                                </span>
                              )}
                            </div>
                            {canEdit ? (
                              <div className="flex gap-1 shrink-0">
                                {(['pending', 'ordered', 'delivered', 'confirmed'] as TaskStatus[]).map((s) => (
                                  <button
                                    key={s}
                                    onClick={() => updateTaskStatusMutation.mutate({ taskId: t.id, status: s })}
                                    className={`text-[10px] font-medium px-2 py-1 rounded-full transition ${
                                      t.status === s ? orderStatusStyles[s] : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                                    }`}
                                  >
                                    {TASK_STATUS_LABELS[s]}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <span className={`text-[10px] font-medium px-2 py-1 rounded-full shrink-0 ${orderStatusStyles[t.status]}`}>
                                {TASK_STATUS_LABELS[t.status]}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {tab === 'Orders' && (
        <div className="space-y-5">
          {canEdit && (
            <Card className="p-4">
              <h3 className="text-sm font-medium text-slate-800 mb-3">Add an Order</h3>
              <div className="flex flex-wrap gap-2">
                {commonOrderItems.map((item) => (
                  <button
                    key={item}
                    onClick={() => addOrderMutation.mutate(item)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 border border-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-50"
                  >
                    <Plus size={12} /> {item}
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-5">
            {orders.length === 0 ? (
              <div className="text-sm text-slate-400 text-center py-10 flex flex-col items-center gap-2">
                <Truck size={22} className="text-slate-300" />
                No orders tracked yet — flowers, doves, carriage, escorts, etc.
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  {orders.map((o) => (
                    <div key={o.id} className="flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-slate-50 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="text-slate-800">{o.item}</div>
                        {o.confirmedAt && (
                          <div className="text-xs text-slate-400">Confirmed {format(parseISO(o.confirmedAt), 'MMM d, h:mm a')}</div>
                        )}
                        {o.orderedAt && !o.confirmedAt && (
                          <div className="text-xs text-slate-400">Ordered {format(parseISO(o.orderedAt), 'MMM d, h:mm a')}</div>
                        )}
                      </div>
                      {canEdit ? (
                        <div className="relative shrink-0">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={o.price ?? ''}
                            placeholder="0.00"
                            onBlur={(e) => {
                              const val = e.target.value.trim()
                              const price = val ? Number(val) : undefined
                              if (price !== o.price) updateOrderPriceMutation.mutate({ orderId: o.id, price })
                            }}
                            className="w-24 pl-5 pr-2 py-1 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#b3925a]"
                          />
                        </div>
                      ) : (
                        o.price !== undefined && <span className="text-xs text-slate-500 shrink-0">{formatCurrency(o.price)}</span>
                      )}
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full capitalize shrink-0 ${orderStatusStyles[o.status]}`}>
                        {o.status === 'pending' && <Clock size={11} />}
                        {o.status === 'confirmed' && <CheckCircle2 size={11} />}
                        {o.status}
                      </span>
                      {canEdit && (
                        <div className="flex gap-1.5 shrink-0">
                          {o.status !== 'confirmed' && o.status === 'pending' && (
                            <button
                              onClick={() => updateOrderMutation.mutate({ orderId: o.id, status: 'ordered' })}
                              className="text-xs font-medium text-amber-700 border border-amber-200 rounded-md px-2 py-1 hover:bg-amber-50"
                            >
                              Mark Ordered
                            </button>
                          )}
                          {o.status !== 'confirmed' && (
                            <button
                              onClick={() => updateOrderMutation.mutate({ orderId: o.id, status: 'confirmed' })}
                              className="text-xs font-medium text-emerald-700 border border-emerald-200 rounded-md px-2 py-1 hover:bg-emerald-50"
                            >
                              Mark Confirmed
                            </button>
                          )}
                          <button
                            onClick={() => { if (confirm(`Remove "${o.item}" from this case's orders?`)) deleteOrderMutation.mutate(o.id) }}
                            title="Remove this order — for when the family decides against it"
                            className="text-slate-400 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-md px-2 py-1"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {orders.some((o) => o.price !== undefined) && (
                  <div className="border-t border-slate-100 mt-3 pt-3 px-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">Quote Total</span>
                      <span className="text-base font-semibold text-slate-900">
                        {formatCurrency(orders.reduce((sum, o) => sum + (o.price ?? 0), 0))}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1">Priced orders are kept in sync with the Quote below automatically.</div>
                  </div>
                )}
              </>
            )}
          </Card>

          <QuoteBuilder
            caseObj={c}
            contract={caseContract}
            gplItems={gplItems}
            canEdit={canEdit}
            currentUser={currentUser!}
            onAddGplItem={(item) => addGplToQuoteMutation.mutate(item)}
            onAdjustLine={(lineItemId, amount) => caseContract && adjustLineMutation.mutate({ lineItemId, contractId: caseContract.id, amount })}
            onRemoveLine={(lineItemId) => caseContract && removeLineMutation.mutate({ lineItemId, contractId: caseContract.id })}
          />
        </div>
      )}

      {tab === 'Notes' && (
        <Card className="p-5">
          {canEdit && (
            <div className="mb-5 pb-5 border-b border-slate-100">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={3}
                placeholder="Add a note about this case…"
                className="w-full border border-slate-200 rounded-md p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a] resize-none"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => noteText.trim() && addNoteMutation.mutate(noteText.trim())}
                  disabled={!noteText.trim() || addNoteMutation.isPending}
                  className="text-sm font-medium bg-[#3b4a35] text-white rounded-md px-4 py-1.5 hover:bg-[#4d5f45] transition disabled:opacity-50"
                >
                  Add Note
                </button>
              </div>
            </div>
          )}
          <div className="space-y-4">
            {notes.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)).map((n) => (
              <div key={n.id} className="border-b border-slate-50 last:border-0 pb-4 last:pb-0">
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                  {n.pinned && <Pin size={12} className="text-amber-500" />}
                  <span className="font-medium text-slate-700">{n.authorName}</span>
                  <span>· {format(parseISO(n.createdAt), 'MMM d, h:mm a')}</span>
                </div>
                <p className="text-sm text-slate-800">{n.body}</p>
              </div>
            ))}
            {notes.length === 0 && <div className="text-sm text-slate-400 text-center py-6">No notes yet.</div>}
          </div>
        </Card>
      )}

      {tab === 'Documents' && !previewTemplate && (
        <div className="space-y-5">
          {canEdit && (
            <Card className="p-4">
              <h3 className="text-sm font-medium text-slate-800 mb-3">Add a Document</h3>
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value as CaseDocument['category'])}
                  className="border border-slate-200 rounded-md px-2.5 py-1.5 text-sm"
                >
                  {Object.entries(docCategoryLabels).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-md px-3 py-1.5 hover:bg-slate-50"
                >
                  <Upload size={13} /> Upload File
                </button>
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} />
                <span className="text-xs text-slate-400">Stored in-session only until Supabase Storage is connected</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setPreviewTemplate('release')}
                  className="text-xs font-medium text-slate-600 border border-slate-200 rounded-md px-3 py-1.5 hover:bg-slate-50"
                >
                  Generate: {templateLabels.release}
                </button>
                <button
                  onClick={() => setPreviewTemplate('embalming')}
                  className="text-xs font-medium text-slate-600 border border-slate-200 rounded-md px-3 py-1.5 hover:bg-slate-50"
                >
                  Generate: {templateLabels.embalming}
                </button>
                <button
                  onClick={() => setPreviewTemplate('preneed')}
                  className="text-xs font-medium text-slate-600 border border-slate-200 rounded-md px-3 py-1.5 hover:bg-slate-50"
                >
                  Generate: {templateLabels.preneed}
                </button>
                <button
                  onClick={() => setPreviewTemplate('first_call')}
                  className="text-xs font-medium text-slate-600 border border-slate-200 rounded-md px-3 py-1.5 hover:bg-slate-50"
                >
                  Generate: {templateLabels.first_call}
                </button>
                <button
                  onClick={() => setPreviewTemplate('vital_sheet')}
                  className="text-xs font-medium text-slate-600 border border-slate-200 rounded-md px-3 py-1.5 hover:bg-slate-50"
                >
                  Generate: {templateLabels.vital_sheet}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Death Certificate Control Form isn't wired up yet — that source document wasn't provided.
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                To send a document for signature, generate it above first — "Send for Signature" appears in the preview.
              </p>
            </Card>
          )}

          {signatureRequests.length > 0 && (
            <Card className="p-4">
              <h3 className="text-sm font-medium text-slate-800 mb-3">Signature Requests</h3>
              <div className="space-y-2">
                {signatureRequests.map((sig) => (
                  <div key={sig.id} className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-slate-50 text-sm">
                    <FileSignature size={15} className="text-slate-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-slate-800">{sig.documentName}</div>
                      <div className="text-xs text-slate-400">
                        To {sig.signerName}{sig.sentAt && ` · Sent ${format(parseISO(sig.sentAt), 'MMM d, h:mm a')}`}
                        {sig.signedAt && ` · Signed ${format(parseISO(sig.signedAt), 'MMM d, h:mm a')}`}
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                      sig.status === 'signed' ? 'bg-emerald-100 text-emerald-800'
                        : sig.status === 'declined' || sig.status === 'expired' ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {sig.status}
                    </span>
                    {canEdit && sig.status === 'sent' && (
                      <button
                        onClick={() => simulateSignedMutation.mutate(sig.id)}
                        className="text-xs font-medium text-slate-500 border border-slate-200 rounded-md px-2 py-1 hover:bg-slate-50"
                      >
                        Simulate Signed (demo)
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-5">
            {documents.length === 0 ? (
              <div className="text-sm text-slate-400 text-center py-10 flex flex-col items-center gap-2">
                <FileText size={22} className="text-slate-300" />
                No documents yet.
              </div>
            ) : (
              <div className="space-y-1">
                {documents.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-slate-50 text-sm">
                    <FileText size={16} className="text-slate-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-slate-800 truncate">{d.name}</div>
                      <div className="text-xs text-slate-400">{docCategoryLabels[d.category]} · {format(parseISO(d.uploadedAt), 'MMM d, yyyy h:mm a')}</div>
                    </div>
                    {d.url && (
                      <button
                        onClick={async () => window.open(await api.getDocumentSignedUrl(d.url), '_blank')}
                        className="text-xs font-medium text-[#3b4a35] hover:underline px-2"
                      >
                        View
                      </button>
                    )}
                    {canEdit && vendors.length > 0 && (
                      <button
                        onClick={() => setSendingDocId(d.id)}
                        title="Send to Vendor"
                        className="text-slate-400 hover:text-[#3b4a35] p-1"
                      >
                        <Send size={14} />
                      </button>
                    )}
                    {canEdit && (
                      <button onClick={() => deleteDocumentMutation.mutate(d.id)} className="text-slate-300 hover:text-red-500 p-1">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'Documents' && previewTemplate && !location && (
        <Card className="p-5 border-amber-300 bg-amber-50">
          <div className="text-sm text-amber-800 font-medium mb-2">Couldn't load this case's location details.</div>
          <div className="text-xs text-amber-700 font-mono space-y-1">
            <div>Case's locationId: {c.locationId || '(empty)'}</div>
            <div>Locations loaded: {allLocations.length}</div>
            <div>Available location IDs: {allLocations.map((l) => l.id).join(', ') || '(none)'}</div>
          </div>
          <button onClick={() => setPreviewTemplate(null)} className="mt-3 text-sm text-amber-700 underline">
            ← Back to documents
          </button>
        </Card>
      )}

      {tab === 'Documents' && previewTemplate && location && (
        <div>
          <div className="no-print flex items-center justify-between mb-4">
            <button onClick={() => setPreviewTemplate(null)} className="text-sm text-slate-500 hover:text-slate-800">
              ← Back to documents
            </button>
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 bg-[#3b4a35] text-white text-sm font-medium px-3.5 py-2 rounded-md hover:bg-[#4d5f45] transition">
                <Printer size={15} /> Print
              </button>
              <button onClick={() => handleSaveGenerated(previewTemplate)} className="text-sm font-medium text-slate-600 border border-slate-200 rounded-md px-3.5 py-2 hover:bg-slate-50">
                Save to Documents
              </button>
              {vendors.length > 0 && (
                <button
                  onClick={() => handleSendGeneratedToVendor(previewTemplate)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-md px-3.5 py-2 hover:bg-slate-50"
                >
                  <Send size={15} /> Send to Vendor
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => sendForSignatureMutation.mutate(templateLabels[previewTemplate])}
                  disabled={sendForSignatureMutation.isPending || !c.contacts[0]?.email}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#3b4a35] border border-[#3b4a35]/30 rounded-md px-3.5 py-2 hover:bg-[#3b4a35]/5 disabled:opacity-40"
                  title={!c.contacts[0]?.email ? 'Add an email to the primary contact first' : undefined}
                >
                  <FileSignature size={15} /> {sendForSignatureMutation.isPending ? 'Sending…' : 'Send for Signature'}
                </button>
              )}
            </div>
          </div>
          {!c.contacts[0]?.email && (
            <p className="no-print text-xs text-amber-600 mb-3 text-right">Add an email address to the primary contact before sending for signature.</p>
          )}
          {sendForSignatureMutation.isError && (
            <div className="no-print text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2 mb-3">
              Couldn't send for signature: {sendForSignatureMutation.error instanceof Error ? sendForSignatureMutation.error.message : 'Unknown error'}
            </div>
          )}
          {sendForSignatureMutation.isSuccess && (
            <div className="no-print text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-3 py-2 mb-3">
              Sent successfully — check the Signature Requests list below the Documents tab.
            </div>
          )}
          <div className="print-target" ref={formPreviewRef}>
            <Card className="p-8 max-w-2xl">
              {previewTemplate === 'release' && <ReleaseAuthorizationForm c={c} />}
              {previewTemplate === 'embalming' && <EmbalmingAuthorizationForm c={c} />}
              {previewTemplate === 'preneed' && <PreneedDisclosureForm c={c} locationLicense={location.licenseNumber ?? ''} />}
              {previewTemplate === 'first_call' && <FirstCallForm c={c} />}
              {previewTemplate === 'vital_sheet' && <VitalSheetForm c={c} />}
            </Card>
          </div>
        </div>
      )}

      {tab === 'Emails' && (
        <Card className="p-5">
          {caseEmails.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-10 flex flex-col items-center gap-2">
              <Mail size={22} className="text-slate-300" />
              No emails matched to this case yet.
            </div>
          ) : (
            <div className="space-y-1">
              {caseEmails.map((email) => (
                <div key={email.id} className="flex items-start gap-3 px-2 py-2.5 rounded-md hover:bg-slate-50 text-sm">
                  <Mail size={16} className="text-slate-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{email.fromName ?? email.from}</span>
                      {email.attachments.length > 0 && <Paperclip size={12} className="text-slate-400" />}
                    </div>
                    <div className="text-slate-800">{email.subject}</div>
                    <div className="text-slate-500 text-xs truncate">{email.preview}</div>
                  </div>
                  <div className="text-xs text-slate-400 whitespace-nowrap">{format(parseISO(email.receivedAt), 'MMM d, h:mm a')}</div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-4 pt-3 border-t border-slate-100">
            Synced from info@casillasfuneralhome.com. Unmatched or uncertain emails are held for review in the Email Inbox screen rather than filed here automatically.
          </p>
        </Card>
      )}

      {tab === 'Financials' && (
        <Card className="p-5">
          {caseContract ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-slate-800">Contract</h3>
                <span className="text-xs text-slate-500 capitalize">{caseContract.status}</span>
              </div>
              <table className="w-full text-sm mb-4">
                <tbody>
                  {caseContract.lineItems.map((li) => (
                    <tr key={li.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 text-slate-700">{li.name}</td>
                      <td className="py-2 text-slate-500 text-right w-16">×{li.quantity}</td>
                      <td className="py-2 text-slate-900 text-right w-28">{formatCurrency(li.unitPrice * li.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end text-sm space-y-1 flex-col items-end">
                <div className="text-slate-500">Subtotal: {formatCurrency(caseContract.subtotal)}</div>
                <div className="text-slate-500">Tax: {formatCurrency(caseContract.taxTotal)}</div>
                <div className="font-semibold text-slate-900 text-base">Total: {formatCurrency(caseContract.total)}</div>
                <div className="text-emerald-600">Paid: {formatCurrency(caseContract.amountPaid)}</div>
                <div className="text-red-500">Balance: {formatCurrency(caseContract.total - caseContract.amountPaid)}</div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-400 text-center py-10">No contract created yet for this case.</div>
          )}
        </Card>
      )}
    </div>
    <div className="no-print">
      <ActivityPanel caseId={caseId} title="Case Activity" />
    </div>
    </div>

    {sendingDocId && (
      <SendToVendorModal
        docName={documents.find((d) => d.id === sendingDocId)?.name ?? ''}
        docPath={documents.find((d) => d.id === sendingDocId)?.url ?? ''}
        vendors={vendors}
        suggestedCategory={suggestVendorCategory(documents.find((d) => d.id === sendingDocId)?.name)}
        onCancel={() => setSendingDocId(null)}
      />
    )}
    </>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400 capitalize">{label}</dt>
      <dd className="text-slate-800 capitalize">{value}</dd>
    </div>
  )
}

function SendToVendorModal({
  docName, docPath, vendors, suggestedCategory, onCancel,
}: {
  docName: string
  docPath: string
  vendors: Vendor[]
  suggestedCategory?: VendorCategory
  onCancel: () => void
}) {
  const [vendorId, setVendorId] = useState<string | null>(null)
  const [method, setMethod] = useState<'email' | 'text'>('email')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sortedVendors = suggestedCategory
    ? [...vendors].sort((a, b) => (a.category === suggestedCategory ? -1 : 0) - (b.category === suggestedCategory ? -1 : 0))
    : vendors
  const vendor = vendors.find((v) => v.id === vendorId)
  const canSend = vendor && (method === 'email' ? !!vendor.email : !!vendor.phone)

  async function handleSend() {
    if (!vendor) return
    setSending(true)
    setError(null)
    try {
      const link = await api.getDocumentSignedUrl(docPath)
      if (method === 'email') {
        const subject = `${docName} — from Casillas Funeral Home`
        const body = `Hello,\n\nPlease find the document "${docName}" here (link expires in 7 days):\n${link}\n\nThank you,\nCasillas Funeral Home`
        window.location.href = `mailto:${vendor.email ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      } else {
        await api.notifyFamilySms(vendor.phone!, `This is Casillas Funeral Home. Please see "${docName}" here: ${link}`)
      }
      onCancel()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate a link for this document.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <Card className="p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-slate-800">Send to Vendor</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          {docName} — a working link to this document (7-day access), not an attachment; the vendor clicks it to get the file.
        </p>
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setMethod('email')}
            className={`flex-1 text-xs font-medium px-2.5 py-1.5 rounded-md border ${method === 'email' ? 'bg-[#3b4a35] text-white border-[#3b4a35]' : 'text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            Email
          </button>
          <button
            onClick={() => setMethod('text')}
            className={`flex-1 text-xs font-medium px-2.5 py-1.5 rounded-md border ${method === 'text' ? 'bg-[#3b4a35] text-white border-[#3b4a35]' : 'text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            Text
          </button>
        </div>
        <div className="space-y-1 max-h-56 overflow-y-auto border border-slate-100 rounded-md mb-4">
          {sortedVendors.map((v) => (
            <button
              key={v.id}
              onClick={() => setVendorId(v.id)}
              className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${vendorId === v.id ? 'bg-[#3b4a35]/10' : 'hover:bg-slate-50'}`}
            >
              <span>
                <span className="text-slate-800">{v.name}</span>
                <span className="text-slate-400 ml-2 text-xs capitalize">{v.category.replace('_', ' ')}</span>
                {v.category === suggestedCategory && (
                  <span className="ml-2 text-[10px] font-medium text-[#3b4a35] bg-[#3b4a35]/10 rounded-full px-1.5 py-0.5">Suggested</span>
                )}
              </span>
              {method === 'email' && !v.email && <span className="text-[10px] text-amber-600">no email on file</span>}
              {method === 'text' && !v.phone && <span className="text-[10px] text-amber-600">no phone on file</span>}
            </button>
          ))}
        </div>
        {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2 mb-3">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="text-sm font-medium text-slate-600 border border-slate-200 rounded-md px-3.5 py-2 hover:bg-slate-50">Cancel</button>
          <button
            onClick={handleSend}
            disabled={!canSend || sending}
            className="text-sm font-medium bg-[#3b4a35] text-white rounded-md px-3.5 py-2 hover:bg-[#4d5f45] disabled:opacity-50"
          >
            {sending ? 'Sending…' : method === 'email' ? 'Open Email' : 'Send Text'}
          </button>
        </div>
      </Card>
    </div>
  )
}
