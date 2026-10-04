import { useState, useEffect, type ReactNode } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'
import { getErrorMessage } from '@/lib/errors'
import { VITAL_FIELDS, computeAge, withSplitNames } from '@/lib/vitalFields'
import {
  EDRS_MARITAL, EDRS_EDUCATION, EDRS_RACES, EDRS_RELATIONSHIPS, EDRS_DISPOSITIONS, PLACE_OF_DEATH_TYPES,
  normalizeMarital, normalizeEducation, normalizeRace, normalizeDisposition,
} from '@/lib/edrsFormat'
import { Card, SectionHeading } from '@/components/ui/Primitives'
import { ArrowLeft, Mail, MessageSquare, Copy, Check, ListChecks, Eye } from 'lucide-react'
import type { VitalSheetInfo, Decedent } from '@/types'

const sectionLabel = 'bg-slate-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-t-md'
const inputClass = 'w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]'
const labelClass = 'block text-[11px] font-medium text-slate-600 mb-1 uppercase tracking-wide'
const readOnlyClass = 'w-full border border-slate-200 bg-slate-50 rounded-md px-3 py-2 text-sm text-slate-700 min-h-[38px]'

const byId = Object.fromEntries(VITAL_FIELDS.map((f) => [f.id, f]))

/**
 * A labelled box whose number and wording come from the shared field list,
 * so what's on this screen is always what's printed on the paper form.
 */
