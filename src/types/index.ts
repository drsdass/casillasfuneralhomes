// ---------------------------------------------------------------------------
// Core domain types for the multi-location funeral home case management system
// ---------------------------------------------------------------------------

// Permission tier — ranked highest to lowest. This is separate from `title`
// (job title like "Funeral Director" or "Embalmer"), which is descriptive
// only and has no bearing on access control.
export type UserRole =
  | 'super_admin' // only role that can assign/change other users' roles
  | 'admin'
  | 'manager'
  | 'supervisor'
  | 'staff_member' // lowest tier — restricted to invoices: print + paid/unpaid toggle only

export const ROLE_RANK: Record<UserRole, number> = {
  super_admin: 5,
  admin: 4,
  manager: 3,
  supervisor: 2,
  staff_member: 1,
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
  supervisor: 'Supervisor',
  staff_member: 'Staff Member',
}

export interface Organization {
  id: string
  name: string
  createdAt: string
}

export interface Location {
  id: string
  orgId: string
  name: string
  address: string
  city: string
  state: string
  zip: string
  phone: string
  timezone: string
  licenseNumber?: string
  active: boolean
}

export interface StaffMember {
  id: string
  orgId: string
  locationIds: string[] // which locations this person can access
  name: string
  email: string
  role: UserRole
  title?: string
  department?: string // e.g. "Funeral Services", "Administration" — job grouping, not a permission
  phone?: string
  avatarColor?: string // for whiteboard chips
  active: boolean
  // Super-admin-controlled overrides: features this person is explicitly
  // blocked from, even if their role would normally grant access. Empty/
  // absent means "use the role default" (see lib/permissions.ts).
  disabledFeatures?: string[]
  // MOCK-ONLY plaintext password for the local demo login. This is NOT how
  // production auth should work — replace with Supabase Auth (or similar)
  // before this ever touches real data. See README "Auth" section.
  password?: string
}

export type CaseStatus =
  | 'first_call'
  | 'arrangement_pending'
  | 'arrangement_scheduled'
  | 'in_progress'
  | 'service_scheduled'
  | 'completed'
  | 'on_hold'

export type CaseType = 'at_need' | 'pre_need' | 'transfer_only'

export type DispositionType = 'burial' | 'cremation' | 'entombment' | 'donation' | 'undetermined'

export interface Decedent {
  firstName: string
  middleName?: string
  lastName: string
  dateOfBirth?: string
  dateOfDeath?: string
  placeOfDeath?: string
  ssn?: string // stored encrypted at rest in real deployment
  sex?: 'male' | 'female' | 'unknown'
  maritalStatus?: string
  veteran?: boolean
}

// First Call — everything captured the moment a call comes in, before most
// other case fields exist yet. veteran status lives on Decedent above, not
// duplicated here.
export interface FirstCallInfo {
  locationType?: 'residence' | 'jfk' | 'drmc' | 'emc' | 'other'
  locationAddress?: string
  gateCode?: string
  weight?: string
  familyPresent?: boolean
  familyReady?: string
  contagious?: boolean
  specialInstructions?: string
  coronerCase?: boolean
  coronerCaseNumber?: string
  doctorName?: string
  doctorPhone?: string
  hospiceName?: string
  hospicePhone?: string
  personCalling?: string
  callReceivedAt?: string
  timeOfRemoval?: string
  callTakenBy?: string
  callTakenAt?: string
}

