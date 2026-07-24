import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'
import { Card, SectionHeading } from '@/components/ui/Primitives'
import { ArrowLeft, Mail, MessageSquare, Copy, Check } from 'lucide-react'
import type { VitalSheetInfo } from '@/types'

const sectionLabel = 'bg-slate-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-t-md'
const inputClass = 'w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]'
const labelClass = 'block text-xs font-medium text-slate-600 mb-1'

export default function VitalSheetIntake() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const { currentUser } = useSession()
  const { data: c } = useQuery({ queryKey: ['case', caseId], queryFn: () => api.getCase(caseId!), enabled: !!caseId })

  const [f, setF] = useState<VitalSheetInfo>({})
  const [initialized, setInitialized] = useState(false)
  const [sendMethod, setSendMethod] = useState<'text' | 'email' | null>(null)
  const [sendTarget, setSendTarget] = useState('')
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    if (c && !initialized) {
      setF(c.vitalSheet ?? {})
      setInitialized(true)
    }
  }, [c, initialized])

  function set<K extends keyof VitalSheetInfo>(key: K, value: VitalSheetInfo[K]) {
    setF((prev) => ({ ...prev, [key]: value }))
  }

  const saveMutation = useMutation({
    mutationFn: () => api.updateCase(caseId!, { vitalSheet: f }, currentUser!),
  })

  const linkMutation = useMutation({
    mutationFn: () => api.createFamilyPortalLink(caseId!, undefined, 30, currentUser!),
    onSuccess: ({ url }) => setGeneratedLink(url),
  })
  const smsMutation = useMutation({
    mutationFn: (phone: string) => api.notifyFamilySms(phone, `This is Casillas Funeral Home. Please complete the Vital Sheet for your loved one here: ${generatedLink}`),
  })

  async function handleSend() {
    let link = generatedLink
    if (!link) { const r = await linkMutation.mutateAsync(); link = r.url }
    if (sendMethod === 'text' && sendTarget) smsMutation.mutate(sendTarget)
    if (sendMethod === 'email' && sendTarget) {
      window.location.href = `mailto:${sendTarget}?subject=${encodeURIComponent('Please complete the Vital Sheet — Casillas Funeral Home')}&body=${encodeURIComponent(`Hello,\n\nPlease complete the Vital Sheet for your loved one here:\n${link}\n\nThank you,\nCasillas Funeral Home`)}`
    }
  }

  if (!c) return null

  return (
    <div className="max-w-3xl">
      <Link to={`/cases/${caseId}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={15} /> Back to case
      </Link>
      <SectionHeading
        title="Vital Sheet"
        subtitle={`${c.decedent.firstName} ${c.decedent.lastName} — name, DOB, and other First Call info already filled in automatically. Send the rest to the family whenever you're ready.`}
      />

      <div className="space-y-4">
        <Card className="overflow-hidden">
          <div className={sectionLabel}>BIRTH & IDENTITY</div>
          <div className="p-4 space-y-3">
            <input value={f.alsoKnownAs ?? ''} onChange={(e) => set('alsoKnownAs', e.target.value)} placeholder="Also Known As" className={inputClass} />
            <div className="grid grid-cols-2 gap-3">
              <input value={f.ageUnderHours ?? ''} onChange={(e) => set('ageUnderHours', e.target.value)} placeholder="If under 24 hrs — Hours" className={inputClass} />
              <input value={f.ageUnderDays ?? ''} onChange={(e) => set('ageUnderDays', e.target.value)} placeholder="If under 24 hrs — Days" className={inputClass} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <input value={f.birthCity ?? ''} onChange={(e) => set('birthCity', e.target.value)} placeholder="Birth City" className={inputClass} />
              <input value={f.birthState ?? ''} onChange={(e) => set('birthState', e.target.value)} placeholder="Birth State" className={inputClass} />
              <input value={f.birthCountry ?? ''} onChange={(e) => set('birthCountry', e.target.value)} placeholder="Birth Country" className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input value={f.education ?? ''} onChange={(e) => set('education', e.target.value)} placeholder="Education" className={inputClass} />
              <input value={f.race ?? ''} onChange={(e) => set('race', e.target.value)} placeholder="Race" className={inputClass} />
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-600">Hispanic/Latino/Spanish?</span>
              <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="radio" checked={!f.hispanicLatino} onChange={() => set('hispanicLatino', false)} className="accent-[#3b4a35]" /> No</label>
              <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="radio" checked={f.hispanicLatino ?? false} onChange={() => set('hispanicLatino', true)} className="accent-[#3b4a35]" /> Yes</label>
              {f.hispanicLatino && <input value={f.hispanicSpecify ?? ''} onChange={(e) => set('hispanicSpecify', e.target.value)} placeholder="Specify" className={inputClass} />}
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className={sectionLabel}>OCCUPATION</div>
          <div className="p-4 grid grid-cols-3 gap-3">
            <input value={f.occupation ?? ''} onChange={(e) => set('occupation', e.target.value)} placeholder="Occupation" className={inputClass} />
            <input value={f.kindOfBusiness ?? ''} onChange={(e) => set('kindOfBusiness', e.target.value)} placeholder="Kind of Business" className={inputClass} />
            <input value={f.yearsInOccupation ?? ''} onChange={(e) => set('yearsInOccupation', e.target.value)} placeholder="Years in Occupation" className={inputClass} />
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className={sectionLabel}>DECEDENT'S RESIDENCE</div>
          <div className="p-4 space-y-3">
            <input value={f.residenceAddress ?? ''} onChange={(e) => set('residenceAddress', e.target.value)} placeholder="Address" className={inputClass} />
            <div className="grid grid-cols-4 gap-3">
              <input value={f.residenceCity ?? ''} onChange={(e) => set('residenceCity', e.target.value)} placeholder="City" className={inputClass} />
              <input value={f.residenceCounty ?? ''} onChange={(e) => set('residenceCounty', e.target.value)} placeholder="County" className={inputClass} />
              <input value={f.residenceState ?? ''} onChange={(e) => set('residenceState', e.target.value)} placeholder="State" className={inputClass} />
              <input value={f.residenceZip ?? ''} onChange={(e) => set('residenceZip', e.target.value)} placeholder="Zip" className={inputClass} />
            </div>
            <input value={f.yearsInCounty ?? ''} onChange={(e) => set('yearsInCounty', e.target.value)} placeholder="Years in County" className={inputClass + ' max-w-xs'} />
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className={sectionLabel}>INFORMANT</div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input value={f.informantName ?? ''} onChange={(e) => set('informantName', e.target.value)} placeholder="Name & Relationship" className={inputClass} />
              <input value={f.informantRelationship ?? ''} onChange={(e) => set('informantRelationship', e.target.value)} placeholder="Relationship" className={inputClass} />
            </div>
            <input value={f.informantMailingAddress ?? ''} onChange={(e) => set('informantMailingAddress', e.target.value)} placeholder="Mailing Address" className={inputClass} />
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className={sectionLabel}>FAMILY</div>
          <div className="p-4 space-y-3">
            <input value={f.spouseName ?? ''} onChange={(e) => set('spouseName', e.target.value)} placeholder="Spouse Name" className={inputClass} />
            <div className="grid grid-cols-2 gap-3">
              <input value={f.fatherName ?? ''} onChange={(e) => set('fatherName', e.target.value)} placeholder="Father's Name" className={inputClass} />
              <input value={f.fatherBirthState ?? ''} onChange={(e) => set('fatherBirthState', e.target.value)} placeholder="Father's Birth State" className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input value={f.motherName ?? ''} onChange={(e) => set('motherName', e.target.value)} placeholder="Mother's Name" className={inputClass} />
              <input value={f.motherBirthState ?? ''} onChange={(e) => set('motherBirthState', e.target.value)} placeholder="Mother's Birth State" className={inputClass} />
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className={sectionLabel}>SERVICES</div>
          <div className="p-4 space-y-3">
            <input value={f.visitationHours ?? ''} onChange={(e) => set('visitationHours', e.target.value)} placeholder="Visitation Hours" className={inputClass} />
            <div className="grid grid-cols-5 gap-2 items-center">
              <input type="date" value={f.rosaryDate ?? ''} onChange={(e) => set('rosaryDate', e.target.value)} className={inputClass} />
              <input type="time" value={f.rosaryTime ?? ''} onChange={(e) => set('rosaryTime', e.target.value)} className={inputClass} />
              <select value={f.rosaryLanguage ?? ''} onChange={(e) => set('rosaryLanguage', e.target.value as VitalSheetInfo['rosaryLanguage'])} className={inputClass}>
                <option value="">Rosary Lang.</option><option value="english">English</option><option value="spanish">Spanish</option>
              </select>
              <input value={f.rosaryPlace ?? ''} onChange={(e) => set('rosaryPlace', e.target.value)} placeholder="Rosary Place" className={inputClass} />
              <input value={f.rosaryBy ?? ''} onChange={(e) => set('rosaryBy', e.target.value)} placeholder="By" className={inputClass} />
            </div>
            <div className="grid grid-cols-5 gap-2 items-center">
              <input type="date" value={f.massDate ?? ''} onChange={(e) => set('massDate', e.target.value)} className={inputClass} />
              <input type="time" value={f.massTime ?? ''} onChange={(e) => set('massTime', e.target.value)} className={inputClass} />
              <select value={f.massLanguage ?? ''} onChange={(e) => set('massLanguage', e.target.value as VitalSheetInfo['massLanguage'])} className={inputClass}>
                <option value="">Mass Lang.</option><option value="english">English</option><option value="spanish">Spanish</option>
              </select>
              <input value={f.massPlace ?? ''} onChange={(e) => set('massPlace', e.target.value)} placeholder="Mass Place" className={inputClass} />
              <input value={f.massBy ?? ''} onChange={(e) => set('massBy', e.target.value)} placeholder="By" className={inputClass} />
            </div>
            <div className="grid grid-cols-4 gap-2 items-center">
              <input type="date" value={f.gravesideDate ?? ''} onChange={(e) => set('gravesideDate', e.target.value)} className={inputClass} />
              <input type="time" value={f.gravesideTime ?? ''} onChange={(e) => set('gravesideTime', e.target.value)} className={inputClass} />
              <input value={f.gravesidePlace ?? ''} onChange={(e) => set('gravesidePlace', e.target.value)} placeholder="Graveside Place" className={inputClass} />
              <input value={f.gravesideBy ?? ''} onChange={(e) => set('gravesideBy', e.target.value)} placeholder="By" className={inputClass} />
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className={sectionLabel}>OFFICE USE ONLY</div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input type="date" value={f.dispositionDate ?? ''} onChange={(e) => set('dispositionDate', e.target.value)} placeholder="Disposition Date" className={inputClass} />
              <input value={f.placeOfFinalDisposition ?? ''} onChange={(e) => set('placeOfFinalDisposition', e.target.value)} placeholder="Place of Final Disposition" className={inputClass} />
            </div>
            <input value={f.dispositionTypeOther ?? ''} onChange={(e) => set('dispositionTypeOther', e.target.value)} placeholder="CVC / DMP / Other" className={inputClass} />
            <div className="grid grid-cols-2 gap-3">
              <input value={f.typeOfDisposition ?? ''} onChange={(e) => set('typeOfDisposition', e.target.value)} placeholder="Type of Disposition (EMB, etc.)" className={inputClass} />
              <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={f.accidentOrViolentCause ?? false} onChange={(e) => set('accidentOrViolentCause', e.target.checked)} className="accent-[#3b4a35]" /> Accident / Violent Cause</label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <input value={f.deathCounty ?? ''} onChange={(e) => set('deathCounty', e.target.value)} placeholder="County (of death)" className={inputClass} />
              <input value={f.facilityAddressOrAddressFound ?? ''} onChange={(e) => set('facilityAddressOrAddressFound', e.target.value)} placeholder="Facility Address / Address Found" className={inputClass} />
              <input value={f.deathCity ?? ''} onChange={(e) => set('deathCity', e.target.value)} placeholder="City (of death)" className={inputClass} />
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={f.obituary ?? false} onChange={(e) => set('obituary', e.target.checked)} className="accent-[#3b4a35]" /> Obituary</label>
              <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={f.pacemaker ?? false} onChange={(e) => set('pacemaker', e.target.checked)} className="accent-[#3b4a35]" /> Pacemaker</label>
              <span className="text-sm text-slate-600">Language</span>
              <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="radio" checked={f.documentLanguage === 'spanish'} onChange={() => set('documentLanguage', 'spanish')} className="accent-[#3b4a35]" /> SPN</label>
              <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="radio" checked={f.documentLanguage === 'english'} onChange={() => set('documentLanguage', 'english')} className="accent-[#3b4a35]" /> ENG</label>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className={sectionLabel}>SURVIVED BY</div>
          <div className="p-4 grid grid-cols-2 gap-3">
            <input value={f.sons ?? ''} onChange={(e) => set('sons', e.target.value)} placeholder="Sons" className={inputClass} />
            <input value={f.daughters ?? ''} onChange={(e) => set('daughters', e.target.value)} placeholder="Daughters" className={inputClass} />
            <input value={f.sisters ?? ''} onChange={(e) => set('sisters', e.target.value)} placeholder="Sisters" className={inputClass} />
            <input value={f.brothers ?? ''} onChange={(e) => set('brothers', e.target.value)} placeholder="Brothers" className={inputClass} />
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className={sectionLabel}>CHURCH</div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input value={f.churchName ?? ''} onChange={(e) => set('churchName', e.target.value)} placeholder="Church" className={inputClass} />
              <input value={f.pastorName ?? ''} onChange={(e) => set('pastorName', e.target.value)} placeholder="Pastor" className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input value={f.churchAddress ?? ''} onChange={(e) => set('churchAddress', e.target.value)} placeholder="Church Address" className={inputClass} />
              <input value={f.pastorPhone ?? ''} onChange={(e) => set('pastorPhone', e.target.value)} placeholder="Pastor Tel." className={inputClass} />
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className={sectionLabel}>FLOWERS, CARDS & EXTRAS</div>
          <div className="p-4 space-y-3">
            <textarea value={f.flowersNotes ?? ''} onChange={(e) => set('flowersNotes', e.target.value)} placeholder="Flowers — vendor, items, ribbon text, color" className={inputClass} rows={2} />
            <input value={f.cardsNameOn ?? ''} onChange={(e) => set('cardsNameOn', e.target.value)} placeholder="Name on Cards / Memorial Folders" className={inputClass} />
            <textarea value={f.prayerCardsNotes ?? ''} onChange={(e) => set('prayerCardsNotes', e.target.value)} placeholder="Prayer Cards — design, verse, amount, language" className={inputClass} rows={2} />
            <textarea value={f.memorialFoldersNotes ?? ''} onChange={(e) => set('memorialFoldersNotes', e.target.value)} placeholder="Memorial Folders — design, verse, amount, language" className={inputClass} rows={2} />
            <input value={f.memorialBook ?? ''} onChange={(e) => set('memorialBook', e.target.value)} placeholder="Book" className={inputClass} />
            <div className="grid grid-cols-2 gap-3">
              <input value={f.doctorAddress ?? ''} onChange={(e) => set('doctorAddress', e.target.value)} placeholder="Doctor Address" className={inputClass} />
              <input value={f.doctorFax ?? ''} onChange={(e) => set('doctorFax', e.target.value)} placeholder="Doctor Fax" className={inputClass} />
            </div>
            <input value={f.makeupHair ?? ''} onChange={(e) => set('makeupHair', e.target.value)} placeholder="Make-up & Hair notes" className={inputClass} />
            <input value={f.receivingFuneralDirector ?? ''} onChange={(e) => set('receivingFuneralDirector', e.target.value)} placeholder="Receiving Funeral Director" className={inputClass} />
            <input value={f.receivingFuneralDirectorAddress ?? ''} onChange={(e) => set('receivingFuneralDirectorAddress', e.target.value)} placeholder="Receiving Funeral Director Address" className={inputClass} />
            <div className="grid grid-cols-2 gap-3">
              <input value={f.receivingFuneralDirectorCharges ?? ''} onChange={(e) => set('receivingFuneralDirectorCharges', e.target.value)} placeholder="Charges $" className={inputClass} />
              <input value={f.receivingFuneralDirectorPhone ?? ''} onChange={(e) => set('receivingFuneralDirectorPhone', e.target.value)} placeholder="Phone" className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input value={f.medallions ?? ''} onChange={(e) => set('medallions', e.target.value)} placeholder="Medallions" className={inputClass} />
              <input value={f.charms ?? ''} onChange={(e) => set('charms', e.target.value)} placeholder="Charms" className={inputClass} />
            </div>
          </div>
        </Card>

        {saveMutation.isError && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            {saveMutation.error instanceof Error ? saveMutation.error.message : 'Something went wrong saving this.'}
          </div>
        )}

        {saveMutation.isSuccess ? (
          <Card className="p-5">
            <div className="flex items-center gap-2 text-emerald-700 mb-3"><Check size={16} /> <span className="text-sm font-medium">Saved.</span></div>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setSendMethod('text')} className={`flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-md border ${sendMethod === 'text' ? 'bg-[#3b4a35] text-white border-[#3b4a35]' : 'text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                <MessageSquare size={14} /> Text
              </button>
              <button onClick={() => setSendMethod('email')} className={`flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-md border ${sendMethod === 'email' ? 'bg-[#3b4a35] text-white border-[#3b4a35]' : 'text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                <Mail size={14} /> Email
              </button>
            </div>
            {sendMethod && (
              <div className="flex gap-2 mb-3">
                <input value={sendTarget} onChange={(e) => setSendTarget(e.target.value)} placeholder={sendMethod === 'text' ? 'Phone number' : 'Email address'} className={inputClass} />
                <button onClick={handleSend} disabled={!sendTarget} className="shrink-0 bg-[#3b4a35] text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-[#4d5f45] disabled:opacity-60">Send</button>
              </div>
            )}
            {generatedLink && (
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-md px-2.5 py-2 mb-3">
                <input readOnly value={generatedLink} className="flex-1 min-w-0 bg-transparent text-xs text-slate-600 focus:outline-none" />
                <button onClick={() => { navigator.clipboard.writeText(generatedLink); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000) }} className="shrink-0 text-slate-500 hover:text-slate-700">
                  {linkCopied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                </button>
              </div>
            )}
            <button onClick={() => navigate(`/cases/${caseId}`)} className="w-full text-sm font-medium text-slate-600 border border-slate-200 rounded-md px-3.5 py-2.5 hover:bg-slate-50">Back to Case →</button>
          </Card>
        ) : (
          <div className="flex justify-end">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="bg-[#3b4a35] text-white text-sm font-medium px-5 py-2.5 rounded-md hover:bg-[#4d5f45] disabled:opacity-60"
            >
              {saveMutation.isPending ? 'Saving…' : 'Save Vital Sheet'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
