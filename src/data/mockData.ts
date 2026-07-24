import type {
  Organization, Location, StaffMember, FuneralCase, GplItem,
  Contract, CalendarEvent, CaseTask, CaseNote, CustodyLogEntry, Vehicle,
  InboundEmail, SignatureRequest,
} from '@/types'

export const organization: Organization = {
  id: 'org-1',
  name: 'Casillas Funeral Home',
  createdAt: '2022-01-01T00:00:00Z',
}

// NOTE: license numbers for Cathedral City, Desert Hot Springs, and
// Coachella are taken from the site screenshot (FD 2117 / FD 2432 / FD 1498).
// Eureka is a new location — swap in its real license # and phone/address
// once you have them; placeholders are marked below.
// Verified against the real letterhead (documents_Coachella8.pdf) and GPL
// (1GPL_10012024.pdf) — exact addresses, phone numbers, and FD license
// numbers. Eureka's are still placeholders pending real details from Joel.
export const locations: Location[] = [
  {
    id: 'loc-1', orgId: 'org-1', name: 'Casillas Funeral Home — Cathedral City',
    address: '68625 Perez Rd #20', city: 'Cathedral City', state: 'CA', zip: '92234',
    phone: '(760) 202-7420', timezone: 'America/Los_Angeles',
    licenseNumber: 'FD 2117', active: true,
  },
  {
    id: 'loc-2', orgId: 'org-1', name: 'Casillas Funeral Home — Desert Hot Springs',
    address: '66272 Pierson Blvd', city: 'Desert Hot Springs', state: 'CA', zip: '92240',
    phone: '(760) 671-6671', timezone: 'America/Los_Angeles',
    licenseNumber: 'FD 2432', active: true,
  },
  {
    id: 'loc-3', orgId: 'org-1', name: 'Casillas Funeral Home — Coachella',
    address: '85891 Grapefruit Blvd', city: 'Coachella', state: 'CA', zip: '92236',
    phone: '(760) 398-1536', timezone: 'America/Los_Angeles',
    licenseNumber: 'FD 1498', active: true,
  },
  {
    id: 'loc-4', orgId: 'org-1', name: 'Sanders Funeral Home',
    address: '1835 E St', city: 'Eureka', state: 'CA', zip: '95501',
    phone: '(707) 442-2941', timezone: 'America/Los_Angeles',
    licenseNumber: 'FD TBD', active: true,
  },
]

// Real employee roster from Casillas Funeral Home's designation sheet.
// Emails are placeholders (firstname.lastname@casillasfuneralhome.com) —
// swap in real addresses before this goes live. Passwords are MOCK-ONLY
// plaintext for the local demo login (see README "Auth" section) — every
// non-Joel account shares a demo password on purpose, since these are
// placeholders, not real credentials anyone should be using.
const CA_LOCATIONS = ['loc-1', 'loc-2', 'loc-3'] // Cathedral City, Desert Hot Springs, Coachella
const EUREKA_ONLY = ['loc-4']
const ALL_LOCATIONS = ['loc-1', 'loc-2', 'loc-3', 'loc-4']

