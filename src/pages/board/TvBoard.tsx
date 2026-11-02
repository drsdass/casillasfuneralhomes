import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useState, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useSession } from '@/context/SessionContext'
import { loadBoardData, type BoardData, type BoardRowData, type OrderState } from '@/lib/tvBoard'
import { format } from 'date-fns'
import { boardDay, boardRange, boardClock, casketTypeFromLines } from '@/lib/boardFormat'
import { ArrowLeft, Check, Clock } from 'lucide-react'
import { getCompanyName } from '@/lib/company'
import { BrandLogo } from '@/components/ui/BrandLogo'
import { shortLocationName } from '@/lib/company'

/**
 * Keeps everything on one screen: no scrolling down or sideways, however many cases or notes there are.
 * It shrinks the whole board just enough to fit (and lets text re-wrap wider as it shrinks), and re-checks
 * whenever something on the board changes, the TV is resized, or the list loads.
 */
export function FitToScreen({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const b = box.current, el = inner.current
    if (!b || !el) return
    let raf = 0
    const fit = () => {
      const W = b.clientWidth, H = b.clientHeight
      if (!W || !H) return
      let best = 0.2
      // From full size downwards, find the largest size where the board (re-wrapped to the wider space) fits.
      for (let sc = 1; sc >= 0.2; sc = Math.round((sc - 0.025) * 1000) / 1000) {
        el.style.width = `${W / sc}px`
        if (el.scrollHeight * sc <= H && el.scrollWidth * sc <= W + 1) { best = sc; break }
      }
      el.style.width = `${W / best}px`
      setScale((old) => (Math.abs(old - best) > 0.001 ? best : old))
    }
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit) }
    fit()
    const mo = new MutationObserver(schedule) // rows appear, notes load, statuses change
    mo.observe(el, { childList: true, subtree: true, characterData: true })
    window.addEventListener('resize', schedule)
    const tick = setInterval(schedule, 5000) // safety net
    return () => { mo.disconnect(); window.removeEventListener('resize', schedule); clearInterval(tick); cancelAnimationFrame(raf) }
  }, [])

  return (
    <div ref={box} className="flex-1 min-h-0 overflow-hidden p-4">
      <div ref={inner} style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  )
}

const LOC_COLORS = ['#34d399', '#fbbf24', '#38bdf8', '#c084fc', '#fb7185']
export const boardLocColors = (locations: { id: string; name: string }[]) => {
  const sorted = [...locations].sort((a, b) => a.name.localeCompare(b.name))
  return new Map(sorted.map((l, i) => [l.id, LOC_COLORS[i % LOC_COLORS.length]]))
}

/** The board itself. Used by the logged-in /board page and by a wall monitor's private /tv/<link> page. */
export function BoardView({ data, backTo }: { data: BoardData; backTo?: string }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  const colors = boardLocColors(data.locations)
  const locName = (id: string) => shortLocationName(data.locations.find((l) => l.id === id)?.name ?? '')
  const used = data.locations.filter((l) => data.rows.some((r) => r.locationId === l.id))
  const here = data.screen?.locationId ? shortLocationName(data.locations.find((l) => l.id === data.screen!.locationId)?.name ?? '') : ''

  return (
    <div className="h-screen overflow-hidden bg-[#1f2a1c] text-white flex flex-col">
      <div className="no-print flex items-center justify-between px-6 py-3 bg-black/20 gap-4">
        {backTo ? (
          <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm text-slate-300 hover:text-white"><ArrowLeft size={15} /> Back</Link>
        ) : <div className="text-sm text-slate-300 w-24">{here}</div>}
        <div className="flex items-center gap-3">
          <BrandLogo on="dark" className="h-8 w-auto" />
          <span className="font-display text-lg font-semibold tracking-wide">{getCompanyName()}</span>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-3 text-sm">
            {used.map((l) => (
              <span key={l.id} className="inline-flex items-center gap-1.5 text-slate-200">
                <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: colors.get(l.id) }} />{shortLocationName(l.name)}
              </span>
            ))}
          </div>
          <div className="text-sm text-slate-300 tabular-nums">{format(now, 'EEEE, MMMM d')} · {format(now, 'h:mm a')}</div>
        </div>
      </div>

      <FitToScreen>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-sm uppercase tracking-wide text-[#d9c78f] border-b-2 border-[#4d5f45]">
              <th className="py-3 px-3">Name</th>
              <th className="py-3 px-3">Visitation</th>
              <th className="py-3 px-3">Funeral Attendant</th>
              <th className="py-3 px-3">Service</th>
              <th className="py-3 px-3">Funeral Attendant</th>
              <th className="py-3 px-3">Disp.</th>
              <th className="py-3 px-3">Flowers</th>
              <th className="py-3 px-3">Birds</th>
              <th className="py-3 px-3">Escort</th>
              <th className="py-3 px-3">Casket</th>
              <th className="py-3 px-3">Special Requests</th>
            </tr>
          </thead>
          <tbody className="text-base">
            {data.rows.map((r) => (
              <BoardRow key={r.id} r={r} color={colors.get(r.locationId) ?? '#94a3b8'} loc={locName(r.locationId)} />
            ))}
          </tbody>
        </table>
        {data.rows.length === 0 && (
          <div className="text-center text-slate-400 py-20">No active cases right now.</div>
        )}
      </FitToScreen>
    </div>
  )
}

