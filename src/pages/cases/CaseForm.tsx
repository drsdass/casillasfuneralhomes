import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'
import { Card, SectionHeading } from '@/components/ui/Primitives'
import { ArrowLeft, Sparkles } from 'lucide-react'
import type { CaseType, DispositionType, CaseStatus, ExtractedCaseData } from '@/types'

const typeOptions: { value: CaseType; label: string }[] = [
  { value: 'at_need', label: 'At Need' },
  { value: 'pre_need', label: 'Pre Need' },
  { value: 'transfer_only', label: 'Transfer Only' },
]
const dispositionOptions: { value: DispositionType; label: string }[] = [
  { value: 'undetermined', label: 'Undetermined' },
  { value: 'burial', label: 'Burial' },
  { value: 'cremation', label: 'Cremation' },
  { value: 'entombment', label: 'Entombment' },
  { value: 'donation', label: 'Donation' },
]
const statusOptions: { value: CaseStatus; label: string }[] = [
  { value: 'first_call', label: 'First Call' },
  { value: 'arrangement_pending', label: 'Arrangement Pending' },
  { value: 'arrangement_scheduled', label: 'Arrangement Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'service_scheduled', label: 'Service Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On Hold' },
]

const inputClass = 'w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]'
const labelClass = 'block text-xs font-medium text-slate-600 mb-1'

/** "2026-07-20T14:00:00.000Z" <-> "2026-07-20T14:00" for <input type="datetime-local"> */
function isoToLocalInput(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function localInputToIso(local: string): string | undefined {
  if (!local) return undefined
  return new Date(local).toISOString()
}

export default function CaseForm() {
  const { caseId } = useParams<{ caseId: string }>()
  const isEdit = !!caseId
  const navigate = useNavigate()
  const location = useLocation()
  const { activeLocationId, currentUser } = useSession()
  const queryClient = useQueryClient()
  const extracted = (location.state as { extracted?: ExtractedCaseData } | null)?.extracted

  const { data: existing } = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => api.getCase(caseId!),
    enabled: isEdit,
  })
  const { data: linkedFamily } = useQuery({
    queryKey: ['family', existing?.familyId],
    queryFn: () => api.getFamily(existing!.familyId!),
    enabled: !!existing?.familyId,
  })

  const [caseNumber, setCaseNumber] = useState(existing?.caseNumber ?? '')
  const [firstName, setFirstName] = useState(existing?.decedent.firstName ?? extracted?.decedentFirstName ?? '')
  const [lastName, setLastName] = useState(existing?.decedent.lastName ?? extracted?.decedentLastName ?? '')
  const [dateOfDeath, setDateOfDeath] = useState(existing?.decedent.dateOfDeath ?? extracted?.dateOfDeath ?? '')
  const [placeOfDeath, setPlaceOfDeath] = useState(existing?.decedent.placeOfDeath ?? extracted?.placeOfDeath ?? '')
  const [type, setType] = useState<CaseType>(existing?.type ?? extracted?.type ?? 'at_need')
  const [status, setStatus] = useState<CaseStatus>(existing?.status ?? 'first_call')
  const [disposition, setDisposition] = useState<DispositionType>(existing?.disposition ?? extracted?.disposition ?? 'undetermined')
  const [familyId, setFamilyId] = useState<string | undefined>(existing?.familyId)
  const [familySearch, setFamilySearch] = useState('')
  const [familySearchResults, setFamilySearchResults] = useState<Awaited<ReturnType<typeof api.searchFamilies>>>([])
  const [selectedFamilyName, setSelectedFamilyName] = useState<string | null>(null)
  const [visitationDate, setVisitationDate] = useState(isoToLocalInput(existing?.visitationDate))
  const [visitationLocation, setVisitationLocation] = useState(existing?.visitationLocation ?? '')
  const [serviceDate, setServiceDate] = useState(isoToLocalInput(existing?.serviceDate))
  const [serviceLocation, setServiceLocation] = useState(existing?.serviceLocation ?? '')
  const [contactName, setContactName] = useState(existing?.contacts[0]?.name ?? extracted?.contactName ?? '')
  const [contactRelationship, setContactRelationship] = useState(existing?.contacts[0]?.relationship ?? extracted?.contactRelationship ?? '')
  const [contactPhone, setContactPhone] = useState(existing?.contacts[0]?.phone ?? extracted?.contactPhone ?? '')
  const [contactEmail, setContactEmail] = useState(existing?.contacts[0]?.email ?? extracted?.contactEmail ?? '')

  useEffect(() => {
    if (linkedFamily) { setFamilyId(linkedFamily.id); setSelectedFamilyName(linkedFamily.name) }
  }, [linkedFamily])

  useEffect(() => {
    if (!familySearch.trim() || selectedFamilyName) { setFamilySearchResults([]); return }
    const t = setTimeout(() => {
      api.searchFamilies(familySearch).then(setFamilySearchResults)
    }, 250)
    return () => clearTimeout(t)
  }, [familySearch, selectedFamilyName])

  useEffect(() => {
    if (!existing) return
    setCaseNumber(existing.caseNumber)
    setFirstName(existing.decedent.firstName)
    setLastName(existing.decedent.lastName)
    setDateOfDeath(existing.decedent.dateOfDeath ?? '')
    setPlaceOfDeath(existing.decedent.placeOfDeath ?? '')
    setType(existing.type)
    setStatus(existing.status)
    setDisposition(existing.disposition)
    setVisitationDate(isoToLocalInput(existing.visitationDate))
    setVisitationLocation(existing.visitationLocation ?? '')
    setServiceDate(isoToLocalInput(existing.serviceDate))
    setServiceLocation(existing.serviceLocation ?? '')
    setContactName(existing.contacts[0]?.name ?? '')
    setContactRelationship(existing.contacts[0]?.relationship ?? '')
    setContactPhone(existing.contacts[0]?.phone ?? '')
    setContactEmail(existing.contacts[0]?.email ?? '')
  }, [existing])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const colorPalette = ['#3d4f3a', '#8b5e34', '#6b7f4f', '#a8763e', '#2f4a3f']
      const contacts = contactName
        ? [{ id: existing?.contacts[0]?.id ?? `c-${Date.now()}`, name: contactName, relationship: contactRelationship, phone: contactPhone, email: contactEmail, isPrimary: true, isAuthorizingAgent: true }]
        : (existing?.contacts ?? [])

      if (isEdit && caseId) {
        return api.updateCase(caseId, {
          caseNumber: caseNumber.trim() || existing?.caseNumber,
          type, status, disposition,
          decedent: { ...existing?.decedent, firstName, lastName, dateOfDeath: dateOfDeath || undefined, placeOfDeath: placeOfDeath || undefined },
          contacts,
          familyId,
          visitationDate: localInputToIso(visitationDate),
          visitationLocation: visitationLocation || undefined,
          serviceDate: localInputToIso(serviceDate),
          serviceLocation: serviceLocation || undefined,
        }, currentUser!)
      }
      return api.createCase({
        orgId: currentUser!.orgId,
        locationId: activeLocationId,
        caseNumber: `NEW-${Date.now().toString().slice(-6)}`,
        type, status, disposition,
        decedent: { firstName, lastName, dateOfDeath: dateOfDeath || undefined, placeOfDeath: placeOfDeath || undefined },
        contacts,
        familyId,
        visitationDate: localInputToIso(visitationDate),
        visitationLocation: visitationLocation || undefined,
        serviceDate: localInputToIso(serviceDate),
        serviceLocation: serviceLocation || undefined,
        custodyStage: 'scene_first_call',
        color: colorPalette[Math.floor(Math.random() * colorPalette.length)],
      }, currentUser!)
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['cases'] })
      if (result) navigate(`/cases/${result.id}`)
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!currentUser) return
    saveMutation.mutate()
  }

  return (
    <div>
      <Link to={isEdit ? `/cases/${caseId}` : '/cases'} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={15} /> {isEdit ? 'Back to case' : 'Back to cases'}
      </Link>

      <SectionHeading title={isEdit ? 'Edit Case' : 'New Case'} subtitle={isEdit ? existing?.caseNumber : 'Enter decedent and case details'} />

      {extracted && (
        <Card className="max-w-2xl p-4 mb-5 border-[#b3925a]/40 bg-[#b3925a]/5">
          <div className="flex items-start gap-2">
            <Sparkles size={16} className="text-[#b3925a] shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-slate-800">
                Pre-filled from an uploaded document — {extracted.confidence} confidence
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Double-check every field below before saving.</div>
              {extracted.notes && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2.5 py-1.5 mt-2">
                  {extracted.notes}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="max-w-2xl">
        <Card className="p-5 mb-5">
          <h3 className="text-sm font-medium text-slate-800 mb-3">Decedent</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className={labelClass}>First Name</label>
              <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Last Name</label>
              <input required value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Date of Death</label>
              <input type="date" value={dateOfDeath} onChange={(e) => setDateOfDeath(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Place of Death</label>
              <input value={placeOfDeath} onChange={(e) => setPlaceOfDeath(e.target.value)} className={inputClass} />
            </div>
          </div>
        </Card>

        <Card className="p-5 mb-5">
          <h3 className="text-sm font-medium text-slate-800 mb-3">Case Details</h3>
          <div className="mb-4">
            <label className={labelClass}>Case Number</label>
            <input value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)} className={inputClass + ' max-w-xs'} />
            <p className="text-xs text-slate-400 mt-1">Editable — some cases use the coroner's case number instead of the default one.</p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as CaseType)} className={inputClass}>
                {typeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as CaseStatus)} className={inputClass}>
                {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Disposition</label>
              <select value={disposition} onChange={(e) => setDisposition(e.target.value as DispositionType)} className={inputClass}>
                {dispositionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </Card>

        <Card className="p-5 mb-5">
          <h3 className="text-sm font-medium text-slate-800 mb-1">Family</h3>
          <p className="text-xs text-slate-400 mb-3">
            Link this case to a family so their full history — past cases, notes, preferences — stays together over the years.
          </p>
          {familyId && selectedFamilyName ? (
            <div className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-md px-3 py-2">
              <span className="text-sm text-slate-700">{selectedFamilyName}</span>
              <button
                type="button"
                onClick={() => { setFamilyId(undefined); setSelectedFamilyName(null); setFamilySearch('') }}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                value={familySearch}
                onChange={(e) => setFamilySearch(e.target.value)}
                placeholder="Search by family name or phone…"
                className={inputClass}
              />
              {familySearchResults.length > 0 && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg z-10 overflow-hidden">
                  {familySearchResults.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => { setFamilyId(f.id); setSelectedFamilyName(f.name); setFamilySearchResults([]) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      {f.name} {f.primaryContactPhone && <span className="text-slate-400">— {f.primaryContactPhone}</span>}
                    </button>
                  ))}
                </div>
              )}
              {familySearch.trim() && familySearchResults.length === 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    const created = await api.createFamily({ orgId: currentUser!.orgId, name: familySearch.trim() }, currentUser!)
                    setFamilyId(created.id)
                    setSelectedFamilyName(created.name)
                  }}
                  className="mt-1.5 text-xs font-medium text-[#3b4a35] hover:underline"
                >
                  + Create new family "{familySearch.trim()}"
                </button>
              )}
            </div>
          )}
        </Card>

        <Card className="p-5 mb-5">
          <h3 className="text-sm font-medium text-slate-800 mb-1">Visitation &amp; Service</h3>
          <p className="text-xs text-slate-400 mb-3">Setting a date here automatically adds (or updates) it on the Calendar — no separate step needed.</p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className={labelClass}>Visitation Date &amp; Time</label>
              <input type="datetime-local" value={visitationDate} onChange={(e) => setVisitationDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Visitation Location</label>
              <input value={visitationLocation} onChange={(e) => setVisitationLocation(e.target.value)} className={inputClass} placeholder="Main Chapel, etc." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Service Date &amp; Time</label>
              <input type="datetime-local" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Service Location</label>
              <input value={serviceLocation} onChange={(e) => setServiceLocation(e.target.value)} className={inputClass} placeholder="Main Chapel, cemetery, etc." />
            </div>
          </div>
        </Card>

        <Card className="p-5 mb-5">
          <h3 className="text-sm font-medium text-slate-800 mb-3">Primary Contact</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className={labelClass}>Name</label>
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Relationship</label>
              <input value={contactRelationship} onChange={(e) => setContactRelationship(e.target.value)} className={inputClass} placeholder="Daughter, Spouse, etc." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Phone</label>
              <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className={inputClass}
                placeholder="Required to send documents for signature"
              />
            </div>
          </div>
        </Card>

        {saveMutation.isError && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2 mb-3">
            Couldn't save this case: {saveMutation.error instanceof Error ? saveMutation.error.message : 'Unknown error'}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Link to={isEdit ? `/cases/${caseId}` : '/cases'} className="text-sm font-medium text-slate-600 border border-slate-200 rounded-md px-4 py-2 hover:bg-slate-50">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="text-sm font-medium bg-[#3b4a35] text-white rounded-md px-4 py-2 hover:bg-[#4d5f45] transition disabled:opacity-60"
          >
            {saveMutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Case'}
          </button>
        </div>
      </form>
    </div>
  )
}