export const staff: StaffMember[] = [
  // --- Super Admins (all locations) ---
  { id: 'stf-joel-casillas', orgId: 'org-1', locationIds: ALL_LOCATIONS, name: 'Joel Casillas', email: 'casillasjoel@live.com', password: 'qwerty', role: 'super_admin', title: 'Owner', phone: '760-702-5848', avatarColor: '#2b3327', active: true },
  { id: 'stf-carolina-casillas', orgId: 'org-1', locationIds: ALL_LOCATIONS, name: 'Carolina Casillas', email: 'carolina.casillas@casillasfuneralhome.com', password: 'demo1234', role: 'super_admin', title: 'Owner', phone: '760-702-6143', avatarColor: '#3d4f3a', active: true },
  { id: 'stf-rosie-canas', orgId: 'org-1', locationIds: ALL_LOCATIONS, name: 'Rosie Canas', email: 'rosie.canas@casillasfuneralhome.com', password: 'demo1234', role: 'super_admin', title: 'Operations', phone: '760-702-9778', avatarColor: '#8b5e34', active: true },
  { id: 'stf-ashlie-casillas', orgId: 'org-1', locationIds: ALL_LOCATIONS, name: 'Ashlie Casillas', email: 'ashlie.casillas@casillasfuneralhome.com', password: 'demo1234', role: 'super_admin', title: 'Operations', phone: '760-397-7274', avatarColor: '#6b7f4f', active: true },

  // --- Admins ---
  { id: 'stf-joseph-casillas', orgId: 'org-1', locationIds: CA_LOCATIONS, name: 'Joseph Casillas', email: 'joseph.casillas@casillasfuneralhome.com', password: 'demo1234', role: 'admin', title: 'Admin', phone: '760-702-0435', avatarColor: '#a8763e', active: true },
  { id: 'stf-leticia-casillas', orgId: 'org-1', locationIds: EUREKA_ONLY, name: 'Leticia Casillas', email: 'leticia.casillas@casillasfuneralhome.com', password: 'demo1234', role: 'admin', title: 'Admin', phone: '760-899-1680', avatarColor: '#2f4a3f', active: true },

  // --- Managers ---
  { id: 'stf-noemi-mejia', orgId: 'org-1', locationIds: CA_LOCATIONS, name: 'Noemi Mejia', email: 'noemi.mejia@casillasfuneralhome.com', password: 'demo1234', role: 'manager', title: 'Manager', phone: '760-574-5821', avatarColor: '#6b3d6b', active: true },
  { id: 'stf-joe-galvan', orgId: 'org-1', locationIds: CA_LOCATIONS, name: 'Joe Galvan', email: 'joe.galvan@casillasfuneralhome.com', password: 'demo1234', role: 'manager', title: 'Manager', phone: '760-391-3506', avatarColor: '#3b4a35', active: true },
  { id: 'stf-marichuy-lopez', orgId: 'org-1', locationIds: CA_LOCATIONS, name: 'Marichuy Lopez', email: 'marichuy.lopez@casillasfuneralhome.com', password: 'demo1234', role: 'manager', title: 'Manager', phone: '760-567-4798', avatarColor: '#8b5e34', active: true },
  { id: 'stf-isaiah-casillas', orgId: 'org-1', locationIds: CA_LOCATIONS, name: 'Isaiah Casillas', email: 'isaiah.casillas@casillasfuneralhome.com', password: 'demo1234', role: 'manager', title: 'Manager', phone: '760-609-2134', avatarColor: '#b3925a', active: true },
  { id: 'stf-amber-lopez', orgId: 'org-1', locationIds: CA_LOCATIONS, name: 'Amber Lopez', email: 'amber.lopez@casillasfuneralhome.com', password: 'demo1234', role: 'manager', title: 'Manager', phone: '760-485-0198', avatarColor: '#6b7f4f', active: true },
  { id: 'stf-kenne-kersey', orgId: 'org-1', locationIds: EUREKA_ONLY, name: 'Kenne Kersey', email: 'kenne.kersey@casillasfuneralhome.com', password: 'demo1234', role: 'manager', title: 'Manager', phone: '760-673-8551', avatarColor: '#5f6f4f', active: true },

  // --- Staff Members ---
  { id: 'stf-david-escoto', orgId: 'org-1', locationIds: CA_LOCATIONS, name: 'David Escoto', email: 'david.escoto@casillasfuneralhome.com', password: 'demo1234', role: 'staff_member', title: 'Staff Member', department: 'Funeral Services', phone: '760-472-9625', avatarColor: '#6b7f4f', active: true },
  { id: 'stf-joey-morales', orgId: 'org-1', locationIds: CA_LOCATIONS, name: 'Joey Morales', email: 'joey.morales@casillasfuneralhome.com', password: 'demo1234', role: 'staff_member', title: 'Staff Member', phone: '760-620-9336', avatarColor: '#3d4f3a', active: true },
  { id: 'stf-leobardo-mejia', orgId: 'org-1', locationIds: CA_LOCATIONS, name: 'Leobardo Mejia', email: 'leobardo.mejia@casillasfuneralhome.com', password: 'demo1234', role: 'staff_member', title: 'Staff Member', department: 'Funeral Services', phone: '760-333-5752', avatarColor: '#2f4a3f', active: true },
  { id: 'stf-hector-salas', orgId: 'org-1', locationIds: CA_LOCATIONS, name: 'Hector Salas', email: 'hector.salas@casillasfuneralhome.com', password: 'demo1234', role: 'staff_member', title: 'Staff Member', department: 'Funeral Services', phone: '760-835-2917', avatarColor: '#a8763e', active: true },
  { id: 'stf-david-espinoza', orgId: 'org-1', locationIds: CA_LOCATIONS, name: 'David Espinoza', email: 'david.espinoza@casillasfuneralhome.com', password: 'demo1234', role: 'staff_member', title: 'Staff Member', department: 'Funeral Services', phone: '760-578-7907', avatarColor: '#6b3d6b', active: true },
  { id: 'stf-silvia-rochin', orgId: 'org-1', locationIds: CA_LOCATIONS, name: 'Silvia Rochin', email: 'silvia.rochin@casillasfuneralhome.com', password: 'demo1234', role: 'staff_member', title: 'Staff Member', phone: '760-391-1656', avatarColor: '#b3925a', active: true },
  { id: 'stf-kelly-little', orgId: 'org-1', locationIds: EUREKA_ONLY, name: 'Kelly Little', email: 'kelly.little@casillasfuneralhome.com', password: 'demo1234', role: 'staff_member', title: 'Staff Member', phone: '916-672-7436', avatarColor: '#b3925a', active: true },
  { id: 'stf-martha-barcelo', orgId: 'org-1', locationIds: EUREKA_ONLY, name: 'Martha Barcelo', email: 'martha.barcelo@casillasfuneralhome.com', password: 'demo1234', role: 'staff_member', title: 'Staff Member', phone: '707-726-3874', avatarColor: '#6b7f4f', active: true },
]

