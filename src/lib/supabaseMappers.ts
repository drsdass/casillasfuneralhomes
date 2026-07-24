// src/lib/supabaseMappers.ts
//
// The app's TypeScript types use camelCase and, for cases, a nested
// `decedent` object and a `contacts` array. The real Postgres schema uses
// snake_case flat columns for the decedent fields and a separate
// `case_contacts` table for contacts. These functions translate between
// the two so api.ts's real-mode (Supabase) branches actually work, instead
// of naively passing the app's JS objects straight through and getting
// silent 400s from mismatched/missing columns.

import type { FuneralCase, CaseContact } from '@/types'

/** FuneralCase (app shape) -> cases table row (DB shape). Does NOT include contacts — insert those separately into case_contacts. */
export function caseToRow(c: Partial<FuneralCase>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (c.orgId !== undefined) row.org_id = c.orgId
  if (c.locationId !== undefined) row.location_id = c.locationId
  if (c.familyId !== undefined) row.family_id = c.familyId ?? null
  if (c.firstCall !== undefined) row.first_call = c.firstCall
  if (c.vitalSheet !== undefined) row.vital_sheet = c.vitalSheet
  if (c.fieldDiscrepancies !== undefined) row.field_discrepancies = c.fieldDiscrepancies
  if (c.caseNumber !== undefined) row.case_number = c.caseNumber
  if (c.type !== undefined) row.type = c.type
  if (c.status !== undefined) row.status = c.status
  if (c.disposition !== undefined) row.disposition = c.disposition
  if (c.assignedDirectorId !== undefined) row.assigned_director_id = c.assignedDirectorId
  if (c.assignedEmbalmerId !== undefined) row.assigned_embalmer_id = c.assignedEmbalmerId
  if (c.visitationDate !== undefined) row.visitation_date = c.visitationDate
  if (c.visitationLocation !== undefined) row.visitation_location = c.visitationLocation
  if (c.serviceDate !== undefined) row.service_date = c.serviceDate
  if (c.serviceLocation !== undefined) row.service_location = c.serviceLocation
  if (c.color !== undefined) row.color = c.color
  if (c.custodyStage !== undefined) row.custody_stage = c.custodyStage

  if (c.decedent) {
    row.decedent_first_name = c.decedent.firstName
    row.decedent_middle_name = c.decedent.middleName ?? null
    row.decedent_last_name = c.decedent.lastName
    row.decedent_dob = c.decedent.dateOfBirth ?? null
    row.decedent_dod = c.decedent.dateOfDeath ?? null
    row.decedent_place_of_death = c.decedent.placeOfDeath ?? null
    row.decedent_sex = c.decedent.sex ?? null
    row.decedent_marital_status = c.decedent.maritalStatus ?? null
    row.decedent_veteran = c.decedent.veteran ?? false
    // decedent.ssn intentionally not mapped — encrypt at the application
    // layer before ever sending it to the database (see schema.sql comment
    // on decedent_ssn_encrypted). Not implemented yet; don't collect SSNs
    // in the UI until it is.
  }

  return row
}