// Vital Sheet — the data needed for the death certificate, permits, and
// service scheduling. Deliberately does NOT repeat fields that already
// exist on Decedent/FirstCallInfo/the case itself (name, DOB, DOD, sex,
// marital status, veteran, weight, coroner's case #, doctor/hospice,
// disposition, visitation date) — those are pulled from there directly.
export interface VitalSheetInfo {
  alsoKnownAs?: string
  birthCity?: string
  birthState?: string
  birthCountry?: string
  education?: string
  hispanicLatino?: boolean
  race?: string
  occupation?: string
  kindOfBusiness?: string
  yearsInOccupation?: string
  residenceAddress?: string
  residenceCity?: string
  residenceCounty?: string
  residenceZip?: string
  residenceState?: string
  yearsInCounty?: string
  informantName?: string
  informantRelationship?: string
  informantMailingAddress?: string
  spouseName?: string
  fatherName?: string
  fatherBirthState?: string
  motherName?: string
  motherBirthState?: string
  placeOfFinalDisposition?: string
  obituary?: boolean
  pacemaker?: boolean
  visitationHours?: string
  rosaryDate?: string
  rosaryTime?: string
  rosaryLanguage?: 'english' | 'spanish'
  rosaryPlace?: string
  rosaryBy?: string
  massDate?: string
  massTime?: string
  massLanguage?: 'english' | 'spanish'
  massPlace?: string
  massBy?: string
  gravesideDate?: string
  gravesideTime?: string
  gravesidePlace?: string
  gravesideBy?: string
  sons?: string
  daughters?: string
  sisters?: string
  brothers?: string
  flowersNotes?: string
  cardsNameOn?: string
  prayerCardsNotes?: string
  memorialFoldersNotes?: string
  memorialBook?: string
  doctorAddress?: string
  doctorFax?: string
  makeupHair?: string
  receivingFuneralDirector?: string
  receivingFuneralDirectorAddress?: string
  receivingFuneralDirectorCharges?: string
  receivingFuneralDirectorPhone?: string
  medallions?: string
  charms?: string
}

/**
 * A shared field (DOB, sex, marital status, veteran status) that a family
 * submitted through their portal link with a value different from what's
 * already on the case — flagged instead of silently overwritten.
 */
export interface FieldDiscrepancy {
  field: string
  fieldLabel: string
  existingValue: string
  submittedValue: string
  flaggedAt: string
}

export interface CaseContact {
  id: string
  name: string
  relationship: string
  phone?: string
  email?: string
  isPrimary: boolean
  isAuthorizingAgent: boolean
}

export interface CaseTask {
  id: string
  caseId: string
  label: string
  category: 'permits' | 'merchandise' | 'service_prep' | 'family' | 'documents' | 'transport' | 'other'
  status: TaskStatus
  dueDate?: string
  assignedTo?: string // staffId
  linkedOrderId?: string // set when this task was auto-created from an Order — its status always mirrors that order's
}

// ---------------------------------------------------------------------------
// Task templates — the standard checklist every new case starts with.
// Editable by staff (Admin → Task Templates); every change is audited.
// When a case is created, its case_tasks are seeded from whatever
// templates are active at that moment — editing a template afterward
// doesn't retroactively change tasks already created on existing cases.
// ---------------------------------------------------------------------------

export interface TaskTemplate {
  id: string
  orgId: string
  label: string
  category: CaseTask['category']
  daysUntilDue?: number // if set, a new case's task gets a due date this many days out from creation
  sortOrder: number
  active: boolean
}

export interface CaseNote {
  id: string
  caseId: string
  authorId: string
  authorName: string
  body: string
  createdAt: string
  pinned?: boolean
}

export interface CaseDocument {
  id: string
  caseId: string
  name: string
  category: 'permit' | 'contract' | 'authorization' | 'photo' | 'obituary' | 'music' | 'other'
  uploadedAt: string
  uploadedBy: string
  url: string // storage path
  signed?: boolean
}

