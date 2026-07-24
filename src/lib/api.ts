import { USE_MOCK, supabase, supabaseUrl, supabaseAnonKey } from './supabase'
import { mockStore } from '@/data/mockStore'
import { TASK_STATUS_LABELS } from '@/types'
import type {
  FuneralCase, Location, StaffMember, CaseTask, CaseNote, CaseDocument,
  GplItem, Contract, CalendarEvent, CustodyLogEntry, CustodyStage, UserRole,
  Vehicle, SchedulingConflict, Payment, PaymentMethod, AuditLogEntry, ServiceOrder, OrderStatus, TaskStatus,
  InboundEmail, SignatureRequest, ExtractedCaseData, StaffTimeOff, ChatMessage, ChatConversation,
  Family, FamilyInteraction, FamilyInteractionType, Vendor, VitalSheetInfo, TaskTemplate,
} from '@/types'
import { locations as mockLocations } from '@/data/mockData'
import {
  caseToRow, rowToCase, contactToRow, rowToStaff, documentToRow, rowToDocument,
  eventToRow, rowToEvent, rowToGplItem, rowToContract, rowToVehicle,
  rowToCustodyLogEntry, rowToServiceOrder, rowToEmail, rowToSignatureRequest,
  rowToAuditLogEntry, rowToTask, rowToNote, rowToTimeOff, rowToChatMessage,
  rowToFamily, familyToRow, rowToFamilyInteraction, rowToVendor, vendorToRow,
  rowToTaskTemplate, taskTemplateToRow,
} from './supabaseMappers'

// -----------------------------------------------------------------------
// This layer is intentionally thin: every function checks USE_MOCK and
// either reads/writes the in-memory mock store (local dev, no backend
// configured) or queries Supabase directly. Swap in real query logic
// under the `else` branches as you wire up production tables — the
// page components never need to change.
//
// The app's TypeScript types use camelCase (and, for a few tables, nested
// objects/arrays); the real Postgres schema uses snake_case flat columns
// and separate join tables. Every real-mode branch below goes through
// `supabaseMappers.ts` to translate between the two — never pass a raw
// camelCase object straight to `.insert()`/`.update()`, it will either
// silently drop fields or 400 on a NOT NULL column that never got set.
//
// Every mutation takes a `changedBy: StaffMember` argument so the mock
// store can append an audit log entry. When wiring Supabase, the
// equivalent is usually `auth.uid()` captured server-side (e.g. via a
// trigger, like the role-change trigger in schema.sql) rather than trusted
// from the client — don't just insert `changedBy.id` as-is from the browser.
// -----------------------------------------------------------------------

function delay<T>(value: T, ms = 150): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

/**
 * Writes one row to the real audit_log table. This was missing entirely
 * from every real-mode mutation for a long time — the mock store logged
 * everything (via its own logAudit()), which made the Admin → Audit Log
 * tab look fully functional in the demo, but nothing was ever actually
 * being recorded against the live Supabase database. Every real-mode
 * write below now calls this. Never let a logging failure block the
 * actual action that triggered it — hence the swallowed catch.
 */
/** Best-guess task category from an order's item name — a grouping hint, not a hard rule. */
function suggestTaskCategory(itemName: string): CaseTask['category'] {
  const n = itemName.toLowerCase()
  if (/flower|casket|urn|dove|bird/.test(n)) return 'merchandise'
  if (/escort|carriage|limo|vehicle/.test(n)) return 'transport'
  return 'other'
}

async function logAuditReal(entry: {
  entityType: AuditLogEntry['entityType']
  entityId: string
  caseId?: string
  action: AuditLogEntry['action']
  summary: string
  changedBy: string
}): Promise<void> {
  try {
    await supabase!.from('audit_log').insert({
      entity_type: entry.entityType, entity_id: entry.entityId, case_id: entry.caseId ?? null,
      action: entry.action, summary: entry.summary, changed_by: entry.changedBy,
    })
  } catch (err) {
    console.error('Failed to write audit log entry:', err)
  }
}

/** Recomputes and saves a contract's subtotal/total from its current line items. */
async function recalculateContractTotal(contractId: string): Promise<void> {
  const { data: contract } = await supabase!.from('contracts').select('discount, tax_total').eq('id', contractId).single()
  const { data: items } = await supabase!.from('contract_line_items').select('quantity, unit_price, adjustment_amount').eq('contract_id', contractId)
  const subtotal = (items ?? []).reduce((sum, i) => sum + Number(i.quantity) * (Number(i.unit_price) + Number(i.adjustment_amount ?? 0)), 0)
  const discount = Number(contract?.discount ?? 0)
  const taxTotal = Number(contract?.tax_total ?? 0)
  await supabase!.from('contracts').update({ subtotal, total: subtotal - discount + taxTotal }).eq('id', contractId)
}

/** Finds the case's contract, creating a draft one if it doesn't have one yet. Shared by the Orders sync and the Quote builder below. */
async function findOrCreateContract(caseId: string, locationId: string): Promise<{ id: string }> {
  const { data: existing } = await supabase!.from('contracts').select('id').eq('case_id', caseId).order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (existing) return existing
  const { data: created, error } = await supabase!
    .from('contracts')
    .insert({ case_id: caseId, location_id: locationId, status: 'draft' })
    .select('id')
    .single()
  if (error) throw error
  return created
}

/**
 * Keeps the case's invoice in sync with a priced Order — this is what
 * makes "family removes an item from the quote" actually show up on the
 * real invoice, not just the Orders tab. Finds the case's contract (or
 * creates a draft one if this is the first priced order on a case that's
 * never had an invoice started), then upserts a line item tied to this
 * specific order via service_order_id. Line items a staff member added by
 * hand from the GPL are untouched — only order-linked lines are managed
 * here.
 */
async function syncOrderPriceToContract(caseId: string, locationId: string, orderId: string, itemName: string, price: number | undefined): Promise<void> {
  if (price === undefined) {
    // Only look up an existing contract when clearing a price — no point
    // creating one just to immediately have nothing to put in it.
    const { data: existing } = await supabase!.from('contracts').select('id').eq('case_id', caseId).order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (!existing) return
    const { data: existingLine } = await supabase!.from('contract_line_items').select('id').eq('contract_id', existing.id).eq('service_order_id', orderId).maybeSingle()
    if (existingLine) {
      await supabase!.from('contract_line_items').delete().eq('id', existingLine.id)
      await recalculateContractTotal(existing.id)
    }
    return
  }

  const contract = await findOrCreateContract(caseId, locationId)
  const { data: existingLine } = await supabase!
    .from('contract_line_items')
    .select('id')
    .eq('contract_id', contract.id)
    .eq('service_order_id', orderId)
    .maybeSingle()

  if (existingLine) {
    await supabase!.from('contract_line_items').update({ name: itemName, unit_price: price }).eq('id', existingLine.id)
  } else {
    await supabase!.from('contract_line_items').insert({
      contract_id: contract.id, service_order_id: orderId, name: itemName, quantity: 1, unit_price: price,
    })
  }
  await recalculateContractTotal(contract.id)
}

/** Removes an order's line item from the invoice entirely, e.g. when the order itself is deleted (not just re-priced to zero). */
async function removeOrderFromContract(orderId: string): Promise<void> {
  const { data: line } = await supabase!.from('contract_line_items').select('id, contract_id').eq('service_order_id', orderId).maybeSingle()
  if (!line) return
  await supabase!.from('contract_line_items').delete().eq('id', line.id)
  await recalculateContractTotal(line.contract_id)
}

/**
 * Keeps a case's Visitation/Service date in sync with a matching calendar
 * event, so setting a date on the case is enough — staff don't also have
 * to separately go create a calendar entry for it to show up. One event
 * per case per type (visitation/service): updated in place if it already
 * exists, created if it doesn't, deleted if the date gets cleared.
 *
 * Default durations (2h visitation, 1h service) are a starting point —
 * edit the individual calendar event afterward if a specific case runs
 * longer or shorter.
 */
async function syncCaseCalendarEvent(
  caseId: string,
  orgId: string,
  locationId: string,
  type: 'visitation' | 'service',
  dateIso: string | undefined,
  eventLocation: string | undefined,
  decedentName: string
): Promise<void> {
  const { data: existing } = await supabase!
    .from('calendar_events')
    .select('id')
    .eq('case_id', caseId)
    .eq('type', type)
    .maybeSingle()

  if (!dateIso) {
    if (existing) {
      await supabase!.from('event_participants').delete().eq('event_id', existing.id)
      await supabase!.from('calendar_events').delete().eq('id', existing.id)
    }
    return
  }

  const durationMs = type === 'visitation' ? 2 * 60 * 60 * 1000 : 60 * 60 * 1000
  const startAt = dateIso
  const endAt = new Date(new Date(dateIso).getTime() + durationMs).toISOString()
  const title = `${decedentName} — ${type === 'visitation' ? 'Visitation' : 'Service'}`

  if (existing) {
    await supabase!.from('calendar_events').update({
      start_at: startAt, end_at: endAt, location_text: eventLocation ?? null, title,
    }).eq('id', existing.id)
  } else {
    await supabase!.from('calendar_events').insert({
      org_id: orgId, location_id: locationId, case_id: caseId, title, type,
      start_at: startAt, end_at: endAt, location_text: eventLocation ?? null,
    })
  }
}