export const cases: FuneralCase[] = [
  {
    id: 'case-1', orgId: 'org-1', locationId: 'loc-1', familyId: 'fam-1', caseNumber: 'CC-2026-041',
    type: 'at_need', status: 'arrangement_scheduled', disposition: 'burial',
    decedent: { firstName: 'Harold', lastName: 'Bennett', dateOfBirth: '1944-03-12', dateOfDeath: '2026-07-08', placeOfDeath: 'Desert Regional Medical Center', sex: 'male', maritalStatus: 'widowed', veteran: true },
    contacts: [{ id: 'c-1', name: 'Karen Bennett', relationship: 'Daughter', phone: '(760) 555-2201', email: 'karen.b@email.com', isPrimary: true, isAuthorizingAgent: true }],
    assignedDirectorId: 'stf-joe-galvan', assignedEmbalmerId: 'stf-david-espinoza',
    serviceDate: '2026-07-18T14:00:00Z', serviceLocation: 'Casillas Funeral Home — Cathedral City',
    color: '#3d4f3a', custodyStage: 'funeral_home', createdAt: '2026-07-08T09:12:00Z', updatedAt: '2026-07-12T16:30:00Z',
  },
  {
    id: 'case-2', orgId: 'org-1', locationId: 'loc-1', caseNumber: 'CC-2026-042',
    type: 'at_need', status: 'in_progress', disposition: 'cremation',
    decedent: { firstName: 'Linda', lastName: 'Cho', dateOfDeath: '2026-07-10', placeOfDeath: 'Residence', sex: 'female', maritalStatus: 'married' },
    contacts: [{ id: 'c-2', name: 'David Cho', relationship: 'Husband', phone: '(760) 555-3310', isPrimary: true, isAuthorizingAgent: true }],
    assignedDirectorId: 'stf-joe-galvan',
    color: '#8b5e34', custodyStage: 'funeral_home', createdAt: '2026-07-10T22:05:00Z', updatedAt: '2026-07-12T10:00:00Z',
  },
  {
    id: 'case-3', orgId: 'org-1', locationId: 'loc-2', caseNumber: 'DHS-2026-018',
    type: 'at_need', status: 'first_call', disposition: 'undetermined',
    decedent: { firstName: 'Robert', lastName: 'Tanaka', dateOfDeath: '2026-07-12', sex: 'male' },
    contacts: [{ id: 'c-3', name: 'Susan Tanaka', relationship: 'Wife', phone: '(760) 555-4420', isPrimary: true, isAuthorizingAgent: true }],
    color: '#6b7f4f', custodyStage: 'scene_first_call', createdAt: '2026-07-12T05:40:00Z', updatedAt: '2026-07-12T05:40:00Z',
  },
  {
    id: 'case-4', orgId: 'org-1', locationId: 'loc-2', caseNumber: 'DHS-2026-017',
    type: 'pre_need', status: 'completed', disposition: 'burial',
    decedent: { firstName: 'Eleanor', lastName: 'Voss', dateOfBirth: '1938-11-02', dateOfDeath: '2026-06-28' },
    contacts: [{ id: 'c-4', name: 'Michael Voss', relationship: 'Son', phone: '(760) 555-9981', isPrimary: true, isAuthorizingAgent: true }],
    assignedDirectorId: 'stf-isaiah-casillas', serviceDate: '2026-07-05T15:00:00Z',
    color: '#6b7f4f', custodyStage: 'cemetery_burial', createdAt: '2026-06-28T08:00:00Z', updatedAt: '2026-07-06T09:00:00Z',
  },
  {
    id: 'case-5', orgId: 'org-1', locationId: 'loc-3', caseNumber: 'COA-2026-063',
    type: 'at_need', status: 'service_scheduled', disposition: 'cremation',
    decedent: { firstName: 'James', lastName: 'Okafor', dateOfDeath: '2026-07-09' },
    contacts: [{ id: 'c-5', name: 'Grace Okafor', relationship: 'Wife', phone: '(760) 555-6612', isPrimary: true, isAuthorizingAgent: true }],
    serviceDate: '2026-07-16T17:00:00Z', serviceLocation: 'Casillas Funeral Home — Coachella',
    color: '#a8763e', custodyStage: 'chapel_service', createdAt: '2026-07-09T13:20:00Z', updatedAt: '2026-07-12T11:15:00Z',
  },
  {
    id: 'case-6', orgId: 'org-1', locationId: 'loc-4', caseNumber: 'EUR-2026-009',
    type: 'at_need', status: 'arrangement_pending', disposition: 'cremation',
    decedent: { firstName: 'Marjorie', lastName: 'Holt', dateOfBirth: '1951-05-19', dateOfDeath: '2026-07-11', placeOfDeath: 'St. Joseph Hospital', sex: 'female', maritalStatus: 'divorced' },
    contacts: [{ id: 'c-6', name: 'Ben Holt', relationship: 'Son', phone: '(707) 555-1187', isPrimary: true, isAuthorizingAgent: true }],
    assignedDirectorId: 'stf-leticia-casillas',
    color: '#2f4a3f', custodyStage: 'in_transit', createdAt: '2026-07-11T11:00:00Z', updatedAt: '2026-07-12T14:00:00Z',
  },
]