function L({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const f = byId[id]
  return (
    <div className={className}>
      <label className={labelClass}>
        {f.number && <span className="font-bold text-[#b3925a] mr-1 normal-case tracking-normal">{f.number}.</span>}
        {f.label}
        {f.hint && <span className="text-slate-400 font-normal normal-case"> — {f.hint}</span>}
      </label>
      {children}
    </div>
  )
}

/** A dropdown limited to EDRS's own choices. A value already on file that isn't one of them stays visible (and flagged) until someone picks a real one. */
function VocabSelect({ value, onChange, options, className }: { value: string; onChange: (v: string) => void; options: readonly string[]; className: string }) {
  const legacy = value && !options.includes(value)
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">—</option>
      {legacy && <option value={value}>{value} (not an EDRS choice)</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

/** Same look as L, for the items that exist in EDRS but not on the paper form. */
function EL({ num, label, hint, children, className }: { num: string; label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className={labelClass}>
        <span className="font-bold text-[#b3925a] mr-1 normal-case tracking-normal">{num}.</span>{label}
        {hint && <span className="text-slate-400 font-normal normal-case"> — {hint}</span>}
      </label>
      {children}
    </div>
  )
}

export default function VitalSheetIntake() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const { currentUser } = useSession()
  const { data: c } = useQuery({ queryKey: ['case', caseId], queryFn: () => api.getCase(caseId!), enabled: !!caseId })

  // Vital Sheet fields proper
  const [f, setF] = useState<VitalSheetInfo>({})
  // Fields that live on the decedent / First Call but belong on this form too
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dob, setDob] = useState('')
  const [dod, setDod] = useState('')
  const [timeOfDeath, setTimeOfDeath] = useState('')
  const [sex, setSex] = useState<NonNullable<Decedent['sex']> | ''>('')
  const [marital, setMarital] = useState('')
  const [veteran, setVeteran] = useState(false)
  const [placeOfDeath, setPlaceOfDeath] = useState('')
  const [weight, setWeight] = useState('')
  const [coronerNumber, setCoronerNumber] = useState('')
  // SSN is never preloaded — it's fetched only when asked for, because every view is audit-logged
  const [ssn, setSsn] = useState('')
  const [ssnDirty, setSsnDirty] = useState(false)
  const [ssnLoading, setSsnLoading] = useState(false)
  const [ssnNotice, setSsnNotice] = useState<string | null>(null)

  const [initialized, setInitialized] = useState(false)
  const [sendMethod, setSendMethod] = useState<'text' | 'email' | null>(null)
  const [sendTarget, setSendTarget] = useState('')
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    if (c && !initialized) {
      const init = withSplitNames(c.vitalSheet)
      init.education = normalizeEducation(init.education).value ?? init.education
      init.race = normalizeRace(init.race).value ?? init.race
      init.typeOfDisposition = normalizeDisposition(init.typeOfDisposition).value ?? init.typeOfDisposition
      setF(init)
      setFirstName(c.decedent.firstName)
      setMiddleName(c.decedent.middleName ?? '')
      setLastName(c.decedent.lastName)
      setDob(c.decedent.dateOfBirth?.slice(0, 10) ?? '')
      setDod(c.decedent.dateOfDeath?.slice(0, 10) ?? '')
      setTimeOfDeath(c.firstCall?.timeOfDeath ?? '')
      setSex(c.decedent.sex ?? '')
      setMarital(normalizeMarital(c.decedent.maritalStatus).value ?? c.decedent.maritalStatus ?? '')
      setVeteran(c.decedent.veteran ?? false)
      setPlaceOfDeath(c.decedent.placeOfDeath ?? '')
      setWeight(c.firstCall?.weight ?? '')
      setCoronerNumber(c.firstCall?.coronerCaseNumber ?? '')
      setInitialized(true)
    }
  }, [c, initialized])

  function set<K extends keyof VitalSheetInfo>(key: K, value: VitalSheetInfo[K]) {
    setF((prev) => ({ ...prev, [key]: value }))
  }
  const text = (key: keyof VitalSheetInfo) => ({
    value: (f[key] as string | undefined) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value as never),
    className: inputClass,
  })

  async function revealSsn() {
    setSsnLoading(true)
    setSsnNotice(null)
    try {
      const value = await api.getDecedentSsn(caseId!)
      setSsn(value ?? '')
      setSsnDirty(false)
      if (!value) setSsnNotice('No Social Security number on file yet.')
    } catch (err) {
      setSsnNotice(getErrorMessage(err))
    } finally {
      setSsnLoading(false)
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!c) return
      await api.updateCase(caseId!, {
        vitalSheet: f,
        decedent: {
          ...c.decedent,
          firstName, middleName: middleName || undefined, lastName,
          dateOfBirth: dob || undefined, dateOfDeath: dod || undefined,
          sex: sex || undefined, maritalStatus: marital || undefined, veteran,
          placeOfDeath: placeOfDeath || undefined,
        },
        firstCall: {
          ...(c.firstCall ?? {}),
          timeOfDeath: timeOfDeath || undefined,
          weight: weight || undefined,
          coronerCaseNumber: coronerNumber || undefined,
        },
      }, currentUser!)
      if (ssnDirty && ssn.trim()) await api.setDecedentSsn(caseId!, ssn, currentUser!)
    },
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

  const age = computeAge({ ...c, decedent: { ...c.decedent, dateOfBirth: dob || undefined, dateOfDeath: dod || undefined } })
  const contact = c.contacts[0]

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <Link to={`/cases/${caseId}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft size={15} /> Back to case
        </Link>
        <Link to={`/cases/${caseId}/edrs`} className="inline-flex items-center gap-1.5 text-xs font-medium text-[#3b4a35] border border-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-50">
          <ListChecks size={13} /> EDRS Entry
        </Link>
      </div>
      <SectionHeading
        title="Vital Sheet"
        subtitle="Every item carries the number printed on the state form, so you can find it again on the paper copy, the printout and the EDRS entry screen."
      />

      <div className="space-y-4">
        <Card className="p-3 text-xs text-slate-500">
          <span className="font-semibold text-slate-600 uppercase tracking-wide mr-2">Contact person</span>
          {contact ? [contact.name, contact.phone, contact.email].filter(Boolean).join(' · ') : 'None on file'}
          <span className="text-slate-400"> — set under Edit on the case</span>
        </Card>

        <Card className="overflow-hidden">
          <div className={sectionLabel}>DECEDENT</div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <L id="firstName"><input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} /></L>
              <L id="middleName"><input value={middleName} onChange={(e) => setMiddleName(e.target.value)} className={inputClass} /></L>
              <L id="lastName"><input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} /></L>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <L id="aka"><input {...text('alsoKnownAs')} /></L>
              <L id="dob"><input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={inputClass} /></L>
              <L id="age"><div className={readOnlyClass}>{age || '—'}</div></L>
              <L id="sex">
                <select value={sex} onChange={(e) => setSex(e.target.value as typeof sex)} className={inputClass}>
                  <option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="unknown">Unknown/Undetermined</option><option value="nonbinary">Nonbinary</option>
                </select>
              </L>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <L id="ageHours"><input {...text('ageUnderHours')} /></L>
              <L id="ageDays"><input {...text('ageUnderDays')} /></L>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <L id="birthCity"><input {...text('birthCity')} /></L>
              <L id="birthState"><input {...text('birthState')} /></L>
              <L id="birthCountry"><input {...text('birthCountry')} /></L>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <L id="ssn">
                <div className="flex gap-1.5">
                  <input
                    value={ssn}
                    onChange={(e) => { setSsn(e.target.value); setSsnDirty(true) }}
                    placeholder="Leave blank to keep what's on file"
                    autoComplete="off"
                    className={inputClass}
                  />
                  <button type="button" onClick={revealSsn} disabled={ssnLoading} title="Show the number on file (logged)" className="shrink-0 border border-slate-200 rounded-md px-2.5 text-slate-500 hover:bg-slate-50 disabled:opacity-50">
                    <Eye size={14} />
                  </button>
                </div>
                {ssnNotice && <div className="text-[11px] text-amber-600 mt-1">{ssnNotice}</div>}
              </L>
              <L id="armedForces">
                <div className="flex items-center gap-4 h-[38px]">
                  <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="radio" checked={veteran} onChange={() => setVeteran(true)} className="accent-[#3b4a35]" /> Yes</label>
                  <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="radio" checked={!veteran} onChange={() => setVeteran(false)} className="accent-[#3b4a35]" /> No</label>
                </div>
              </L>
              <L id="maritalStatus"><VocabSelect value={marital} onChange={setMarital} options={EDRS_MARITAL} className={inputClass} /></L>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <L id="dod"><input type="date" value={dod} onChange={(e) => setDod(e.target.value)} className={inputClass} /></L>
              <L id="timeOfDeath"><input type="time" value={timeOfDeath} onChange={(e) => setTimeOfDeath(e.target.value)} className={inputClass} /></L>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className={sectionLabel}>BACKGROUND</div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <L id="education"><VocabSelect value={f.education ?? ''} onChange={(v) => set('education', v)} options={EDRS_EDUCATION} className={inputClass} /></L>
              <L id="hispanic">
                <div className="flex items-center gap-3 h-[38px]">
                  <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="radio" checked={!f.hispanicLatino} onChange={() => set('hispanicLatino', false)} className="accent-[#3b4a35]" /> No</label>
                  <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="radio" checked={f.hispanicLatino ?? false} onChange={() => set('hispanicLatino', true)} className="accent-[#3b4a35]" /> Yes</label>
                </div>
              </L>
              <L id="race"><VocabSelect value={f.race ?? ''} onChange={(v) => set('race', v)} options={EDRS_RACES} className={inputClass} /></L>
            </div>
            {f.hispanicLatino && (
              <div className="grid grid-cols-3 gap-3">
                <L id="hispanicSpecify" className="col-start-2"><input {...text('hispanicSpecify')} /></L>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <L id="occupation"><input {...text('occupation')} /></L>
              <L id="kindOfBusiness"><input {...text('kindOfBusiness')} /></L>
              <L id="yearsInOccupation"><input {...text('yearsInOccupation')} /></L>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className={sectionLabel}>RESIDENCE</div>
          <div className="p-4 space-y-3">
            <L id="residence"><input {...text('residenceAddress')} /></L>
            <div className="grid grid-cols-5 gap-3">
              <L id="residenceCity"><input {...text('residenceCity')} /></L>
              <L id="residenceCounty"><input {...text('residenceCounty')} /></L>
              <L id="residenceZip"><input {...text('residenceZip')} /></L>
              <L id="yearsInCounty"><input {...text('yearsInCounty')} /></L>
              <L id="residenceState"><input {...text('residenceState')} /></L>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className={sectionLabel}>INFORMANT & FAMILY</div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <L id="informantName"><input {...text('informantName')} /></L>
              <L id="informantRelationship">
                <input {...text('informantRelationship')} list="edrs-relationships" />
                <datalist id="edrs-relationships">{EDRS_RELATIONSHIPS.map((r) => <option key={r} value={r} />)}</datalist>
              </L>
            </div>
            <L id="informantAddress"><input {...text('informantMailingAddress')} /></L>
            <div className="grid grid-cols-3 gap-3">
              <L id="spouseFirst"><input {...text('spouseFirstName')} /></L>
              <L id="spouseMiddle"><input {...text('spouseMiddleName')} /></L>
              <L id="spouseLast"><input {...text('spouseLastName')} /></L>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <L id="fatherFirst"><input {...text('fatherFirstName')} /></L>
              <L id="fatherMiddle"><input {...text('fatherMiddleName')} /></L>
              <L id="fatherLast"><input {...text('fatherLastName')} /></L>
              <L id="fatherBirthState"><input {...text('fatherBirthState')} /></L>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <L id="motherFirst"><input {...text('motherFirstName')} /></L>
              <L id="motherMiddle"><input {...text('motherMiddleName')} /></L>
              <L id="motherLast"><input {...text('motherLastName')} /></L>
              <L id="motherBirthState"><input {...text('motherBirthState')} /></L>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className={sectionLabel}>OFFICE USE ONLY</div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <L id="dispositionDate"><input type="date" value={f.dispositionDate ?? ''} onChange={(e) => set('dispositionDate', e.target.value)} className={inputClass} /></L>
              <L id="finalDisposition"><input {...text('placeOfFinalDisposition')} /></L>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <L id="cvcDmpOther"><input {...text('dispositionTypeOther')} /></L>
              <L id="typeOfDisposition"><VocabSelect value={f.typeOfDisposition ?? ''} onChange={(v) => set('typeOfDisposition', v)} options={EDRS_DISPOSITIONS} className={inputClass} /></L>
              <L id="accVc">
                <div className="flex items-center gap-4 h-[38px]">
                  <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="radio" checked={f.accidentOrViolentCause === true} onChange={() => set('accidentOrViolentCause', true)} className="accent-[#3b4a35]" /> Yes</label>
                  <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="radio" checked={f.accidentOrViolentCause === false} onChange={() => set('accidentOrViolentCause', false)} className="accent-[#3b4a35]" /> No</label>
                </div>
              </L>
            </div>
            <L id="placeOfDeath"><input value={placeOfDeath} onChange={(e) => setPlaceOfDeath(e.target.value)} className={inputClass} /></L>
            <div className="grid grid-cols-3 gap-3">
              <L id="deathCounty"><input {...text('deathCounty')} /></L>
              <L id="facilityAddress"><input {...text('facilityAddressOrAddressFound')} /></L>
              <L id="deathCity"><input {...text('deathCity')} /></L>
            </div>
            <div className="grid grid-cols-5 gap-3">
              <L id="weight"><input value={weight} onChange={(e) => setWeight(e.target.value)} className={inputClass} /></L>
              <L id="pacemaker">
                <div className="flex items-center gap-3 h-[38px]">
                  <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="radio" checked={f.pacemaker ?? false} onChange={() => set('pacemaker', true)} className="accent-[#3b4a35]" /> Yes</label>
                  <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="radio" checked={!f.pacemaker} onChange={() => set('pacemaker', false)} className="accent-[#3b4a35]" /> No</label>
                </div>
              </L>
              <L id="language">
                <div className="flex items-center gap-3 h-[38px]">
                  <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="radio" checked={f.documentLanguage === 'spanish'} onChange={() => set('documentLanguage', 'spanish')} className="accent-[#3b4a35]" /> SPN</label>
                  <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="radio" checked={f.documentLanguage === 'english'} onChange={() => set('documentLanguage', 'english')} className="accent-[#3b4a35]" /> ENG</label>
                </div>
              </L>
              <L id="coronerCase"><input value={coronerNumber} onChange={(e) => setCoronerNumber(e.target.value)} className={inputClass} /></L>
              <L id="obituary">
                <div className="flex items-center gap-3 h-[38px]">
                  <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="radio" checked={f.obituary ?? false} onChange={() => set('obituary', true)} className="accent-[#3b4a35]" /> Yes</label>
                  <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="radio" checked={!f.obituary} onChange={() => set('obituary', false)} className="accent-[#3b4a35]" /> No</label>
                </div>
              </L>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className={sectionLabel}>EDRS ONLY — NOT ON THE PAPER FORM</div>
          <div className="p-4 space-y-3">
            <p className="text-xs text-slate-400">The state's electronic system asks these; the paper Vital Sheet doesn't. The funeral establishment and its license number (44 and 45) come from the location's record, so there's nothing to enter here for them.</p>
            <div className="grid grid-cols-2 gap-3">
              <EL num="102/103" label="Where death occurred">
                <select value={f.placeOfDeathType ?? ''} onChange={(e) => set('placeOfDeathType', (e.target.value || undefined) as VitalSheetInfo['placeOfDeathType'])} className={inputClass}>
                  <option value="">—</option>
                  {Object.entries(PLACE_OF_DEATH_TYPES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </EL>
              <EL num="25A" label="Homeless?">
                <select value={f.homeless ?? ''} onChange={(e) => set('homeless', (e.target.value || undefined) as VitalSheetInfo['homeless'])} className={inputClass}>
                  <option value="">—</option><option value="no">No</option><option value="yes">Yes</option><option value="unknown">Unknown</option>
                </select>
              </EL>
              {f.homeless === 'yes' && (
                <EL num="25A" label="Homeless?" hint="which" className="col-start-2">
                  <select value={f.homelessKind ?? ''} onChange={(e) => set('homelessKind', (e.target.value || undefined) as VitalSheetInfo['homelessKind'])} className={inputClass}>
                    <option value="">—</option><option value="unsheltered">Unsheltered</option><option value="sheltered">Sheltered</option><option value="in_institution">In Institution</option>
                  </select>
                </EL>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <EL num="42" label="Embalmed?">
                <div className="flex items-center gap-4 h-[38px]">
                  <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="radio" checked={f.embalmed === 'yes'} onChange={() => set('embalmed', 'yes')} className="accent-[#3b4a35]" /> Yes</label>
                  <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="radio" checked={f.embalmed === 'no'} onChange={() => set('embalmed', 'no')} className="accent-[#3b4a35]" /> No</label>
                </div>
              </EL>
              <EL num="42" label="Embalmer" hint="name"><input {...text('embalmerName')} disabled={f.embalmed !== 'yes'} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-300`} /></EL>
              <EL num="43" label="Embalmer's license number"><input {...text('embalmerLicense')} placeholder="EMB1234" disabled={f.embalmed !== 'yes'} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-300`} /></EL>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className={sectionLabel}>VISITATION · ROSARY · MASS · GRAVESIDE</div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Visitation — Hours</label>
                <input {...text('visitationHours')} />
              </div>
              <div className="col-span-2 text-xs text-slate-400 self-end pb-2">Visitation and service dates and places are set under Edit on the case, so they stay in sync with the Calendar.</div>
            </div>
            <div className="grid grid-cols-5 gap-2 items-end">
              <div><label className={labelClass}>Rosary — Date</label><input type="date" value={f.rosaryDate ?? ''} onChange={(e) => set('rosaryDate', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Time</label><input type="time" value={f.rosaryTime ?? ''} onChange={(e) => set('rosaryTime', e.target.value)} className={inputClass} /></div>
              <div>
                <label className={labelClass}>ENG / SPAN</label>
                <select value={f.rosaryLanguage ?? ''} onChange={(e) => set('rosaryLanguage', e.target.value as VitalSheetInfo['rosaryLanguage'])} className={inputClass}>
                  <option value="">—</option><option value="english">English</option><option value="spanish">Spanish</option>
                </select>
              </div>
              <div><label className={labelClass}>Place</label><input {...text('rosaryPlace')} /></div>
              <div><label className={labelClass}>By</label><input {...text('rosaryBy')} /></div>
            </div>
            <div className="grid grid-cols-5 gap-2 items-end">
              <div><label className={labelClass}>Mass — Date</label><input type="date" value={f.massDate ?? ''} onChange={(e) => set('massDate', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Time</label><input type="time" value={f.massTime ?? ''} onChange={(e) => set('massTime', e.target.value)} className={inputClass} /></div>
              <div>
                <label className={labelClass}>ENG / SPAN</label>
                <select value={f.massLanguage ?? ''} onChange={(e) => set('massLanguage', e.target.value as VitalSheetInfo['massLanguage'])} className={inputClass}>
                  <option value="">—</option><option value="english">English</option><option value="spanish">Spanish</option>
                </select>
              </div>
              <div><label className={labelClass}>Place</label><input {...text('massPlace')} /></div>
              <div><label className={labelClass}>By</label><input {...text('massBy')} /></div>
            </div>
            <div className="grid grid-cols-4 gap-2 items-end">
              <div><label className={labelClass}>Graveside — Date</label><input type="date" value={f.gravesideDate ?? ''} onChange={(e) => set('gravesideDate', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Time</label><input type="time" value={f.gravesideTime ?? ''} onChange={(e) => set('gravesideTime', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Place</label><input {...text('gravesidePlace')} /></div>
              <div><label className={labelClass}>By</label><input {...text('gravesideBy')} /></div>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className={sectionLabel}>SURVIVED BY</div>
          <div className="p-4 grid grid-cols-2 gap-3">
            <div><label className={labelClass}>Sons</label><input {...text('sons')} /></div>
            <div><label className={labelClass}>Daughters</label><input {...text('daughters')} /></div>
            <div><label className={labelClass}>Sisters</label><input {...text('sisters')} /></div>
            <div><label className={labelClass}>Brothers</label><input {...text('brothers')} /></div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className={sectionLabel}>CHURCH</div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelClass}>Church</label><input {...text('churchName')} /></div>
              <div><label className={labelClass}>Pastor</label><input {...text('pastorName')} /></div>
              <div><label className={labelClass}>Address</label><input {...text('churchAddress')} /></div>
              <div><label className={labelClass}>Tel.</label><input {...text('pastorPhone')} /></div>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className={sectionLabel}>FLOWERS, CARDS & EXTRAS</div>
          <div className="p-4 space-y-3">
            <div><label className={labelClass}>Flowers — vendor, items, ribbon text, color</label><textarea {...text('flowersNotes')} rows={2} /></div>
            <div><label className={labelClass}>Name on Cards / Mem Folders</label><input {...text('cardsNameOn')} /></div>
            <div><label className={labelClass}>Prayer Cards — design, verse, amount, language</label><textarea {...text('prayerCardsNotes')} rows={2} /></div>
            <div><label className={labelClass}>Mem. Folders — design, verse, amount, language</label><textarea {...text('memorialFoldersNotes')} rows={2} /></div>
            <div><label className={labelClass}>Book</label><input {...text('memorialBook')} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelClass}>Doctor — Address</label><input {...text('doctorAddress')} /></div>
              <div><label className={labelClass}>Doctor — Fax</label><input {...text('doctorFax')} /></div>
            </div>
            <div><label className={labelClass}>Make-up & Hair</label><input {...text('makeupHair')} /></div>
            <div><label className={labelClass}>Receiving Funeral Director</label><input {...text('receivingFuneralDirector')} /></div>
            <div><label className={labelClass}>Receiving FD — Address</label><input {...text('receivingFuneralDirectorAddress')} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelClass}>Charges $</label><input {...text('receivingFuneralDirectorCharges')} /></div>
              <div><label className={labelClass}>Tel</label><input {...text('receivingFuneralDirectorPhone')} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelClass}>Medallions</label><input {...text('medallions')} /></div>
              <div><label className={labelClass}>Charms</label><input {...text('charms')} /></div>
            </div>
          </div>
        </Card>

        {saveMutation.isError && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            {getErrorMessage(saveMutation.error, 'Something went wrong saving this.')}
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
            <div className="flex gap-2">
              <button onClick={() => navigate(`/cases/${caseId}`)} className="flex-1 text-sm font-medium text-slate-600 border border-slate-200 rounded-md px-3.5 py-2.5 hover:bg-slate-50">Back to Case →</button>
              <button onClick={() => navigate(`/cases/${caseId}/edrs`)} className="flex-1 text-sm font-medium text-[#3b4a35] border border-[#3b4a35]/30 rounded-md px-3.5 py-2.5 hover:bg-[#3b4a35]/5">EDRS Entry →</button>
            </div>
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