export interface FuneralCase {
  id: string
  orgId: string
  locationId: string
  caseNumber: string
  type: CaseType
  status: CaseStatus
  disposition: DispositionType
  decedent: Decedent
  contacts: CaseContact[]
  familyId?: string // links this case to a persistent Family record spanning years/multiple cases
  firstCall?: FirstCallInfo
  vitalSheet?: VitalSheetInfo
  fieldDiscrepancies?: FieldDiscrepancy[]
  assignedDirectorId?: string
  assignedEmbalmerId?: string
  visitationDate?: string
  visitationLocation?: string
  serviceDate?: string
  serviceLocation?: string
  color?: string // whiteboard color coding
  custodyStage: CustodyStage
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Chain of Custody
// ---------------------------------------------------------------------------

export type CustodyStage =
  | 'scene_first_call'
  | 'in_transit'
  | 'funeral_home'
  | 'chapel_service'
  | 'crematory'
  | 'ashes_received'
  | 'cemetery_burial'
  | 'shipped_released'
  | 'completed'

export const CUSTODY_STAGES: CustodyStage[] = [
  'scene_first_call',
  'in_transit',
  'funeral_home',
  'chapel_service',
  'crematory',
  'ashes_received',
  'cemetery_burial',
  'shipped_released',
  'completed',
]

export const CUSTODY_STAGE_LABELS: Record<CustodyStage, string> = {
  scene_first_call: 'Scene / First Call',
  in_transit: 'In Transit',
  funeral_home: 'Funeral Home',
  chapel_service: 'Chapel / Service',
  crematory: 'Crematory',
  ashes_received: 'Ashes Received',
  cemetery_burial: 'Cemetery / Burial',
  shipped_released: 'Shipped Out / Released',
  completed: 'Completed',
}

export interface CustodyLogEntry {
  id: string
  caseId: string
  fromStage?: CustodyStage
  toStage: CustodyStage
  movedBy: string // staffId
  movedByName: string
  timestamp: string
  note?: string
}

// ---------------------------------------------------------------------------
// Financials
// ---------------------------------------------------------------------------

export type GplCategory = 'service' | 'merchandise' | 'cash_advance' | 'facility'

export interface GplItem {
  id: string
  orgId: string
  locationId: string // GPL can vary by location
  sku: string
  name: string
  category: GplCategory
  price: number
  taxable: boolean
  active: boolean
}

export interface ContractLineItem {
  id: string
  gplItemId: string
  serviceOrderId?: string // set for line items synced from a priced Order — see the Orders tab
  name: string
  quantity: number
  unitPrice: number
  adjustmentAmount?: number // per-line discount (negative) or increase (positive), on top of unitPrice
}

export type ContractStatus = 'draft' | 'sent' | 'signed' | 'paid' | 'void'

export interface Contract {
  id: string
  caseId: string
  locationId: string
  status: ContractStatus
  lineItems: ContractLineItem[]
  subtotal: number
  taxTotal: number
  discount: number // flat dollar amount, applied to subtotal before tax
  total: number
  amountPaid: number
  // Manual paid/unpaid toggle, distinct from `status` (document lifecycle:
  // draft/sent/signed/void). This is what the staff_member print/pay screen
  // reads and flips.
  paid: boolean
  createdAt: string
  signedAt?: string
}

export type PaymentMethod = 'cash' | 'check' | 'credit_card' | 'ach' | 'insurance_assignment' | 'financing'

export interface Payment {
  id: string
  contractId: string
  caseId: string
  amount: number
  method: PaymentMethod
  reference?: string
  receivedAt: string
  recordedBy: string
}

// ---------------------------------------------------------------------------
// Audit log — every create/update/delete across the app should append here.
// This is the record of who touched what and when; treat it as append-only.
// ---------------------------------------------------------------------------

export type AuditAction = 'create' | 'update' | 'delete' | 'status_change'

export interface AuditLogEntry {
  id: string
  entityType: 'case' | 'task' | 'note' | 'document' | 'contract' | 'payment' | 'custody' | 'staff' | 'event' | 'order' | 'email' | 'signature_request' | 'family' | 'vendor'
  entityId: string
  caseId?: string // denormalized for easy filtering by case, when applicable
  action: AuditAction
  summary: string // human-readable description, e.g. "Marked task 'Confirm casket' complete"
  changedBy: string // staffId
  changedByName: string
  timestamp: string
}

// ---------------------------------------------------------------------------
// Vendor / third-party item order confirmation tracking (flowers, carriage,
// escorts, etc.) — tracks whether an ordered item has actually been
// confirmed with the vendor, not just requested.
// ---------------------------------------------------------------------------

// The shared progress lifecycle for both vendor Orders and Tasks — the
// same four stages, used identically in both places, so a task linked to
// an order is never out of sync with what the order itself says.
// "confirmed" displays as "Completed" in the UI (TASK_STATUS_LABELS below)
// — kept as the stored value rather than renamed, to avoid a breaking
// migration on existing order data.
export type TaskStatus = 'pending' | 'ordered' | 'delivered' | 'confirmed'
export type OrderStatus = TaskStatus

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Initial Call',
  ordered: 'Ordered',
  delivered: 'Delivered',
  confirmed: 'Completed',
}