export const caseTasks: CaseTask[] = [
  { id: 't-1', caseId: 'case-1', label: 'File death certificate with county', category: 'permits', status: 'confirmed', assignedTo: 'stf-joe-galvan' },
  { id: 't-2', caseId: 'case-1', label: 'Obtain burial permit', category: 'permits', status: 'confirmed', assignedTo: 'stf-joe-galvan' },
  { id: 't-3', caseId: 'case-1', label: 'Confirm casket selection with family', category: 'merchandise', status: 'pending', dueDate: '2026-07-14', assignedTo: 'stf-joe-galvan' },
  { id: 't-4', caseId: 'case-1', label: 'Prepare obituary draft', category: 'family', status: 'pending', dueDate: '2026-07-13', assignedTo: 'stf-joe-galvan' },
  { id: 't-5', caseId: 'case-1', label: 'Coordinate embalming', category: 'service_prep', status: 'confirmed', assignedTo: 'stf-david-espinoza' },
  { id: 't-6', caseId: 'case-2', label: 'Confirm cremation authorization signed', category: 'documents', status: 'pending', assignedTo: 'stf-joe-galvan' },
  { id: 't-7', caseId: 'case-2', label: 'Schedule crematory pickup', category: 'transport', status: 'pending', dueDate: '2026-07-14' },
  { id: 't-8', caseId: 'case-3', label: 'Complete first call intake', category: 'documents', status: 'confirmed' },
  { id: 't-9', caseId: 'case-3', label: 'Schedule arrangement conference', category: 'family', status: 'pending', dueDate: '2026-07-13' },
  { id: 't-10', caseId: 'case-5', label: 'Confirm chapel setup for service', category: 'service_prep', status: 'pending', dueDate: '2026-07-16' },
  { id: 't-11', caseId: 'case-6', label: 'Schedule arrangement conference with son', category: 'family', status: 'pending', dueDate: '2026-07-13', assignedTo: 'stf-leticia-casillas' },
  { id: 't-12', caseId: 'case-6', label: 'Confirm cremation authorization', category: 'documents', status: 'pending', assignedTo: 'stf-leticia-casillas' },
]

export const caseNotes: CaseNote[] = [
  { id: 'n-1', caseId: 'case-1', authorId: 'stf-joe-galvan', authorName: 'Joe Galvan', body: 'Family requested military honors — reached out to VFW Post 1201 for a color guard.', createdAt: '2026-07-11T14:22:00Z', pinned: true },
  { id: 'n-2', caseId: 'case-1', authorId: 'stf-joe-galvan', authorName: 'Joe Galvan', body: 'Daughter will bring in photos for the memorial video by Wednesday.', createdAt: '2026-07-12T09:05:00Z' },
  { id: 'n-3', caseId: 'case-3', authorId: 'stf-isaiah-casillas', authorName: 'Isaiah Casillas', body: 'Spouse still deciding between burial and cremation — following up tomorrow AM.', createdAt: '2026-07-12T06:10:00Z' },
  { id: 'n-4', caseId: 'case-6', authorId: 'stf-leticia-casillas', authorName: 'Leticia Casillas', body: 'Son is out of town until Wednesday — arrangement conference set for his return.', createdAt: '2026-07-12T15:30:00Z' },
]

