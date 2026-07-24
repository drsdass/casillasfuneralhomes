import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'
import { Card, SectionHeading } from '@/components/ui/Primitives'
import { ArrowLeft, Mail, MessageSquare, Copy, Check } from 'lucide-react'
import type { FirstCallInfo } from '@/types'

const sectionLabel = 'bg-slate-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-t-md'
const inputClass = 'w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]'
const labelClass = 'block text-xs font-medium text-slate-600 mb-1'

export default function FirstCallIntake() {
  const { caseId } = useParams<{ caseId: string }>()
  const isEdit = !!caseId
  const navigate = useNavigate()
  const { activeLocationId, currentUser } = useSession()

  const { data: existing } = useQuery({ queryKey: ['case', caseId], queryFn: () => api.getCase(caseId!), enabled: isEdit })

  const [caseNumber, setCaseNumber] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dateOfDeath, setDateOfDeath] = useState('')
  const [timeOfDeath, setTimeOfDeath] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [ssn, setSsn] = useState('')
  const [veteran, setVeteran] = useState(false)
  const [locationType, setLocationType] = useState<FirstCallInfo['locationType']>('residence')
  const [locationAddress, setLocationAddress] = useState('')
  const [gateCode, setGateCode] = useState('')
  const [weight, setWeight] = useState('')
  const [familyPresent, setFamilyPresent] = useState(false)
  const [familyReady, setFamilyReady] = useState('')
  const [contagious, setContagious] = useState(false)
  const [locationInstructions, setLocationInstructions] = useState('')
  const [nokName, setNokName] = useState('')
  const [nokPhone, setNokPhone] = useState('')
  const [nokRelationship, setNokRelationship] = useState('')
  const [coronerCase, setCoronerCase] = useState(false)
  const [coronerCaseNumber, setCoronerCaseNumber] = useState('')
  const [doctorName, setDoctorName] = useState('')
  const [doctorPhone, setDoctorPhone] = useState('')
  const [hospiceName, setHospiceName] = useState('')
  const [hospicePhone, setHospicePhone] = useState('')
  const [personCalling, setPersonCalling] = useState('')
  const [callReceivedAt, setCallReceivedAt] = useState('')
  const [timeOfRemoval, setTimeOfRemoval] = useState('')
  const [callerInstructions, setCallerInstructions] = useState('')

  const [savedCaseId, setSavedCaseId] = useState<string | null>(null)
  const [sendMethod, setSendMethod] = useState<'text' | 'email' | null>(null)
  const [sendTarget, setSendTarget] = useState('')
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    if (!existing) return
    setCaseNumber(existing.caseNumber)
    setFirstName(existing.decedent.firstName)
    setLastName(existing.decedent.lastName)
    setDateOfDeath(existing.decedent.dateOfDeath ?? '')
    setDateOfBirth(existing.decedent.dateOfBirth ?? '')
    setVeteran(existing.decedent.veteran ?? false)
    setNokName(existing.contacts[0]?.name ?? '')
    setNokPhone(existing.contacts[0]?.phone ?? '')
    setNokRelationship(existing.contacts[0]?.relationship ?? '')
    const fc = existing.firstCall
    if (fc) {
      setLocationType(fc.locationType ?? 'residence')
      setLocationAddress(fc.locationAddress ?? '')
      setGateCode(fc.gateCode ?? '')
      setWeight(fc.weight ?? '')
      setFamilyPresent(fc.familyPresent ?? false)
      setFamilyReady(fc.familyReady ?? '')
      setContagious(fc.contagious ?? false)
      setLocationInstructions(fc.specialInstructions ?? '')
      setCoronerCase(fc.coronerCase ?? false)
      setCoronerCaseNumber(fc.coronerCaseNumber ?? '')
      setDoctorName(fc.doctorName ?? '')
      setDoctorPhone(fc.doctorPhone ?? '')
      setHospiceName(fc.hospiceName ?? '')
      setHospicePhone(fc.hospicePhone ?? '')
      setPersonCalling(fc.personCalling ?? '')
      setCallReceivedAt(fc.callReceivedAt ?? '')
      setTimeOfRemoval(fc.timeOfRemoval ?? '')
    }
  }, [existing])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const firstCall: FirstCallInfo = {
        locationType, locationAddress: locationAddress || undefined, gateCode: gateCode || undefined,
        weight: weight || undefined, familyPresent, familyReady: familyReady || undefined, contagious,
        specialInstructions: locationInstructions || undefined, coronerCase, coronerCaseNumber: coronerCaseNumber || undefined,
        doctorName: doctorName || undefined, doctorPhone: doctorPhone || undefined,
        hospiceName: hospiceName || undefined, hospicePhone: hospicePhone || undefined,
        personCalling: personCalling || undefined, callReceivedAt: callReceivedAt || undefined,
        timeOfRemoval: timeOfRemoval || undefined,
        callTakenBy: existing?.firstCall?.callTakenBy ?? currentUser!.name,
        callTakenAt: existing?.firstCall?.callTakenAt ?? new Date().toISOString(),
      }
      const contacts = nokName ? [{ id: existing?.contacts[0]?.id ?? `c-${Date.now()}`, name: nokName, relationship: nokRelationship, phone: nokPhone, isPrimary: true, isAuthorizingAgent: true }] : []

      if (isEdit && caseId) {
        await api.updateCase(caseId, {
          caseNumber: caseNumber.trim() || existing?.caseNumber,
          decedent: { ...existing?.decedent, firstName, lastName, dateOfDeath: dateOfDeath || undefined, dateOfBirth: dateOfBirth || undefined, veteran },
          contacts, firstCall,
        }, currentUser!)
        return caseId
      }
      const created = await api.createCase({
        orgId: currentUser!.orgId, locationId: activeLocationId,
        caseNumber: caseNumber.trim() || `NEW-${Date.now().toString().slice(-6)}`,
        type: 'at_need', status: 'first_call', disposition: 'undetermined',
        decedent: { firstName: firstName || 'Unknown', lastName: lastName || 'Unknown', dateOfDeath: dateOfDeath || undefined, dateOfBirth: dateOfBirth || undefined, veteran },
        contacts, firstCall,
        custodyStage: 'scene_first_call',
      }, currentUser!)
      return created.id
    },
    onSuccess: (id) => setSavedCaseId(id),
  })

  const linkMutation = useMutation({
    mutationFn: () => api.createFamilyPortalLink(savedCaseId!, undefined, 30, currentUser!),
    onSuccess: ({ url }) => setGeneratedLink(url),
  })

  const smsMutation = useMutation({
    mutationFn: (phone: string) => api.notifyFamilySms(phone, `This is Casillas Funeral Home. Please complete the remaining information for your loved one here: ${generatedLink}`),
  })

  async function handleSend() {
    let link = generatedLink
    if (!link) {
      const result = await linkMutation.mutateAsync()
      link = result.url
    }
    if (sendMethod === 'text' && sendTarget) smsMutation.mutate(sendTarget)
    if (sendMethod === 'email' && sendTarget) {
      window.location.href = `mailto:${sendTarget}?subject=${encodeURIComponent('Please complete your information — Casillas Funeral Home')}&body=${encodeURIComponent(`Hello,\n\nPlease complete the remaining information for your loved one here:\n${link}\n\nThank you,\nCasillas Funeral Home`)}`
    }
  }

  if (!currentUser) return null

  return (
    <div className="max-w-3xl">
      <Link to="/cases" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={15} /> Back to cases
      </Link>

      <SectionHeading
        title="First Call"
        subtitle="Fill in what you know now — save and send the rest to the family whenever you're ready. Nothing here is required to save."
      />

      {!savedCaseId ? (
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className={sectionLabel}>DECEASED</div>
            <div className="p-4 space-y-3">
              <div>
                <label className={labelClass}>Case Number</label>
                <input value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)} placeholder="Leave blank to auto-generate" className={inputClass + ' max-w-xs'} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelClass}>First Name</label><input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>Last Name</label><input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className={labelClass}>Date of Death</label><input type="date" value={dateOfDeath} onChange={(e) => setDateOfDeath(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>Time</label><input type="time" value={timeOfDeath} onChange={(e) => setTimeOfDeath(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>Date of Birth</label><input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={inputClass} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3 items-end">
                <div><label className={labelClass}>SS#</label><input value={ssn} onChange={(e) => setSsn(e.target.value)} className={inputClass} /></div>
                <label className="flex items-center gap-2 text-sm text-slate-600 pb-2">
                  <input type="checkbox" checked={veteran} onChange={(e) => setVeteran(e.target.checked)} className="accent-[#3b4a35]" /> Veteran
                </label>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className={sectionLabel}>LOCATION</div>
            <div className="p-4 space-y-3">
              <div className="flex flex-wrap gap-4">
                {(['residence', 'jfk', 'drmc', 'emc', 'other'] as const).map((t) => (
                  <label key={t} className="flex items-center gap-1.5 text-sm text-slate-600">
                    <input type="radio" checked={locationType === t} onChange={() => setLocationType(t)} className="accent-[#3b4a35]" />
                    {t === 'residence' ? 'RES' : t.toUpperCase()}
                  </label>
                ))}
              </div>
              <input value={locationAddress} onChange={(e) => setLocationAddress(e.target.value)} placeholder="Address" className={inputClass} />
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelClass}>Gate Code</label><input value={gateCode} onChange={(e) => setGateCode(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>Weight</label><input value={weight} onChange={(e) => setWeight(e.target.value)} className={inputClass} /></div>
              </div>
              <div className="flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={familyPresent} onChange={(e) => setFamilyPresent(e.target.checked)} className="accent-[#3b4a35]" /> Family Present</label>
                <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={contagious} onChange={(e) => setContagious(e.target.checked)} className="accent-[#3b4a35]" /> Contagious</label>
                <div className="flex-1 min-w-[160px]"><input value={familyReady} onChange={(e) => setFamilyReady(e.target.value)} placeholder="Family ready?" className={inputClass} /></div>
              </div>
              <div><label className={labelClass}>Special Instructions</label><input value={locationInstructions} onChange={(e) => setLocationInstructions(e.target.value)} className={inputClass} /></div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className={sectionLabel}>NEXT OF KIN</div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelClass}>Name</label><input value={nokName} onChange={(e) => setNokName(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>Phone</label><input value={nokPhone} onChange={(e) => setNokPhone(e.target.value)} className={inputClass} /></div>
              </div>
              <div className="max-w-xs"><label className={labelClass}>Relationship</label><input value={nokRelationship} onChange={(e) => setNokRelationship(e.target.value)} className={inputClass} /></div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className={sectionLabel}>MEDICAL INFO</div>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={coronerCase} onChange={(e) => setCoronerCase(e.target.checked)} className="accent-[#3b4a35]" /> Coroner's case</label>
                <input value={coronerCaseNumber} onChange={(e) => setCoronerCaseNumber(e.target.value)} placeholder="Case #" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input value={doctorName} onChange={(e) => setDoctorName(e.target.value)} placeholder="Doctor" className={inputClass} />
                <input value={doctorPhone} onChange={(e) => setDoctorPhone(e.target.value)} placeholder="Doctor phone" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input value={hospiceName} onChange={(e) => setHospiceName(e.target.value)} placeholder="Hospice" className={inputClass} />
                <input value={hospicePhone} onChange={(e) => setHospicePhone(e.target.value)} placeholder="Hospice phone" className={inputClass} />
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className={sectionLabel}>PERSON CALLING</div>
            <div className="p-4 space-y-3">
              <input value={personCalling} onChange={(e) => setPersonCalling(e.target.value)} placeholder="Person calling" className={inputClass} />
              <div className="grid grid-cols-2 gap-3">
                <input value={callReceivedAt} onChange={(e) => setCallReceivedAt(e.target.value)} placeholder="Call received at" className={inputClass} />
                <input value={timeOfRemoval} onChange={(e) => setTimeOfRemoval(e.target.value)} placeholder="Time of removal" className={inputClass} />
              </div>
              <input value={callerInstructions} onChange={(e) => setCallerInstructions(e.target.value)} placeholder="Special instructions" className={inputClass} />
            </div>
          </Card>

          {saveMutation.isError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {saveMutation.error instanceof Error ? saveMutation.error.message : 'Something went wrong saving this.'}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="bg-[#3b4a35] text-white text-sm font-medium px-5 py-2.5 rounded-md hover:bg-[#4d5f45] disabled:opacity-60"
            >
              {saveMutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Save & Create Case'}
            </button>
          </div>
        </div>
      ) : (
        <Card className="p-6">
          <div className="flex items-center gap-2 text-emerald-700 mb-1">
            <Check size={18} /> <span className="font-medium">Saved.</span>
          </div>
          <p className="text-sm text-slate-500 mb-5">
            Send the family a link to fill in whatever's still missing, or head straight to the case.
          </p>

          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setSendMethod('text')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-md border ${sendMethod === 'text' ? 'bg-[#3b4a35] text-white border-[#3b4a35]' : 'text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              <MessageSquare size={14} /> Text
            </button>
            <button
              onClick={() => setSendMethod('email')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-md border ${sendMethod === 'email' ? 'bg-[#3b4a35] text-white border-[#3b4a35]' : 'text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              <Mail size={14} /> Email
            </button>
          </div>

          {sendMethod && (
            <div className="flex gap-2 mb-4">
              <input
                value={sendTarget}
                onChange={(e) => setSendTarget(e.target.value)}
                placeholder={sendMethod === 'text' ? 'Phone number' : 'Email address'}
                className={inputClass}
              />
              <button
                onClick={handleSend}
                disabled={!sendTarget || linkMutation.isPending || smsMutation.isPending}
                className="shrink-0 bg-[#3b4a35] text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-[#4d5f45] disabled:opacity-60"
              >
                Send
              </button>
            </div>
          )}

          {generatedLink && (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-md px-2.5 py-2 mb-4">
              <input readOnly value={generatedLink} className="flex-1 min-w-0 bg-transparent text-xs text-slate-600 focus:outline-none" />
              <button
                onClick={() => { navigator.clipboard.writeText(generatedLink); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000) }}
                className="shrink-0 text-slate-500 hover:text-slate-700"
              >
                {linkCopied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              </button>
            </div>
          )}
          {smsMutation.isSuccess && <div className="text-xs text-emerald-700 mb-3">Text sent.</div>}

          <button
            onClick={() => navigate(`/cases/${savedCaseId}`)}
            className="w-full text-sm font-medium text-slate-600 border border-slate-200 rounded-md px-3.5 py-2.5 hover:bg-slate-50"
          >
            Go to Case →
          </button>
        </Card>
      )}
    </div>
  )
}
