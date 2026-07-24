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
  const readOnly = 'border-b border-slate-400 flex-1 min-w-0 px-1 py-0.5 text-sm bg-slate-50'
  return (
    <div className="text-sm text-slate-900">
      <div className="flex items-center gap-3 pb-3 mb-6 border-b-2 border-slate-800">
        <img src="/casillas-logo.png" alt="Casillas Funeral Home" className="h-14 w-auto shrink-0" />
        <h2 className="font-bold text-2xl">VITAL SHEET</h2>
      </div>

      <div className="bg-slate-600 text-white text-xs font-semibold px-2 py-1 mb-3">DECEDENT</div>
      <div className="space-y-2 mb-5">
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">First</span><span className={readOnly}>{c.decedent.firstName}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Middle</span><span className={readOnly}>{c.decedent.middleName ?? ''}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Last</span><span className={readOnly}>{c.decedent.lastName}</span></div>
        </div>
        <div className="flex items-baseline gap-2"><span className="text-xs font-medium w-28 shrink-0">Also Known As</span><span className={readOnly}>{vs?.alsoKnownAs ?? ''}</span></div>
        <div className="grid grid-cols-4 gap-4">
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">DOB</span><span className={readOnly}>{fmtDate(c.decedent.dateOfBirth)}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">DOD</span><span className={readOnly}>{fmtDate(c.decedent.dateOfDeath)}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Sex</span><span className={readOnly + ' capitalize'}>{c.decedent.sex ?? ''}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Marital</span><span className={readOnly}>{c.decedent.maritalStatus ?? ''}</span></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Birth City</span><span className={readOnly}>{vs?.birthCity ?? ''}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">State</span><span className={readOnly}>{vs?.birthState ?? ''}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Country</span><span className={readOnly}>{vs?.birthCountry ?? ''}</span></div>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium">
          Armed Forces? <span className={checkboxClass}>{c.decedent.veteran ? '✓' : ''}</span>Y <span className={checkboxClass}>{!c.decedent.veteran ? '✓' : ''}</span>N
        </div>
      </div>

      <div className="bg-slate-600 text-white text-xs font-semibold px-2 py-1 mb-3">BACKGROUND</div>
      <div className="space-y-2 mb-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Education</span><span className={readOnly}>{vs?.education ?? ''}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Race</span><span className={readOnly}>{vs?.race ?? ''}</span></div>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium">
          Hispanic/Latino? <span className={checkboxClass}>{vs?.hispanicLatino ? '✓' : ''}</span>Y <span className={checkboxClass}>{!vs?.hispanicLatino ? '✓' : ''}</span>N
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Occupation</span><span className={readOnly}>{vs?.occupation ?? ''}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Business</span><span className={readOnly}>{vs?.kindOfBusiness ?? ''}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Yrs</span><span className={readOnly}>{vs?.yearsInOccupation ?? ''}</span></div>
        </div>
      </div>

      <div className="bg-slate-600 text-white text-xs font-semibold px-2 py-1 mb-3">RESIDENCE</div>
      <div className="space-y-2 mb-5">
        <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Address</span><span className={readOnly}>{vs?.residenceAddress ?? ''}</span></div>
        <div className="grid grid-cols-4 gap-4">
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">City</span><span className={readOnly}>{vs?.residenceCity ?? ''}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">County</span><span className={readOnly}>{vs?.residenceCounty ?? ''}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">State</span><span className={readOnly}>{vs?.residenceState ?? ''}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Zip</span><span className={readOnly}>{vs?.residenceZip ?? ''}</span></div>
        </div>
      </div>

      <div className="bg-slate-600 text-white text-xs font-semibold px-2 py-1 mb-3">INFORMANT / FAMILY</div>
      <div className="space-y-2 mb-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Informant</span><span className={readOnly}>{vs?.informantName ?? c.contacts[0]?.name ?? ''}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Relationship</span><span className={readOnly}>{vs?.informantRelationship ?? c.contacts[0]?.relationship ?? ''}</span></div>
        </div>
        <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Spouse</span><span className={readOnly}>{vs?.spouseName ?? ''}</span></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Father</span><span className={readOnly}>{vs?.fatherName ?? ''}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Mother</span><span className={readOnly}>{vs?.motherName ?? ''}</span></div>
        </div>
      </div>

      <div className="bg-slate-600 text-white text-xs font-semibold px-2 py-1 mb-3">OFFICE USE ONLY</div>
      <div className="space-y-2 mb-5">
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Disposition</span><span className={readOnly + ' capitalize'}>{c.disposition.replace('_', ' ')}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Weight</span><span className={readOnly}>{fc?.weight ?? ''}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Coroner's Case #</span><span className={readOnly}>{fc?.coronerCaseNumber ?? ''}</span></div>
        </div>
        <div className="flex items-baseline gap-2"><span className="text-xs font-medium w-28 shrink-0">Doctor / Hospice</span><span className={readOnly}>{[fc?.doctorName, fc?.hospiceName].filter(Boolean).join(' / ')}</span></div>
      </div>

      <div className="bg-slate-600 text-white text-xs font-semibold px-2 py-1 mb-3">SERVICES</div>
      <div className="space-y-2 mb-5">
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Visitation</span><span className={readOnly}>{fmtDate(c.visitationDate)}{vs?.visitationHours ? ` · ${vs.visitationHours}` : ''}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Service</span><span className={readOnly}>{fmtDate(c.serviceDate)}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Graveside</span><span className={readOnly}>{fmtDate(vs?.gravesideDate)}{vs?.gravesideTime ? ` ${vs.gravesideTime}` : ''} {vs?.gravesidePlace ?? ''}</span></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium shrink-0">Rosary</span>
            <span className={readOnly}>{fmtDate(vs?.rosaryDate)}{vs?.rosaryTime ? ` ${vs.rosaryTime}` : ''} {vs?.rosaryPlace ?? ''} {vs?.rosaryLanguage ? `(${vs.rosaryLanguage})` : ''}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium shrink-0">Mass</span>
            <span className={readOnly}>{fmtDate(vs?.massDate)}{vs?.massTime ? ` ${vs.massTime}` : ''} {vs?.massPlace ?? ''} {vs?.massLanguage ? `(${vs.massLanguage})` : ''}</span>
          </div>
        </div>
      </div>

      <div className="bg-slate-600 text-white text-xs font-semibold px-2 py-1 mb-3">SURVIVED BY</div>
      <div className="grid grid-cols-4 gap-4 mb-5">
        <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Sons</span><span className={readOnly}>{vs?.sons ?? ''}</span></div>
        <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Daughters</span><span className={readOnly}>{vs?.daughters ?? ''}</span></div>
        <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Sisters</span><span className={readOnly}>{vs?.sisters ?? ''}</span></div>
        <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Brothers</span><span className={readOnly}>{vs?.brothers ?? ''}</span></div>
      </div>

      <div className="bg-slate-600 text-white text-xs font-semibold px-2 py-1 mb-3">FLOWERS, CARDS &amp; EXTRAS</div>
      <div className="space-y-2">
        <div className="flex items-baseline gap-2"><span className="text-xs font-medium w-28 shrink-0">Flowers</span><span className={readOnly}>{vs?.flowersNotes ?? ''}</span></div>
        <div className="flex items-baseline gap-2"><span className="text-xs font-medium w-28 shrink-0">Name on Cards</span><span className={readOnly}>{vs?.cardsNameOn ?? ''}</span></div>
        <div className="flex items-baseline gap-2"><span className="text-xs font-medium w-28 shrink-0">Prayer Cards</span><span className={readOnly}>{vs?.prayerCardsNotes ?? ''}</span></div>
        <div className="flex items-baseline gap-2"><span className="text-xs font-medium w-28 shrink-0">Mem. Folders</span><span className={readOnly}>{vs?.memorialFoldersNotes ?? ''}</span></div>
        <div className="flex items-baseline gap-2"><span className="text-xs font-medium w-28 shrink-0">Make-up &amp; Hair</span><span className={readOnly}>{vs?.makeupHair ?? ''}</span></div>
        <div className="flex items-baseline gap-2"><span className="text-xs font-medium w-28 shrink-0">Receiving FD</span><span className={readOnly}>{[vs?.receivingFuneralDirector, vs?.receivingFuneralDirectorCharges && `$${vs.receivingFuneralDirectorCharges}`].filter(Boolean).join(' — ')}</span></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Medallions</span><span className={readOnly}>{vs?.medallions ?? ''}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-xs font-medium shrink-0">Charms</span><span className={readOnly}>{vs?.charms ?? ''}</span></div>
        </div>
      </div>
    </div>
  )
}