// Real General Price List, effective October 1, 2024 (see 1GPL_10012024.pdf).
// Prices are identical across Cathedral City, Desert Hot Springs, and
// Coachella per the source document, so one canonical list is generated for
// all three. Eureka doesn't have a confirmed price list yet — it reuses the
// same figures as a placeholder; replace once Casillas provides Eureka's
// actual GPL.
const gplCanonical: Omit<GplItem, 'id' | 'orgId' | 'locationId'>[] = [
  // Basic Services
  { sku: 'SVC-100', name: 'Basic Services of Funeral Director and Staff and Overhead', category: 'service', price: 995, taxable: false, active: true },
  { sku: 'SVC-101', name: 'Staff for Prayer Services', category: 'service', price: 450, taxable: false, active: true },
  { sku: 'SVC-102', name: 'Staff and Equipment for Off-Site Prayer Services/Mass', category: 'service', price: 185, taxable: false, active: true },
  { sku: 'SVC-103', name: 'Staff for Graveside Services', category: 'service', price: 150, taxable: false, active: true },
  { sku: 'SVC-104', name: 'Staff for Weekend or Holiday Services', category: 'service', price: 400, taxable: false, active: true },
  { sku: 'SVC-105', name: 'Dressing, Cosmetics, Hair Styling and Casketing of Remains', category: 'service', price: 250, taxable: false, active: true },
  { sku: 'SVC-106', name: 'Dressing Unembalmed Remains', category: 'service', price: 150, taxable: false, active: true },
  { sku: 'SVC-107', name: 'Post-Autopsy Care', category: 'service', price: 150, taxable: false, active: true },
  { sku: 'SVC-108', name: 'Viewing Unembalmed Body / Sanitary Care', category: 'service', price: 225, taxable: false, active: true },
  { sku: 'SVC-109', name: 'Embalming', category: 'service', price: 490, taxable: false, active: true },

  // Transportation
  { sku: 'TRN-100', name: 'Transfer of Deceased to Funeral Home (25 mile radius)', category: 'service', price: 475, taxable: false, active: true },
  { sku: 'TRN-101', name: 'Second Man Removal', category: 'service', price: 85, taxable: false, active: true },
  { sku: 'TRN-102', name: 'Hearse (25 mile radius)', category: 'service', price: 170, taxable: false, active: true },
  { sku: 'TRN-103', name: 'Service/Utility Vehicle (50 mile radius)', category: 'service', price: 150, taxable: false, active: true },
  { sku: 'TRN-104', name: 'International Transportation (starts at)', category: 'service', price: 350, taxable: false, active: true },

  // Services and Facilities
  { sku: 'FAC-100', name: 'Staff Services and Use of Facilities for Memorial Services', category: 'facility', price: 450, taxable: false, active: true },
  { sku: 'FAC-101', name: 'Staff Services and Use of Facilities for Visitation (4 hrs, up to 9:00pm)', category: 'facility', price: 450, taxable: false, active: true },
  { sku: 'FAC-102', name: 'Staff Services and Use of Equipment for Graveside Service', category: 'facility', price: 150, taxable: false, active: true },
  { sku: 'FAC-103', name: 'Refrigerated Holding of Remains (per day)', category: 'facility', price: 85, taxable: false, active: true },
  { sku: 'FAC-104', name: 'Overnight Visitation / Extended Hours After 9:00pm', category: 'facility', price: 400, taxable: false, active: true },
  { sku: 'FAC-105', name: 'Staff Services and Use of Facilities for Funeral Ceremony', category: 'facility', price: 185, taxable: false, active: true },

  // Merchandise
  { sku: 'MER-100', name: 'Adult Casket — Economy', category: 'merchandise', price: 730, taxable: true, active: true },
  { sku: 'MER-101', name: 'Adult Casket — Mid-Range', category: 'merchandise', price: 2895, taxable: true, active: true },
  { sku: 'MER-102', name: 'Adult Casket — Premium', category: 'merchandise', price: 10500, taxable: true, active: true },
  { sku: 'MER-103', name: 'Infant / Children\u2019s Casket', category: 'merchandise', price: 370, taxable: true, active: true },
  { sku: 'MER-104', name: 'Rental Casket', category: 'merchandise', price: 1095, taxable: true, active: true },
  { sku: 'MER-105', name: 'Alternate Container for Cremation', category: 'merchandise', price: 105, taxable: true, active: true },
  { sku: 'MER-106', name: 'Memorial Folders and Prayer Cards (first 100)', category: 'merchandise', price: 45, taxable: true, active: true },
  { sku: 'MER-107', name: 'Memorial Register Book', category: 'merchandise', price: 45, taxable: true, active: true },
  { sku: 'MER-108', name: 'Urn (starting at)', category: 'merchandise', price: 45, taxable: true, active: true },
  { sku: 'MER-109', name: 'Outside Shipping Container for Airline Transport', category: 'merchandise', price: 185, taxable: true, active: true },
  { sku: 'MER-110', name: 'Combination Shipping Container', category: 'merchandise', price: 295, taxable: true, active: true },
  { sku: 'MER-111', name: 'Memorial Marker (starting at)', category: 'merchandise', price: 1165, taxable: true, active: true },
  { sku: 'MER-112', name: 'Crucifix', category: 'merchandise', price: 25, taxable: true, active: true },
  { sku: 'MER-113', name: 'Rosary', category: 'merchandise', price: 15, taxable: true, active: true },

  // Other Services / Packages
  { sku: 'OTH-100', name: 'Cremation', category: 'service', price: 300, taxable: false, active: true },
  { sku: 'OTH-101', name: 'DCA Fee', category: 'cash_advance', price: 11.5, taxable: false, active: true },
  { sku: 'OTH-102', name: 'Mailing Cremated Remains Within the United States', category: 'service', price: 160, taxable: false, active: true },
  { sku: 'OTH-103', name: 'Motorcycle Escorts (2 Bikes)', category: 'service', price: 400, taxable: false, active: true },
  { sku: 'OTH-104', name: 'Insurance Assignment', category: 'cash_advance', price: 350, taxable: false, active: true },
  { sku: 'OTH-105', name: 'Forwarding Remains to Another Funeral Home', category: 'service', price: 2360, taxable: false, active: true },
  { sku: 'OTH-106', name: 'Receiving Remains from Another Funeral Home', category: 'service', price: 1790, taxable: false, active: true },
  { sku: 'PKG-100', name: 'Direct Cremation — Container Provided by Purchaser', category: 'service', price: 1620, taxable: false, active: true },
  { sku: 'PKG-101', name: 'Direct Cremation — Container Purchased from Funeral Home', category: 'service', price: 1720, taxable: false, active: true },
  { sku: 'PKG-102', name: 'Immediate Burial — Casket Provided by Purchaser', category: 'service', price: 2190, taxable: false, active: true },
  { sku: 'PKG-103', name: 'Immediate Burial — Casket Purchased from Funeral Home', category: 'service', price: 2190, taxable: false, active: true },
]

