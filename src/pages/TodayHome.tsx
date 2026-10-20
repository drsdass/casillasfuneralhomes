import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, isToday, parseISO } from 'date-fns'
import { Phone, Search, Truck, CalendarClock, FolderOpen, GraduationCap } from 'lucide-react'
import { useSession } from '@/context/SessionContext'
import { useLanguage } from '@/i18n/LanguageContext'
import { api } from '@/lib/api'
import { canViewAllLocations } from '@/lib/permissions'
import { Card, CaseStatusBadge } from '@/components/ui/Primitives'
import { FirstDayTour } from '@/components/ui/FirstDayTour'
import { isCaseDone } from '@/lib/caseDone'

/** The Easy view home: a few big buttons and what needs attention today — nothing else. */
export default function TodayHome() {
  const { currentUser, activeLocationId } = useSession()
  const { language } = useLanguage()
  const tx = (en: string, es: string) => (language === 'es' ? es : en)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [practiceMsg, setPracticeMsg] = useState<string | null>(null)
  // The tour opens by itself the first time a person sees this page, then only when they ask for it.
  const tourKey = `casillas_tour_seen_${currentUser?.id ?? ''}`
  const [tour, setTour] = useState(() => { try { return !!currentUser && localStorage.getItem(tourKey) !== '1' } catch { return false } })
  const closeTour = () => { setTour(false); try { localStorage.setItem(tourKey, '1') } catch { /* ignore */ } }
  const all = currentUser ? canViewAllLocations(currentUser.role) : false

  const { data: cases = [] } = useQuery({ queryKey: ['cases', all ? 'all' : activeLocationId], queryFn: () => api.getCases(all ? undefined : activeLocationId) })
  const { data: events = [] } = useQuery({ queryKey: ['events', all ? 'all' : activeLocationId], queryFn: () => api.getCalendarEvents(all ? undefined : activeLocationId) })

  const makePractice = useMutation({
    mutationFn: () => api.createCase({
      orgId: currentUser!.orgId, locationId: activeLocationId,
      caseNumber: `PRACTICE-${Date.now().toString().slice(-5)}`,
      type: 'at_need', status: 'first_call', disposition: 'undetermined',
      decedent: { firstName: 'Practice', lastName: 'Sample' }, contacts: [], custodyStage: 'scene_first_call',
    }, currentUser!),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ['cases'] }); navigate(`/cases/${c.id}`) },
    onError: (e) => setPracticeMsg((e as Error).message),
  })
  const clearPractice = useMutation({
    mutationFn: async () => {
      const mine = cases.filter((c) => c.caseNumber.startsWith('PRACTICE-'))
      for (const c of mine) await api.deletePracticeCase(c.id)
      return mine.length
    },
    onSuccess: (n) => { qc.invalidateQueries({ queryKey: ['cases'] }); setPracticeMsg(n ? tx(`Removed ${n} practice case(s).`, `Se eliminaron ${n} caso(s) de práctica.`) : tx('No practice cases to remove.', 'No hay casos de práctica.')) },
    onError: (e) => setPracticeMsg((e as Error).message),
  })

  if (!currentUser) return null
  const hour = new Date().getHours()
  const greeting = hour < 12 ? tx('Good morning', 'Buenos días') : hour < 18 ? tx('Good afternoon', 'Buenas tardes') : tx('Good evening', 'Buenas noches')
  const open = cases.filter((c) => !isCaseDone(c))
  const mine = open.filter((c) => c.assignedDirectorId === currentUser.id || c.assignedEmbalmerId === currentUser.id)
  const list = (mine.length ? mine : open).slice(0, 8)
  const today = events.filter((e) => isToday(parseISO(e.start))).sort((a, b) => a.start.localeCompare(b.start))
  const big = 'flex flex-col items-center justify-center gap-2 rounded-xl border-2 px-4 py-6 text-center text-lg font-semibold transition'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {tour && <FirstDayTour onClose={closeTour} onPractice={() => makePractice.mutate()} />}
      <div>
        <h1 className="text-3xl font-display font-semibold text-slate-900">{greeting}, {currentUser.name.split(' ')[0]}</h1>
        <p className="text-slate-500 mt-1">{format(new Date(), 'EEEE, MMMM d')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link to="/cases/first-call" className={`${big} border-[#3b4a35] bg-[#3b4a35] text-white hover:bg-[#4d5f45]`}>
          <Phone size={30} /> {tx('New First Call', 'Nueva llamada')}
        </Link>
        <Link to="/cases" className={`${big} border-slate-300 bg-white text-slate-800 hover:border-slate-500`}>
          <Search size={30} /> {tx('Find a case', 'Buscar un caso')}
        </Link>
        <Link to="/custody" className={`${big} border-slate-300 bg-white text-slate-800 hover:border-slate-500`}>
          <Truck size={30} /> {tx('Chain of Custody', 'Cadena de custodia')}
        </Link>
      </div>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 mb-3"><CalendarClock size={20} /> {tx("Today's services", 'Servicios de hoy')}</h2>
        {today.length === 0
          ? <p className="text-slate-500 py-2">{tx('Nothing scheduled today.', 'Nada programado hoy.')}</p>
          : <div className="space-y-2">{today.map((e) => (
              <div key={e.id} className="flex gap-4 text-base">
                <div className="w-24 shrink-0 text-slate-500">{format(parseISO(e.start), 'h:mm a')}</div>
                <div><span className="font-medium text-slate-900">{e.title}</span>{e.location && <span className="text-slate-500"> · {e.location}</span>}</div>
              </div>))}</div>}
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 mb-3"><FolderOpen size={20} /> {mine.length ? tx('Your open cases', 'Sus casos abiertos') : tx('Open cases', 'Casos abiertos')}</h2>
        <div className="space-y-2">
          {list.map((c) => (
            <Link key={c.id} to={`/cases/${c.id}`} className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 hover:border-slate-400 hover:bg-slate-50">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-900 truncate">{c.decedent.firstName} {c.decedent.lastName}
                  {c.caseNumber.startsWith('PRACTICE-') && <span className="ml-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">{tx('PRACTICE', 'PRÁCTICA')}</span>}
                </div>
                <div className="text-sm text-slate-500">{c.caseNumber}{c.serviceDate && ` · ${format(parseISO(c.serviceDate), 'MMM d, h:mm a')}`}</div>
              </div>
              <CaseStatusBadge status={c.status} />
            </Link>))}
          {list.length === 0 && <p className="text-slate-500 py-2">{tx('No open cases.', 'No hay casos abiertos.')}</p>}
          {open.length > list.length && <Link to="/cases" className="block text-center text-[#3b4a35] font-medium pt-2 hover:underline">{tx(`See all ${open.length} cases`, `Ver los ${open.length} casos`)}</Link>}
        </div>
      </Card>

      <Card className="p-5 bg-amber-50/50 border-amber-200">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 mb-1"><GraduationCap size={20} /> {tx('Practice', 'Práctica')}</h2>
        <p className="text-slate-600 mb-3">{tx('Want to try things without worrying? Make a practice case, click around, and delete it when you are done. It never affects a real family.', '¿Quiere probar sin preocuparse? Cree un caso de práctica, explore y bórrelo cuando termine. Nunca afecta a una familia real.')}</p>
        <div className="flex gap-3 flex-wrap">
          <button className="rounded-lg border border-[#3b4a35] bg-white text-[#3b4a35] px-4 py-2 font-medium" onClick={() => setTour(true)}>{tx('Take the 2-minute tour', 'Hacer el recorrido de 2 minutos')}</button>
          <button className="rounded-lg bg-slate-900 text-white px-4 py-2 font-medium disabled:opacity-50" disabled={makePractice.isPending} onClick={() => makePractice.mutate()}>{tx('Make a practice case', 'Crear caso de práctica')}</button>
          <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium disabled:opacity-50" disabled={clearPractice.isPending} onClick={() => { if (confirm(tx('Delete all practice cases? Real cases are never touched.', '¿Borrar todos los casos de práctica? Los casos reales no se tocan.'))) clearPractice.mutate() }}>{tx('Delete practice cases', 'Borrar casos de práctica')}</button>
        </div>
        {practiceMsg && <p className="text-sm text-slate-600 mt-2">{practiceMsg}</p>}
      </Card>
    </div>
  )
}
