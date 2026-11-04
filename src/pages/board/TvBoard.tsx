import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useState, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useKeepAwake } from '@/lib/keepAwake'
import { useSession } from '@/context/SessionContext'
import { CUSTODY_STAGE_LABELS } from '@/types'
import { loadBoardData, type BoardData, type BoardRowData, type BoardEvent } from '@/lib/tvBoard'
import { format } from 'date-fns'
import { boardDay, boardRange, boardClock, casketTypeFromLines } from '@/lib/boardFormat'
import { boardSplit, boardEventsOf, extraState, FLOWERS_RE, BIRDS_RE, ESCORT_RE, type BoardExtra } from '@/lib/boardDisp'
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
  useKeepAwake()
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  const colors = boardLocColors(data.locations)
  const split = boardSplit(data.rows, now)
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
            {split.current.map((r) => (
              <BoardRow key={r.id} r={r} color={colors.get(r.locationId) ?? '#94a3b8'} loc={locName(r.locationId)} />
            ))}
            {split.waiting.length > 0 && (
              <>
                <tr>
                  <td colSpan={11} className="pt-6 pb-2 px-3">
                    <div className="flex items-center gap-3 rounded-md border border-amber-300/40 bg-amber-300/10 px-4 py-2 text-amber-200">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                      <span className="text-sm font-bold uppercase tracking-wider">Services complete — items still pending</span>
                      <span className="ml-auto text-xs font-semibold text-amber-200/80">{split.waiting.length} case{split.waiting.length === 1 ? '' : 's'}</span>
                    </div>
                  </td>
                </tr>
                {split.waiting.map((r) => (
                  <BoardRow key={r.id} r={r} waitingSince={split.doneAt.get(r)} color={colors.get(r.locationId) ?? '#94a3b8'} loc={locName(r.locationId)} />
                ))}
              </>
            )}
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

function ExtraCell({ state }: { state: BoardExtra }) {
  if (state === 'confirmed') return <span className="inline-flex items-center gap-1 font-semibold text-emerald-400"><Check size={16} /> Confirmed</span>
  if (state === 'yes') return <span className="inline-flex items-center gap-1 font-semibold text-amber-300"><Clock size={15} /> Yes</span>
  return <span className="text-slate-500">No</span>
}

function EventLine({ e, range }: { e: BoardEvent; range: boolean }) {
  const sub = [e.label, e.place].filter(Boolean).join(' · ')
  return (
    <div className="whitespace-nowrap">
      <div>{boardDay(e.start)} · {range ? boardRange(e.start, e.end) : boardClock(e.start)}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  )
}
const Staff = ({ e }: { e?: BoardEvent }) => (e && e.staff.length > 0 ? <>{e.staff.join(', ')}</> : <span className="text-slate-500">—</span>)

/** One case. Several visitations / services stack as lines under each other; the name, DISP, flowers ... span all of them. */
/** What the board says a finished case is waiting on, by where it is in the custody chain. */
const WAIT_TEXT: Record<string, string> = { crematory: 'At the crematory', ashes_received: 'Ashes received — release / pickup', cemetery_burial: 'Burial / cemetery', funeral_home: 'Cremation / shipping / burial', chapel_service: 'Cremation / shipping / burial', in_transit: 'In transit' }

function BoardRow({ r, color, loc, waitingSince }: { r: BoardRowData; color: string; loc: string; waitingSince?: string }) {
  // The calendar events when there are any; otherwise the visitation / service saved on the case itself.
  const { visits, services } = boardEventsOf(r)
  const wait = waitingSince ? (WAIT_TEXT[r.custodyStage ?? ''] ?? CUSTODY_STAGE_LABELS[r.custodyStage as keyof typeof CUSTODY_STAGE_LABELS] ?? 'Open') : ''
  const tint = waitingSince ? 'bg-amber-300/[0.09]' : ''
  const dim = waitingSince ? 'opacity-90' : ''
  const n = Math.max(1, visits.length, services.length)
  const specialNotes = r.specials
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const v = visits[i], sv = services[i]
        const last = i === n - 1
        return (
          <tr key={i} className={`${last ? 'border-b border-white/10' : ''} ${tint} ${dim} hover:bg-white/5 [&>td]:!py-1.5`}>
            {i === 0 && (
              <td rowSpan={n} className="py-3 px-3 pl-5 font-semibold whitespace-nowrap align-top border-b border-white/10" style={{ boxShadow: `inset 6px 0 0 ${color}` }}>
                <span className="inline-block h-2.5 w-2.5 rounded-full mr-2 align-middle" style={{ backgroundColor: r.color }} />
                {r.lastName}, {r.firstName}
                <span className="ml-2 align-middle inline-block text-[11px] font-semibold rounded px-1.5 py-0.5" style={{ color, border: `1px solid ${color}` }}>{loc}</span>
                {waitingSince && (
                  <div className="mt-1 text-xs font-semibold text-amber-300">
                    <span className="rounded bg-amber-300/20 px-1.5 py-0.5">Waiting: {wait}</span>
                    <span className="ml-2 font-normal text-amber-200/70">service done {boardDay(waitingSince)}</span>
                  </div>
                )}
              </td>
            )}
            <td className="py-3 px-3 text-slate-200 align-top">{v ? <EventLine e={v} range /> : i === 0 ? '—' : ''}</td>
            <td className="py-3 px-3 text-slate-200 text-sm align-top">{v || i === 0 ? <Staff e={v} /> : null}</td>
            <td className="py-3 px-3 text-slate-200 align-top">{sv ? <EventLine e={sv} range={false} /> : i === 0 ? '—' : ''}</td>
            <td className="py-3 px-3 text-slate-200 text-sm align-top">{sv || i === 0 ? <Staff e={sv} /> : null}</td>
            {i === 0 && (<>
              <td rowSpan={n} className="py-3 px-3 text-slate-100 font-semibold whitespace-nowrap align-top border-b border-white/10">{r.boardDisp || <span className="text-slate-500 font-normal">—</span>}</td>
              <td rowSpan={n} className="py-3 px-3 align-top border-b border-white/10"><ExtraCell state={extraState(r.boardFlowers, r.flowers, r.casketLines, FLOWERS_RE)} /></td>
              <td rowSpan={n} className="py-3 px-3 align-top border-b border-white/10"><ExtraCell state={extraState(r.boardBirds, r.birds, r.casketLines, BIRDS_RE)} /></td>
              <td rowSpan={n} className="py-3 px-3 align-top border-b border-white/10"><ExtraCell state={extraState(r.boardEscort, r.escort, r.casketLines, ESCORT_RE)} /></td>
              <td rowSpan={n} className="py-3 px-3 text-slate-200 align-top border-b border-white/10">{(r.casketLines ? casketTypeFromLines(r.casketLines) : casketTypeFromLines(r.casket ? [r.casket] : [])) ?? '—'}</td>
              <td rowSpan={n} className="py-3 px-3 text-slate-300 text-sm min-w-[220px] break-words [overflow-wrap:anywhere] align-top border-b border-white/10">
                {specialNotes.length > 0
                  ? <ul className="space-y-1">{specialNotes.map((x, k) => <li key={k} className="leading-snug">{specialNotes.length > 1 ? '• ' : ''}{x}</li>)}</ul>
                  : <span className="text-slate-500">—</span>}
              </td>
            </>)}
          </tr>
        )
      })}
    </>
  )
}