export const gplItems: GplItem[] = ['loc-1', 'loc-2', 'loc-3', 'loc-4'].flatMap((locationId) =>
  gplCanonical.map((item, i) => ({
    ...item,
    id: `g-${locationId}-${i}`,
    orgId: 'org-1',
    locationId,
  }))
)

export const contracts: Contract[] = [
  {
    id: 'ct-1', caseId: 'case-1', locationId: 'loc-1', status: 'signed',
    lineItems: [
      { id: 'li-1', gplItemId: 'g-1', name: 'Basic Services of Funeral Director & Staff', quantity: 1, unitPrice: 2495 },
      { id: 'li-2', gplItemId: 'g-2', name: 'Embalming', quantity: 1, unitPrice: 895 },
      { id: 'li-3', gplItemId: 'g-3', name: 'Casket — Monarch Bronze', quantity: 1, unitPrice: 4295 },
      { id: 'li-4', gplItemId: 'g-6', name: 'Funeral Ceremony — Facilities & Staff', quantity: 1, unitPrice: 795 },
    ],
    subtotal: 8480, taxTotal: 322.13, discount: 0, total: 8802.13, amountPaid: 4000, paid: false,
    createdAt: '2026-07-09T10:00:00Z', signedAt: '2026-07-09T15:30:00Z',
  },
  {
    id: 'ct-2', caseId: 'case-5', locationId: 'loc-3', status: 'signed',
    lineItems: [
      { id: 'li-5', gplItemId: 'g-1', name: 'Basic Services of Funeral Director & Staff', quantity: 1, unitPrice: 2495 },
      { id: 'li-6', gplItemId: 'g-5', name: 'Visitation — Facilities & Staff (per day)', quantity: 1, unitPrice: 650 },
    ],
    subtotal: 3145, taxTotal: 0, discount: 0, total: 3145, amountPaid: 3145, paid: true,
    createdAt: '2026-07-10T09:00:00Z', signedAt: '2026-07-10T14:00:00Z',
  },
  {
    id: 'ct-3', caseId: 'case-4', locationId: 'loc-2', status: 'paid',
    lineItems: [
      { id: 'li-7', gplItemId: 'g-1', name: 'Basic Services of Funeral Director & Staff', quantity: 1, unitPrice: 2495 },
      { id: 'li-8', gplItemId: 'g-4', name: 'Casket — Oak Heritage', quantity: 1, unitPrice: 2895 },
    ],
    subtotal: 5390, taxTotal: 224.51, discount: 0, total: 5614.51, amountPaid: 5614.51, paid: true,
    createdAt: '2026-06-29T10:00:00Z', signedAt: '2026-06-29T16:00:00Z',
  },
]