/** cases table row (DB shape, with case_contacts joined as `case_contacts`) -> FuneralCase (app shape). */
export function rowToCase(row: any): FuneralCase {
  return {
    id: row.id,
    orgId: row.org_id,
    locationId: row.location_id,
    familyId: row.family_id ?? undefined,
    firstCall: row.first_call ?? undefined,
    vitalSheet: row.vital_sheet ?? undefined,
    fieldDiscrepancies: row.field_discrepancies ?? undefined,
    caseNumber: row.case_number,
    type: row.type,
    status: row.status,
    disposition: row.disposition,
    decedent: {
      firstName: row.decedent_first_name,
      middleName: row.decedent_middle_name ?? undefined,
      lastName: row.decedent_last_name,
      dateOfBirth: row.decedent_dob ?? undefined,
      dateOfDeath: row.decedent_dod ?? undefined,
      placeOfDeath: row.decedent_place_of_death ?? undefined,
      sex: row.decedent_sex ?? undefined,
      maritalStatus: row.decedent_marital_status ?? undefined,
      veteran: row.decedent_veteran ?? undefined,
    },
    contacts: (row.case_contacts ?? []).map(rowToContact),
    assignedDirectorId: row.assigned_director_id ?? undefined,
    assignedEmbalmerId: row.assigned_embalmer_id ?? undefined,
    visitationDate: row.visitation_date ?? undefined,
    visitationLocation: row.visitation_location ?? undefined,
    serviceDate: row.service_date ?? undefined,
    serviceLocation: row.service_location ?? undefined,
    color: row.color ?? undefined,
    custodyStage: row.custody_stage,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function contactToRow(contact: CaseContact, caseId: string): Record<string, unknown> {
  return {
    case_id: caseId,
    name: contact.name,
    relationship: contact.relationship,
    phone: contact.phone ?? null,
    email: contact.email ?? null,
    is_primary: contact.isPrimary,
    is_authorizing_agent: contact.isAuthorizingAgent,
  }
}

function rowToContact(row: any): CaseContact {
  return {
    id: row.id,
    name: row.name,
    relationship: row.relationship,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    isPrimary: row.is_primary,
    isAuthorizingAgent: row.is_authorizing_agent,
  }
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------
import type {
  StaffMember, CaseDocument, CalendarEvent, GplItem, Contract, ContractLineItem,
  Vehicle, CustodyLogEntry, ServiceOrder, InboundEmail, SignatureRequest, AuditLogEntry,
} from '@/types'

export function rowToStaff(row: any): StaffMember {
  return {
    id: row.id,
    orgId: row.org_id,
    locationIds: (row.staff_locations ?? []).map((sl: { location_id: string }) => sl.location_id),
    name: row.name,
    email: row.email,
    role: row.role,
    title: row.title ?? undefined,
    department: row.department ?? undefined,
    phone: row.phone ?? undefined,
    avatarColor: row.avatar_color ?? undefined,
    active: row.active,
    disabledFeatures: row.disabled_features ?? [],
  }
}

// ---------------------------------------------------------------------------
// Case documents
// ---------------------------------------------------------------------------

export function documentToRow(doc: Omit<CaseDocument, 'id' | 'uploadedAt'>): Record<string, unknown> {
  return {
    case_id: doc.caseId,
    name: doc.name,
    category: doc.category,
    storage_path: doc.url,
    uploaded_by: doc.uploadedBy,
    signed: doc.signed ?? false,
  }
}

export function rowToDocument(row: any): CaseDocument {
  return {
    id: row.id,
    caseId: row.case_id,
    name: row.name,
    category: row.category,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by,
    url: row.storage_path,
    signed: row.signed ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// Calendar events (+ participants join table)
// ---------------------------------------------------------------------------

export function eventToRow(e: Partial<CalendarEvent>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (e.orgId !== undefined) row.org_id = e.orgId
  if (e.locationId !== undefined) row.location_id = e.locationId
  if (e.caseId !== undefined) row.case_id = e.caseId ?? null
  if (e.vehicleId !== undefined) row.vehicle_id = e.vehicleId ?? null
  if (e.title !== undefined) row.title = e.title
  if (e.type !== undefined) row.type = e.type
  if (e.start !== undefined) row.start_at = e.start
  if (e.end !== undefined) row.end_at = e.end
  if (e.location !== undefined) row.location_text = e.location ?? null
  if (e.notes !== undefined) row.notes = e.notes ?? null
  return row
}

export function rowToEvent(row: any): CalendarEvent {
  return {
    id: row.id,
    orgId: row.org_id,
    locationId: row.location_id,
    caseId: row.case_id ?? undefined,
    vehicleId: row.vehicle_id ?? undefined,
    title: row.title,
    type: row.type,
    start: row.start_at,
    end: row.end_at,
    location: row.location_text ?? undefined,
    notes: row.notes ?? undefined,
    participantIds: (row.event_participants ?? []).map((p: { staff_id: string }) => p.staff_id),
  }
}

// ---------------------------------------------------------------------------
// GPL items
// ---------------------------------------------------------------------------

export function rowToGplItem(row: any): GplItem {
  return {
    id: row.id,
    orgId: row.org_id,
    locationId: row.location_id,
    sku: row.sku ?? undefined,
    name: row.name,
    category: row.category,
    price: Number(row.price),
    taxable: row.taxable,
    active: row.active,
  }
}

// ---------------------------------------------------------------------------
// Contracts (+ line items join table)
// ---------------------------------------------------------------------------

export function rowToContract(row: any): Contract {
  return {
    id: row.id,
    caseId: row.case_id,
    locationId: row.location_id,
    status: row.status,
    lineItems: (row.contract_line_items ?? []).map(rowToLineItem),
    subtotal: Number(row.subtotal),
    taxTotal: Number(row.tax_total),
    discount: Number(row.discount ?? 0),
    total: Number(row.total),
    amountPaid: Number(row.amount_paid),
    paid: row.paid,
    createdAt: row.created_at,
    signedAt: row.signed_at ?? undefined,
  }
}

function rowToLineItem(row: any): ContractLineItem {
  return {
    id: row.id,
    gplItemId: row.gpl_item_id,
    serviceOrderId: row.service_order_id ?? undefined,
    name: row.name,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    adjustmentAmount: row.adjustment_amount ? Number(row.adjustment_amount) : undefined,
  }
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

export function rowToVehicle(row: any): Vehicle {
  return {
    id: row.id,
    orgId: row.org_id,
    locationId: row.location_id,
    name: row.name,
    type: row.type,
    active: row.active,
  }
}

// ---------------------------------------------------------------------------
// Custody log — moved_by_name isn't a stored column (only the staff_id is);
// this looks up the CURRENT name of that staff member via a join. Not
// perfectly historically accurate if someone's name changes later, but
// functional. Add a snapshot name column later if that matters.
// ---------------------------------------------------------------------------

export function rowToCustodyLogEntry(row: any): CustodyLogEntry {
  return {
    id: row.id,
    caseId: row.case_id,
    fromStage: row.from_stage ?? undefined,
    toStage: row.to_stage,
    movedBy: row.moved_by,
    movedByName: row.staff_members?.name ?? 'Unknown',
    timestamp: row.timestamp,
    note: row.note ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// Service orders
// ---------------------------------------------------------------------------

export function rowToServiceOrder(row: any): ServiceOrder {
  return {
    id: row.id,
    caseId: row.case_id,
    item: row.item,
    status: row.status,
    price: row.price !== null && row.price !== undefined ? Number(row.price) : undefined,
    vendor: row.vendor ?? undefined,
    notes: row.notes ?? undefined,
    orderedBy: row.ordered_by ?? undefined,
    orderedAt: row.ordered_at ?? undefined,
    confirmedBy: row.confirmed_by ?? undefined,
    confirmedAt: row.confirmed_at ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// Inbound emails
// ---------------------------------------------------------------------------

export function rowToEmail(row: any): InboundEmail {
  return {
    id: row.id,
    graphMessageId: row.graph_message_id,
    from: row.from_address,
    fromName: row.from_name ?? undefined,
    subject: row.subject,
    preview: row.preview ?? '',
    receivedAt: row.received_at,
    caseId: row.case_id ?? undefined,
    matchStatus: row.match_status,
    matchConfidence: row.match_confidence != null ? Number(row.match_confidence) : undefined,
    matchReason: row.match_reason ?? undefined,
    attachments: row.attachments ?? [],
    confirmedBy: row.confirmed_by ?? undefined,
    confirmedAt: row.confirmed_at ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// Signature requests
// ---------------------------------------------------------------------------

export function rowToSignatureRequest(row: any): SignatureRequest {
  return {
    id: row.id,
    caseId: row.case_id,
    documentName: row.document_name,
    signRequestId: row.sign_request_id ?? undefined,
    status: row.status,
    signerName: row.signer_name,
    signerEmail: row.signer_email,
    sentBy: row.sent_by,
    sentAt: row.sent_at ?? undefined,
    signedAt: row.signed_at ?? undefined,
    signedDocumentUrl: row.signed_document_url ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// Audit log — same name-snapshot caveat as custody log, see above.
// ---------------------------------------------------------------------------

export function rowToAuditLogEntry(row: any): AuditLogEntry {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    caseId: row.case_id ?? undefined,
    action: row.action,
    summary: row.summary,
    changedBy: row.changed_by,
    changedByName: row.staff_members?.name ?? 'Unknown',
    timestamp: row.timestamp,
  }
}

// ---------------------------------------------------------------------------
// Tasks & notes
// ---------------------------------------------------------------------------
import type { CaseTask, CaseNote } from '@/types'

export function rowToTask(row: any): CaseTask {
  return {
    id: row.id,
    caseId: row.case_id,
    label: row.label,
    category: row.category,
    status: row.status,
    dueDate: row.due_date ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    linkedOrderId: row.linked_order_id ?? undefined,
  }
}

/** author_name isn't a stored column (only author_id) — joined from staff_members, same caveat as custody/audit log. */
export function rowToNote(row: any): CaseNote {
  return {
    id: row.id,
    caseId: row.case_id,
    authorId: row.author_id,
    authorName: row.staff_members?.name ?? 'Unknown',
    body: row.body,
    createdAt: row.created_at,
    pinned: row.pinned ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// Staff time off
// ---------------------------------------------------------------------------
import type { StaffTimeOff } from '@/types'

export function rowToTimeOff(row: any): StaffTimeOff {
  return {
    id: row.id,
    staffId: row.staff_id,
    startDate: row.start_date,
    endDate: row.end_date,
    type: row.type,
    notes: row.notes ?? undefined,
    createdBy: row.created_by,
  }
}

// ---------------------------------------------------------------------------
// Chat messages
// ---------------------------------------------------------------------------
import type { ChatMessage } from '@/types'

export function rowToChatMessage(row: any): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
  }
}

// ---------------------------------------------------------------------------
// Family CRM
// ---------------------------------------------------------------------------
import type { Family, FamilyInteraction } from '@/types'

export function rowToFamily(row: any): Family {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    primaryContactName: row.primary_contact_name ?? undefined,
    primaryContactPhone: row.primary_contact_phone ?? undefined,
    primaryContactEmail: row.primary_contact_email ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  }
}

export function familyToRow(f: Partial<Family>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (f.orgId !== undefined) row.org_id = f.orgId
  if (f.name !== undefined) row.name = f.name
  if (f.primaryContactName !== undefined) row.primary_contact_name = f.primaryContactName || null
  if (f.primaryContactPhone !== undefined) row.primary_contact_phone = f.primaryContactPhone || null
  if (f.primaryContactEmail !== undefined) row.primary_contact_email = f.primaryContactEmail || null
  if (f.notes !== undefined) row.notes = f.notes || null
  return row
}

/** created_by_name isn't a stored column — joined from staff_members, same pattern as notes/custody log. */
export function rowToFamilyInteraction(row: any): FamilyInteraction {
  return {
    id: row.id,
    familyId: row.family_id,
    type: row.type,
    notes: row.notes,
    createdBy: row.created_by,
    createdByName: row.staff_members?.name ?? 'Unknown',
    createdAt: row.created_at,
  }
}

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------
import type { Vendor } from '@/types'

export function rowToVendor(row: any): Vendor {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    category: row.category,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    address: row.address ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  }
}

export function vendorToRow(v: Partial<Vendor>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (v.orgId !== undefined) row.org_id = v.orgId
  if (v.name !== undefined) row.name = v.name
  if (v.category !== undefined) row.category = v.category
  if (v.email !== undefined) row.email = v.email || null
  if (v.phone !== undefined) row.phone = v.phone || null
  if (v.address !== undefined) row.address = v.address || null
  if (v.notes !== undefined) row.notes = v.notes || null
  return row
}

// ---------------------------------------------------------------------------
// Task templates
// ---------------------------------------------------------------------------
import type { TaskTemplate } from '@/types'

export function rowToTaskTemplate(row: any): TaskTemplate {
  return {
    id: row.id,
    orgId: row.org_id,
    label: row.label,
    category: row.category,
    daysUntilDue: row.days_until_due ?? undefined,
    sortOrder: row.sort_order,
    active: row.active,
  }
}

export function taskTemplateToRow(t: Partial<TaskTemplate>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (t.orgId !== undefined) row.org_id = t.orgId
  if (t.label !== undefined) row.label = t.label
  if (t.category !== undefined) row.category = t.category
  if (t.daysUntilDue !== undefined) row.days_until_due = t.daysUntilDue ?? null
  if (t.sortOrder !== undefined) row.sort_order = t.sortOrder
  if (t.active !== undefined) row.active = t.active
  return row
}