/** The logged-in /board page. Refreshes by itself every 20 seconds. */
export default function TvBoard() {
  const { currentUser } = useSession()
  const { data } = useQuery({ queryKey: ['board-data'], queryFn: loadBoardData, refetchInterval: 20_000 })
  if (!currentUser || !data) return null
  return <BoardView data={data} backTo="/" />
}

function OrderCell({ status }: { status: OrderState }) {
  if (status === 'confirmed') return <Check size={16} className="text-emerald-400" />
  if (status === 'ordered') return <Clock size={16} className="text-amber-400" />
  if (status === 'pending') return <span className="text-slate-400 text-xs">pending</span>
  return <span className="text-slate-500">—</span>
}

function BoardRow({ r, color, loc }: { r: BoardRowData; color: string; loc: string }) {
  const { visitation, service } = r
  const specialNotes = r.specials
  const serviceStart = r.serviceDate ?? service?.start
  return (
    <tr className="border-b border-white/10 hover:bg-white/5 [&>td]:!py-1.5" style={{ boxShadow: `inset 6px 0 0 ${color}` }}>
      <td className="py-3 px-3 pl-5 font-semibold whitespace-nowrap">
        <span className="inline-block h-2.5 w-2.5 rounded-full mr-2 align-middle" style={{ backgroundColor: r.color }} />
        {r.lastName}, {r.firstName}
        <span className="ml-2 align-middle inline-block text-[11px] font-semibold rounded px-1.5 py-0.5" style={{ color, border: `1px solid ${color}` }}>{loc}</span>
      </td>
      <td className="py-3 px-3 text-slate-200 whitespace-nowrap">
        {visitation ? <>{boardDay(visitation.start)} · {boardRange(visitation.start, visitation.end)}</> : '—'}
      </td>
      <td className="py-3 px-3 text-slate-200 text-sm">{visitation && visitation.staff.length > 0 ? visitation.staff.join(', ') : <span className="text-slate-500">—</span>}</td>
      <td className="py-3 px-3 text-slate-200 whitespace-nowrap">
        {serviceStart ? <>{boardDay(serviceStart)} · {boardClock(serviceStart)}</> : '—'}
      </td>
      <td className="py-3 px-3 text-slate-200 text-sm">{service && service.staff.length > 0 ? service.staff.join(', ') : <span className="text-slate-500">—</span>}</td>
      <td className="py-3 px-3 text-slate-100 font-semibold whitespace-nowrap">{r.boardDisp || <span className="text-slate-500 font-normal">—</span>}</td>
      <td className="py-3 px-3"><OrderCell status={r.flowers} /></td>
      <td className="py-3 px-3"><OrderCell status={r.birds} /></td>
      <td className="py-3 px-3"><OrderCell status={r.escort} /></td>
      <td className="py-3 px-3 text-slate-200">{(r.casketLines ? casketTypeFromLines(r.casketLines) : casketTypeFromLines(r.casket ? [r.casket] : [])) ?? '—'}</td>
      <td className="py-3 px-3 text-slate-300 text-sm min-w-[220px] break-words [overflow-wrap:anywhere]">
        {specialNotes.length > 0
          ? <ul className="space-y-1">{specialNotes.map((n, i) => <li key={i} className="leading-snug">{specialNotes.length > 1 ? '• ' : ''}{n}</li>)}</ul>
          : <span className="text-slate-500">—</span>}
      </td>
    </tr>
  )
}