export const api = {
  // -------------------------------------------------------------------
  // Locations / staff / roles / access
  // -------------------------------------------------------------------

  async getLocations(): Promise<Location[]> {
    if (USE_MOCK) return delay(mockLocations)
    const { data, error } = await supabase!.from('locations').select('*')
    if (error) throw error
    return (data ?? []).map((row: any) => ({
      id: row.id, orgId: row.org_id, name: row.name, address: row.address,
      city: row.city, state: row.state, zip: row.zip, phone: row.phone,
      timezone: row.timezone, licenseNumber: row.license_number ?? undefined, active: row.active,
    }))
  },

  async getStaff(): Promise<StaffMember[]> {
    if (USE_MOCK) return delay(mockStore.getStaff())
    const { data, error } = await supabase!.from('staff_members').select('*, staff_locations(location_id)')
    if (error) throw error
    return (data ?? []).map(rowToStaff)
  },

  /** Only callable by super_admin in the UI — enforced there and by a DB trigger (see schema.sql). */
  async updateStaffRole(staffId: string, role: UserRole, changedBy: StaffMember): Promise<StaffMember[]> {
    if (USE_MOCK) return delay(mockStore.updateStaffRole(staffId, role, changedBy))
    const { error } = await supabase!.from('staff_members').update({ role }).eq('id', staffId)
    if (error) throw error
    const target = await this.getStaff()
    logAuditReal({
      entityType: 'staff', entityId: staffId, action: 'update',
      summary: `Changed ${target.find((s) => s.id === staffId)?.name ?? staffId}'s role to ${role}`,
      changedBy: changedBy.id,
    })
    return target
  },

  /** super_admin only — which locations a staff member can access. */
  async updateStaffLocations(staffId: string, locationIds: string[], changedBy: StaffMember): Promise<StaffMember[]> {
    if (USE_MOCK) return delay(mockStore.updateStaffLocations(staffId, locationIds, changedBy))
    const { error } = await supabase!.from('staff_locations').delete().eq('staff_id', staffId)
    if (error) throw error
    if (locationIds.length) {
      const { error: insertErr } = await supabase!.from('staff_locations').insert(
        locationIds.map((locationId) => ({ staff_id: staffId, location_id: locationId }))
      )
      if (insertErr) throw insertErr
    }
    const updated = await this.getStaff()
    logAuditReal({
      entityType: 'staff', entityId: staffId, action: 'update',
      summary: `Updated ${updated.find((s) => s.id === staffId)?.name ?? staffId}'s location access`,
      changedBy: changedBy.id,
    })
    return updated
  },

  /** super_admin only — features explicitly disabled for this user, overriding their role default. */
  async updateStaffFeatures(staffId: string, disabledFeatures: string[], changedBy: StaffMember): Promise<StaffMember[]> {
    if (USE_MOCK) return delay(mockStore.updateStaffFeatures(staffId, disabledFeatures, changedBy))
    const { error } = await supabase!.from('staff_members').update({ disabled_features: disabledFeatures }).eq('id', staffId)
    if (error) throw error
    const updated = await this.getStaff()
    logAuditReal({
      entityType: 'staff', entityId: staffId, action: 'update',
      summary: `Updated ${updated.find((s) => s.id === staffId)?.name ?? staffId}'s feature access`,
      changedBy: changedBy.id,
    })
    return updated
  },

  /** Super Admin only — creates a real login account + staff record + location access in one call, via a dedicated Edge Function (needs the service_role key, which the browser never holds). */
  async createStaffMember(input: {
    name: string; email: string; role: UserRole; title?: string; department?: string; phone?: string; locationIds: string[]
  }, changedBy: StaffMember): Promise<{ tempPassword: string }> {
    if (USE_MOCK) return delay(mockStore.createStaffMember(input, changedBy))
    const { data, error } = await supabase!.functions.invoke('create-staff-member', { body: input })
    if (error) {
      const context = (error as { context?: Response }).context
      if (context) {
        try {
          const body = await context.clone().json()
          throw new Error(body?.error ?? error.message)
        } catch {
          // fall through
        }
      }
      throw error
    }
    logAuditReal({
      entityType: 'staff', entityId: data.id, action: 'create',
      summary: `Added new staff member: ${input.name} (${input.role.replace('_', ' ')})`, changedBy: changedBy.id,
    })
    return { tempPassword: data.tempPassword }
  },

  // -------------------------------------------------------------------
  // Cases
  // -------------------------------------------------------------------

  async getCases(locationId?: string): Promise<FuneralCase[]> {
    if (USE_MOCK) {
      const rows = mockStore.getCases()
      return delay(locationId ? rows.filter((c) => c.locationId === locationId) : rows)
    }
    let query = supabase!.from('cases').select('*, case_contacts(*)')
    if (locationId) query = query.eq('location_id', locationId)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(rowToCase)
  },

  async getCase(caseId: string): Promise<FuneralCase | undefined> {
    if (USE_MOCK) return delay(mockStore.getCase(caseId))
    const { data, error } = await supabase!.from('cases').select('*, case_contacts(*)').eq('id', caseId).single()
    if (error) throw error
    return data ? rowToCase(data) : undefined
  },

  async createCase(input: Omit<FuneralCase, 'id' | 'createdAt' | 'updatedAt'>, changedBy: StaffMember): Promise<FuneralCase> {
    if (USE_MOCK) return delay(mockStore.createCase(input, changedBy))
    const { data: caseRow, error } = await supabase!.from('cases').insert(caseToRow(input)).select().single()
    if (error) throw error
    if (input.contacts?.length) {
      const { error: contactErr } = await supabase!
        .from('case_contacts')
        .insert(input.contacts.map((c) => contactToRow(c, caseRow.id)))
      if (contactErr) throw contactErr
    }
    const decedentName = `${input.decedent.firstName} ${input.decedent.lastName}`
    if ('visitationDate' in input) await syncCaseCalendarEvent(caseRow.id, input.orgId, input.locationId, 'visitation', input.visitationDate, input.visitationLocation, decedentName)
    if ('serviceDate' in input) await syncCaseCalendarEvent(caseRow.id, input.orgId, input.locationId, 'service', input.serviceDate, input.serviceLocation, decedentName)
    await this.seedTasksFromTemplates(caseRow.id, input.orgId)
    this.notifySlack(`🆕 New case created: *${decedentName}* (${input.caseNumber}) — by ${changedBy.name}`)
    logAuditReal({
      entityType: 'case', entityId: caseRow.id, caseId: caseRow.id, action: 'create',
      summary: `Created case for ${decedentName}`, changedBy: changedBy.id,
    })
    return this.getCase(caseRow.id) as Promise<FuneralCase>
  },

  async updateCase(id: string, patch: Partial<FuneralCase>, changedBy: StaffMember): Promise<FuneralCase | undefined> {
    if (USE_MOCK) return delay(mockStore.updateCase(id, patch, changedBy))
    const { error } = await supabase!.from('cases').update(caseToRow(patch)).eq('id', id)
    if (error) throw error
    if (patch.contacts) {
      // Simplest correct approach at this scale: replace the full contact
      // list rather than diffing individual rows.
      const { error: deleteErr } = await supabase!.from('case_contacts').delete().eq('case_id', id)
      if (deleteErr) throw deleteErr
      if (patch.contacts.length) {
        const { error: insertErr } = await supabase!
          .from('case_contacts')
          .insert(patch.contacts.map((c) => contactToRow(c, id)))
        if (insertErr) throw insertErr
      }
    }
    // Only touch the calendar when a date field was actually part of this
    // save — cheap presence checks so unrelated case edits (e.g. a task
    // toggle elsewhere) never risk wiping out a calendar event by accident.
    if ('visitationDate' in patch || 'serviceDate' in patch) {
      const current = await this.getCase(id)
      if (current) {
        const decedentName = `${current.decedent.firstName} ${current.decedent.lastName}`
        if ('visitationDate' in patch) await syncCaseCalendarEvent(id, current.orgId, current.locationId, 'visitation', patch.visitationDate, patch.visitationLocation, decedentName)
        if ('serviceDate' in patch) await syncCaseCalendarEvent(id, current.orgId, current.locationId, 'service', patch.serviceDate, patch.serviceLocation, decedentName)
      }
    }
    const result = await this.getCase(id)
    logAuditReal({
      entityType: 'case', entityId: id, caseId: id, action: 'update',
      summary: `Updated case ${result?.caseNumber ?? id}`, changedBy: changedBy.id,
    })
    return result
  },

  // -------------------------------------------------------------------
  // Tasks
  // -------------------------------------------------------------------

  async getCaseTasks(caseId: string): Promise<CaseTask[]> {
    if (USE_MOCK) return delay(mockStore.getCaseTasks(caseId))
    const { data, error } = await supabase!.from('case_tasks').select('*').eq('case_id', caseId)
    if (error) throw error
    return (data ?? []).map(rowToTask)
  },

  /** Every incomplete task whose due date has passed, across every active case — what the Dashboard's pending-tasks alert is built from. */
  async getOverdueTasks(): Promise<Array<CaseTask & { decedentName: string; caseNumber: string }>> {
    if (USE_MOCK) return delay(mockStore.getOverdueTasks())
    const today = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabase!
      .from('case_tasks')
      .select('*, cases(case_number, decedent_first_name, decedent_last_name, status)')
      .neq('status', 'confirmed')
      .lt('due_date', today)
    if (error) throw error
    return (data ?? [])
      .filter((row: any) => row.cases && row.cases.status !== 'completed')
      .map((row: any) => ({
        ...rowToTask(row),
        decedentName: `${row.cases.decedent_first_name} ${row.cases.decedent_last_name}`,
        caseNumber: row.cases.case_number,
      }))
  },

  async updateTaskStatus(taskId: string, status: TaskStatus, changedBy: StaffMember): Promise<CaseTask[]> {
    if (USE_MOCK) return delay(mockStore.updateTaskStatus(taskId, status, changedBy))
    const { data: current, error: fetchErr } = await supabase!.from('case_tasks').select('label, case_id, linked_order_id').eq('id', taskId).single()
    if (fetchErr) throw fetchErr
    const { error } = await supabase!.from('case_tasks').update({ status }).eq('id', taskId)
    if (error) throw error
    // A task linked to an order stays in sync in that direction too —
    // completing it from the Tasks tab should also move the order along,
    // not just the reverse.
    if (current.linked_order_id) {
      await supabase!.from('service_orders').update({ status }).eq('id', current.linked_order_id)
    }
    logAuditReal({
      entityType: 'task', entityId: taskId, caseId: current.case_id, action: 'status_change',
      summary: `Marked task "${current.label}" as ${TASK_STATUS_LABELS[status]}`, changedBy: changedBy.id,
    })
    return []
  },

  async addTask(caseId: string, label: string, category: CaseTask['category'], changedBy: StaffMember): Promise<CaseTask> {
    if (USE_MOCK) return delay(mockStore.addTask(caseId, label, category, changedBy))
    const { data, error } = await supabase!.from('case_tasks').insert({ case_id: caseId, label, category }).select().single()
    if (error) throw error
    logAuditReal({
      entityType: 'task', entityId: data.id, caseId, action: 'create',
      summary: `Added task "${label}"`, changedBy: changedBy.id,
    })
    return rowToTask(data)
  },

  // -------------------------------------------------------------------
  // Task templates — the standard checklist new cases start with
  // -------------------------------------------------------------------

  async getTaskTemplates(): Promise<TaskTemplate[]> {
    if (USE_MOCK) return delay(mockStore.getTaskTemplates())
    const { data, error } = await supabase!.from('task_templates').select('*').order('sort_order')
    if (error) throw error
    return (data ?? []).map(rowToTaskTemplate)
  },

  async createTaskTemplate(input: Omit<TaskTemplate, 'id'>, changedBy: StaffMember): Promise<TaskTemplate> {
    if (USE_MOCK) return delay(mockStore.createTaskTemplate(input, changedBy))
    const { data, error } = await supabase!.from('task_templates').insert(taskTemplateToRow(input)).select().single()
    if (error) throw error
    logAuditReal({ entityType: 'task', entityId: data.id, action: 'create', summary: `Added task template "${input.label}"`, changedBy: changedBy.id })
    return rowToTaskTemplate(data)
  },

  async updateTaskTemplate(id: string, patch: Partial<TaskTemplate>, changedBy: StaffMember): Promise<TaskTemplate> {
    if (USE_MOCK) return delay(mockStore.updateTaskTemplate(id, patch, changedBy))
    const { data, error } = await supabase!.from('task_templates').update(taskTemplateToRow(patch)).eq('id', id).select().single()
    if (error) throw error
    logAuditReal({ entityType: 'task', entityId: id, action: 'update', summary: `Updated task template "${data.label}"`, changedBy: changedBy.id })
    return rowToTaskTemplate(data)
  },

  async deleteTaskTemplate(id: string, changedBy: StaffMember): Promise<void> {
    if (USE_MOCK) { mockStore.deleteTaskTemplate(id, changedBy); return }
    const { data: t } = await supabase!.from('task_templates').select('label').eq('id', id).single()
    const { error } = await supabase!.from('task_templates').delete().eq('id', id)
    if (error) throw error
    if (t) logAuditReal({ entityType: 'task', entityId: id, action: 'delete', summary: `Removed task template "${t.label}"`, changedBy: changedBy.id })
  },

  /** Copies every active template into a brand-new case's task list — a one-time snapshot, not a live link, so editing templates later never changes existing cases. */
  async seedTasksFromTemplates(caseId: string, orgId: string): Promise<void> {
    if (USE_MOCK) { mockStore.seedTasksFromTemplates(caseId); return }
    const { data: templates } = await supabase!.from('task_templates').select('*').eq('org_id', orgId).eq('active', true).order('sort_order')
    if (!templates?.length) return
    const now = new Date()
    const rows = templates.map((t) => ({
      case_id: caseId, label: t.label, category: t.category,
      due_date: t.days_until_due != null ? new Date(now.getTime() + t.days_until_due * 86_400_000).toISOString().slice(0, 10) : null,
    }))
    await supabase!.from('case_tasks').insert(rows)
  },

  // -------------------------------------------------------------------
  // Notes
  // -------------------------------------------------------------------

  async getCaseNotes(caseId: string): Promise<CaseNote[]> {
    if (USE_MOCK) return delay(mockStore.getCaseNotes(caseId))
    const { data, error } = await supabase!.from('case_notes').select('*, staff_members(name)').eq('case_id', caseId)
    if (error) throw error
    return (data ?? []).map(rowToNote)
  },

  async addNote(caseId: string, author: StaffMember, body: string): Promise<CaseNote> {
    if (USE_MOCK) return delay(mockStore.addNote(caseId, author, body))
    const { data, error } = await supabase!
      .from('case_notes')
      .insert({ case_id: caseId, author_id: author.id, body })
      .select('*, staff_members(name)')
      .single()
    if (error) throw error
    logAuditReal({
      entityType: 'note', entityId: data.id, caseId, action: 'create',
      summary: 'Added a note', changedBy: author.id,
    })
    return rowToNote(data)
  },

  // -------------------------------------------------------------------
  // Documents
  // -------------------------------------------------------------------

  async getCaseDocuments(caseId: string): Promise<CaseDocument[]> {
    if (USE_MOCK) return delay(mockStore.getCaseDocuments(caseId))
    const { data, error } = await supabase!.from('case_documents').select('*').eq('case_id', caseId)
    if (error) throw error
    return (data ?? []).map(rowToDocument)
  },

  /** Actually uploads a file to Storage and returns the storage path — what was missing before; addDocument alone just inserts a row, it never touched Storage. */
  async uploadCaseFile(caseId: string, file: File | Blob, filename: string): Promise<string> {
    if (USE_MOCK) return `mock/${caseId}/${filename}` // no real Storage in mock mode; fine since nothing tries to fetch it back
    const path = `case-files/${caseId}/${Date.now()}-${filename.replace(/[^a-z0-9.]/gi, '-')}`
    const { error } = await supabase!.storage.from('case-documents').upload(path, file, {
      contentType: file instanceof File ? file.type : 'application/pdf',
    })
    if (error) throw error
    return path
  },

  async addDocument(doc: Omit<CaseDocument, 'id' | 'uploadedAt'>, changedBy: StaffMember): Promise<CaseDocument> {
    if (USE_MOCK) return delay(mockStore.addDocument(doc, changedBy))
    const { data, error } = await supabase!.from('case_documents').insert(documentToRow(doc)).select().single()
    if (error) throw error
    logAuditReal({
      entityType: 'document', entityId: data.id, caseId: doc.caseId, action: 'create',
      summary: `Added document "${doc.name}"`, changedBy: changedBy.id,
    })
    return rowToDocument(data)
  },

  async deleteDocument(id: string, changedBy: StaffMember): Promise<void> {
    if (USE_MOCK) return delay(mockStore.deleteDocument(id, changedBy))
    const { data: doc } = await supabase!.from('case_documents').select('name, case_id').eq('id', id).single()
    const { error } = await supabase!.from('case_documents').delete().eq('id', id)
    if (error) throw error
    if (doc) {
      logAuditReal({
        entityType: 'document', entityId: id, caseId: doc.case_id, action: 'delete',
        summary: `Deleted document "${doc.name}"`, changedBy: changedBy.id,
      })
    }
  },

  // -------------------------------------------------------------------
  // GPL / Financials / Invoices
  // -------------------------------------------------------------------

  async getGplItems(locationId?: string): Promise<GplItem[]> {
    if (USE_MOCK) {
      const rows = mockStore.getGplItems()
      return delay(locationId ? rows.filter((g) => g.locationId === locationId) : rows)
    }
    let query = supabase!.from('gpl_items').select('*')
    if (locationId) query = query.eq('location_id', locationId)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(rowToGplItem)
  },

  async getContracts(): Promise<Contract[]> {
    if (USE_MOCK) return delay(mockStore.getContracts())
    const { data, error } = await supabase!.from('contracts').select('*, contract_line_items(*)')
    if (error) throw error
    return (data ?? []).map(rowToContract)
  },

  /** Manual paid/unpaid toggle — the action the staff_member (lowest tier) role is permitted to take. */
  /** Marks a contract as signed — called after a signature is captured, whether via SignRequest or the in-person pad. */
  async markContractSigned(contractId: string, changedBy: StaffMember): Promise<void> {
    if (USE_MOCK) { mockStore.markContractSigned(contractId); return }
    const { error } = await supabase!.from('contracts').update({ status: 'signed', signed_at: new Date().toISOString() }).eq('id', contractId)
    if (error) throw error
    logAuditReal({ entityType: 'contract', entityId: contractId, action: 'status_change', summary: 'Quote signed', changedBy: changedBy.id })
  },

  async toggleContractPaid(contractId: string, changedBy: StaffMember): Promise<Contract[]> {
    if (USE_MOCK) return delay(mockStore.toggleContractPaid(contractId, changedBy))
    const { data: current, error: fetchErr } = await supabase!.from('contracts').select('paid').eq('id', contractId).single()
    if (fetchErr) throw fetchErr
    const { error } = await supabase!.from('contracts').update({ paid: !current.paid }).eq('id', contractId)
    if (error) throw error
    logAuditReal({
      entityType: 'contract', entityId: contractId, action: 'status_change',
      summary: 'Toggled invoice paid/unpaid status', changedBy: changedBy.id,
    })
    return this.getContracts()
  },

  // -------------------------------------------------------------------
  // Quote builder — adds real General Price List items to a case's
  // invoice (creating the invoice as a draft if one doesn't exist yet),
  // with a per-line discount/increase on top of list price. This is the
  // same underlying contract/contract_line_items data as the Orders-tab
  // sync above — a "quote" is just a draft invoice.
  // -------------------------------------------------------------------

  /** Adds one GPL item as a new line on the case's quote/invoice. */
  async addGplItemToQuote(caseId: string, locationId: string, gplItem: { id: string; name: string; price: number }, changedBy: StaffMember): Promise<void> {
    if (USE_MOCK) { mockStore.addGplItemToQuote(caseId, locationId, gplItem, changedBy); return }
    const contract = await findOrCreateContract(caseId, locationId)
    const { error } = await supabase!.from('contract_line_items').insert({
      contract_id: contract.id, gpl_item_id: gplItem.id, name: gplItem.name, quantity: 1, unit_price: gplItem.price,
    })
    if (error) throw error
    await recalculateContractTotal(contract.id)
    logAuditReal({
      entityType: 'contract', entityId: contract.id, caseId, action: 'create',
      summary: `Added "${gplItem.name}" to the quote`, changedBy: changedBy.id,
    })
  },

  /** Sets a line item's discount (negative) or increase (positive) — the "family starts taking things off" adjustment. */
  async updateLineItemAdjustment(lineItemId: string, contractId: string, adjustmentAmount: number, changedBy: StaffMember): Promise<void> {
    if (USE_MOCK) { mockStore.updateLineItemAdjustment(lineItemId, contractId, adjustmentAmount, changedBy); return }
    const { error } = await supabase!.from('contract_line_items').update({ adjustment_amount: adjustmentAmount }).eq('id', lineItemId)
    if (error) throw error
    await recalculateContractTotal(contractId)
    logAuditReal({
      entityType: 'contract', entityId: contractId, action: 'update',
      summary: adjustmentAmount < 0 ? `Applied a $${Math.abs(adjustmentAmount).toFixed(2)} discount to a quote line` : adjustmentAmount > 0 ? `Applied a $${adjustmentAmount.toFixed(2)} increase to a quote line` : 'Cleared a quote line adjustment',
      changedBy: changedBy.id,
    })
  },

  /** Removes a GPL-sourced line item from the quote. For order-sourced lines, delete the order itself on the Orders tab instead — that keeps the two in sync. */
  async removeQuoteLineItem(lineItemId: string, contractId: string, changedBy: StaffMember): Promise<void> {
    if (USE_MOCK) { mockStore.removeQuoteLineItem(lineItemId, contractId, changedBy); return }
    const { error } = await supabase!.from('contract_line_items').delete().eq('id', lineItemId)
    if (error) throw error
    await recalculateContractTotal(contractId)
    logAuditReal({
      entityType: 'contract', entityId: contractId, action: 'delete',
      summary: 'Removed a line item from the quote', changedBy: changedBy.id,
    })
  },

  /**
   * Family-portal checkout scaffold. This is a UI-only simulation — it is
   * NOT wired to a real payment processor. Before accepting real payments,
   * replace this with Stripe Elements/Payment Element on the frontend and
   * a server-side (Supabase Edge Function) endpoint that creates a
   * PaymentIntent with your Stripe secret key. Never put a Stripe secret
   * key in frontend code.
   */
  async recordOnlinePayment(contractId: string): Promise<{ contracts: Contract[]; payment?: Payment }> {
    if (USE_MOCK) return delay(mockStore.recordOnlinePayment(contractId))
    throw new Error('Online payments require a Stripe backend integration — see api.ts comment.')
  },

  async getPayments(caseId?: string): Promise<Payment[]> {
    if (USE_MOCK) return delay(mockStore.getPayments(caseId))
    let query = supabase!.from('payments').select('*')
    if (caseId) query = query.eq('case_id', caseId)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map((row: any) => ({
      id: row.id, contractId: row.contract_id, caseId: row.case_id, amount: Number(row.amount),
      method: row.method, reference: row.reference ?? undefined, receivedAt: row.received_at, recordedBy: row.recorded_by,
    }))
  },

  /**
   * Records one real payment — the "$2k now, rest in two days" case.
   * Unlike recordOnlinePayment (a Stripe-dependent full-payment stub),
   * this takes any amount and method, and can be called as many times as
   * needed against the same contract. amount_paid and the paid flag on
   * the contract are recomputed from the sum of every payment on it —
   * never set directly — so partial payments always add up correctly no
   * matter how many separate payments come in.
   */
  async recordPayment(input: {
    contractId: string; caseId: string; amount: number; method: PaymentMethod; reference?: string
  }, changedBy: StaffMember): Promise<Payment> {
    if (USE_MOCK) return delay(mockStore.recordPayment(input, changedBy))
    const { data, error } = await supabase!.from('payments').insert({
      contract_id: input.contractId, case_id: input.caseId, amount: input.amount,
      method: input.method, reference: input.reference || null, recorded_by: changedBy.id,
    }).select().single()
    if (error) throw error

    const { data: allPayments } = await supabase!.from('payments').select('amount').eq('contract_id', input.contractId)
    const totalPaid = (allPayments ?? []).reduce((sum, p) => sum + Number(p.amount), 0)
    const { data: contract } = await supabase!.from('contracts').select('total').eq('id', input.contractId).single()
    await supabase!.from('contracts').update({
      amount_paid: totalPaid, paid: contract ? totalPaid >= Number(contract.total) : false,
    }).eq('id', input.contractId)

    logAuditReal({
      entityType: 'payment', entityId: data.id, caseId: input.caseId, action: 'create',
      summary: `Recorded a $${input.amount.toFixed(2)} payment (${input.method.replace('_', ' ')})`, changedBy: changedBy.id,
    })

    return {
      id: data.id, contractId: data.contract_id, caseId: data.case_id, amount: Number(data.amount),
      method: data.method, reference: data.reference ?? undefined, receivedAt: data.received_at, recordedBy: data.recorded_by,
    }
  },

  // -------------------------------------------------------------------
  // Chain of Custody
  // -------------------------------------------------------------------

  async getCustodyLog(caseId?: string): Promise<CustodyLogEntry[]> {
    if (USE_MOCK) return delay(mockStore.getCustodyLog(caseId))
    let query = supabase!.from('custody_log').select('*, staff_members(name)').order('timestamp', { ascending: true })
    if (caseId) query = query.eq('case_id', caseId)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(rowToCustodyLogEntry)
  },

  /** Records a chain-of-custody transition. This should be an append-only, auditable action in production. */
  async moveCustody(
    caseId: string,
    toStage: CustodyStage,
    movedBy: StaffMember,
    note?: string
  ): Promise<{ cases: FuneralCase[]; log: CustodyLogEntry[] }> {
    if (USE_MOCK) return delay(mockStore.moveCustody(caseId, toStage, movedBy, note))
    const current = await this.getCase(caseId)
    const { error: caseErr } = await supabase!.from('cases').update({ custody_stage: toStage }).eq('id', caseId)
    if (caseErr) throw caseErr
    const { error: logErr } = await supabase!.from('custody_log').insert({
      case_id: caseId, from_stage: current?.custodyStage, to_stage: toStage,
      moved_by: movedBy.id, note,
    })
    if (logErr) throw logErr
    const decedentName = current ? `${current.decedent.firstName} ${current.decedent.lastName}` : caseId
    this.notifySlack(`📦 ${decedentName} moved to *${toStage.replace(/_/g, ' ')}* — by ${movedBy.name}`)
    logAuditReal({
      entityType: 'custody', entityId: caseId, caseId, action: 'status_change',
      summary: `Moved custody to "${toStage.replace(/_/g, ' ')}"`, changedBy: movedBy.id,
    })
    // One specific, meaningful moment gets a family text — not every stage
    // change, which would feel clinical rather than reassuring.
    if (toStage === 'funeral_home' && current) {
      const contactPhone = current.contacts.find((ct) => ct.isPrimary)?.phone ?? current.contacts[0]?.phone
      if (contactPhone) {
        this.notifyFamilySms(
          contactPhone,
          `This is Casillas Funeral Home. We want you to know that ${current.decedent.firstName} has arrived safely at our care facility and is being treated with the utmost care and respect. We are here for you and your family every step of the way.`
        )
      }
    }
    const [cases, log] = await Promise.all([this.getCases(), this.getCustodyLog()])
    return { cases, log }
  },

  // -------------------------------------------------------------------
  // Scheduling
  // -------------------------------------------------------------------

  async getVehicles(locationId?: string): Promise<Vehicle[]> {
    if (USE_MOCK) {
      const rows = mockStore.getVehicles()
      return delay(locationId ? rows.filter((v) => v.locationId === locationId) : rows)
    }
    let query = supabase!.from('vehicles').select('*')
    if (locationId) query = query.eq('location_id', locationId)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(rowToVehicle)
  },

  async getCalendarEvents(locationId?: string): Promise<CalendarEvent[]> {
    if (USE_MOCK) {
      const rows = mockStore.getEvents()
      return delay(locationId ? rows.filter((e) => e.locationId === locationId) : rows)
    }
    let query = supabase!.from('calendar_events').select('*, event_participants(staff_id)')
    if (locationId) query = query.eq('location_id', locationId)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(rowToEvent)
  },

  /** Checks for staff/vehicle double-booking before a create/edit is saved. */
  async findSchedulingConflicts(
    start: string,
    end: string,
    participantIds: string[],
    vehicleId: string | undefined,
    excludeEventId?: string
  ): Promise<SchedulingConflict[]> {
    if (USE_MOCK) return delay(mockStore.findConflicts(start, end, participantIds, vehicleId, excludeEventId))

    // Overlapping-range check done client-side against everything in a
    // generous window around the requested time, rather than a tight SQL
    // overlap query — simpler to keep correct, and event volume here is
    // small enough that this is fine. A real high-volume system would want
    // this as a Postgres function for atomicity instead.
    const windowStart = new Date(new Date(start).getTime() - 24 * 60 * 60 * 1000).toISOString()
    const windowEnd = new Date(new Date(end).getTime() + 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase!
      .from('calendar_events')
      .select('*, event_participants(staff_id)')
      .gte('start_at', windowStart)
      .lte('start_at', windowEnd)
    if (error) throw error

    const events = (data ?? []).map(rowToEvent).filter((e) => e.id !== excludeEventId)
    const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart < bEnd && bStart < aEnd
    const [staffRows, vehicleRows] = await Promise.all([this.getStaff(), this.getVehicles()])

    const conflicts: SchedulingConflict[] = []
    for (const e of events) {
      if (!overlaps(start, end, e.start, e.end)) continue
      for (const pid of participantIds) {
        if (e.participantIds.includes(pid)) {
          const person = staffRows.find((s) => s.id === pid)
          conflicts.push({ kind: 'staff', resourceId: pid, resourceName: person?.name ?? pid, conflictingEvent: e })
        }
      }
      if (vehicleId && e.vehicleId === vehicleId) {
        const vehicle = vehicleRows.find((v) => v.id === vehicleId)
        conflicts.push({ kind: 'vehicle', resourceId: vehicleId, resourceName: vehicle?.name ?? vehicleId, conflictingEvent: e })
      }
    }
    return conflicts
  },

  async createEvent(input: Omit<CalendarEvent, 'id'>, changedBy: StaffMember): Promise<CalendarEvent> {
    if (USE_MOCK) return delay(mockStore.createEvent(input, changedBy))
    const { data: eventRow, error } = await supabase!.from('calendar_events').insert(eventToRow(input)).select().single()
    if (error) throw error
    if (input.participantIds?.length) {
      const { error: partErr } = await supabase!
        .from('event_participants')
        .insert(input.participantIds.map((staffId) => ({ event_id: eventRow.id, staff_id: staffId })))
      if (partErr) throw partErr
    }
    const { data: full, error: fetchErr } = await supabase!
      .from('calendar_events').select('*, event_participants(staff_id)').eq('id', eventRow.id).single()
    if (fetchErr) throw fetchErr
    logAuditReal({
      entityType: 'event', entityId: eventRow.id, caseId: input.caseId, action: 'create',
      summary: `Scheduled "${input.title}"`, changedBy: changedBy.id,
    })
    return rowToEvent(full)
  },

  async updateEvent(id: string, patch: Partial<CalendarEvent>, changedBy: StaffMember): Promise<CalendarEvent | undefined> {
    if (USE_MOCK) return delay(mockStore.updateEvent(id, patch, changedBy))
    const row = eventToRow(patch)
    if (Object.keys(row).length > 0) {
      const { error } = await supabase!.from('calendar_events').update(row).eq('id', id)
      if (error) throw error
    }
    if (patch.participantIds) {
      const { error: deleteErr } = await supabase!.from('event_participants').delete().eq('event_id', id)
      if (deleteErr) throw deleteErr
      if (patch.participantIds.length) {
        const { error: insertErr } = await supabase!
          .from('event_participants')
          .insert(patch.participantIds.map((staffId) => ({ event_id: id, staff_id: staffId })))
        if (insertErr) throw insertErr
      }
    }
    const { data: full, error: fetchErr } = await supabase!
      .from('calendar_events').select('*, event_participants(staff_id)').eq('id', id).single()
    if (fetchErr) throw fetchErr
    logAuditReal({
      entityType: 'event', entityId: id, caseId: full.case_id ?? undefined, action: 'update',
      summary: `Updated "${full.title}"`, changedBy: changedBy.id,
    })
    return rowToEvent(full)
  },

  // -------------------------------------------------------------------
  // Vendor / item order confirmation tracking
  // -------------------------------------------------------------------

  async getOrders(caseId: string): Promise<ServiceOrder[]> {
    if (USE_MOCK) return delay(mockStore.getOrders(caseId))
    const { data, error } = await supabase!.from('service_orders').select('*').eq('case_id', caseId)
    if (error) throw error
    return (data ?? []).map(rowToServiceOrder)
  },

  async addOrder(caseId: string, item: string, changedBy: StaffMember): Promise<ServiceOrder> {
    if (USE_MOCK) return delay(mockStore.addOrder(caseId, item, changedBy))
    const { data, error } = await supabase!.from('service_orders').insert({ case_id: caseId, item, status: 'pending' }).select().single()
    if (error) throw error
    logAuditReal({
      entityType: 'order', entityId: data.id, caseId, action: 'create',
      summary: `Added order: ${item}`, changedBy: changedBy.id,
    })
    // Every order becomes a task too — same status lifecycle, kept in
    // sync automatically from here on.
    await supabase!.from('case_tasks').insert({
      case_id: caseId, label: item, category: suggestTaskCategory(item), status: 'pending', linked_order_id: data.id,
    })
    return rowToServiceOrder(data)
  },

  async updateOrderStatus(orderId: string, status: OrderStatus, changedBy: StaffMember): Promise<ServiceOrder[]> {
    if (USE_MOCK) return delay(mockStore.updateOrderStatus(orderId, status, changedBy))
    const patch: Record<string, unknown> = { status }
    const now = new Date().toISOString()
    if (status === 'ordered') { patch.ordered_by = changedBy.id; patch.ordered_at = now }
    if (status === 'confirmed') { patch.confirmed_by = changedBy.id; patch.confirmed_at = now }
    const { data: order, error } = await supabase!.from('service_orders').update(patch).eq('id', orderId).select('item, case_id').single()
    if (error) throw error
    await supabase!.from('case_tasks').update({ status }).eq('linked_order_id', orderId)
    logAuditReal({
      entityType: 'order', entityId: orderId, caseId: order?.case_id, action: 'status_change',
      summary: `Order "${order?.item}" marked ${TASK_STATUS_LABELS[status]}`, changedBy: changedBy.id,
    })
    return []
  },

  /** Sets or clears the price shown in the Orders tab's running quote total. Pass undefined to clear it. */
  async updateOrderPrice(orderId: string, price: number | undefined, changedBy: StaffMember): Promise<void> {
    if (USE_MOCK) { mockStore.updateOrderPrice(orderId, price, changedBy); return }
    const { data: order, error } = await supabase!.from('service_orders').update({ price: price ?? null }).eq('id', orderId).select('item, case_id, cases(location_id)').single()
    if (error) throw error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const locationId = (order as any)?.cases?.location_id
    if (order && locationId) {
      await syncOrderPriceToContract(order.case_id, locationId, orderId, order.item, price)
    }
    logAuditReal({
      entityType: 'order', entityId: orderId, caseId: order?.case_id, action: 'update',
      summary: `Updated price for order "${order?.item}"`, changedBy: changedBy.id,
    })
  },

  /** Removes an order entirely — for when a family decides against an item after seeing the quote total. */
  async deleteOrder(orderId: string, changedBy: StaffMember): Promise<void> {
    if (USE_MOCK) { mockStore.deleteOrder(orderId, changedBy); return }
    const { data: order } = await supabase!.from('service_orders').select('item, case_id').eq('id', orderId).single()
    await removeOrderFromContract(orderId)
    const { error } = await supabase!.from('service_orders').delete().eq('id', orderId)
    if (error) throw error
    if (order) {
      logAuditReal({
        entityType: 'order', entityId: orderId, caseId: order.case_id, action: 'delete',
        summary: `Removed order "${order.item}"`, changedBy: changedBy.id,
      })
    }
  },

  // -------------------------------------------------------------------
  // Inbound email → case matching
  //
  // The actual inbox polling (Microsoft Graph API against
  // info@casillasfuneralhome.com) runs server-side in a Supabase Edge
  // Function — see supabase/functions/sync-inbox/. It writes matched rows
  // into an `inbound_emails` table; these functions just read/update that
  // table. Nothing here talks to Microsoft directly, and nothing here
  // should ever hold a Graph API token client-side.
  // -------------------------------------------------------------------

  async getEmails(filter?: { caseId?: string; needsReview?: boolean }): Promise<InboundEmail[]> {
    if (USE_MOCK) return delay(mockStore.getEmails(filter))
    let query = supabase!.from('inbound_emails').select('*').order('received_at', { ascending: false })
    if (filter?.caseId) query = query.eq('case_id', filter.caseId)
    if (filter?.needsReview) query = query.in('match_status', ['suggested', 'unmatched'])
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(rowToEmail)
  },

  async confirmEmailMatch(emailId: string, caseId: string, changedBy: StaffMember): Promise<InboundEmail[]> {
    if (USE_MOCK) return delay(mockStore.confirmEmailMatch(emailId, caseId, changedBy))
    const { error } = await supabase!.from('inbound_emails').update({
      case_id: caseId, match_status: 'confirmed', confirmed_by: changedBy.id, confirmed_at: new Date().toISOString(),
    }).eq('id', emailId)
    if (error) throw error
    logAuditReal({
      entityType: 'email', entityId: emailId, caseId, action: 'update',
      summary: 'Confirmed email match to case', changedBy: changedBy.id,
    })
    return this.getEmails()
  },

  async ignoreEmail(emailId: string, changedBy: StaffMember): Promise<InboundEmail[]> {
    if (USE_MOCK) return delay(mockStore.ignoreEmail(emailId, changedBy))
    const { error } = await supabase!.from('inbound_emails').update({ match_status: 'ignored' }).eq('id', emailId)
    if (error) throw error
    logAuditReal({
      entityType: 'email', entityId: emailId, action: 'update',
      summary: 'Marked email as not case-relevant', changedBy: changedBy.id,
    })
    return this.getEmails()
  },

  /**
   * Runs one of the two per-attachment actions a staff member can take on
   * a matched email: "extract" reads it with Claude and returns fields to
   * review (nothing saved automatically); "save" just stores the file on
   * the case. Attachment content is only ever fetched at this moment, for
   * this one attachment — never in bulk.
   */
  async actOnEmailAttachment(params: {
    graphMessageId: string
    attachmentId: string
    filename: string
    contentType: string
    action: 'extract' | 'save'
    caseId: string
    changedBy: StaffMember
  }): Promise<{ action: 'extract'; extracted: ExtractedCaseData } | { action: 'save'; document: CaseDocument }> {
    if (USE_MOCK) {
      if (params.action === 'save') {
        return delay({
          action: 'save',
          document: await mockStore.addDocument(
            { caseId: params.caseId, name: params.filename, category: 'other', url: '', uploadedBy: params.changedBy.id },
            params.changedBy
          ),
        })
      }
      return delay({
        action: 'extract',
        extracted: {
          decedentFirstName: 'Sample', decedentLastName: 'FromAttachment',
          confidence: 'medium',
          notes: 'Placeholder — mock mode doesn\u2019t call the real extraction service.',
        },
      })
    }

    const { data, error } = await supabase!.functions.invoke('email-attachment-action', {
      body: { ...params, changedBy: params.changedBy.id },
    })
    if (error) {
      const context = (error as { context?: Response }).context
      if (context) {
        try {
          const errBody = await context.clone().json()
          throw new Error(errBody?.error ?? error.message)
        } catch {
          // fall through
        }
      }
      throw error
    }
    if (data.action === 'save') {
      logAuditReal({
        entityType: 'document', entityId: data.document.id, caseId: params.caseId, action: 'create',
        summary: `Saved email attachment "${params.filename}" to case`, changedBy: params.changedBy.id,
      })
    } else {
      logAuditReal({
        entityType: 'case', entityId: params.caseId, caseId: params.caseId, action: 'update',
        summary: `Extracted info from email attachment "${params.filename}" for review`, changedBy: params.changedBy.id,
      })
    }
    return data
  },

  // -------------------------------------------------------------------
  // E-signature requests (SignRequest API)
  //
  // Sending a document for signature requires a SignRequest API key,
  // which — like Stripe — must never live in frontend code. The real
  // implementation calls a Supabase Edge Function (see
  // supabase/functions/send-signature-request/) that holds the key
  // server-side and calls SignRequest's REST API. A second function
  // (supabase/functions/signrequest-webhook/) receives SignRequest's
  // "document signed" callback and updates the request status — the
  // frontend never polls SignRequest directly.
  // -------------------------------------------------------------------

  async getSignatureRequests(caseId?: string): Promise<SignatureRequest[]> {
    if (USE_MOCK) return delay(mockStore.getSignatureRequests(caseId))
    let query = supabase!.from('signature_requests').select('*')
    if (caseId) query = query.eq('case_id', caseId)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(rowToSignatureRequest)
  },

  /**
   * `pdfBlob` is required in real mode — the caller (CaseDetail) generates
   * it from the on-screen form via `pdfFromElement()` before calling this.
   * Ignored in mock mode, which just simulates the whole flow.
   */
  async createSignatureRequest(
    input: Omit<SignatureRequest, 'id' | 'status' | 'sentAt'>,
    changedBy: StaffMember,
    pdfBlob?: Blob
  ): Promise<SignatureRequest> {
    if (USE_MOCK) return delay(mockStore.createSignatureRequest(input, changedBy))

    if (!pdfBlob) throw new Error('A generated PDF is required to send for signature.')

    const path = `pending-signature/${input.caseId}/${Date.now()}-${input.documentName.replace(/[^a-z0-9]/gi, '-')}.pdf`
    const { error: uploadErr } = await supabase!.storage.from('case-documents').upload(path, pdfBlob, {
      contentType: 'application/pdf',
    })
    if (uploadErr) throw uploadErr

    const { data, error } = await supabase!.functions.invoke('send-signature-request', {
      body: { ...input, documentStoragePath: path },
    })
    if (error) {
      // supabase-js's default error for a non-2xx Edge Function response is
      // a generic "Edge Function returned a non-2xx status code" with none
      // of the actual detail our function put in its JSON body. The real
      // reason is sitting in `error.context`, the raw Response object —
      // read it out so the UI shows something actually diagnosable instead
      // of sending you back to the Supabase logs every time.
      const context = (error as { context?: Response }).context
      if (context) {
        try {
          const body = await context.clone().json()
          throw new Error(body?.error ?? error.message)
        } catch {
          // context wasn't JSON — fall through to the generic message
        }
      }
      throw error
    }
    logAuditReal({
      entityType: 'signature_request', entityId: data.id, caseId: input.caseId, action: 'create',
      summary: `Sent "${input.documentName}" to ${input.signerName} for signature`, changedBy: changedBy.id,
    })
    return rowToSignatureRequest(data)
  },

  /** Mock-only helper for demoing the flow without a real SignRequest webhook. */
  async simulateSignatureComplete(requestId: string): Promise<SignatureRequest[]> {
    if (USE_MOCK) return delay(mockStore.simulateSignatureComplete(requestId))
    return this.getSignatureRequests()
  },

  // -------------------------------------------------------------------
  // Document → case extraction
  //
  // Reads an uploaded document (intake form, hospital paperwork, an
  // existing invoice, etc.) via Claude and returns structured fields to
  // pre-fill a New Case form with. This never creates a case directly —
  // the frontend always routes the result through the normal case form
  // for a staff member to review and confirm first.
  // -------------------------------------------------------------------

  async extractCaseFromDocument(file: File): Promise<ExtractedCaseData> {
    if (USE_MOCK) {
      return delay({
        decedentFirstName: 'Sample', decedentLastName: 'Extraction',
        dateOfDeath: new Date().toISOString().slice(0, 10),
        placeOfDeath: 'Example Hospital',
        disposition: 'undetermined', type: 'at_need',
        contactName: 'Jane Sample', contactRelationship: 'Daughter',
        confidence: 'medium',
        notes: 'This is placeholder data — mock mode doesn\u2019t call the real extraction service. Connect Supabase to test with a real document.',
      }, 400)
    }

    const fileBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result.split(',')[1] ?? '') // strip the "data:...;base64," prefix
      }
      reader.onerror = () => reject(new Error('Could not read the uploaded file.'))
      reader.readAsDataURL(file)
    })

    const { data, error } = await supabase!.functions.invoke('extract-case-data', {
      body: { fileBase64, mediaType: file.type },
    })
    if (error) {
      const context = (error as { context?: Response }).context
      if (context) {
        try {
          const body = await context.clone().json()
          throw new Error(body?.error ?? error.message)
        } catch {
          // fall through to generic error below
        }
      }
      throw error
    }
    return data as ExtractedCaseData
  },

  // -------------------------------------------------------------------
  // Audit log
  // -------------------------------------------------------------------

  // -------------------------------------------------------------------
  // Staff time off
  // -------------------------------------------------------------------

  async getTimeOff(): Promise<StaffTimeOff[]> {
    if (USE_MOCK) return delay(mockStore.getTimeOff())
    const { data, error } = await supabase!.from('staff_time_off').select('*')
    if (error) throw error
    return (data ?? []).map(rowToTimeOff)
  },

  /** Manager+ only, enforced by RLS and by the caller checking canAssignStaff before showing the UI. */
  async addTimeOff(entry: Omit<StaffTimeOff, 'id'>, changedBy: StaffMember): Promise<StaffTimeOff> {
    if (USE_MOCK) return delay(mockStore.addTimeOff(entry, changedBy))
    const { data, error } = await supabase!.from('staff_time_off').insert({
      staff_id: entry.staffId, start_date: entry.startDate, end_date: entry.endDate,
      type: entry.type, notes: entry.notes ?? null, created_by: changedBy.id,
    }).select().single()
    if (error) throw error
    const staffList = await this.getStaff()
    const person = staffList.find((s) => s.id === entry.staffId)
    const typeLabel = entry.type === 'other_off' ? 'off' : entry.type
    this.notifySlack(`📅 ${person?.name ?? 'Someone'} marked as *${typeLabel}* ${entry.startDate} – ${entry.endDate}`)
    logAuditReal({
      entityType: 'staff', entityId: entry.staffId, action: 'create',
      summary: `Marked ${person?.name ?? entry.staffId} as ${typeLabel} from ${entry.startDate} to ${entry.endDate}`,
      changedBy: changedBy.id,
    })
    return rowToTimeOff(data)
  },

  async deleteTimeOff(id: string, changedBy: StaffMember): Promise<void> {
    if (USE_MOCK) { mockStore.deleteTimeOff(id, changedBy); return }
    const { data: entry } = await supabase!.from('staff_time_off').select('staff_id, type').eq('id', id).single()
    const { error } = await supabase!.from('staff_time_off').delete().eq('id', id)
    if (error) throw error
    if (entry) {
      logAuditReal({
        entityType: 'staff', entityId: entry.staff_id, action: 'delete',
        summary: `Removed a ${entry.type === 'other_off' ? 'off' : entry.type} entry`, changedBy: changedBy.id,
      })
    }
  },

  // -------------------------------------------------------------------
  // Internal staff chat — 1:1 and group conversations
  // -------------------------------------------------------------------

  /**
   * Every conversation the current user is part of, with the last message
   * and unread count already computed — what the sidebar list needs
   * directly, no further joins required by the caller.
   */
  async getConversations(currentUserId: string): Promise<ChatConversation[]> {
    if (USE_MOCK) return delay(mockStore.getConversations(currentUserId))

    const { data: myRows, error: myErr } = await supabase!
      .from('chat_participants')
      .select('conversation_id, last_read_at')
      .eq('staff_id', currentUserId)
    if (myErr) throw myErr
    if (!myRows?.length) return []

    const convIds = myRows.map((r) => r.conversation_id)
    const lastReadByConv = new Map(myRows.map((r) => [r.conversation_id, r.last_read_at]))

    const [{ data: convRows, error: convErr }, { data: allParticipants }, staffList] = await Promise.all([
      supabase!.from('chat_conversations').select('*').in('id', convIds),
      supabase!.from('chat_participants').select('conversation_id, staff_id').in('conversation_id', convIds),
      this.getStaff(),
    ])
    if (convErr) throw convErr

    const { data: allMessages } = await supabase!
      .from('chat_messages')
      .select('*')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false })

    const staffNameById = new Map(staffList.map((s) => [s.id, s.name]))

    return (convRows ?? []).map((conv) => {
      const participantIds = (allParticipants ?? []).filter((p) => p.conversation_id === conv.id).map((p) => p.staff_id)
      const messagesForConv = (allMessages ?? []).filter((m) => m.conversation_id === conv.id)
      const lastReadAt = lastReadByConv.get(conv.id)
      const unreadCount = messagesForConv.filter((m) => m.sender_id !== currentUserId && (!lastReadAt || m.created_at > lastReadAt)).length

      return {
        id: conv.id,
        name: conv.name ?? undefined,
        isGroup: conv.is_group,
        participantIds,
        participantNames: participantIds.map((id) => staffNameById.get(id) ?? 'Unknown'),
        createdBy: conv.created_by,
        createdAt: conv.created_at,
        lastMessage: messagesForConv[0]
          ? { body: messagesForConv[0].body, senderId: messagesForConv[0].sender_id, createdAt: messagesForConv[0].created_at }
          : undefined,
        unreadCount,
      }
    }).sort((a, b) => (b.lastMessage?.createdAt ?? b.createdAt).localeCompare(a.lastMessage?.createdAt ?? a.createdAt))
  },

  /** Full message history for one conversation. */
  async getConversationMessages(conversationId: string): Promise<ChatMessage[]> {
    if (USE_MOCK) return delay(mockStore.getConversationMessages(conversationId))
    const { data, error } = await supabase!
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []).map(rowToChatMessage)
  },

  /**
   * Starts a new conversation — pass one other person for a 1:1, or
   * several for a group (with an optional name; auto-generated from
   * participant names if left blank). Returns the new conversation's id.
   */
  async createConversation(participantIds: string[], name: string | undefined, currentUser: StaffMember): Promise<string> {
    const allParticipantIds = Array.from(new Set([...participantIds, currentUser.id]))
    if (USE_MOCK) return delay(mockStore.createConversation(allParticipantIds, name, currentUser))

    const isGroup = allParticipantIds.length > 2
    const { data: conv, error } = await supabase!
      .from('chat_conversations')
      .insert({ name: name || null, is_group: isGroup, created_by: currentUser.id })
      .select()
      .single()
    if (error) throw error

    const { error: partErr } = await supabase!
      .from('chat_participants')
      .insert(allParticipantIds.map((staffId) => ({ conversation_id: conv.id, staff_id: staffId })))
    if (partErr) throw partErr

    return conv.id
  },

  async sendMessage(conversationId: string, body: string, sender: StaffMember): Promise<ChatMessage> {
    if (USE_MOCK) return delay(mockStore.sendMessage(conversationId, body, sender))
    const { data, error } = await supabase!
      .from('chat_messages')
      .insert({ conversation_id: conversationId, sender_id: sender.id, body })
      .select()
      .single()
    if (error) throw error
    return rowToChatMessage(data)
  },

  /** Marks a conversation as read up to now, for the current user only. */
  async markConversationRead(conversationId: string, currentUserId: string): Promise<void> {
    if (USE_MOCK) { mockStore.markConversationRead(conversationId, currentUserId); return }
    const { error } = await supabase!
      .from('chat_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('staff_id', currentUserId)
    if (error) throw error
  },

  /**
   * Live updates for the current user's messages — new/changed rows call
   * `onChange` immediately, no refresh needed. Returns an unsubscribe
   * function; call it when the component unmounts. Mock mode has no
   * realtime equivalent, so this is a no-op there.
   *
   * Subscribes to every chat_messages insert rather than filtering
   * server-side by conversation — Realtime's column filters can't express
   * "conversation_id is one of these several IDs" cleanly, and chat
   * volume for a single funeral home is small enough that filtering
   * client-side (the caller checks the message's conversationId against
   * its own known conversation list) is simpler and reliable, including
   * for a conversation someone was just added to seconds ago.
   */
  subscribeToMessages(currentUserId: string, onChange: (newMessage: ChatMessage | null) => void): () => void {
    if (USE_MOCK) return () => {}
    const uniqueSuffix = Math.random().toString(36).slice(2)
    const handlePayload = (payload: { new: unknown }) => onChange(payload.new ? rowToChatMessage(payload.new) : null)
    const channel = supabase!
      .channel(`chat-${currentUserId}-${uniqueSuffix}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, handlePayload)
      .subscribe()
    return () => { supabase!.removeChannel(channel) }
  },

  // -------------------------------------------------------------------
  // Family Portal
  //
  // Two very different access patterns on purpose: creating a link is a
  // normal staff-authenticated write (RLS-protected, same as everything
  // else). Reading portal data as the family is NOT — it goes through
  // family-portal-data, a dedicated Edge Function that validates the
  // token itself rather than relying on a login that a family member
  // will never have. See that function's file for the full reasoning.
  // -------------------------------------------------------------------

  /** Manager+ / anyone with case-edit access — creates a fresh, hard-to-guess link for a family to use. */
  async createFamilyPortalLink(caseId: string, contactId: string | undefined, expiresInDays: number | undefined, changedBy?: StaffMember): Promise<{ token: string; url: string }> {
    // Long random token — two concatenated UUIDs with dashes stripped, 64
    // hex characters. Not guessable, and not derived from the case ID.
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    if (USE_MOCK) {
      return delay({ token, url: `${window.location.origin}/portal/${token}` })
    }
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString() : null
    const { error } = await supabase!.from('family_portal_links').insert({
      case_id: caseId, contact_id: contactId ?? null, token, expires_at: expiresAt,
    })
    if (error) throw error
    if (changedBy) {
      logAuditReal({
        entityType: 'case', entityId: caseId, caseId, action: 'create',
        summary: 'Generated a Family Portal link', changedBy: changedBy.id,
      })
    }
    return { token, url: `${window.location.origin}/portal/${token}` }
  },

  /** Public — no auth. This is what the family's browser actually calls. */
  async getFamilyPortalData(token: string): Promise<{
    case: FuneralCase; location: Location; gplItems: GplItem[]; contracts: Contract[]; mediaFiles: CaseDocument[]; statusMessage: string | null
  }> {
    if (USE_MOCK) {
      // Mock mode: treat the "token" as a case ID directly, so the demo
      // experience still works without needing a real link generated first.
      const c = await mockStore.getCase(token)
      if (!c) throw new Error('This link is invalid.')
      return {
        case: c,
        location: mockLocations.find((l) => l.id === c.locationId)!,
        gplItems: mockStore.getGplItems(),
        contracts: mockStore.getContracts().filter((ct) => ct.caseId === c.id),
        mediaFiles: [],
        statusMessage: 'Your loved one is in our care.',
      }
    }
    const { data, error } = await supabase!.functions.invoke('family-portal-data', { body: { token } })
    if (error) {
      const context = (error as { context?: Response }).context
      if (context) {
        try {
          const body = await context.clone().json()
          throw new Error(body?.error ?? error.message)
        } catch {
          // fall through
        }
      }
      throw error
    }
    return {
      case: rowToCase(data.case),
      location: data.location,
      gplItems: (data.gplItems ?? []).map(rowToGplItem),
      contracts: (data.contracts ?? []).map(rowToContract),
      mediaFiles: (data.mediaFiles ?? []).map(rowToDocument),
      statusMessage: data.statusMessage,
    }
  },

  /** Public — no auth. Lets a family member complete missing First Call/Vital Sheet fields through their portal link. Only the narrow field set the Edge Function allows — see its comments for exactly what's excluded and why, and how shared-field discrepancies (DOB, veteran) are handled instead of silently overwritten. */
  async updateFamilyPortalInfo(token: string, updates: {
    dateOfBirth?: string; ssn?: string; veteran?: boolean
    contactName?: string; contactPhone?: string; contactRelationship?: string
    doctorName?: string; doctorPhone?: string; hospiceName?: string; hospicePhone?: string
    vitalSheet?: Partial<VitalSheetInfo>
  }): Promise<{ hasDiscrepancy: boolean }> {
    if (USE_MOCK) return { hasDiscrepancy: false } // no-op in demo mode
    const { data, error } = await supabase!.functions.invoke('family-portal-update', { body: { token, ...updates } })
    if (error) {
      const context = (error as { context?: Response }).context
      if (context) {
        try {
          const body = await context.clone().json()
          throw new Error(body?.error ?? error.message)
        } catch {
          // fall through
        }
      }
      throw error
    }
    return { hasDiscrepancy: !!data?.hasDiscrepancy }
  },

  /** Public — no auth. Lets a family member add/remove a real price-list item on their case's quote through their portal link — same underlying quote the staff Quote Builder uses. */
  async toggleFamilyPortalQuoteItem(token: string, action: 'add' | 'remove', gplItem: { id: string; name: string; price: number }): Promise<void> {
    if (USE_MOCK) return // no-op in demo mode
    const { error } = await supabase!.functions.invoke('family-portal-quote', {
      body: { token, action, gplItemId: gplItem.id, name: gplItem.name, price: gplItem.price },
    })
    if (error) {
      const context = (error as { context?: Response }).context
      if (context) {
        try {
          const body = await context.clone().json()
          throw new Error(body?.error ?? error.message)
        } catch {
          // fall through
        }
      }
      throw error
    }
  },

  /** Public — no auth. Lets a family member upload a photo or song for the memorial slideshow through their portal link. Uses a direct fetch() rather than supabase.functions.invoke() — checks the real HTTP status/body itself instead of trusting the SDK wrapper to detect failures, since that wasn't reliably surfacing errors for this specific request. */
  async uploadFamilyPortalFile(token: string, file: File, kind: 'photo' | 'music'): Promise<void> {
    if (USE_MOCK) return // no-op in demo mode
    const base64Data: string = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = () => reject(new Error('Could not read the file'))
      reader.readAsDataURL(file)
    })
    const response = await fetch(`${supabaseUrl}/functions/v1/family-portal-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseAnonKey}`,
        apikey: supabaseAnonKey!,
      },
      body: JSON.stringify({ token, filename: file.name, contentType: file.type, base64Data, kind }),
    })
    let responseBody: { error?: string; ok?: boolean } = {}
    try {
      responseBody = await response.json()
    } catch {
      // Non-JSON response — fall through to the generic message below.
    }
    if (!response.ok) {
      throw new Error(responseBody?.error ?? `Upload failed (${response.status}). Please try again or use a smaller photo.`)
    }
  },

  // -------------------------------------------------------------------
  // Slack notifications
  //
  // Fire-and-forget — a failed or unconfigured Slack integration should
  // never block or fail the actual action that triggered it. Every call
  // site below wraps this in its own try/catch for exactly that reason.
  // -------------------------------------------------------------------

  async notifySlack(text: string): Promise<void> {
    if (USE_MOCK) return // no-op in demo mode
    try {
      await supabase!.functions.invoke('notify-slack', { body: { text } })
    } catch {
      // Deliberately swallowed — see comment above.
    }
  },

  /** Fire-and-forget, same reasoning as notifySlack — a failed text should never block or fail the case action that triggered it. */
  async notifyFamilySms(toPhone: string, message: string): Promise<void> {
    if (USE_MOCK) return // no-op in demo mode
    try {
      await supabase!.functions.invoke('notify-family-sms', { body: { toPhone, message } })
    } catch {
      // Deliberately swallowed.
    }
  },

  // -------------------------------------------------------------------
  // Audit log
  // -------------------------------------------------------------------

  // -------------------------------------------------------------------
  // Family CRM
  // -------------------------------------------------------------------

  async getFamilies(): Promise<Family[]> {
    if (USE_MOCK) return delay(mockStore.getFamilies())
    const { data, error } = await supabase!.from('families').select('*').order('name')
    if (error) throw error
    return (data ?? []).map(rowToFamily)
  },

  async getFamily(id: string): Promise<Family | undefined> {
    if (USE_MOCK) return delay(mockStore.getFamily(id))
    const { data, error } = await supabase!.from('families').select('*').eq('id', id).single()
    if (error) throw error
    return data ? rowToFamily(data) : undefined
  },

  /** Every case ever linked to this family, most recent first — the actual "lifetime relationship" view. */
  async getFamilyCases(familyId: string): Promise<FuneralCase[]> {
    if (USE_MOCK) {
      const all = mockStore.getCases()
      return delay(all.filter((c) => c.familyId === familyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    }
    const { data, error } = await supabase!.from('cases').select('*, case_contacts(*)').eq('family_id', familyId)
    if (error) throw error
    return (data ?? []).map(rowToCase).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  async createFamily(input: Omit<Family, 'id' | 'createdAt'>, changedBy?: StaffMember): Promise<Family> {
    if (USE_MOCK) return delay(mockStore.createFamily(input))
    const { data, error } = await supabase!.from('families').insert(familyToRow(input)).select().single()
    if (error) throw error
    if (changedBy) {
      logAuditReal({
        entityType: 'family', entityId: data.id, action: 'create',
        summary: `Created family "${input.name}"`, changedBy: changedBy.id,
      })
    }
    return rowToFamily(data)
  },

  async updateFamily(id: string, patch: Partial<Family>, changedBy?: StaffMember): Promise<Family | undefined> {
    if (USE_MOCK) return delay(mockStore.updateFamily(id, patch))
    const { data, error } = await supabase!.from('families').update(familyToRow(patch)).eq('id', id).select().single()
    if (error) throw error
    if (changedBy) {
      logAuditReal({
        entityType: 'family', entityId: id, action: 'update',
        summary: `Updated family "${data.name}"`, changedBy: changedBy.id,
      })
    }
    return rowToFamily(data)
  },

  async getFamilyInteractions(familyId: string): Promise<FamilyInteraction[]> {
    if (USE_MOCK) return delay(mockStore.getFamilyInteractions(familyId))
    const { data, error } = await supabase!
      .from('family_interactions')
      .select('*, staff_members(name)')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(rowToFamilyInteraction)
  },

  async addFamilyInteraction(familyId: string, type: FamilyInteractionType, notes: string, changedBy: StaffMember): Promise<FamilyInteraction> {
    if (USE_MOCK) return delay(mockStore.addFamilyInteraction(familyId, type, notes, changedBy))
    const { data, error } = await supabase!
      .from('family_interactions')
      .insert({ family_id: familyId, type, notes, created_by: changedBy.id })
      .select('*, staff_members(name)')
      .single()
    if (error) throw error
    logAuditReal({
      entityType: 'family', entityId: familyId, action: 'create',
      summary: `Logged interaction: ${type.replace(/_/g, ' ')}`, changedBy: changedBy.id,
    })
    return rowToFamilyInteraction(data)
  },

  /** Simple name/phone search for linking a case to an existing family during case creation. */
  async searchFamilies(query: string): Promise<Family[]> {
    const all = await this.getFamilies()
    const q = query.trim().toLowerCase()
    if (!q) return []
    return all.filter((f) =>
      f.name.toLowerCase().includes(q) ||
      f.primaryContactName?.toLowerCase().includes(q) ||
      f.primaryContactPhone?.includes(q)
    )
  },

  // -------------------------------------------------------------------
  // Vendor directory
  // -------------------------------------------------------------------

  async getVendors(): Promise<Vendor[]> {
    if (USE_MOCK) return delay(mockStore.getVendors())
    const { data, error } = await supabase!.from('vendors').select('*').order('name')
    if (error) throw error
    return (data ?? []).map(rowToVendor)
  },

  async createVendor(input: Omit<Vendor, 'id' | 'createdAt'>, changedBy: StaffMember): Promise<Vendor> {
    if (USE_MOCK) return delay(mockStore.createVendor(input, changedBy))
    const { data, error } = await supabase!.from('vendors').insert(vendorToRow(input)).select().single()
    if (error) throw error
    logAuditReal({ entityType: 'vendor', entityId: data.id, action: 'create', summary: `Added vendor "${input.name}"`, changedBy: changedBy.id })
    return rowToVendor(data)
  },

  async deleteVendor(id: string, changedBy: StaffMember): Promise<void> {
    if (USE_MOCK) { mockStore.deleteVendor(id, changedBy); return }
    const { data: v } = await supabase!.from('vendors').select('name').eq('id', id).single()
    const { error } = await supabase!.from('vendors').delete().eq('id', id)
    if (error) throw error
    if (v) logAuditReal({ entityType: 'vendor', entityId: id, action: 'delete', summary: `Removed vendor "${v.name}"`, changedBy: changedBy.id })
  },

  /**
   * A short-lived link to a document already saved in Storage — this is
   * how "send this to a vendor" actually works. Browsers can't attach a
   * file to a mailto: link, so instead this opens an email with a real
   * working link the vendor clicks to get the document themselves.
   */
  async getDocumentSignedUrl(storagePath: string): Promise<string> {
    if (USE_MOCK) return `https://example.com/mock-document/${storagePath}`
    const { data, error } = await supabase!.storage.from('case-documents').createSignedUrl(storagePath, 60 * 60 * 24 * 7) // 7 days
    if (error) throw error
    return data.signedUrl
  },

  // -------------------------------------------------------------------
  // Audit log
  // -------------------------------------------------------------------

  async getAuditLog(filters?: { caseId?: string; entityType?: AuditLogEntry['entityType'] }): Promise<AuditLogEntry[]> {
    if (USE_MOCK) return delay(mockStore.getAuditLog(filters))
    let query = supabase!.from('audit_log').select('*, staff_members(name)').order('timestamp', { ascending: false })
    if (filters?.caseId) query = query.eq('case_id', filters.caseId)
    if (filters?.entityType) query = query.eq('entity_type', filters.entityType)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(rowToAuditLogEntry)
  },
}
