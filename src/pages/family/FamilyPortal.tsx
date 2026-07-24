import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useState } from 'react'
import {
  Image as ImageIcon, MessageSquare, PenLine, Check,
  Phone, CreditCard, Lock, ShieldCheck, HeartHandshake, ClipboardList, FileText, Music,
} from 'lucide-react'
import { formatCurrency } from '@/components/ui/Primitives'
import { useLanguage } from '@/i18n/LanguageContext'
import { LanguageToggle } from '@/components/layout/LanguageToggle'

const sectionKeys = ['intake', 'vitalSheet', 'obituary', 'photos', 'billing', 'messages'] as const
const sectionIcons = { intake: ClipboardList, vitalSheet: FileText, obituary: PenLine, photos: ImageIcon, billing: CreditCard, messages: MessageSquare }

/**
 * Resizes/re-compresses a photo before upload — real phone camera photos
 * are routinely 3-8MB, and base64-encoding that for the request body
 * (which inflates size by roughly a third) was silently exceeding what
 * the Edge Function accepts. This keeps things well under that ceiling
 * without a visible quality loss on screen or in a slideshow.
 */
async function compressImage(file: File, maxDimension = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) return file
  return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })
}

export default function FamilyPortal() {
  const { token } = useParams<{ token: string }>()
  const { t } = useLanguage()
  const [active, setActive] = useState<typeof sectionKeys[number]>('intake')
  const [obituaryText, setObituaryText] = useState('')
  const [saved, setSaved] = useState(false)
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvc, setCardCvc] = useState('')
  const [cardName, setCardName] = useState('')
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [intakeSaved, setIntakeSaved] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingMusic, setUploadingMusic] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [intakeDiscrepancy, setIntakeDiscrepancy] = useState(false)
  const [dob, setDob] = useState('')
  const [ssn, setSsn] = useState('')
  const [veteran, setVeteran] = useState(false)
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactRelationship, setContactRelationship] = useState('')
  const [doctorName, setDoctorName] = useState('')
  const [doctorPhone, setDoctorPhone] = useState('')
  const [hospiceName, setHospiceName] = useState('')
  const [hospicePhone, setHospicePhone] = useState('')
  const [intakeInitialized, setIntakeInitialized] = useState(false)
  // Vital Sheet — family-appropriate subset only, mirrors what the Edge Function accepts
  const [vsAlsoKnownAs, setVsAlsoKnownAs] = useState('')
  const [vsBirthCity, setVsBirthCity] = useState('')
  const [vsBirthState, setVsBirthState] = useState('')
  const [vsBirthCountry, setVsBirthCountry] = useState('')
  const [vsEducation, setVsEducation] = useState('')
  const [vsHispanicLatino, setVsHispanicLatino] = useState(false)
  const [vsRace, setVsRace] = useState('')
  const [vsOccupation, setVsOccupation] = useState('')
  const [vsKindOfBusiness, setVsKindOfBusiness] = useState('')
  const [vsYearsInOccupation, setVsYearsInOccupation] = useState('')
  const [vsResidenceAddress, setVsResidenceAddress] = useState('')
  const [vsResidenceCity, setVsResidenceCity] = useState('')
  const [vsResidenceCounty, setVsResidenceCounty] = useState('')
  const [vsResidenceZip, setVsResidenceZip] = useState('')
  const [vsResidenceState, setVsResidenceState] = useState('')
  const [vsYearsInCounty, setVsYearsInCounty] = useState('')
  const [vsInformantName, setVsInformantName] = useState('')
  const [vsInformantRelationship, setVsInformantRelationship] = useState('')
  const [vsInformantMailingAddress, setVsInformantMailingAddress] = useState('')
  const [vsSpouseName, setVsSpouseName] = useState('')
  const [vsFatherName, setVsFatherName] = useState('')
  const [vsFatherBirthState, setVsFatherBirthState] = useState('')
  const [vsMotherName, setVsMotherName] = useState('')
  const [vsMotherBirthState, setVsMotherBirthState] = useState('')
  const [vsSons, setVsSons] = useState('')
  const [vsDaughters, setVsDaughters] = useState('')
  const [vsSisters, setVsSisters] = useState('')
  const [vsBrothers, setVsBrothers] = useState('')
  const [vsSaved, setVsSaved] = useState(false)
  const queryClient = useQueryClient()

  // Everything comes from one call to the token-validated Edge Function —
  // this page never talks to the database directly, since a family member
  // visiting this link has no staff login for RLS to check against.
  const { data, isError } = useQuery({
    queryKey: ['family-portal', token],
    queryFn: () => api.getFamilyPortalData(token!),
    enabled: !!token,
    retry: false,
  })
  const c = data?.case
  const loc = data?.location
  const gplItems = data?.gplItems ?? []
  const contracts = data?.contracts ?? []
  const statusMessage = data?.statusMessage
  const mediaFiles = data?.mediaFiles ?? []
  const photos = mediaFiles.filter((m) => m.category === 'photo')
  const music = mediaFiles.find((m) => m.category === 'music')

  // Pre-fill the intake form with whatever's already on file, once, the
  // first time case data arrives — not on every refetch, or the family's
  // in-progress typing would get overwritten mid-edit.
  if (c && !intakeInitialized) {
    setIntakeInitialized(true)
    setDob(c.decedent.dateOfBirth ?? '')
    setVeteran(c.decedent.veteran ?? false)
    setContactName(c.contacts[0]?.name ?? '')
    setContactPhone(c.contacts[0]?.phone ?? '')
    setContactRelationship(c.contacts[0]?.relationship ?? '')
    setDoctorName(c.firstCall?.doctorName ?? '')
    setDoctorPhone(c.firstCall?.doctorPhone ?? '')
    setHospiceName(c.firstCall?.hospiceName ?? '')
    setHospicePhone(c.firstCall?.hospicePhone ?? '')
    const vs = c.vitalSheet
    if (vs) {
      setVsAlsoKnownAs(vs.alsoKnownAs ?? ''); setVsBirthCity(vs.birthCity ?? ''); setVsBirthState(vs.birthState ?? ''); setVsBirthCountry(vs.birthCountry ?? '')
      setVsEducation(vs.education ?? ''); setVsHispanicLatino(vs.hispanicLatino ?? false); setVsRace(vs.race ?? '')
      setVsOccupation(vs.occupation ?? ''); setVsKindOfBusiness(vs.kindOfBusiness ?? ''); setVsYearsInOccupation(vs.yearsInOccupation ?? '')
      setVsResidenceAddress(vs.residenceAddress ?? ''); setVsResidenceCity(vs.residenceCity ?? ''); setVsResidenceCounty(vs.residenceCounty ?? '')
      setVsResidenceZip(vs.residenceZip ?? ''); setVsResidenceState(vs.residenceState ?? ''); setVsYearsInCounty(vs.yearsInCounty ?? '')
      setVsInformantName(vs.informantName ?? ''); setVsInformantRelationship(vs.informantRelationship ?? ''); setVsInformantMailingAddress(vs.informantMailingAddress ?? '')
      setVsSpouseName(vs.spouseName ?? ''); setVsFatherName(vs.fatherName ?? ''); setVsFatherBirthState(vs.fatherBirthState ?? '')
      setVsMotherName(vs.motherName ?? ''); setVsMotherBirthState(vs.motherBirthState ?? '')
      setVsSons(vs.sons ?? ''); setVsDaughters(vs.daughters ?? ''); setVsSisters(vs.sisters ?? ''); setVsBrothers(vs.brothers ?? '')
    }
  }

  const intakeMutation = useMutation({
    mutationFn: () => api.updateFamilyPortalInfo(token!, {
      dateOfBirth: dob || undefined, ssn: ssn || undefined, veteran,
      contactName: contactName || undefined, contactPhone: contactPhone || undefined, contactRelationship: contactRelationship || undefined,
      doctorName: doctorName || undefined, doctorPhone: doctorPhone || undefined, hospiceName: hospiceName || undefined, hospicePhone: hospicePhone || undefined,
    }),
    onSuccess: ({ hasDiscrepancy }) => {
      setIntakeSaved(true)
      setIntakeDiscrepancy(hasDiscrepancy)
      setTimeout(() => setIntakeSaved(false), 6000)
      queryClient.invalidateQueries({ queryKey: ['family-portal', token] })
    },
  })

  const vitalSheetMutation = useMutation({
    mutationFn: () => api.updateFamilyPortalInfo(token!, {
      vitalSheet: {
        alsoKnownAs: vsAlsoKnownAs || undefined, birthCity: vsBirthCity || undefined, birthState: vsBirthState || undefined, birthCountry: vsBirthCountry || undefined,
        education: vsEducation || undefined, hispanicLatino: vsHispanicLatino, race: vsRace || undefined,
        occupation: vsOccupation || undefined, kindOfBusiness: vsKindOfBusiness || undefined, yearsInOccupation: vsYearsInOccupation || undefined,
        residenceAddress: vsResidenceAddress || undefined, residenceCity: vsResidenceCity || undefined, residenceCounty: vsResidenceCounty || undefined,
        residenceZip: vsResidenceZip || undefined, residenceState: vsResidenceState || undefined, yearsInCounty: vsYearsInCounty || undefined,
        informantName: vsInformantName || undefined, informantRelationship: vsInformantRelationship || undefined, informantMailingAddress: vsInformantMailingAddress || undefined,
        spouseName: vsSpouseName || undefined, fatherName: vsFatherName || undefined, fatherBirthState: vsFatherBirthState || undefined,
        motherName: vsMotherName || undefined, motherBirthState: vsMotherBirthState || undefined,
        sons: vsSons || undefined, daughters: vsDaughters || undefined, sisters: vsSisters || undefined, brothers: vsBrothers || undefined,
      },
    }),
    onSuccess: () => {
      setVsSaved(true)
      setTimeout(() => setVsSaved(false), 4000)
      queryClient.invalidateQueries({ queryKey: ['family-portal', token] })
    },
  })

  const payMutation = useMutation({
    mutationFn: (contractId: string) => api.recordOnlinePayment(contractId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family-portal', token] })
      setPaymentSuccess(true)
    },
  })

  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-6">
        <div>
          <div className="text-slate-700 font-medium mb-1">{t('familyPortal.error.genericMessage')}</div>
          <div className="text-sm text-slate-400">{t('familyPortal.error.contactFuneralHome')}</div>
        </div>
      </div>
    )
  }
  if (!c) return <div className="min-h-screen flex items-center justify-center text-slate-400">{t('familyPortal.loading')}</div>

  const invoice = contracts.find((ct) => ct.caseId === c.id)
  const balanceDue = invoice ? invoice.total - invoice.amountPaid : 0

  function handlePaySubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!invoice) return
    payMutation.mutate(invoice.id)
  }

  function formatCardNumber(v: string) {
    return v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
  }
  function formatExpiry(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 4)
    return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
  }

  return (
    <div className="min-h-screen bg-[#cbb98c]">
      {/* Utility bar — mirrors the public site's top strip */}
      <div className="bg-[#2b2f28] text-white text-xs">
        <div className="max-w-5xl mx-auto px-6 py-2 flex justify-end items-center gap-5">
          <span className="hover:text-[#d9c78f] cursor-pointer">{t('familyPortal.utilityBar.whoWeAre')}</span>
          <span className="hover:text-[#d9c78f] cursor-pointer">{t('familyPortal.utilityBar.contactUs')}</span>
          <span className="hover:text-[#d9c78f] cursor-pointer">{t('familyPortal.utilityBar.directions')}</span>
          <span className="hover:text-[#d9c78f] cursor-pointer">{t('familyPortal.utilityBar.sendFlowers')}</span>
          <span className="flex items-center gap-1 text-[#d9c78f]">
            <Phone size={11} /> {t('familyPortal.utilityBar.call')}: {loc?.phone ?? '(760) 398-1536'}
          </span>
          <LanguageToggle variant="light" />
        </div>
      </div>

      {/* Olive textured nav bar with logo card overlapping, like the live site */}
      <div className="relative bg-[#5f6f4f] border-b-4 border-[#4d5f45]">
        <div className="max-w-5xl mx-auto px-6 relative">
          {/* Logo card */}
          <div className="absolute -top-2 left-0 bg-white rounded-sm shadow-md px-5 py-3 flex items-center gap-3 z-10">
            <img src="/casillas-logo.png" alt="Casillas Funeral Home" className="h-11 w-auto shrink-0" />
            <div className="leading-tight">
              <div className="font-display font-bold text-slate-800 text-sm tracking-wide">CASILLAS<br />FUNERAL HOME</div>
            </div>
            <div className="text-[11px] leading-tight text-red-700 font-medium pl-2 border-l border-slate-200">
              {loc && <div>{loc.city}, {loc.state} <span className="text-slate-400">{loc.licenseNumber}</span></div>}
            </div>
          </div>
          <div className="h-16" />
        </div>
      </div>

      {/* Hero */}
      <div className="bg-[#3b4a35] text-white">
        <div className="max-w-3xl mx-auto px-6 py-10 text-center">
          <div className="text-xs uppercase tracking-[0.2em] text-[#d9c78f] mb-2">{t('familyPortal.hero.inLovingMemory')}</div>
          <h1 className="font-display italic text-3xl font-semibold" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.4)' }}>
            {c.decedent.firstName} {c.decedent.lastName}
          </h1>
          {c.decedent.dateOfBirth && c.decedent.dateOfDeath && (
            <div className="text-sm text-slate-300 mt-2">
              {new Date(c.decedent.dateOfBirth).getFullYear()} – {new Date(c.decedent.dateOfDeath).getFullYear()}
            </div>
          )}
          {loc && <div className="text-xs text-slate-300 mt-1">{loc.name}</div>}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {statusMessage && (
          <div className="bg-white rounded-sm border border-[#b3925a]/30 shadow-md p-5 mb-6 flex items-start gap-3">
            <div className="h-9 w-9 rounded-full bg-[#3b4a35]/10 text-[#3b4a35] flex items-center justify-center shrink-0">
              <HeartHandshake size={18} />
            </div>
            <div>
              <div className="text-xs font-semibold text-[#b3925a] uppercase tracking-wide mb-0.5">{t('familyPortal.status.currentStatus')}</div>
              <div className="text-sm text-slate-700">{statusMessage}</div>
            </div>
          </div>
        )}

        <p className="text-sm text-[#3b3a2f] text-center mb-8">{t('familyPortal.welcome')}</p>

        <div className="flex gap-2 justify-center mb-8 flex-wrap">
          {sectionKeys.map((key) => {
            const Icon = sectionIcons[key]
            return (
              <button
                key={key}
                onClick={() => setActive(key)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-sm text-sm font-semibold uppercase tracking-wide transition ${
                  active === key
                    ? 'bg-[#3b4a35] text-white'
                    : 'bg-[#5f6f4f] text-white/90 hover:bg-[#54633f] border border-[#4d5f45]'
                }`}
              >
                <Icon size={14} /> {t(`familyPortal.sections.${key}`)}
              </button>
            )
          })}
        </div>

        <div className="bg-white rounded-sm border border-[#b3925a]/30 shadow-md p-6">
          {active === 'intake' && (
            <div>
              <h2 className="font-display text-lg font-semibold text-[#3b4a35] mb-1">{t('familyPortal.intake.title')}</h2>
              <p className="text-sm text-slate-500 mb-4">{t('familyPortal.intake.subtitle')}</p>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('familyPortal.intake.dateOfBirth')}</label>
                  <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('familyPortal.intake.ssn')}</label>
                  <input value={ssn} onChange={(e) => setSsn(e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 mb-5">
                <input type="checkbox" checked={veteran} onChange={(e) => setVeteran(e.target.checked)} className="accent-[#3b4a35]" /> {t('familyPortal.intake.veteran')}
              </label>

              <h3 className="text-sm font-semibold text-slate-700 mb-2">{t('familyPortal.intake.contactSectionTitle')}</h3>
              <div className="grid grid-cols-2 gap-4 mb-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('familyPortal.intake.contactName')}</label>
                  <input value={contactName} onChange={(e) => setContactName(e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('familyPortal.intake.contactPhone')}</label>
                  <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
                </div>
              </div>
              <div className="mb-5">
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('familyPortal.intake.contactRelationship')}</label>
                <input value={contactRelationship} onChange={(e) => setContactRelationship(e.target.value)} className="w-full max-w-xs border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
              </div>

              <h3 className="text-sm font-semibold text-slate-700 mb-2">{t('familyPortal.intake.medicalSectionTitle')}</h3>
              <div className="grid grid-cols-2 gap-4 mb-2">
                <input value={doctorName} onChange={(e) => setDoctorName(e.target.value)} placeholder={t('familyPortal.intake.doctorName')} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
                <input value={doctorPhone} onChange={(e) => setDoctorPhone(e.target.value)} placeholder={t('familyPortal.intake.doctorPhone')} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-5">
                <input value={hospiceName} onChange={(e) => setHospiceName(e.target.value)} placeholder={t('familyPortal.intake.hospiceName')} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
                <input value={hospicePhone} onChange={(e) => setHospicePhone(e.target.value)} placeholder={t('familyPortal.intake.hospicePhone')} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
              </div>

              <div className="flex items-center justify-end gap-3">
                {intakeSaved && (
                  <span className={`text-sm ${intakeDiscrepancy ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {intakeDiscrepancy ? t('familyPortal.intake.savedWithDiscrepancy') : t('familyPortal.intake.saved')}
                  </span>
                )}
                <button
                  onClick={() => intakeMutation.mutate()}
                  disabled={intakeMutation.isPending}
                  className="inline-flex items-center gap-1.5 bg-[#3b4a35] text-white text-sm font-medium px-4 py-2 rounded-sm hover:bg-[#4d5f45] transition disabled:opacity-60"
                >
                  {intakeMutation.isPending ? '…' : t('familyPortal.intake.save')}
                </button>
              </div>
            </div>
          )}

          {active === 'vitalSheet' && (
            <div>
              <h2 className="font-display text-lg font-semibold text-[#3b4a35] mb-1">{t('familyPortal.vitalSheet.title')}</h2>
              <p className="text-sm text-slate-500 mb-4">{t('familyPortal.vitalSheet.subtitle')}</p>

              <h3 className="text-sm font-semibold text-slate-700 mb-2">{t('familyPortal.vitalSheet.birthSection')}</h3>
              <input value={vsAlsoKnownAs} onChange={(e) => setVsAlsoKnownAs(e.target.value)} placeholder={t('familyPortal.vitalSheet.alsoKnownAs')} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
              <div className="grid grid-cols-3 gap-3 mb-2">
                <input value={vsBirthCity} onChange={(e) => setVsBirthCity(e.target.value)} placeholder={t('familyPortal.vitalSheet.birthCity')} className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
                <input value={vsBirthState} onChange={(e) => setVsBirthState(e.target.value)} placeholder={t('familyPortal.vitalSheet.birthState')} className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
                <input value={vsBirthCountry} onChange={(e) => setVsBirthCountry(e.target.value)} placeholder={t('familyPortal.vitalSheet.birthCountry')} className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-2">
                <input value={vsEducation} onChange={(e) => setVsEducation(e.target.value)} placeholder={t('familyPortal.vitalSheet.education')} className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
                <input value={vsRace} onChange={(e) => setVsRace(e.target.value)} placeholder={t('familyPortal.vitalSheet.race')} className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 mb-5">
                <input type="checkbox" checked={vsHispanicLatino} onChange={(e) => setVsHispanicLatino(e.target.checked)} className="accent-[#3b4a35]" /> {t('familyPortal.vitalSheet.hispanicLatino')}
              </label>

              <h3 className="text-sm font-semibold text-slate-700 mb-2">{t('familyPortal.vitalSheet.occupationSection')}</h3>
              <div className="grid grid-cols-3 gap-3 mb-5">
                <input value={vsOccupation} onChange={(e) => setVsOccupation(e.target.value)} placeholder={t('familyPortal.vitalSheet.occupation')} className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
                <input value={vsKindOfBusiness} onChange={(e) => setVsKindOfBusiness(e.target.value)} placeholder={t('familyPortal.vitalSheet.kindOfBusiness')} className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
                <input value={vsYearsInOccupation} onChange={(e) => setVsYearsInOccupation(e.target.value)} placeholder={t('familyPortal.vitalSheet.yearsInOccupation')} className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
              </div>

              <h3 className="text-sm font-semibold text-slate-700 mb-2">{t('familyPortal.vitalSheet.residenceSection')}</h3>
              <input value={vsResidenceAddress} onChange={(e) => setVsResidenceAddress(e.target.value)} placeholder={t('familyPortal.vitalSheet.residenceAddress')} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
              <div className="grid grid-cols-4 gap-3 mb-2">
                <input value={vsResidenceCity} onChange={(e) => setVsResidenceCity(e.target.value)} placeholder={t('familyPortal.vitalSheet.residenceCity')} className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
                <input value={vsResidenceCounty} onChange={(e) => setVsResidenceCounty(e.target.value)} placeholder={t('familyPortal.vitalSheet.residenceCounty')} className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
                <input value={vsResidenceState} onChange={(e) => setVsResidenceState(e.target.value)} placeholder={t('familyPortal.vitalSheet.residenceState')} className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
                <input value={vsResidenceZip} onChange={(e) => setVsResidenceZip(e.target.value)} placeholder={t('familyPortal.vitalSheet.residenceZip')} className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
              </div>
              <input value={vsYearsInCounty} onChange={(e) => setVsYearsInCounty(e.target.value)} placeholder={t('familyPortal.vitalSheet.yearsInCounty')} className="w-full max-w-xs border border-slate-200 rounded-md px-3 py-2 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />

              <h3 className="text-sm font-semibold text-slate-700 mb-2">{t('familyPortal.vitalSheet.informantSection')}</h3>
              <div className="grid grid-cols-2 gap-3 mb-2">
                <input value={vsInformantName} onChange={(e) => setVsInformantName(e.target.value)} placeholder={t('familyPortal.vitalSheet.informantName')} className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
                <input value={vsInformantRelationship} onChange={(e) => setVsInformantRelationship(e.target.value)} placeholder={t('familyPortal.vitalSheet.informantRelationship')} className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
              </div>
              <input value={vsInformantMailingAddress} onChange={(e) => setVsInformantMailingAddress(e.target.value)} placeholder={t('familyPortal.vitalSheet.informantMailingAddress')} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />

              <h3 className="text-sm font-semibold text-slate-700 mb-2">{t('familyPortal.vitalSheet.familySection')}</h3>
              <input value={vsSpouseName} onChange={(e) => setVsSpouseName(e.target.value)} placeholder={t('familyPortal.vitalSheet.spouseName')} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
              <div className="grid grid-cols-2 gap-3 mb-2">
                <input value={vsFatherName} onChange={(e) => setVsFatherName(e.target.value)} placeholder={t('familyPortal.vitalSheet.fatherName')} className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
                <input value={vsFatherBirthState} onChange={(e) => setVsFatherBirthState(e.target.value)} placeholder={t('familyPortal.vitalSheet.fatherBirthState')} className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-5">
                <input value={vsMotherName} onChange={(e) => setVsMotherName(e.target.value)} placeholder={t('familyPortal.vitalSheet.motherName')} className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
                <input value={vsMotherBirthState} onChange={(e) => setVsMotherBirthState(e.target.value)} placeholder={t('familyPortal.vitalSheet.motherBirthState')} className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
              </div>

              <h3 className="text-sm font-semibold text-slate-700 mb-2">{t('familyPortal.vitalSheet.survivedBySection')}</h3>
              <div className="grid grid-cols-2 gap-3 mb-5">
                <input value={vsSons} onChange={(e) => setVsSons(e.target.value)} placeholder={t('familyPortal.vitalSheet.sons')} className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
                <input value={vsDaughters} onChange={(e) => setVsDaughters(e.target.value)} placeholder={t('familyPortal.vitalSheet.daughters')} className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
                <input value={vsSisters} onChange={(e) => setVsSisters(e.target.value)} placeholder={t('familyPortal.vitalSheet.sisters')} className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
                <input value={vsBrothers} onChange={(e) => setVsBrothers(e.target.value)} placeholder={t('familyPortal.vitalSheet.brothers')} className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
              </div>

              <div className="flex items-center justify-end gap-3">
                {vsSaved && <span className="text-sm text-emerald-600">{t('familyPortal.vitalSheet.saved')}</span>}
                <button
                  onClick={() => vitalSheetMutation.mutate()}
                  disabled={vitalSheetMutation.isPending}
                  className="inline-flex items-center gap-1.5 bg-[#3b4a35] text-white text-sm font-medium px-4 py-2 rounded-sm hover:bg-[#4d5f45] transition disabled:opacity-60"
                >
                  {vitalSheetMutation.isPending ? '…' : t('familyPortal.vitalSheet.save')}
                </button>
              </div>
            </div>
          )}

          {active === 'obituary' && (
            <div>
              <h2 className="font-display text-lg font-semibold text-[#3b4a35] mb-1">{t('familyPortal.obituary.title')}</h2>
              <p className="text-sm text-slate-500 mb-4">{t('familyPortal.obituary.subtitle')}</p>
              <textarea
                value={obituaryText}
                onChange={(e) => { setObituaryText(e.target.value); setSaved(false) }}
                rows={10}
                placeholder={`${c.decedent.firstName} ${c.decedent.lastName} ${t('familyPortal.obituary.placeholderName')}`}
                className="w-full border border-slate-200 rounded-md p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a] resize-none"
              />
              <div className="flex items-center justify-between mt-3">
                <button className="text-sm text-slate-500 hover:text-slate-700">{t('familyPortal.obituary.aiHelp')}</button>
                <button
                  onClick={() => setSaved(true)}
                  className="inline-flex items-center gap-1.5 bg-[#3b4a35] text-white text-sm font-medium px-4 py-2 rounded-sm hover:bg-[#4d5f45] transition"
                >
                  {saved ? <Check size={15} /> : null} {saved ? t('familyPortal.obituary.saved') : t('familyPortal.obituary.save')}
                </button>
              </div>
            </div>
          )}

          {active === 'photos' && (
            <div>
              <h2 className="font-display text-lg font-semibold text-[#3b4a35] mb-1">{t('familyPortal.photos.title')}</h2>
              <p className="text-sm text-slate-500 mb-4">{t('familyPortal.photos.subtitle')}</p>

              {uploadError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2 mb-3">{uploadError}</div>
              )}

              <label className="block border-2 border-dashed border-slate-200 rounded-lg py-10 text-center text-slate-400 text-sm cursor-pointer hover:border-[#b3925a] hover:text-[#b3925a] transition mb-3">
                <ImageIcon size={26} className="mx-auto mb-2" />
                {uploadingPhoto ? t('familyPortal.photos.uploading') : t('familyPortal.photos.dropzone')}
                <input
                  type="file" accept="image/*" multiple className="hidden" disabled={uploadingPhoto}
                  onChange={async (e) => {
                    const files = Array.from(e.target.files ?? [])
                    if (!files.length) return
                    setUploadingPhoto(true)
                    setUploadError(null)
                    try {
                      for (const file of files) {
                        const compressed = await compressImage(file)
                        await api.uploadFamilyPortalFile(token!, compressed, 'photo')
                      }
                      queryClient.invalidateQueries({ queryKey: ['family-portal', token] })
                    } catch (err) {
                      setUploadError(err instanceof Error ? err.message : 'Something went wrong uploading — please try again.')
                    } finally {
                      setUploadingPhoto(false)
                      e.target.value = ''
                    }
                  }}
                />
              </label>

              {photos.length > 0 && (
                <div className="text-sm text-slate-600 mb-5">{t('familyPortal.photos.count', { count: photos.length })}</div>
              )}

              <h3 className="text-sm font-semibold text-slate-700 mb-1">{t('familyPortal.photos.musicTitle')}</h3>
              <p className="text-xs text-slate-400 mb-3">{t('familyPortal.photos.musicSubtitle')}</p>
              {music ? (
                <div className="text-sm text-slate-600 flex items-center gap-2">
                  <Music size={15} className="text-[#b3925a]" /> {music.name}
                </div>
              ) : (
                <label className="inline-flex items-center gap-1.5 text-sm font-medium text-[#3b4a35] border border-[#3b4a35]/30 rounded-md px-3.5 py-2 hover:bg-[#3b4a35]/5 cursor-pointer">
                  <Music size={14} /> {uploadingMusic ? t('familyPortal.photos.uploading') : t('familyPortal.photos.addSong')}
                  <input
                    type="file" accept="audio/*" className="hidden" disabled={uploadingMusic}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setUploadingMusic(true)
                      setUploadError(null)
                      try {
                        await api.uploadFamilyPortalFile(token!, file, 'music')
                        queryClient.invalidateQueries({ queryKey: ['family-portal', token] })
                      } catch (err) {
                        setUploadError(err instanceof Error ? err.message : 'Something went wrong uploading — please try again.')
                      } finally {
                        setUploadingMusic(false)
                        e.target.value = ''
                      }
                    }}
                  />
                </label>
              )}
            </div>
          )}

          {active === 'billing' && (
            <div>
              <h2 className="font-display text-lg font-semibold text-[#3b4a35] mb-1">{t('familyPortal.billing.title')}</h2>
              <p className="text-sm text-slate-500 mb-4">{t('familyPortal.billing.subtitle')}</p>

              {!invoice ? (
                <div className="text-sm text-slate-400 text-center py-10">{t('familyPortal.billing.noInvoice')}</div>
              ) : paymentSuccess || invoice.paid ? (
                <div className="text-center py-10">
                  <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                    <Check size={22} />
                  </div>
                  <div className="text-sm font-medium text-slate-800">{t('familyPortal.billing.paymentReceived')}</div>
                  <div className="text-xs text-slate-500 mt-1">{t('familyPortal.billing.receiptSent')}</div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center border border-slate-100 rounded-md px-4 py-3 mb-5 bg-slate-50">
                    <span className="text-sm text-slate-600">{t('familyPortal.billing.balanceDue')}</span>
                    <span className="text-lg font-semibold text-slate-900">{formatCurrency(balanceDue)}</span>
                  </div>

                  <form onSubmit={handlePaySubmit} className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{t('familyPortal.billing.nameOnCard')}</label>
                      <input required value={cardName} onChange={(e) => setCardName(e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{t('familyPortal.billing.cardNumber')}</label>
                      <div className="relative">
                        <CreditCard size={15} className="absolute left-3 top-2.5 text-slate-400" />
                        <input
                          required
                          value={cardNumber}
                          onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                          placeholder="4242 4242 4242 4242"
                          className="w-full border border-slate-200 rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">{t('familyPortal.billing.expiry')}</label>
                        <input required value={cardExpiry} onChange={(e) => setCardExpiry(formatExpiry(e.target.value))} placeholder="MM/YY" className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">{t('familyPortal.billing.cvc')}</label>
                        <div className="relative">
                          <Lock size={13} className="absolute left-3 top-2.5 text-slate-400" />
                          <input required value={cardCvc} onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="123" className="w-full border border-slate-200 rounded-md pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
                        </div>
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={payMutation.isPending}
                      className="w-full inline-flex items-center justify-center gap-1.5 bg-[#3b4a35] text-white text-sm font-medium py-2.5 rounded-sm hover:bg-[#4d5f45] transition disabled:opacity-60 mt-2"
                    >
                      <Lock size={13} /> {payMutation.isPending ? t('familyPortal.billing.processing') : `${t('familyPortal.billing.pay')} ${formatCurrency(balanceDue)}`}
                    </button>
                    <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 pt-1">
                      <ShieldCheck size={12} /> {t('familyPortal.billing.securePayments')}
                    </div>
                  </form>

                  <p className="text-[11px] text-slate-400 mt-4 text-center">{t('familyPortal.billing.demoNotice')}</p>
                </>
              )}
            </div>
          )}

          {active === 'messages' && (
            <div>
              <h2 className="font-display text-lg font-semibold text-[#3b4a35] mb-1">{t('familyPortal.messages.title')}</h2>
              <p className="text-sm text-slate-500 mb-4">{t('familyPortal.messages.subtitle')}</p>
              <div className="text-sm text-slate-400 text-center py-10">{t('familyPortal.messages.noMessages')}</div>
              <div className="flex gap-2">
                <input
                  placeholder={t('familyPortal.messages.placeholder')}
                  className="flex-1 border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]"
                />
                <button className="bg-[#3b4a35] text-white text-sm font-medium px-4 py-2 rounded-sm hover:bg-[#4d5f45] transition">{t('familyPortal.messages.send')}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
