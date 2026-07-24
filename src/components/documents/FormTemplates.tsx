import type { FuneralCase } from '@/types'

// ---------------------------------------------------------------------------
// These templates reproduce the exact text/layout of Casillas Funeral
// Home's real forms (from documents_Coachella8.pdf and photos of the real
// paper forms), so the printed output matches what's already in use.
// Fields are live <input>s pre-filled from case data where available,
// editable before printing.
//
// NOT YET BUILT: the California Certificate of Death data-collection form,
// and the flowers/prayer cards/memorial folders form (the "back" page) —
// both real and provided, but dense enough to deserve their own careful
// pass rather than guessing at layout. Ask to have those added the same way.
// ---------------------------------------------------------------------------

const fieldClass = 'border-b border-slate-400 flex-1 min-w-0 px-1 py-0.5 text-sm focus:outline-none focus:bg-amber-50 print:focus:bg-transparent'
const checkboxClass = 'h-4 w-4 border border-slate-500 inline-flex items-center justify-center text-xs align-middle mr-1'

/** ISO (YYYY-MM-DD) → MM/DD/YYYY for display. Storage stays ISO everywhere; this is purely how dates are shown on these printed forms. */
function fmtDate(iso: string | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  if (!y || !m || !d) return iso
  return `${m}/${d}/${y}`
}

function Letterhead() {
  return (
    <div className="flex items-start gap-4 pb-3 mb-6 border-b-2 border-slate-800">
      <img src="/casillas-logo.png" alt="Casillas Funeral Home" className="h-16 w-auto shrink-0" />
      <div className="text-xs leading-tight pt-1">
        <div><span className="font-bold text-[#a8323a]">Cathedral City</span> | 68625 Perez Rd. #20  t (760) 202-7420  <span className="font-medium">FD-2117</span></div>
        <div><span className="font-bold text-[#a8323a]">Coachella</span> | 85891 Grapefruit Blvd  t (760) 398-1536  <span className="font-medium">FD-1498</span></div>
        <div><span className="font-bold text-[#a8323a]">Desert Hot Springs</span> | 66272 Pierson Blvd  (760) 671-6671  <span className="font-medium">FD-2432</span></div>
        <div className="mt-1 text-slate-500">www.CasillasFuneralHome.com</div>
      </div>
    </div>
  )
}