export interface ServiceOrder {
  id: string
  caseId: string
  item: string // e.g. "Flowers", "Horse & Carriage", "Motorcycle Escort", "Doves"
  status: OrderStatus
  price?: number // what this line item costs — shown in the running quote total, editable inline
  vendor?: string
  notes?: string
  orderedBy?: string
  orderedAt?: string
  confirmedBy?: string
  confirmedAt?: string
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

export type EventType = 'visitation' | 'service' | 'burial' | 'cremation' | 'first_call' | 'meeting' | 'other'

export type VehicleType = 'hearse' | 'van' | 'limousine' | 'other'

export interface Vehicle {
  id: string
  orgId: string
  locationId: string
  name: string
  type: VehicleType
  active: boolean
}

export interface CalendarEvent {
  id: string
  orgId: string
  locationId: string
  caseId?: string
  title: string
  type: EventType
  start: string
  end: string
  location?: string
  participantIds: string[] // staffIds
  vehicleId?: string
  notes?: string
}

/** A scheduling conflict detected for a staff member or vehicle over an overlapping time window. */
export interface SchedulingConflict {
  kind: 'staff' | 'vehicle'
  resourceId: string
  resourceName: string
  conflictingEvent: CalendarEvent
}

// ---------------------------------------------------------------------------
// Family Portal
// ---------------------------------------------------------------------------

export interface FamilyPortalLink {
  id: string
  caseId: string
  token: string
  contactId: string
  createdAt: string
  expiresAt?: string
  lastAccessedAt?: string
}

export interface ObituaryDraft {
  id: string
  caseId: string
  body: string
  photoUrls: string[]
  status: 'draft' | 'submitted' | 'approved' | 'published'
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Inbound email → case matching
// ---------------------------------------------------------------------------
// Casillas' shared inbox (info@casillasfuneralhome.com, Outlook/Microsoft 365)
// is watched via the Microsoft Graph API. Every inbound message is matched
// to a case either automatically (sender is a known case contact) or held
// for a staff member to confirm (unknown sender — matched by AI suggestion,
// or not matched at all).

export type EmailMatchStatus = 'auto_matched' | 'suggested' | 'unmatched' | 'confirmed' | 'ignored'

export interface EmailAttachment {
  id: string // Microsoft Graph attachment ID, used to fetch content on demand
  filename: string
  contentType: string
  sizeBytes: number
}

export interface InboundEmail {
  id: string
  graphMessageId: string // Microsoft Graph message ID, for fetching full content/attachments on demand
  from: string
  fromName?: string
  subject: string
  preview: string // short snippet, not the full body — full body fetched on demand from Graph
  receivedAt: string
  caseId?: string // set once matched (auto or confirmed)
  matchStatus: EmailMatchStatus
  matchConfidence?: number // 0-1, for AI-suggested matches
  matchReason?: string // e.g. "Sender matches contact Karen Bennett on case CC-2026-041" or "Mentions 'Bennett' and 'Cathedral City'"
  attachments: EmailAttachment[] // metadata only — content fetched on demand per-attachment, per staff choice
  confirmedBy?: string
  confirmedAt?: string
}

// ---------------------------------------------------------------------------
// E-signature requests (SignRequest API)
// ---------------------------------------------------------------------------

export type SignatureRequestStatus = 'draft' | 'sent' | 'viewed' | 'signed' | 'declined' | 'expired'

export interface SignatureRequest {
  id: string
  caseId: string
  documentName: string // e.g. "Authorization for Release of Human Remains"
  signRequestId?: string // SignRequest's own document ID, once sent
  status: SignatureRequestStatus
  signerName: string
  signerEmail: string
  sentBy: string
  sentAt?: string
  signedAt?: string
  signedDocumentUrl?: string // populated once signed, downloaded from SignRequest and stored
}

// ---------------------------------------------------------------------------
// Document → case extraction (upload an intake form/hospital paperwork/etc.
// and have it pre-fill a New Case form). Always reviewed by staff before
// saving — never auto-creates a case.
// ---------------------------------------------------------------------------

export interface ExtractedCaseData {
  decedentFirstName?: string
  decedentMiddleName?: string
  decedentLastName?: string
  dateOfBirth?: string // YYYY-MM-DD if found
  dateOfDeath?: string
  placeOfDeath?: string
  sex?: string
  maritalStatus?: string
  disposition?: DispositionType
  type?: CaseType
  contactName?: string
  contactRelationship?: string
  contactPhone?: string
  contactEmail?: string
  confidence: 'high' | 'medium' | 'low'
  notes?: string // anything the model flagged as uncertain or worth a human double-check
}

// ---------------------------------------------------------------------------
// Staff time off — vacation/sick/other unavailability, shown on both the
// dedicated Staff Schedule page and layered onto the Calendar (which staff
// are unavailable when assigning them to an event).
// ---------------------------------------------------------------------------

export type TimeOffType = 'vacation' | 'sick' | 'other_off'

export interface StaffTimeOff {
  id: string
  staffId: string
  startDate: string // YYYY-MM-DD, inclusive
  endDate: string // YYYY-MM-DD, inclusive
  type: TimeOffType
  notes?: string
  createdBy: string
}

// ---------------------------------------------------------------------------
// Internal staff chat — supports both 1:1 and group conversations. A
// message always belongs to a conversation; a conversation has one or
// more participants. Live while people are in the app (Supabase Realtime).
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string
  conversationId: string
  senderId: string
  body: string
  createdAt: string
}

export interface ChatConversation {
  id: string
  name?: string // set for group chats you've named; undefined for 1:1 (display the other person's name instead)
  isGroup: boolean
  participantIds: string[]
  participantNames: string[]
  createdBy: string
  createdAt: string
  lastMessage?: { body: string; senderId: string; createdAt: string }
  unreadCount: number
}

// ---------------------------------------------------------------------------
// Family CRM — a family persists across every case they've ever been
// served for, not just one. Org-wide (not location-scoped): the same
// family might be served at a different Casillas location years apart.
// ---------------------------------------------------------------------------

export interface Family {
  id: string
  orgId: string
  name: string // e.g. "The Bennett Family"
  primaryContactName?: string
  primaryContactPhone?: string
  primaryContactEmail?: string
  notes?: string // preferences, religion, special considerations — the "no family repeats themselves" idea
  createdAt: string
}

export type FamilyInteractionType = 'thank_you_sent' | 'grief_support' | 'anniversary_outreach' | 'referral' | 'community_event' | 'other'

export interface FamilyInteraction {
  id: string
  familyId: string
  type: FamilyInteractionType
  notes: string
  createdBy: string
  createdByName: string
  createdAt: string
}

// ---------------------------------------------------------------------------
// Vendor directory — external parties documents get sent to (removal
// companies, crematories, florists, etc.), org-wide since the same vendor
// often serves multiple locations.
// ---------------------------------------------------------------------------

export type VendorCategory = 'removal_company' | 'crematory' | 'cemetery' | 'florist' | 'doctor_office' | 'hospice' | 'church' | 'printing' | 'other'

export interface Vendor {
  id: string
  orgId: string
  name: string
  category: VendorCategory
  email?: string
  phone?: string
  address?: string
  notes?: string
  createdAt: string
}

// ---------------------------------------------------------------------------
// Auth / session
// ---------------------------------------------------------------------------

export interface Session {
  user: StaffMember
  activeLocationId: string // current location context in the UI
}