// Chain-of-custody audit trail — every stage transition (including the
// initial one) is logged with who moved the case and when. In a real
// deployment this table should be append-only (no edits/deletes) since it's
// the legal record of custody.
export const custodyLog: CustodyLogEntry[] = [
  { id: 'cl-1', caseId: 'case-1', toStage: 'funeral_home', movedBy: 'stf-joe-galvan', movedByName: 'Joe Galvan', timestamp: '2026-07-08T10:00:00Z', note: 'Received from Desert Regional Medical Center' },
  { id: 'cl-2', caseId: 'case-2', toStage: 'funeral_home', movedBy: 'stf-joe-galvan', movedByName: 'Joe Galvan', timestamp: '2026-07-10T22:30:00Z', note: 'Received from residence' },
  { id: 'cl-3', caseId: 'case-3', toStage: 'scene_first_call', movedBy: 'stf-isaiah-casillas', movedByName: 'Isaiah Casillas', timestamp: '2026-07-12T05:40:00Z', note: 'First call received' },
  { id: 'cl-4', caseId: 'case-4', toStage: 'funeral_home', movedBy: 'stf-isaiah-casillas', movedByName: 'Isaiah Casillas', timestamp: '2026-06-28T09:00:00Z' },
  { id: 'cl-5', caseId: 'case-4', fromStage: 'funeral_home', toStage: 'chapel_service', movedBy: 'stf-isaiah-casillas', movedByName: 'Isaiah Casillas', timestamp: '2026-07-05T13:00:00Z' },
  { id: 'cl-6', caseId: 'case-4', fromStage: 'chapel_service', toStage: 'cemetery_burial', movedBy: 'stf-isaiah-casillas', movedByName: 'Isaiah Casillas', timestamp: '2026-07-05T16:30:00Z', note: 'Interment complete' },
  { id: 'cl-7', caseId: 'case-5', toStage: 'funeral_home', movedBy: 'stf-hector-salas', movedByName: 'Hector Salas', timestamp: '2026-07-09T14:00:00Z' },
  { id: 'cl-8', caseId: 'case-5', fromStage: 'funeral_home', toStage: 'chapel_service', movedBy: 'stf-hector-salas', movedByName: 'Hector Salas', timestamp: '2026-07-12T11:15:00Z' },
  { id: 'cl-9', caseId: 'case-6', toStage: 'in_transit', movedBy: 'stf-leticia-casillas', movedByName: 'Leticia Casillas', timestamp: '2026-07-11T12:00:00Z', note: 'Transport arranged from St. Joseph Hospital' },
]

export const vehicles: Vehicle[] = [
  { id: 'veh-1', orgId: 'org-1', locationId: 'loc-1', name: 'Hearse #1', type: 'hearse', active: true },
  { id: 'veh-2', orgId: 'org-1', locationId: 'loc-1', name: 'Transfer Van', type: 'van', active: true },
  { id: 'veh-3', orgId: 'org-1', locationId: 'loc-2', name: 'Hearse #1', type: 'hearse', active: true },
  { id: 'veh-4', orgId: 'org-1', locationId: 'loc-3', name: 'Hearse #1', type: 'hearse', active: true },
  { id: 'veh-5', orgId: 'org-1', locationId: 'loc-3', name: 'Family Limousine', type: 'limousine', active: true },
  { id: 'veh-6', orgId: 'org-1', locationId: 'loc-4', name: 'Hearse #1', type: 'hearse', active: true },
]

export const calendarEvents: CalendarEvent[] = [
  { id: 'e-1', orgId: 'org-1', locationId: 'loc-1', caseId: 'case-1', title: 'Bennett — Arrangement Conference', type: 'meeting', start: '2026-07-13T17:00:00Z', end: '2026-07-13T18:00:00Z', participantIds: ['stf-joe-galvan'] },
  { id: 'e-2', orgId: 'org-1', locationId: 'loc-1', caseId: 'case-1', title: 'Bennett — Visitation', type: 'visitation', start: '2026-07-17T22:00:00Z', end: '2026-07-18T01:00:00Z', location: 'Main Chapel', participantIds: ['stf-joe-galvan', 'stf-david-espinoza'], vehicleId: 'veh-1' },
  { id: 'e-3', orgId: 'org-1', locationId: 'loc-1', caseId: 'case-1', title: 'Bennett — Funeral Service', type: 'service', start: '2026-07-18T21:00:00Z', end: '2026-07-18T22:00:00Z', location: 'Main Chapel', participantIds: ['stf-joe-galvan'], vehicleId: 'veh-1' },
  { id: 'e-4', orgId: 'org-1', locationId: 'loc-2', caseId: 'case-3', title: 'Tanaka — Arrangement Conference', type: 'meeting', start: '2026-07-13T19:00:00Z', end: '2026-07-13T20:00:00Z', participantIds: ['stf-isaiah-casillas'] },
  { id: 'e-5', orgId: 'org-1', locationId: 'loc-3', caseId: 'case-5', title: 'Okafor — Memorial Service', type: 'service', start: '2026-07-16T22:00:00Z', end: '2026-07-16T23:30:00Z', location: 'Coachella Chapel', participantIds: ['stf-hector-salas'], vehicleId: 'veh-4' },
  { id: 'e-6', orgId: 'org-1', locationId: 'loc-4', caseId: 'case-6', title: 'Holt — Arrangement Conference', type: 'meeting', start: '2026-07-15T18:00:00Z', end: '2026-07-15T19:00:00Z', participantIds: ['stf-leticia-casillas'] },
]

