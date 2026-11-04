import { format, parseISO } from 'date-fns'
import { BrandLogo } from '@/components/ui/BrandLogo'
import { getCompanyName } from '@/lib/company'
import { CUSTODY_STAGE_LABELS, type CalendarEvent, type FuneralCase, type Location, type ServiceOrder, type StaffMember } from '@/types'

const cell = 'border border-slate-400 px-2 py-1.5 align-top'
const lab = 'text-[10px] font-semibold uppercase text-slate-500'
const when = (iso?: string) => { try { return iso ? format(parseISO(iso), 'EEE M/d/yyyy · h:mm a') : '—' } catch { return '—' } }
const day = (iso?: string) => { try { return iso ? format(parseISO(iso), 'M/d/yyyy') : '—' } catch { return '—' } }

/** One printed page that tells anyone picking up the case where it stands: who, family, services, orders. */
export function CaseSummarySheet({ c, location, events, orders, staff, preparedBy }: { c: FuneralCase; location?: Location; events: CalendarEvent[]; orders: ServiceOrder[]; staff: StaffMember[]; preparedBy: string }) {
  const d = c.decedent, fc = c.firstCall
  const nm = (id?: string) => staff.find((s) => s.id === id)?.name ?? '—'
  const evs = events.filter((e) => ['visitation', 'service', 'burial'].includes(e.type)).sort((a, b) => a.start.localeCompare(b.start))
  return (
    <div className="bg-white text-slate-900 p-8 text-[12.5px] leading-snug" style={{ width: '100%', maxWidth: 780, margin: '0 auto' }}>
      <div className="flex items-start justify-between gap-6 border-b-2 border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-14 w-auto shrink-0" />
          <div>
            <div className="text-lg font-semibold">{getCompanyName()}</div>
            {location && <div className="text-slate-600">{location.address}, {location.city}, {location.state} {location.zip}{location.phone ? ` · ${location.phone}` : ''}</div>}
          </div>
        </div>
        <div className="text-right"><div className="text-xl font-bold tracking-wide">CASE SUMMARY</div><div className="text-slate-600">Case {c.caseNumber}</div></div>
      </div>

      <table className="mt-4 w-full border-collapse"><tbody>
        <tr>
          <td className={cell}><div className={lab}>Name</div><b>{d.firstName} {d.middleName ? d.middleName + ' ' : ''}{d.lastName}</b></td>
          <td className={cell}><div className={lab}>Date of birth</div>{day(d.dateOfBirth)}</td>
          <td className={cell}><div className={lab}>Date of death</div>{day(d.dateOfDeath)}{fc?.timeOfDeath ? ` · ${fc.timeOfDeath}` : ''}</td>
        </tr>
        <tr>
          <td className={cell}><div className={lab}>Place of death</div>{d.placeOfDeath || fc?.locationAddress || '—'}</td>
          <td className={cell}><div className={lab}>Disposition</div>{(c.disposition ?? '—').toString().replace(/_/g, ' ')}</td>
          <td className={cell}><div className={lab}>Current location</div>{CUSTODY_STAGE_LABELS[c.custodyStage]}</td>
        </tr>
        <tr>
          <td className={cell}><div className={lab}>Funeral director</div>{nm(c.assignedDirectorId)}</td>
          <td className={cell}><div className={lab}>Embalmer</div>{nm(c.assignedEmbalmerId)}</td>
          <td className={cell}><div className={lab}>Veteran</div>{d.veteran ? 'Yes' : 'No'}</td>
        </tr>
      </tbody></table>

      <div className="mt-4 mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Family &amp; contacts</div>
      <table className="w-full border-collapse">
        <thead><tr className="bg-slate-100 text-left text-[11px] uppercase"><th className={cell}>Name</th><th className={cell}>Relationship</th><th className={cell}>Phone</th><th className={cell}>Email</th></tr></thead>
        <tbody>
          {c.contacts.length === 0 && <tr><td colSpan={4} className={cell + ' text-slate-500'}>No contacts on file.</td></tr>}
          {c.contacts.map((p) => <tr key={p.id}><td className={cell}><b>{p.name}</b>{p.isAuthorizingAgent ? ' (authorizing)' : p.isPrimary ? ' (primary)' : ''}</td><td className={cell}>{p.relationship}</td><td className={cell}>{p.phone ?? ''}</td><td className={cell}>{p.email ?? ''}</td></tr>)}
        </tbody>
      </table>

      <div className="mt-4 mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Visitation, services &amp; burial</div>
      <table className="w-full border-collapse">
        <thead><tr className="bg-slate-100 text-left text-[11px] uppercase"><th className={cell}>What</th><th className={cell}>Date &amp; time</th><th className={cell}>Where</th></tr></thead>
        <tbody>
          {evs.length === 0 && <tr><td colSpan={3} className={cell + ' text-slate-500'}>Nothing scheduled.</td></tr>}
          {evs.map((e) => <tr key={e.id}><td className={cell}><b>{e.label || e.title}</b></td><td className={cell + ' whitespace-nowrap'}>{when(e.start)}</td><td className={cell}>{e.location ?? ''}</td></tr>)}
        </tbody>
      </table>

      <div className="mt-4 mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Orders</div>
      <table className="w-full border-collapse">
        <thead><tr className="bg-slate-100 text-left text-[11px] uppercase"><th className={cell}>Item</th><th className={cell}>Status</th><th className={cell}>Vendor</th><th className={cell}>Notes</th></tr></thead>
        <tbody>
          {orders.length === 0 && <tr><td colSpan={4} className={cell + ' text-slate-500'}>No orders.</td></tr>}
          {orders.map((o) => <tr key={o.id}><td className={cell}><b>{o.item}</b></td><td className={cell + ' capitalize'}>{String(o.status).replace(/_/g, ' ')}</td><td className={cell}>{o.vendor ?? ''}</td><td className={cell}>{o.notes ?? ''}</td></tr>)}
        </tbody>
      </table>

      {fc?.specialInstructions && <div className="mt-3"><span className={lab}>Special instructions: </span>{fc.specialInstructions}</div>}
      <div className="mt-6 text-[10px] text-slate-500">Printed {format(new Date(), 'M/d/yyyy h:mm a')} by {preparedBy}</div>
    </div>
  )
}
