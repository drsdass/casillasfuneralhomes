import {
  staff, cases, contracts, custodyLog, caseTasks, caseNotes,
  vehicles, calendarEvents, gplItems, inboundEmails, signatureRequests,
} from './mockData'
import { TASK_STATUS_LABELS } from '@/types'
import type {
  StaffMember, FuneralCase, Contract, CustodyLogEntry, CustodyStage, UserRole,
  CaseTask, CaseNote, CaseDocument, Vehicle, CalendarEvent, SchedulingConflict,
  Payment, PaymentMethod, GplItem, AuditLogEntry, ServiceOrder, OrderStatus, ContractLineItem,
  InboundEmail, EmailMatchStatus, SignatureRequest, SignatureRequestStatus, StaffTimeOff, ChatMessage, ChatConversation,
  Family, FamilyInteraction, Vendor, TaskTemplate, TaskStatus,
} from '@/types'

// ---------------------------------------------------------------------------
// In-memory mutable store, seeded from the static mock data. This simulates
// a backend for the local demo so that every write action in the UI — case
// creation/edits, task/note updates, document uploads, scheduling, custody
// moves, invoice payments, role/access changes — actually sticks during the
// session, and every one of those writes is mirrored into an audit log.
//
// IMPORTANT: this resets on every page reload and is NOT shared between
// browser tabs or users. Once Supabase is connected (see README), api.ts
// should call real mutations against Postgres instead of this module.
// ---------------------------------------------------------------------------

let staffStore: StaffMember[] = staff.map((s) => ({ ...s }))
let caseStore: FuneralCase[] = cases.map((c) => ({ ...c }))
let contractStore: Contract[] = contracts.map((c) => ({ ...c }))
let custodyLogStore: CustodyLogEntry[] = custodyLog.map((c) => ({ ...c }))
let taskStore: CaseTask[] = caseTasks.map((t) => ({ ...t }))
let taskTemplateStore: TaskTemplate[] = [
  { id: 'tt-1', orgId: 'org-1', label: 'Obtain death certificate', category: 'documents', daysUntilDue: 5, sortOrder: 1, active: true },
  { id: 'tt-2', orgId: 'org-1', label: 'Confirm disposition authorization', category: 'permits', daysUntilDue: 2, sortOrder: 2, active: true },
  { id: 'tt-3', orgId: 'org-1', label: 'Schedule arrangement conference', category: 'family', daysUntilDue: 1, sortOrder: 3, active: true },
  { id: 'tt-4', orgId: 'org-1', label: 'Select merchandise', category: 'merchandise', daysUntilDue: 3, sortOrder: 4, active: true },
]
let noteStore: CaseNote[] = caseNotes.map((n) => ({ ...n }))
let documentStore: CaseDocument[] = []
let vehicleStore: Vehicle[] = vehicles.map((v) => ({ ...v }))
let eventStore: CalendarEvent[] = calendarEvents.map((e) => ({ ...e }))
let gplStore: GplItem[] = gplItems.map((g) => ({ ...g }))
let paymentStore: Payment[] = []
let auditLogStore: AuditLogEntry[] = []
let orderStore: ServiceOrder[] = []
let timeOffStore: StaffTimeOff[] = [
  { id: 'to-1', staffId: 'stf-hector-salas', startDate: '2026-07-21', endDate: '2026-07-25', type: 'vacation', createdBy: 'stf-joe-galvan' },
]
let chatMessageStore: ChatMessage[] = []
let chatConversationStore: { id: string; name?: string; isGroup: boolean; createdBy: string; createdAt: string }[] = []
let chatParticipantStore: { conversationId: string; staffId: string; lastReadAt?: string }[] = []
let familyStore: Family[] = [
  { id: 'fam-1', orgId: 'org-1', name: 'The Bennett Family', primaryContactName: 'Karen Bennett', primaryContactPhone: '(760) 555-0142', notes: 'Prefers phone calls over email. Catholic.', createdAt: '2026-07-09T00:00:00Z' },
]
let familyInteractionStore: FamilyInteraction[] = []
let vendorStore: Vendor[] = [
  { id: 'ven-1', orgId: 'org-1', name: 'Valley Removal Service', category: 'removal_company', phone: '(760) 555-0100', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'ven-2', orgId: 'org-1', name: 'Desert Cremation Services', category: 'crematory', phone: '(760) 555-0101', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'ven-3', orgId: 'org-1', name: "Damara's Flowers", category: 'florist', phone: '(760) 555-0102', createdAt: '2026-01-01T00:00:00Z' },
]
let emailStore: InboundEmail[] = inboundEmails.map((e) => ({ ...e }))
let signatureRequestStore: SignatureRequest[] = signatureRequests.map((s) => ({ ...s }))

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