function SigLine({ label }: { label: string }) {
  return (
    <div className="mt-6">
      <div className="border-b border-slate-500 h-7" />
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 1. Authorization for Release of Human Remains and Personal Property
// ---------------------------------------------------------------------------

export function ReleaseAuthorizationForm({ c }: { c: FuneralCase }) {
  return (
    <div className="text-sm text-slate-900">
      <Letterhead />
      <h2 className="text-center font-bold text-base mb-6">
        AUTHORIZATION FOR RELEASE OF HUMAN REMAINS AND PERSONAL PROPERTY
      </h2>

      <div className="flex items-baseline gap-2 mb-4">
        <span>To:</span>
        <input defaultValue={c.decedent.placeOfDeath ?? ''} className={fieldClass} placeholder="Name of facility (i.e. hospital, nursing home, etc.)" />
      </div>
      <div className="text-xs text-slate-500 mb-6">Name of facility (i.e. hospital, nursing home, etc.)</div>

      <p className="font-bold mb-4">
        Pursuant to CA Health &amp; Safety Code; Division 7; Part 1; Chapter 2; Section 7053, this Document is a
        demand for and authorization to release forthwith the remains and personal property of:
      </p>

      <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-6">
        <div>
          <input defaultValue={`${c.decedent.firstName} ${c.decedent.lastName}`} className={fieldClass + ' w-full'} />
          <div className="text-xs text-slate-500 mt-0.5">Full Name of Decedent</div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium w-32 shrink-0">Date of Birth</span>
            <input type="date" defaultValue={c.decedent.dateOfBirth} className={fieldClass} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium w-32 shrink-0">Date of Death</span>
            <input type="date" defaultValue={c.decedent.dateOfDeath} className={fieldClass} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium w-32 shrink-0">Last 4 of SSN</span>
            <input maxLength={4} className={fieldClass} />
          </div>
        </div>
      </div>

      <div className="mb-6">
        <span className="font-bold">To: CASILLAS FUNERAL HOME</span>
        <p className="mt-2">Acting as agents for the family of deceased mention above.</p>
      </div>

      <div className="grid grid-cols-2 gap-x-8">
        <div>
          <SigLine label="Signature of Person Authorizing Release" />
          <div className="mt-3">
            <div className="border-b border-slate-500 h-7" />
            <div className="text-xs text-slate-500 mt-0.5">Print Name</div>
          </div>
        </div>
        <div>
          <SigLine label="Relationship of Authorizing Person to Decedent" />
          <div className="mt-3">
            <div className="border-b border-slate-500 h-7" />
            <div className="text-xs text-slate-500 mt-0.5">Date</div>
          </div>
        </div>
      </div>

      <p className="text-xs font-bold mt-8 leading-relaxed">
        ANY PERSON WHO FAILS TO RELEASE FORTHWITH THE HUMAN REMAINS SPECIFIED HEREIN UPON
        DELIVERY OF THIS AUTHORIZATION FOR SUCH RELEASE SIGNED BY ANY PERSON ENTITLED TO THE
        CUSTODY OF SUCH REMAINS, IS GUILTY OF A MISDEMEANOR UNDER THE ABOVE MENTIONED CALIFORNIA
        HEALTH &amp; SAFETY CODE SECTION 7053.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 2. Authorization to Accept or Decline Embalming
// ---------------------------------------------------------------------------

export function EmbalmingAuthorizationForm({ c }: { c: FuneralCase }) {
  return (
    <div className="text-sm text-slate-900">
      <Letterhead />
      <h2 className="text-center font-bold text-base mb-6">AUTHORIZATION TO ACCEPT OR DECLINE EMBALMING</h2>

      <p className="mb-1">TO: <span className="font-bold">CASILLAS FUNERAL HOME</span></p>
      <p className="text-xs text-slate-500 mb-4">(Funeral Establishment Name)</p>
      <div className="flex items-baseline gap-2 mb-6">
        <span>RE:</span>
        <input defaultValue={`${c.decedent.firstName} ${c.decedent.lastName}`} className={fieldClass} placeholder="Decedent" />
      </div>

      <p className="mb-4 leading-relaxed">
        Embalming is the addition to, or the replacement of, body fluids by chemical
        preservatives or the application of chemical preservatives for the temporary
        preservation of the body. I understand that embalming is not required by law.
      </p>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span>I,</span>
        <input className={fieldClass} style={{ maxWidth: 220 }} />
        <span>, do</span>
        <span className={checkboxClass} />
        <span>do not</span>
        <span className={checkboxClass} />
        <span>(check one) request embalming</span>
      </div>

      <p className="mb-2">
        I understand that for storage or embalming purposes the decedent may be transported
        to the following location:
      </p>
      <div className="border-b border-slate-400 h-7 mb-1" />
      <div className="text-xs text-slate-500 mb-6">(Location Name and Address)</div>

      <p className="mb-6">
        The undersigned hereby represents that he/she has the legal right to control disposition
        of the remains of the decedent.
      </p>

      <div className="grid grid-cols-2 gap-x-8 mb-6">
        <SigLine label="Signed" />
        <SigLine label="Relationship to Decedent" />
      </div>
      <div className="flex items-center gap-2 text-xs mb-8">
        <span>Executed this</span>
        <span className="border-b border-slate-400 flex-1" />
        <span>at</span>
        <span className="border-b border-slate-400 flex-1" />
      </div>
      <div className="flex justify-between text-[10px] text-slate-500 -mt-6 mb-8">
        <span className="pl-16">(Day, Month and Year)</span>
        <span className="pr-8">(City and State)</span>
      </div>

      <p className="text-xs italic mb-4">
        This section is to be completed by the funeral establishment if authorization to accept or decline
        embalming is obtained orally.
      </p>
      <p className="mb-2">The above statement regarding embalming and storage was read and/or provided to</p>
      <div className="border-b border-slate-400 h-7 mb-1" />
      <div className="text-xs text-slate-500 mb-4">Relationship to Decedent</div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span>who</span>
        <span className={checkboxClass} /> <span>did</span>
        <span className={checkboxClass} /> <span>did not</span>
        <span>(check one) authorize embalming at the above named funeral establishment.</span>
      </div>
      <div className="grid grid-cols-2 gap-8 text-sm mb-8">
        <div className="flex items-center gap-2">
          <span className="shrink-0">Telephone Number:</span>
          <span className="border-b border-slate-400 flex-1" />
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0">Date/time granted:</span>
          <span className="border-b border-slate-400 flex-1" />
        </div>
      </div>

      <p className="text-xs italic mb-4">
        This section is to be completed by the funeral establishment representative who is
        executing this authorization to accept or decline embalming.
      </p>
      <p className="mb-6">I declare under penalty of perjury that the foregoing is true and correct.</p>
      <div className="flex items-center gap-2 text-xs mb-8">
        <span>Executed this</span>
        <span className="border-b border-slate-400 flex-1" />
        <span>at</span>
        <span className="border-b border-slate-400 flex-1" />
      </div>
      <div className="grid grid-cols-2 gap-x-8">
        <SigLine label="Funeral Establishment Representative (Print Name)" />
        <SigLine label="Funeral Establishment Representative (Signature)" />
      </div>

      <div className="text-[10px] text-slate-400 mt-8">12-AUTH (rev. 11/14)</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 3. Disclosure of Preneed Funeral Agreement
// ---------------------------------------------------------------------------

export function PreneedDisclosureForm({ c, locationLicense }: { c: FuneralCase; locationLicense: string }) {
  return (
    <div className="text-sm text-slate-900">
      <Letterhead />
      <h2 className="text-center font-bold text-base mb-6">Disclosure of Preneed Funeral Agreement</h2>

      <div className="flex flex-wrap items-center gap-1 mb-6 leading-relaxed">
        <span>The funeral establishment, license number</span>
        <input defaultValue={locationLicense} className={fieldClass} style={{ maxWidth: 100 }} />
        <span>, DOES</span>
        <span className={checkboxClass} />
        <span>, DOES NOT</span>
        <span className={checkboxClass} />
        <span>(check one) have a preneed arrangement, as defined below, made by or on behalf of</span>
        <input defaultValue={`${c.decedent.firstName} ${c.decedent.lastName}`} className={fieldClass} style={{ maxWidth: 220 }} />
      </div>

      <p className="mb-6 leading-relaxed text-xs">
        "Preneed arrangement," "preneed agreement" or "preneed" is written instruction regarding goods or services
        or both goods and services for final disposition of human remains when the goods or services are not provided
        until the time of death, and may be either unfunded or paid for in advance of need.
      </p>

      <p className="mb-2 font-medium">If the funeral establishment does have a preneed agreement, complete the following:</p>
      <p className="mb-4 text-xs leading-relaxed">
        In compliance with Business and Professions Code Section 7745, the funeral establishment has presented to
        the person named below a copy of any preneed agreement which has been signed and paid for in full, or in part
        by, or on behalf of the deceased and is in the possession of the funeral establishment.
      </p>

      <div className="grid grid-cols-2 gap-x-8 mb-4">
        <SigLine label="Signature of the survivor or responsible party" />
        <div className="mt-6">
          <div className="border-b border-slate-500 h-7" />
          <div className="text-xs text-slate-500 mt-0.5">Date</div>
        </div>
      </div>
      <div className="mb-6">
        <div className="border-b border-slate-500 h-7" />
        <div className="text-xs text-slate-500 mt-0.5">Print name of the survivor or responsible party</div>
      </div>

      <div className="grid grid-cols-2 gap-x-8 mb-8">
        <SigLine label="Signature of funeral establishment representative" />
        <div className="mt-6">
          <div className="border-b border-slate-500 h-7" />
          <div className="text-xs text-slate-500 mt-0.5">Date</div>
        </div>
      </div>
      <div className="mb-8">
        <div className="border-b border-slate-500 h-7" />
        <div className="text-xs text-slate-500 mt-0.5">Print name of funeral establishment representative / Title</div>
      </div>

      <p className="text-xs font-medium mb-2">The funeral establishment must:</p>
      <ul className="text-xs list-disc ml-5 mb-6 space-y-1">
        <li>Give a copy of the completed statement to the survivor or responsible party.</li>
        <li>
          Retain the original or a copy of the completed disclosure statement on file for not less than
          one (1) year after the preneed account has been audited by the Bureau or seven (7) years
          from the date the disclosure statement was made, whichever comes first.
        </li>
      </ul>

      <p className="text-xs leading-relaxed mb-4">
        Funeral Establishment's Responsibility – Business and Professions Code Section 7745 requires a funeral
        establishment to present to the survivor of the decedent or the responsible party a copy of any preneed
        agreement in its possession which has been signed and paid for in full, or in part by, or on behalf of the
        deceased. Business and Professions Code Section 7685.6 requires a copy of any preneed arrangements to be
        disclosed prior to drafting any contract for funeral goods or services. A funeral establishment that
        knowingly fails to present a preneed agreement as required is liable for a civil fine equal to three times
        the cost of the preneed agreement, or one thousand dollars ($1,000), whichever is greater.
      </p>

      <p className="text-xs leading-relaxed">
        You may contact the Cemetery and Funeral Bureau for more information on funeral, cemetery or cremation
        matters or to file a complaint against a licensee:<br />
        Cemetery and Funeral Bureau, 1625 North Market Blvd., Suite S-208, Sacramento, CA 95834, 916-574-7870
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 4. First Call Sheet — intake info taken the moment a call comes in, long
// before most Case fields exist yet. Reproduces the real Casillas "FIRST
// CALL" sheet layout. Every field here is a blank fillable input (like the
// paper original) rather than pulled from case data, since a first call
// sheet is usually filled out to CREATE the initial record, not to
// document something already in the system.
// ---------------------------------------------------------------------------

export function FirstCallForm({ c }: { c?: FuneralCase }) {
  return (
    <div className="text-sm text-slate-900">
      <div className="flex items-center gap-3 pb-3 mb-6 border-b-2 border-slate-800">
        <img src="/casillas-logo.png" alt="Casillas Funeral Home" className="h-14 w-auto shrink-0" />
        <h2 className="font-bold text-2xl">FIRST CALL</h2>
      </div>

      <div className="bg-slate-600 text-white text-xs font-semibold px-2 py-1 mb-3">DECEASED</div>
      <div className="space-y-2 mb-5">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium w-28 shrink-0">Name</span>
          <input defaultValue={c ? `${c.decedent.firstName} ${c.decedent.lastName}` : ''} className={fieldClass + ' w-full'} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium shrink-0">Date of Death</span>
            <input type="date" defaultValue={c?.decedent.dateOfDeath} className={fieldClass} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium shrink-0">Time</span>
            <input type="time" className={fieldClass} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium shrink-0">Date of Birth</span>
            <input type="date" defaultValue={c?.decedent.dateOfBirth} className={fieldClass} />
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-baseline gap-2 flex-1">
            <span className="text-xs font-medium shrink-0">SS#</span>
            <input className={fieldClass + ' w-full'} />
          </div>
          <div className="flex items-center gap-2 text-xs font-medium shrink-0">
            Veteran? <span className={checkboxClass}></span>Y <span className={checkboxClass}></span>N
          </div>
        </div>
      </div>

      <div className="bg-slate-600 text-white text-xs font-semibold px-2 py-1 mb-3">LOCATION</div>
      <div className="space-y-2 mb-5">
        <div className="flex items-center gap-4 text-xs font-medium">
          <span className={checkboxClass}></span>RES <span className={checkboxClass}></span>JFK <span className={checkboxClass}></span>DRMC <span className={checkboxClass}></span>EMC
          <span className="flex items-baseline gap-2 flex-1">other <input className={fieldClass + ' w-full'} /></span>
        </div>
        <input className={fieldClass + ' w-full'} placeholder="Address" />
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium shrink-0">Gate Code</span>
            <input className={fieldClass + ' w-full'} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium shrink-0">Weight</span>
            <input className={fieldClass + ' w-full'} />
          </div>
        </div>
        <div className="flex items-center gap-8 text-xs font-medium">
          <span>Fam. Present? <span className={checkboxClass}></span>Y <span className={checkboxClass}></span>N</span>
          <span className="flex items-baseline gap-2 flex-1">Fam Ready? <input className={fieldClass + ' flex-1'} /></span>
          <span>Contagious? <span className={checkboxClass}></span>N <span className={checkboxClass}></span>Y</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium shrink-0">Special instruction</span>
          <input className={fieldClass + ' w-full'} />
        </div>
      </div>

      <div className="bg-slate-600 text-white text-xs font-semibold px-2 py-1 mb-3">NEXT OF KIN</div>
      <div className="space-y-2 mb-5">
        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-2 flex-1">
            <span className="text-xs font-medium shrink-0">Name</span>
            <input defaultValue={c?.contacts[0]?.name ?? ''} className={fieldClass + ' w-full'} />
          </div>
          <div className="flex items-baseline gap-2 flex-1">
            <span className="text-xs font-medium shrink-0">Ph</span>
            <input defaultValue={c?.contacts[0]?.phone ?? ''} className={fieldClass + ' w-full'} />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium shrink-0">Relationship</span>
          <input defaultValue={c?.contacts[0]?.relationship ?? ''} className={fieldClass + ' w-full max-w-xs'} />
        </div>
      </div>

      <div className="bg-slate-600 text-white text-xs font-semibold px-2 py-1 mb-3">MEDICAL INFO</div>
      <div className="space-y-2 mb-5">
        <div className="flex items-center gap-2 text-xs font-medium">
          Coroner's case? <span className={checkboxClass}></span>Y <span className={checkboxClass}></span>N
          <span className="flex items-baseline gap-2 flex-1">#<input className={fieldClass + ' w-full'} /></span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-2 flex-1">
            <span className="text-xs font-medium shrink-0">Doctor</span>
            <input className={fieldClass + ' w-full'} />
          </div>
          <div className="flex items-baseline gap-2 flex-1">
            <span className="text-xs font-medium shrink-0">PH</span>
            <input className={fieldClass + ' w-full'} />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-2 flex-1">
            <span className="text-xs font-medium shrink-0">Hospice</span>
            <input className={fieldClass + ' w-full'} />
          </div>
          <div className="flex items-baseline gap-2 flex-1">
            <span className="text-xs font-medium shrink-0">PH</span>
            <input className={fieldClass + ' w-full'} />
          </div>
        </div>
      </div>

      <div className="bg-slate-600 text-white text-xs font-semibold px-2 py-1 mb-3">PERSON CALLING</div>
      <div className="space-y-2 mb-5">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium w-28 shrink-0">Person calling</span>
          <input className={fieldClass + ' w-full'} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium shrink-0">Called received at</span>
            <input className={fieldClass + ' w-full'} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium shrink-0">Time of Removal</span>
            <input className={fieldClass + ' w-full'} />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium w-28 shrink-0">Special instructions</span>
          <input className={fieldClass + ' w-full'} />
        </div>
      </div>

      <div className="flex items-center gap-6 text-xs font-medium mt-8 pt-3 border-t border-slate-300">
        Call taken: Date <input type="date" className={fieldClass} />
        time <input type="time" className={fieldClass} />
        By <input className={fieldClass + ' flex-1'} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 5. Vital Sheet — the death-certificate/permit data-collection form.
// Fields already captured elsewhere (name, DOB, DOD, sex, marital status,
// veteran, weight, coroner's case #, doctor/hospice, disposition) are
// pulled in read-only from the case/First Call — this print view is the
// single place all of it comes together, not a fourth place to type it.
// ---------------------------------------------------------------------------

export function VitalSheetForm({ c }: { c: FuneralCase }) {
  const fc = c.firstCall
  const vs = c.vitalSheet
  const ro = 'border-b border-slate-400 flex-1 min-w-0 px-1 py-0.5 text-xs bg-slate-50'

  let age = ''
  if (c.decedent.dateOfBirth && c.decedent.dateOfDeath) {
    const dob = new Date(c.decedent.dateOfBirth)
    const dod = new Date(c.decedent.dateOfDeath)
    let years = dod.getFullYear() - dob.getFullYear()
    const m = dod.getMonth() - dob.getMonth()
    if (m < 0 || (m === 0 && dod.getDate() < dob.getDate())) years--
    age = years >= 0 ? String(years) : ''
  }

  return (
    <div className="text-xs text-slate-900">
      {/* ------------------------------------------------------------- */}
      {/* PAGE 1 — matches "This form contains the data needed to      */}
      {/* complete the California Certificate of Death" exactly        */}
      {/* ------------------------------------------------------------- */}
      <div className="mb-3">
        <div className="flex justify-between items-start mb-2">
          <div className="italic text-[11px] leading-tight max-w-[45%]">This form contains the data needed to complete the California Certificate of Death</div>
          <div className="text-right space-y-1 w-1/2">
            <div className="flex items-baseline gap-1"><span className="font-medium shrink-0">CONTACT PERSON</span><span className={ro}>{c.contacts[0]?.name ?? ''}</span></div>
            <div className="flex items-baseline gap-1"><span className="font-medium shrink-0">PHONE NUMBER</span><span className={ro}>{c.contacts[0]?.phone ?? ''}</span></div>
            <div className="flex items-baseline gap-1"><span className="font-medium shrink-0">EMAIL</span><span className={ro}>{c.contacts[0]?.email ?? ''}</span></div>
          </div>
        </div>

        <div className="border border-slate-400">
          <div className="grid grid-cols-3 border-b border-slate-400">
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">1. DECEDENT FIRST NAME</div><div className="font-medium">{c.decedent.firstName}</div></div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">2. MIDDLE</div><div className="font-medium">{c.decedent.middleName ?? ''}</div></div>
            <div className="p-1"><div className="text-[9px] text-slate-500">3. LAST NAME</div><div className="font-medium">{c.decedent.lastName}</div></div>
          </div>
          <div className="p-1 border-b border-slate-400"><div className="text-[9px] text-slate-500">ALSO KNOWN AS</div><div>{vs?.alsoKnownAs ?? ''}</div></div>
          <div className="grid grid-cols-4 border-b border-slate-400">
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">4. DATE OF BIRTH</div><div>{c.decedent.dateOfBirth ?? ''}</div></div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">5. AGE</div><div>{age}</div></div>
            <div className="p-1 col-span-2"><div className="text-[9px] text-slate-500">6. SEX</div><div className="capitalize">{c.decedent.sex ?? ''}</div></div>
          </div>
          <div className="grid grid-cols-6 border-b border-slate-400">
            <div className="p-1 border-r border-slate-400 col-span-2"><div className="text-[9px] text-slate-500">9. BIRTH CITY/ STATE/ COUNTRY</div><div>{[vs?.birthCity, vs?.birthState, vs?.birthCountry].filter(Boolean).join(', ')}</div></div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">10. SOCIAL SECURITY NUMBER</div><div>{c.decedent.ssn ?? ''}</div></div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">11. ARMED FORCES?</div><div>{c.decedent.veteran ? 'Y' : 'N'}</div></div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">12. MARITAL STATUS</div><div className="capitalize">{c.decedent.maritalStatus ?? ''}</div></div>
            <div className="p-1"><div className="text-[9px] text-slate-500">7. DATE OF DEATH</div><div>{c.decedent.dateOfDeath ?? ''}</div><div className="text-[9px] text-slate-500 mt-0.5">8. TIME</div><div>{fc?.timeOfDeath ?? ''}</div></div>
          </div>
          <div className="grid grid-cols-3 border-b border-slate-400">
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">13. EDUCATION</div><div>{vs?.education ?? ''}</div></div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">14. WAS DECEDENT HISPANIC/ LATINO /SPANISH?</div><div>{vs?.hispanicLatino ? 'Yes' : 'No'}</div></div>
            <div className="p-1"><div className="text-[9px] text-slate-500">16. RACE</div><div>{vs?.race ?? ''}</div></div>
          </div>
          <div className="grid grid-cols-3 border-b border-slate-400">
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">17. OCCUPATION</div><div>{vs?.occupation ?? ''}</div></div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">18. KIND OF BUSINESS</div><div>{vs?.kindOfBusiness ?? ''}</div></div>
            <div className="p-1"><div className="text-[9px] text-slate-500">19. YRS IN OCCUPATION</div><div>{vs?.yearsInOccupation ?? ''}</div></div>
          </div>
          <div className="p-1 border-b border-slate-400"><div className="text-[9px] text-slate-500">20. DECEDENT'S RESIDENCE</div><div>{vs?.residenceAddress ?? ''}</div></div>
          <div className="grid grid-cols-5 border-b border-slate-400">
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">21. CITY</div><div>{vs?.residenceCity ?? ''}</div></div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">22. COUNTY</div><div>{vs?.residenceCounty ?? ''}</div></div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">23. ZIP CODE</div><div>{vs?.residenceZip ?? ''}</div></div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">24. YRS IN COUNTY</div><div>{vs?.yearsInCounty ?? ''}</div></div>
            <div className="p-1"><div className="text-[9px] text-slate-500">25. STATE</div><div>{vs?.residenceState ?? ''}</div></div>
          </div>
          <div className="grid grid-cols-2 border-b border-slate-400">
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">26. NAME OF INFORMANT AND RELATIONSHIP</div><div>{[vs?.informantName, vs?.informantRelationship].filter(Boolean).join(' — ')}</div></div>
            <div className="p-1"><div className="text-[9px] text-slate-500">27. MAILING ADDRESS</div><div>{vs?.informantMailingAddress ?? ''}</div></div>
          </div>
          <div className="grid grid-cols-3 border-b border-slate-400">
            <div className="p-1 border-r border-slate-400 col-span-2"><div className="text-[9px] text-slate-500">28. NAME OF SPOUSE</div><div>{vs?.spouseName ?? ''}</div></div>
            <div className="p-1"><div className="text-[9px] text-slate-500">30. LAST - MAIDEN</div><div></div></div>
          </div>
          <div className="grid grid-cols-4 border-b border-slate-400">
            <div className="p-1 border-r border-slate-400 col-span-2"><div className="text-[9px] text-slate-500">31. NAME OF FATHER</div><div>{vs?.fatherName ?? ''}</div></div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">33. LAST</div><div></div></div>
            <div className="p-1"><div className="text-[9px] text-slate-500">34 BIRTH STATE</div><div>{vs?.fatherBirthState ?? ''}</div></div>
          </div>
          <div className="grid grid-cols-4">
            <div className="p-1 border-r border-slate-400 col-span-2"><div className="text-[9px] text-slate-500">35. NAME OF MOTHER</div><div>{vs?.motherName ?? ''}</div></div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">36. LAST - MAIDEN</div><div></div></div>
            <div className="p-1"><div className="text-[9px] text-slate-500">38 BIRTH STATE</div><div>{vs?.motherBirthState ?? ''}</div></div>
          </div>
        </div>

        <div className="bg-slate-600 text-white text-center text-[10px] font-semibold py-0.5 mt-2">OFFICE USE ONLY</div>
        <div className="border border-slate-400 border-t-0">
          <div className="p-1 border-b border-slate-400"><div className="text-[9px] text-slate-500">101. PLACE OF DEATH</div><div>{c.decedent.placeOfDeath ?? ''}</div></div>
          <div className="grid grid-cols-2 border-b border-slate-400">
            <div className="p-1 border-r border-slate-400">
              <div className="text-[9px] text-slate-500">DISPOSITION</div>
              <div>EMB <span className="inline-block w-3 h-3 border border-slate-500 align-middle ml-1 mr-3 text-center">{c.disposition === 'burial' ? '✓' : ''}</span>
              CREM <span className="inline-block w-3 h-3 border border-slate-500 align-middle ml-1">{c.disposition === 'cremation' ? '✓' : ''}</span></div>
            </div>
            <div className="p-1"><div className="text-[9px] text-slate-500">40. PLACE OF FINAL DISPOSITION</div><div>{vs?.placeOfFinalDisposition ?? ''}</div></div>
          </div>
          <div className="grid grid-cols-5">
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">WEIGHT</div><div>{fc?.weight ?? ''}</div></div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">OBITUARY</div><div>{vs?.obituary ? 'Y' : 'N'}</div></div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">PACEMAKER</div><div>{vs?.pacemaker ? 'Y' : 'N'}</div></div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">CORONER'S CASE #</div><div>{fc?.coronerCaseNumber ?? ''}</div></div>
            <div className="p-1"><div className="text-[9px] text-slate-500">DOCTOR - HOSPICE</div><div>{[fc?.doctorName, fc?.hospiceName].filter(Boolean).join(' / ')}</div></div>
          </div>
        </div>

        <div className="border border-slate-400 border-t-0">
          <div className="grid grid-cols-[90px_1fr_1fr_1fr] border-b border-slate-400">
            <div className="p-1 bg-slate-100 font-medium border-r border-slate-400">VISITATION</div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">Date</div>{c.visitationDate ?? ''}</div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">Hours</div>{vs?.visitationHours ?? ''}</div>
            <div className="p-1"><div className="text-[9px] text-slate-500">Place</div>{c.visitationLocation ?? ''}</div>
          </div>
          <div className="grid grid-cols-[90px_1fr_1fr_1fr_1fr] border-b border-slate-400">
            <div className="p-1 bg-slate-100 font-medium border-r border-slate-400">ROSARY SERVICE</div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">Date</div>{vs?.rosaryDate ?? ''}</div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">Time</div>{vs?.rosaryTime ?? ''}</div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">{vs?.rosaryLanguage === 'spanish' ? 'SPAN' : 'ENG'} Place</div>{vs?.rosaryPlace ?? ''}</div>
            <div className="p-1"><div className="text-[9px] text-slate-500">BY</div>{vs?.rosaryBy ?? ''}</div>
          </div>
          <div className="grid grid-cols-[90px_1fr_1fr_1fr_1fr] border-b border-slate-400">
            <div className="p-1 bg-slate-100 font-medium border-r border-slate-400">MASS FUNERAL SERV</div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">Date</div>{vs?.massDate ?? ''}</div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">Time</div>{vs?.massTime ?? ''}</div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">{vs?.massLanguage === 'spanish' ? 'SPAN' : 'ENG'} Place</div>{vs?.massPlace ?? ''}</div>
            <div className="p-1"><div className="text-[9px] text-slate-500">BY</div>{vs?.massBy ?? ''}</div>
          </div>
          <div className="grid grid-cols-[90px_1fr_1fr_1fr]">
            <div className="p-1 bg-slate-100 font-medium border-r border-slate-400">GRAVESIDE SERVICE</div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">Date</div>{vs?.gravesideDate ?? ''}</div>
            <div className="p-1 border-r border-slate-400"><div className="text-[9px] text-slate-500">Time</div>{vs?.gravesideTime ?? ''}</div>
            <div className="p-1"><div className="text-[9px] text-slate-500">Place</div>{vs?.gravesidePlace ?? ''} {vs?.gravesideBy && `— BY ${vs.gravesideBy}`}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-8 mt-2">
          <div className="space-y-1">
            <div className="flex items-baseline gap-2"><span className="w-20 font-medium shrink-0">SONS</span><span className={ro}>{vs?.sons ?? ''}</span></div>
            <div className="flex items-baseline gap-2"><span className="w-20 font-medium shrink-0">DAUGHTERS</span><span className={ro}>{vs?.daughters ?? ''}</span></div>
            <div className="flex items-baseline gap-2"><span className="w-20 font-medium shrink-0">SISTERS</span><span className={ro}>{vs?.sisters ?? ''}</span></div>
            <div className="flex items-baseline gap-2"><span className="w-20 font-medium shrink-0">BROTHER</span><span className={ro}>{vs?.brothers ?? ''}</span></div>
          </div>
          <div className="text-[10px] space-y-1">
            <div className="flex items-baseline gap-2"><span className="w-4 font-medium">Y</span><span className={ro}>{age}</span></div>
            <div className="flex items-baseline gap-2"><span className="w-4 font-medium">M</span><span className={ro}></span></div>
            <div className="flex items-baseline gap-2"><span className="w-4 font-medium">D</span><span className={ro}></span></div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* PAGE 2 — matches the back page (Flowers / Cards / Doctor /    */}
      {/* Receiving Funeral Director) exactly                          */}
      {/* ------------------------------------------------------------- */}
      <div className="break-before-page pt-6 border-t-2 border-dashed border-slate-300 mt-6">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex items-baseline gap-2"><span className="font-medium shrink-0">Church:</span><span className={ro}>{vs?.churchName ?? ''}</span></div>
          <div className="flex items-baseline gap-2"><span className="font-medium shrink-0">Pastor:</span><span className={ro}>{vs?.pastorName ?? ''}</span></div>
          <div className="flex items-baseline gap-2"><span className="font-medium shrink-0">Address:</span><span className={ro}>{vs?.churchAddress ?? ''}</span></div>
          <div className="flex items-baseline gap-2"><span className="font-medium shrink-0">Tel:</span><span className={ro}>{vs?.pastorPhone ?? ''}</span></div>
        </div>

        <div className="bg-slate-600 text-white text-xs font-semibold px-2 py-1 mb-2">FLOWERS</div>
        <div className="mb-4">
          <p className="text-xs whitespace-pre-wrap">{vs?.flowersNotes || '—'}</p>
        </div>

        <div className="mb-4"><span className="font-semibold">NAME ON CARDS/MEM FOLDERS:</span> <span className={ro}>{vs?.cardsNameOn ?? ''}</span></div>

        <div className="bg-slate-600 text-white text-xs font-semibold px-2 py-1 mb-2">PRAYER CARDS</div>
        <p className="text-xs whitespace-pre-wrap mb-4">{vs?.prayerCardsNotes || '—'}</p>

        <div className="bg-slate-600 text-white text-xs font-semibold px-2 py-1 mb-2">MEM. FOLDERS</div>
        <p className="text-xs whitespace-pre-wrap mb-4">{vs?.memorialFoldersNotes || '—'}</p>

        <div className="flex items-baseline gap-2 mb-4"><span className="font-medium shrink-0">Book</span><span className={ro}>{vs?.memorialBook ?? ''}</span></div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="bg-slate-600 text-white text-xs font-semibold px-2 py-1 mb-2">DOCTOR</div>
            <div className="space-y-1">
              <div>{fc?.doctorName ?? ''}</div>
              <div className="flex items-baseline gap-2"><span className="text-[10px] text-slate-500 shrink-0">Address</span><span className={ro}>{vs?.doctorAddress ?? ''}</span></div>
              <div className="flex items-baseline gap-2"><span className="text-[10px] text-slate-500 shrink-0">Tel.</span><span className={ro}>{fc?.doctorPhone ?? ''}</span><span className="text-[10px] text-slate-500 shrink-0">Fax</span><span className={ro}>{vs?.doctorFax ?? ''}</span></div>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold mb-2">MAKE-UP &amp; HAIR</div>
            <p className="text-xs whitespace-pre-wrap">{vs?.makeupHair || '—'}</p>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-baseline gap-2 mb-1"><span className="font-medium shrink-0">Receiving Funeral Director</span><span className={ro}>{vs?.receivingFuneralDirector ?? ''}</span></div>
          <div className="flex items-baseline gap-2 mb-1"><span className="font-medium shrink-0">Address</span><span className={ro}>{vs?.receivingFuneralDirectorAddress ?? ''}</span></div>
          <div className="flex items-baseline gap-2"><span className="font-medium shrink-0">Charges $</span><span className={ro}>{vs?.receivingFuneralDirectorCharges ?? ''}</span><span className="font-medium shrink-0">Tel</span><span className={ro}>{vs?.receivingFuneralDirectorPhone ?? ''}</span></div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="flex items-baseline gap-2"><span className="font-medium shrink-0">medallions</span><span className={ro}>{vs?.medallions ?? ''}</span></div>
          <div className="flex items-baseline gap-2"><span className="font-medium shrink-0">charms</span><span className={ro}>{vs?.charms ?? ''}</span></div>
        </div>
      </div>
    </div>
  )
}