// ---------------------------------------------------------------------------
// Inbound email → case matching (info@casillasfuneralhome.com, Outlook)
// ---------------------------------------------------------------------------

export const inboundEmails: InboundEmail[] = [
  {
    id: 'em-1', graphMessageId: 'AAMkAG-mock-1',
    from: 'karen.b@email.com', fromName: 'Karen Bennett',
    subject: 'Photos for the memorial video', preview: 'Hi, attached are the photos we talked about for dad\u2019s memorial video...',
    receivedAt: '2026-07-12T15:40:00Z', caseId: 'case-1', matchStatus: 'auto_matched',
    matchReason: 'Sender matches contact Karen Bennett on case CC-2026-041',
    attachments: [
      { id: 'att-1a', filename: 'dad_photo_1.jpg', contentType: 'image/jpeg', sizeBytes: 2_400_000 },
      { id: 'att-1b', filename: 'dad_photo_2.jpg', contentType: 'image/jpeg', sizeBytes: 1_950_000 },
    ],
  },
  {
    id: 'em-2', graphMessageId: 'AAMkAG-mock-2',
    from: 'medicalrecords@desertregional.example', fromName: 'Desert Regional Medical Center Records',
    subject: 'RE: Bennett, Harold - records request', preview: 'Please find attached the requested medical records for the above-named patient...',
    receivedAt: '2026-07-11T09:15:00Z', matchStatus: 'suggested', caseId: 'case-1',
    matchConfidence: 0.82, matchReason: 'Subject mentions decedent name "Bennett, Harold" matching case CC-2026-041',
    attachments: [
      { id: 'att-2a', filename: 'discharge_summary.pdf', contentType: 'application/pdf', sizeBytes: 340_000 },
    ],
  },
  {
    id: 'em-3', graphMessageId: 'AAMkAG-mock-3',
    from: 'orders@valleyflorist.example', fromName: 'Valley Florist',
    subject: 'Order confirmation #48213', preview: 'Thank you for your order. Your delivery is scheduled for...',
    receivedAt: '2026-07-12T11:05:00Z', matchStatus: 'unmatched', attachments: [],
  },
  {
    id: 'em-4', graphMessageId: 'AAMkAG-mock-4',
    from: 'susan.tanaka@email.com', fromName: 'Susan Tanaka',
    subject: 'Question about tomorrow', preview: 'Hi, I wanted to ask what time we should arrive for the conference tomorrow...',
    receivedAt: '2026-07-12T18:22:00Z', caseId: 'case-3', matchStatus: 'confirmed',
    matchReason: 'Sender matches contact Susan Tanaka on case DHS-2026-018', attachments: [],
    confirmedBy: 'stf-isaiah-casillas', confirmedAt: '2026-07-12T18:30:00Z',
  },
]

// ---------------------------------------------------------------------------
// E-signature requests (SignRequest API)
// ---------------------------------------------------------------------------

export const signatureRequests: SignatureRequest[] = [
  {
    id: 'sig-1', caseId: 'case-1', documentName: 'Authorization for Release of Human Remains',
    signRequestId: 'sr-mock-8841', status: 'signed',
    signerName: 'Karen Bennett', signerEmail: 'karen.b@email.com',
    sentBy: 'stf-joe-galvan', sentAt: '2026-07-09T11:00:00Z', signedAt: '2026-07-09T14:20:00Z',
    signedDocumentUrl: '',
  },
  {
    id: 'sig-2', caseId: 'case-3', documentName: 'Authorization to Accept or Decline Embalming',
    signRequestId: 'sr-mock-8902', status: 'sent',
    signerName: 'Susan Tanaka', signerEmail: 'susan.tanaka@email.com',
    sentBy: 'stf-isaiah-casillas', sentAt: '2026-07-12T19:00:00Z',
  },
]