/** Best-guess task category from an order's item name — a sort/grouping hint, not a hard rule. Shared with the real api.ts implementation. */
function suggestTaskCategory(itemName: string): CaseTask['category'] {
  const n = itemName.toLowerCase()
  if (/flower|casket|urn|dove|bird/.test(n)) return 'merchandise'
  if (/escort|carriage|limo|vehicle/.test(n)) return 'transport'
  return 'other'
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd
}

function logAudit(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) {
  auditLogStore = [...auditLogStore, { ...entry, id: newId('audit'), timestamp: new Date().toISOString() }]
}

export const mockStore = {
  // -----------------------------------------------------------------
  // Staff / roles / access
  // -----------------------------------------------------------------
  getStaff: (): StaffMember[] => staffStore,

  updateStaffRole(staffId: string, role: UserRole, changedBy: StaffMember): StaffMember[] {
    const target = staffStore.find((s) => s.id === staffId)
    staffStore = staffStore.map((s) => (s.id === staffId ? { ...s, role } : s))
    logAudit({
      entityType: 'staff', entityId: staffId, action: 'update',
      summary: `Changed ${target?.name ?? staffId}'s role to ${role}`,
      changedBy: changedBy.id, changedByName: changedBy.name,
    })
    return staffStore
  },

  /** Toggle whether a staff member has access to a given location. */
  updateStaffLocations(staffId: string, locationIds: string[], changedBy: StaffMember): StaffMember[] {
    const target = staffStore.find((s) => s.id === staffId)
    staffStore = staffStore.map((s) => (s.id === staffId ? { ...s, locationIds } : s))
    logAudit({
      entityType: 'staff', entityId: staffId, action: 'update',
      summary: `Updated ${target?.name ?? staffId}'s location access`,
      changedBy: changedBy.id, changedByName: changedBy.name,
    })
    return staffStore
  },

  /** Toggle whether a staff member has a given feature explicitly disabled (overriding their role default). */
  updateStaffFeatures(staffId: string, disabledFeatures: string[], changedBy: StaffMember): StaffMember[] {
    const target = staffStore.find((s) => s.id === staffId)
    staffStore = staffStore.map((s) => (s.id === staffId ? { ...s, disabledFeatures } : s))
    logAudit({
      entityType: 'staff', entityId: staffId, action: 'update',
      summary: `Updated ${target?.name ?? staffId}'s feature access`,
      changedBy: changedBy.id, changedByName: changedBy.name,
    })
    return staffStore
  },

  createStaffMember(
    input: { name: string; email: string; role: UserRole; title?: string; department?: string; phone?: string; locationIds: string[] },
    changedBy: StaffMember
  ): { tempPassword: string } {
    const newStaff: StaffMember = {
      id: newId('staff'), orgId: changedBy.orgId, locationIds: input.locationIds,
      name: input.name, email: input.email, role: input.role,
      title: input.title, department: input.department, phone: input.phone,
      avatarColor: '#5f6f4f', active: true,
    }
    staffStore = [...staffStore, newStaff]
    logAudit({
      entityType: 'staff', entityId: newStaff.id, action: 'create',
      summary: `Added new staff member: ${input.name} (${input.role.replace('_', ' ')})`,
      changedBy: changedBy.id, changedByName: changedBy.name,
    })
    return { tempPassword: 'ChangeMe123!' }
  },

  // -----------------------------------------------------------------
  // Cases
  // -----------------------------------------------------------------
  getCases: (): FuneralCase[] => caseStore,

  getCase: (id: string): FuneralCase | undefined => caseStore.find((c) => c.id === id),

  createCase(input: Omit<FuneralCase, 'id' | 'createdAt' | 'updatedAt'>, changedBy: StaffMember): FuneralCase {
    const now = new Date().toISOString()
    const newCase: FuneralCase = { ...input, id: newId('case'), createdAt: now, updatedAt: now }
    caseStore = [newCase, ...caseStore]
    logAudit({
      entityType: 'case', entityId: newCase.id, caseId: newCase.id, action: 'create',
      summary: `Created case for ${newCase.decedent.firstName} ${newCase.decedent.lastName}`,
      changedBy: changedBy.id, changedByName: changedBy.name,
    })
    this.seedTasksFromTemplates(newCase.id)
    return newCase
  },

  updateCase(id: string, patch: Partial<FuneralCase>, changedBy: StaffMember): FuneralCase | undefined {
    let updated: FuneralCase | undefined
    caseStore = caseStore.map((c) => {
      if (c.id !== id) return c
      updated = { ...c, ...patch, updatedAt: new Date().toISOString() }
      return updated
    })
    if (updated) {
      logAudit({
        entityType: 'case', entityId: id, caseId: id, action: 'update',
        summary: `Updated case ${updated.caseNumber}`,
        changedBy: changedBy.id, changedByName: changedBy.name,
      })
    }
    return updated
  },

  // -----------------------------------------------------------------
  // Tasks
  // -----------------------------------------------------------------
  getCaseTasks: (caseId: string): CaseTask[] => taskStore.filter((t) => t.caseId === caseId),

  getOverdueTasks(): Array<CaseTask & { decedentName: string; caseNumber: string }> {
    const today = new Date().toISOString().slice(0, 10)
    return taskStore
      .filter((t) => t.status !== 'confirmed' && t.dueDate && t.dueDate < today)
      .map((t) => {
        const c = caseStore.find((c) => c.id === t.caseId)
        return { ...t, decedentName: c ? `${c.decedent.firstName} ${c.decedent.lastName}` : 'Unknown', caseNumber: c?.caseNumber ?? '' }
      })
      .filter((t) => caseStore.find((c) => c.id === t.caseId)?.status !== 'completed')
  },

  updateTaskStatus(taskId: string, status: TaskStatus, changedBy: StaffMember): CaseTask[] {
    const task = taskStore.find((t) => t.id === taskId)
    taskStore = taskStore.map((t) => (t.id === taskId ? { ...t, status } : t))
    if (task) {
      logAudit({
        entityType: 'task', entityId: taskId, caseId: task.caseId, action: 'status_change',
        summary: `Marked task "${task.label}" as ${TASK_STATUS_LABELS[status]}`,
        changedBy: changedBy.id, changedByName: changedBy.name,
      })
    }
    return taskStore
  },

  addTask(caseId: string, label: string, category: CaseTask['category'], changedBy: StaffMember): CaseTask {
    const task: CaseTask = { id: newId('task'), caseId, label, category, status: 'pending' }
    taskStore = [...taskStore, task]
    logAudit({
      entityType: 'task', entityId: task.id, caseId, action: 'create',
      summary: `Added task "${label}"`,
      changedBy: changedBy.id, changedByName: changedBy.name,
    })
    return task
  },

  // -----------------------------------------------------------------
  // Task templates
  // -----------------------------------------------------------------
  getTaskTemplates: (): TaskTemplate[] => taskTemplateStore,

  createTaskTemplate(input: Omit<TaskTemplate, 'id'>, changedBy: StaffMember): TaskTemplate {
    const t: TaskTemplate = { ...input, id: newId('tt') }
    taskTemplateStore = [...taskTemplateStore, t]
    logAudit({ entityType: 'task', entityId: t.id, action: 'create', summary: `Added task template "${input.label}"`, changedBy: changedBy.id, changedByName: changedBy.name })
    return t
  },

  updateTaskTemplate(id: string, patch: Partial<TaskTemplate>, changedBy: StaffMember): TaskTemplate {
    let updated: TaskTemplate | undefined
    taskTemplateStore = taskTemplateStore.map((t) => (t.id === id ? (updated = { ...t, ...patch }) : t))
    if (updated) logAudit({ entityType: 'task', entityId: id, action: 'update', summary: `Updated task template "${updated.label}"`, changedBy: changedBy.id, changedByName: changedBy.name })
    return updated!
  },

  deleteTaskTemplate(id: string, changedBy: StaffMember): void {
    const t = taskTemplateStore.find((x) => x.id === id)
    taskTemplateStore = taskTemplateStore.filter((x) => x.id !== id)
    if (t) logAudit({ entityType: 'task', entityId: id, action: 'delete', summary: `Removed task template "${t.label}"`, changedBy: changedBy.id, changedByName: changedBy.name })
  },

  seedTasksFromTemplates(caseId: string): void {
    const now = new Date()
    const newTasks: CaseTask[] = taskTemplateStore.filter((t) => t.active).map((t) => ({
      id: newId('task'), caseId, label: t.label, category: t.category, status: 'pending',
      dueDate: t.daysUntilDue != null ? new Date(now.getTime() + t.daysUntilDue * 86_400_000).toISOString().slice(0, 10) : undefined,
    }))
    taskStore = [...taskStore, ...newTasks]
  },

  // -----------------------------------------------------------------
  // Notes
  // -----------------------------------------------------------------
  getCaseNotes: (caseId: string): CaseNote[] => noteStore.filter((n) => n.caseId === caseId),

  addNote(caseId: string, author: StaffMember, body: string): CaseNote {
    const note: CaseNote = {
      id: newId('note'), caseId, authorId: author.id, authorName: author.name,
      body, createdAt: new Date().toISOString(),
    }
    noteStore = [...noteStore, note]
    logAudit({
      entityType: 'note', entityId: note.id, caseId, action: 'create',
      summary: 'Added a note',
      changedBy: author.id, changedByName: author.name,
    })
    return note
  },

  // -----------------------------------------------------------------
  // Documents
  // -----------------------------------------------------------------
  getCaseDocuments: (caseId: string): CaseDocument[] => documentStore.filter((d) => d.caseId === caseId),

  addDocument(doc: Omit<CaseDocument, 'id' | 'uploadedAt'>, changedBy: StaffMember): CaseDocument {
    const full: CaseDocument = { ...doc, id: newId('doc'), uploadedAt: new Date().toISOString() }
    documentStore = [...documentStore, full]
    logAudit({
      entityType: 'document', entityId: full.id, caseId: doc.caseId, action: 'create',
      summary: `Added document "${doc.name}"`,
      changedBy: changedBy.id, changedByName: changedBy.name,
    })
    return full
  },

  deleteDocument(id: string, changedBy: StaffMember): void {
    const doc = documentStore.find((d) => d.id === id)
    documentStore = documentStore.filter((d) => d.id !== id)
    if (doc) {
      logAudit({
        entityType: 'document', entityId: id, caseId: doc.caseId, action: 'delete',
        summary: `Deleted document "${doc.name}"`,
        changedBy: changedBy.id, changedByName: changedBy.name,
      })
    }
  },

  // -----------------------------------------------------------------
  // Chain of custody
  // -----------------------------------------------------------------
  moveCustody(
    caseId: string,
    toStage: CustodyStage,
    movedBy: StaffMember,
    note?: string
  ): { cases: FuneralCase[]; log: CustodyLogEntry[] } {
    const existing = caseStore.find((c) => c.id === caseId)
    const fromStage = existing?.custodyStage
    const now = new Date().toISOString()
    caseStore = caseStore.map((c) => (c.id === caseId ? { ...c, custodyStage: toStage, updatedAt: now } : c))
    const entry: CustodyLogEntry = {
      id: newId('cl'), caseId, fromStage, toStage,
      movedBy: movedBy.id, movedByName: movedBy.name, timestamp: now, note,
    }
    custodyLogStore = [...custodyLogStore, entry]
    logAudit({
      entityType: 'custody', entityId: caseId, caseId, action: 'status_change',
      summary: `Moved custody to "${toStage.replace(/_/g, ' ')}"`,
      changedBy: movedBy.id, changedByName: movedBy.name,
    })
    return { cases: caseStore, log: custodyLogStore }
  },

  getCustodyLog: (caseId?: string): CustodyLogEntry[] =>
    caseId ? custodyLogStore.filter((l) => l.caseId === caseId) : custodyLogStore,

  // -----------------------------------------------------------------
  // GPL
  // -----------------------------------------------------------------
  getGplItems: (): GplItem[] => gplStore,

  // -----------------------------------------------------------------
  // Contracts / invoices / payments
  // -----------------------------------------------------------------
  getContracts: (): Contract[] => contractStore,

  markContractSigned(contractId: string): void {
    contractStore = contractStore.map((c) => (c.id === contractId ? { ...c, status: 'signed', signedAt: new Date().toISOString() } : c))
  },

  toggleContractPaid(contractId: string, changedBy: StaffMember): Contract[] {
    contractStore = contractStore.map((c) => (c.id === contractId ? { ...c, paid: !c.paid } : c))
    logAudit({
      entityType: 'contract', entityId: contractId, action: 'status_change',
      summary: 'Toggled invoice paid/unpaid status',
      changedBy: changedBy.id, changedByName: changedBy.name,
    })
    return contractStore
  },

  /** Recomputes one contract's subtotal/total from its current line items, in place. */
  recalcContract(contractId: string): void {
    contractStore = contractStore.map((c) => {
      if (c.id !== contractId) return c
      const subtotal = c.lineItems.reduce((sum, i) => sum + i.quantity * (i.unitPrice + (i.adjustmentAmount ?? 0)), 0)
      return { ...c, subtotal, total: subtotal - c.discount + c.taxTotal }
    })
  },

  /** Finds or creates a draft contract for a case — mock-mode counterpart to the real findOrCreateContract. */
  findOrCreateContract(caseId: string, locationId: string): Contract {
    let contract = contractStore.find((c) => c.caseId === caseId)
    if (!contract) {
      contract = {
        id: newId('contract'), caseId, locationId, status: 'draft',
        lineItems: [], subtotal: 0, taxTotal: 0, discount: 0, total: 0, amountPaid: 0, paid: false,
        createdAt: new Date().toISOString(),
      }
      contractStore = [...contractStore, contract]
    }
    return contract
  },

  addGplItemToQuote(caseId: string, locationId: string, gplItem: { id: string; name: string; price: number }, changedBy: StaffMember): void {
    const contract = this.findOrCreateContract(caseId, locationId)
    const lineItem: ContractLineItem = { id: newId('line'), gplItemId: gplItem.id, name: gplItem.name, quantity: 1, unitPrice: gplItem.price }
    contractStore = contractStore.map((c) => (c.id === contract.id ? { ...c, lineItems: [...c.lineItems, lineItem] } : c))
    this.recalcContract(contract.id)
    logAudit({
      entityType: 'contract', entityId: contract.id, caseId, action: 'create',
      summary: `Added "${gplItem.name}" to the quote`,
      changedBy: changedBy.id, changedByName: changedBy.name,
    })
  },

  updateLineItemAdjustment(lineItemId: string, contractId: string, adjustmentAmount: number, changedBy: StaffMember): void {
    contractStore = contractStore.map((c) =>
      c.id === contractId ? { ...c, lineItems: c.lineItems.map((i) => (i.id === lineItemId ? { ...i, adjustmentAmount } : i)) } : c
    )
    this.recalcContract(contractId)
    logAudit({
      entityType: 'contract', entityId: contractId, action: 'update',
      summary: 'Adjusted a quote line item',
      changedBy: changedBy.id, changedByName: changedBy.name,
    })
  },

  removeQuoteLineItem(lineItemId: string, contractId: string, changedBy: StaffMember): void {
    contractStore = contractStore.map((c) =>
      c.id === contractId ? { ...c, lineItems: c.lineItems.filter((i) => i.id !== lineItemId) } : c
    )
    this.recalcContract(contractId)
    logAudit({
      entityType: 'contract', entityId: contractId, action: 'delete',
      summary: 'Removed a line item from the quote',
      changedBy: changedBy.id, changedByName: changedBy.name,
    })
  },

  /** Records a full online payment against a contract (family portal checkout scaffold). */
  recordOnlinePayment(contractId: string): { contracts: Contract[]; payment?: Payment } {
    const contract = contractStore.find((c) => c.id === contractId)
    if (!contract) return { contracts: contractStore }
    const payment: Payment = {
      id: newId('pay'), contractId, caseId: contract.caseId, amount: contract.total - contract.amountPaid,
      method: 'credit_card', reference: 'ONLINE-DEMO', receivedAt: new Date().toISOString(), recordedBy: 'online_payment',
    }
    paymentStore = [...paymentStore, payment]
    contractStore = contractStore.map((c) =>
      c.id === contractId ? { ...c, amountPaid: c.total, paid: true, status: 'paid' } : c
    )
    logAudit({
      entityType: 'payment', entityId: payment.id, caseId: contract.caseId, action: 'create',
      summary: `Online payment of ${payment.amount.toFixed(2)} received`,
      changedBy: 'family_portal', changedByName: 'Family Portal (online payment)',
    })
    return { contracts: contractStore, payment }
  },

  getPayments: (caseId?: string): Payment[] =>
    caseId ? paymentStore.filter((p) => p.caseId === caseId) : paymentStore,

  recordPayment(
    input: { contractId: string; caseId: string; amount: number; method: PaymentMethod; reference?: string },
    changedBy: StaffMember
  ): Payment {
    const payment: Payment = {
      id: newId('pay'), contractId: input.contractId, caseId: input.caseId, amount: input.amount,
      method: input.method, reference: input.reference, receivedAt: new Date().toISOString(), recordedBy: changedBy.id,
    }
    paymentStore = [...paymentStore, payment]
    const totalPaid = paymentStore.filter((p) => p.contractId === input.contractId).reduce((sum, p) => sum + p.amount, 0)
    contractStore = contractStore.map((c) =>
      c.id === input.contractId ? { ...c, amountPaid: totalPaid, paid: totalPaid >= c.total } : c
    )
    logAudit({
      entityType: 'payment', entityId: payment.id, caseId: input.caseId, action: 'create',
      summary: `Recorded a $${input.amount.toFixed(2)} payment (${input.method.replace('_', ' ')})`,
      changedBy: changedBy.id, changedByName: changedBy.name,
    })
    return payment
  },

  // -----------------------------------------------------------------
  // Vehicles & scheduling
  // -----------------------------------------------------------------
  getVehicles: (): Vehicle[] => vehicleStore,

  getEvents: (): CalendarEvent[] => eventStore,

  /** Checks for staff or vehicle double-booking in the given window, excluding `excludeEventId` (used when editing). */
  findConflicts(
    start: string,
    end: string,
    participantIds: string[],
    vehicleId: string | undefined,
    excludeEventId?: string
  ): SchedulingConflict[] {
    const conflicts: SchedulingConflict[] = []
    for (const e of eventStore) {
      if (e.id === excludeEventId) continue
      if (!overlaps(start, end, e.start, e.end)) continue
      for (const pid of participantIds) {
        if (e.participantIds.includes(pid)) {
          const person = staffStore.find((s) => s.id === pid)
          conflicts.push({ kind: 'staff', resourceId: pid, resourceName: person?.name ?? pid, conflictingEvent: e })
        }
      }
      if (vehicleId && e.vehicleId === vehicleId) {
        const vehicle = vehicleStore.find((v) => v.id === vehicleId)
        conflicts.push({ kind: 'vehicle', resourceId: vehicleId, resourceName: vehicle?.name ?? vehicleId, conflictingEvent: e })
      }
    }
    return conflicts
  },

  createEvent(input: Omit<CalendarEvent, 'id'>, changedBy: StaffMember): CalendarEvent {
    const event: CalendarEvent = { ...input, id: newId('evt') }
    eventStore = [...eventStore, event]
    logAudit({
      entityType: 'event', entityId: event.id, caseId: event.caseId, action: 'create',
      summary: `Scheduled "${event.title}"`,
      changedBy: changedBy.id, changedByName: changedBy.name,
    })
    return event
  },

  updateEvent(id: string, patch: Partial<CalendarEvent>, changedBy: StaffMember): CalendarEvent | undefined {
    let updated: CalendarEvent | undefined
    eventStore = eventStore.map((e) => {
      if (e.id !== id) return e
      updated = { ...e, ...patch }
      return updated
    })
    if (updated) {
      logAudit({
        entityType: 'event', entityId: id, caseId: updated.caseId, action: 'update',
        summary: `Updated "${updated.title}"`,
        changedBy: changedBy.id, changedByName: changedBy.name,
      })
    }
    return updated
  },

  // -----------------------------------------------------------------
  // Vendor / item order confirmation tracking
  // -----------------------------------------------------------------
  getOrders: (caseId: string): ServiceOrder[] => orderStore.filter((o) => o.caseId === caseId),

  addOrder(caseId: string, item: string, changedBy: StaffMember): ServiceOrder {
    const order: ServiceOrder = { id: newId('order'), caseId, item, status: 'pending' }
    orderStore = [...orderStore, order]
    logAudit({
      entityType: 'order', entityId: order.id, caseId, action: 'create',
      summary: `Added order: ${item}`,
      changedBy: changedBy.id, changedByName: changedBy.name,
    })
    // Every order becomes a task too — same status lifecycle, kept in
    // sync automatically from here on, so "what's happening with the
    // flowers" only needs checking in one place.
    const linkedTask: CaseTask = {
      id: newId('task'), caseId, label: item, category: suggestTaskCategory(item), status: 'pending', linkedOrderId: order.id,
    }
    taskStore = [...taskStore, linkedTask]
    return order
  },

  updateOrderStatus(orderId: string, status: OrderStatus, changedBy: StaffMember): ServiceOrder[] {
    const now = new Date().toISOString()
    orderStore = orderStore.map((o) => {
      if (o.id !== orderId) return o
      if (status === 'ordered') return { ...o, status, orderedBy: changedBy.id, orderedAt: now }
      if (status === 'confirmed') return { ...o, status, confirmedBy: changedBy.id, confirmedAt: now }
      return { ...o, status }
    })
    const order = orderStore.find((o) => o.id === orderId)
    if (order) {
      logAudit({
        entityType: 'order', entityId: orderId, caseId: order.caseId, action: 'status_change',
        summary: `Order "${order.item}" marked ${TASK_STATUS_LABELS[status]}`,
        changedBy: changedBy.id, changedByName: changedBy.name,
      })
      taskStore = taskStore.map((t) => (t.linkedOrderId === orderId ? { ...t, status } : t))
    }
    return orderStore
  },

  updateOrderPrice(orderId: string, price: number | undefined, changedBy: StaffMember): void {
    orderStore = orderStore.map((o) => (o.id === orderId ? { ...o, price } : o))
    const order = orderStore.find((o) => o.id === orderId)
    if (order) {
      logAudit({
        entityType: 'order', entityId: orderId, caseId: order.caseId, action: 'update',
        summary: `Updated price for order "${order.item}"`,
        changedBy: changedBy.id, changedByName: changedBy.name,
      })
    }
  },

  deleteOrder(orderId: string, changedBy: StaffMember): void {
    const order = orderStore.find((o) => o.id === orderId)
    orderStore = orderStore.filter((o) => o.id !== orderId)
    if (order) {
      logAudit({
        entityType: 'order', entityId: orderId, caseId: order.caseId, action: 'delete',
        summary: `Removed order "${order.item}"`,
        changedBy: changedBy.id, changedByName: changedBy.name,
      })
    }
  },

  // -----------------------------------------------------------------
  // Inbound email → case matching
  // -----------------------------------------------------------------
  getEmails: (filter?: { caseId?: string; needsReview?: boolean }): InboundEmail[] => {
    let rows = emailStore
    if (filter?.caseId) rows = rows.filter((e) => e.caseId === filter.caseId)
    if (filter?.needsReview) rows = rows.filter((e) => e.matchStatus === 'suggested' || e.matchStatus === 'unmatched')
    return rows.slice().sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
  },

  /** Confirms (or reassigns) which case an email belongs to — the human-in-the-loop step for anything not auto-matched by sender. */
  confirmEmailMatch(emailId: string, caseId: string, changedBy: StaffMember): InboundEmail[] {
    const now = new Date().toISOString()
    emailStore = emailStore.map((e) =>
      e.id === emailId ? { ...e, caseId, matchStatus: 'confirmed' as EmailMatchStatus, confirmedBy: changedBy.id, confirmedAt: now } : e
    )
    logAudit({
      entityType: 'email', entityId: emailId, caseId, action: 'update',
      summary: 'Confirmed email match to case',
      changedBy: changedBy.id, changedByName: changedBy.name,
    })
    return emailStore
  },

  /** Dismisses an email as not case-relevant (e.g. spam, a vendor newsletter). */
  ignoreEmail(emailId: string, changedBy: StaffMember): InboundEmail[] {
    emailStore = emailStore.map((e) => (e.id === emailId ? { ...e, matchStatus: 'ignored' as EmailMatchStatus } : e))
    logAudit({
      entityType: 'email', entityId: emailId, action: 'update',
      summary: 'Marked email as not case-relevant',
      changedBy: changedBy.id, changedByName: changedBy.name,
    })
    return emailStore
  },

  // -----------------------------------------------------------------
  // E-signature requests (SignRequest)
  // -----------------------------------------------------------------
  getSignatureRequests: (caseId?: string): SignatureRequest[] =>
    caseId ? signatureRequestStore.filter((s) => s.caseId === caseId) : signatureRequestStore,

  /**
   * Creates a signature request. In mock mode this simulates SignRequest's
   * response; the real implementation calls a Supabase Edge Function that
   * holds the SignRequest API key server-side (see supabase/functions/).
   */
  createSignatureRequest(
    input: Omit<SignatureRequest, 'id' | 'status' | 'sentAt'>,
    changedBy: StaffMember
  ): SignatureRequest {
    const req: SignatureRequest = {
      ...input, id: newId('sig'), status: 'sent', sentAt: new Date().toISOString(),
      signRequestId: `sr-mock-${Math.floor(Math.random() * 100000)}`,
    }
    signatureRequestStore = [...signatureRequestStore, req]
    logAudit({
      entityType: 'signature_request', entityId: req.id, caseId: req.caseId, action: 'create',
      summary: `Sent "${req.documentName}" to ${req.signerName} for signature`,
      changedBy: changedBy.id, changedByName: changedBy.name,
    })
    return req
  },

  /** Mock-only: simulates the signature completing, standing in for SignRequest's real webhook callback. */
  simulateSignatureComplete(requestId: string): SignatureRequest[] {
    signatureRequestStore = signatureRequestStore.map((s) =>
      s.id === requestId ? { ...s, status: 'signed' as SignatureRequestStatus, signedAt: new Date().toISOString() } : s
    )
    return signatureRequestStore
  },

  // -----------------------------------------------------------------
  // Staff time off
  // -----------------------------------------------------------------
  getTimeOff: (): StaffTimeOff[] => timeOffStore,

  addTimeOff(entry: Omit<StaffTimeOff, 'id'>, changedBy: StaffMember): StaffTimeOff {
    const full: StaffTimeOff = { ...entry, id: newId('timeoff') }
    timeOffStore = [...timeOffStore, full]
    const staffName = staffStore.find((s) => s.id === entry.staffId)?.name ?? entry.staffId
    logAudit({
      entityType: 'staff', entityId: entry.staffId, action: 'create',
      summary: `Marked ${staffName} as ${entry.type.replace('_', ' ')} from ${entry.startDate} to ${entry.endDate}`,
      changedBy: changedBy.id, changedByName: changedBy.name,
    })
    return full
  },

  deleteTimeOff(id: string, changedBy: StaffMember): StaffTimeOff[] {
    const entry = timeOffStore.find((t) => t.id === id)
    timeOffStore = timeOffStore.filter((t) => t.id !== id)
    if (entry) {
      const staffName = staffStore.find((s) => s.id === entry.staffId)?.name ?? entry.staffId
      logAudit({
        entityType: 'staff', entityId: entry.staffId, action: 'delete',
        summary: `Removed ${staffName}'s ${entry.type.replace('_', ' ')} entry`,
        changedBy: changedBy.id, changedByName: changedBy.name,
      })
    }
    return timeOffStore
  },

  // -----------------------------------------------------------------
  // Internal staff chat — 1:1 and group conversations
  // -----------------------------------------------------------------
  getConversations(currentUserId: string): ChatConversation[] {
    const myConvIds = chatParticipantStore.filter((p) => p.staffId === currentUserId).map((p) => p.conversationId)
    return myConvIds.map((convId) => {
      const conv = chatConversationStore.find((c) => c.id === convId)!
      const participantIds = chatParticipantStore.filter((p) => p.conversationId === convId).map((p) => p.staffId)
      const messages = chatMessageStore.filter((m) => m.conversationId === convId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      const myLastRead = chatParticipantStore.find((p) => p.conversationId === convId && p.staffId === currentUserId)?.lastReadAt
      const unreadCount = messages.filter((m) => m.senderId !== currentUserId && (!myLastRead || m.createdAt > myLastRead)).length
      return {
        id: conv.id, name: conv.name, isGroup: conv.isGroup,
        participantIds, participantNames: participantIds.map((id) => staffStore.find((s) => s.id === id)?.name ?? 'Unknown'),
        createdBy: conv.createdBy, createdAt: conv.createdAt,
        lastMessage: messages[0] ? { body: messages[0].body, senderId: messages[0].senderId, createdAt: messages[0].createdAt } : undefined,
        unreadCount,
      }
    }).sort((a, b) => (b.lastMessage?.createdAt ?? b.createdAt).localeCompare(a.lastMessage?.createdAt ?? a.createdAt))
  },

  getConversationMessages: (conversationId: string): ChatMessage[] =>
    chatMessageStore.filter((m) => m.conversationId === conversationId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),

  createConversation(participantIds: string[], name: string | undefined, currentUser: StaffMember): string {
    const id = newId('conv')
    chatConversationStore = [...chatConversationStore, {
      id, name, isGroup: participantIds.length > 2, createdBy: currentUser.id, createdAt: new Date().toISOString(),
    }]
    chatParticipantStore = [...chatParticipantStore, ...participantIds.map((staffId) => ({ conversationId: id, staffId }))]
    return id
  },

  sendMessage(conversationId: string, body: string, sender: StaffMember): ChatMessage {
    const msg: ChatMessage = { id: newId('msg'), conversationId, senderId: sender.id, body, createdAt: new Date().toISOString() }
    chatMessageStore = [...chatMessageStore, msg]
    return msg
  },

  markConversationRead(conversationId: string, currentUserId: string): void {
    const now = new Date().toISOString()
    chatParticipantStore = chatParticipantStore.map((p) =>
      p.conversationId === conversationId && p.staffId === currentUserId ? { ...p, lastReadAt: now } : p
    )
  },

  // -----------------------------------------------------------------
  // Family CRM
  // -----------------------------------------------------------------
  getFamilies: (): Family[] => familyStore,

  getFamily: (id: string): Family | undefined => familyStore.find((f) => f.id === id),

  createFamily(input: Omit<Family, 'id' | 'createdAt'>): Family {
    const family: Family = { ...input, id: newId('family'), createdAt: new Date().toISOString() }
    familyStore = [...familyStore, family]
    return family
  },

  updateFamily(id: string, patch: Partial<Family>): Family | undefined {
    let updated: Family | undefined
    familyStore = familyStore.map((f) => {
      if (f.id !== id) return f
      updated = { ...f, ...patch }
      return updated
    })
    return updated
  },

  getFamilyInteractions: (familyId: string): FamilyInteraction[] =>
    familyInteractionStore.filter((i) => i.familyId === familyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),

  addFamilyInteraction(familyId: string, type: FamilyInteraction['type'], notes: string, changedBy: StaffMember): FamilyInteraction {
    const interaction: FamilyInteraction = {
      id: newId('interaction'), familyId, type, notes,
      createdBy: changedBy.id, createdByName: changedBy.name, createdAt: new Date().toISOString(),
    }
    familyInteractionStore = [...familyInteractionStore, interaction]
    return interaction
  },

  // -----------------------------------------------------------------
  // Vendor directory
  // -----------------------------------------------------------------
  getVendors: (): Vendor[] => vendorStore,

  createVendor(input: Omit<Vendor, 'id' | 'createdAt'>, changedBy: StaffMember): Vendor {
    const vendor: Vendor = { ...input, id: newId('vendor'), createdAt: new Date().toISOString() }
    vendorStore = [...vendorStore, vendor]
    logAudit({
      entityType: 'vendor', entityId: vendor.id, action: 'create',
      summary: `Added vendor "${input.name}"`, changedBy: changedBy.id, changedByName: changedBy.name,
    })
    return vendor
  },

  deleteVendor(id: string, changedBy: StaffMember): void {
    const vendor = vendorStore.find((v) => v.id === id)
    vendorStore = vendorStore.filter((v) => v.id !== id)
    if (vendor) {
      logAudit({
        entityType: 'vendor', entityId: id, action: 'delete',
        summary: `Removed vendor "${vendor.name}"`, changedBy: changedBy.id, changedByName: changedBy.name,
      })
    }
  },

  // -----------------------------------------------------------------
  // Audit log
  // -----------------------------------------------------------------
  getAuditLog: (filters?: { caseId?: string; entityType?: AuditLogEntry['entityType'] }): AuditLogEntry[] => {
    let rows = auditLogStore
    if (filters?.caseId) rows = rows.filter((a) => a.caseId === filters.caseId)
    if (filters?.entityType) rows = rows.filter((a) => a.entityType === filters.entityType)
    return rows.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  },
}
