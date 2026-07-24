import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'
import { canViewAllLocations } from '@/lib/permissions'
import { Card, SectionHeading, CaseStatusBadge } from '@/components/ui/Primitives'
import { Link } from 'react-router-dom'
import { AlertCircle, CalendarClock, CheckCircle2, Clock, HeartHandshake } from 'lucide-react'
import { format, isToday, parseISO } from 'date-fns'
import { ActivityPanel } from '@/components/activity/ActivityPanel'
import { useLanguage } from '@/i18n/LanguageContext'

export default function Dashboard() {
  const { activeLocationId, accessibleLocations, currentUser } = useSession()
  const { t } = useLanguage()
  const isAllLocations = currentUser ? canViewAllLocations(currentUser.role) : false

  const { data: cases = [] } = useQuery({
    queryKey: ['cases', isAllLocations ? 'all' : activeLocationId],
    queryFn: () => api.getCases(isAllLocations ? undefined : activeLocationId),
  })
  const { data: events = [] } = useQuery({
    queryKey: ['events', isAllLocations ? 'all' : activeLocationId],
    queryFn: () => api.getCalendarEvents(isAllLocations ? undefined : activeLocationId),
  })
  const { data: families = [] } = useQuery({ queryKey: ['families'], queryFn: api.getFamilies })
  const { data: overdueTasks = [] } = useQuery({ queryKey: ['overdue-tasks'], queryFn: api.getOverdueTasks })

  if (!currentUser) return null

  const activeCases = cases.filter((c) => c.status !== 'completed')
  const openCount = activeCases.length
  const scheduledToday = events.filter((e) => isToday(parseISO(e.start)))
  const needsAttention = cases.filter((c) => c.status === 'first_call' || c.status === 'arrangement_pending')

  // A death anniversary in the next 30 days — the "reach out, don't let
  // them feel forgotten" idea. Looks across ALL cases (not just active
  // ones), since this matters most for cases from years past.
  const today = new Date()
  const upcomingAnniversaries = cases
    .filter((c) => c.decedent.dateOfDeath)
    .map((c) => {
      const dod = parseISO(c.decedent.dateOfDeath!)
      let anniversary = new Date(today.getFullYear(), dod.getMonth(), dod.getDate())
      if (anniversary < today) anniversary = new Date(today.getFullYear() + 1, dod.getMonth(), dod.getDate())
      const daysUntil = Math.round((anniversary.getTime() - today.getTime()) / 86_400_000)
      const yearsSince = anniversary.getFullYear() - dod.getFullYear()
      return { case: c, anniversary, daysUntil, yearsSince }
    })
    .filter((a) => a.daysUntil <= 30 && a.yearsSince > 0)
    .sort((a, b) => a.daysUntil - b.daysUntil)

  const locationName = (id: string) => accessibleLocations.find((l) => l.id === id)?.name ?? id

  return (
    <div className="grid grid-cols-[1fr_280px] gap-6 items-start">
    <div>
      <SectionHeading
        title={`${t('dashboard.welcomeBack')}, ${currentUser.name.split(' ')[0]}`}
        subtitle={isAllLocations ? `${t('dashboard.viewingAllLocations')} (${accessibleLocations.length})` : locationName(activeLocationId)}
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><Clock size={18} /></div>
          <div>
            <div className="text-2xl font-semibold">{openCount}</div>
            <div className="text-xs text-slate-500">{t('dashboard.activeCases')}</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><AlertCircle size={18} /></div>
          <div>
            <div className="text-2xl font-semibold">{needsAttention.length}</div>
            <div className="text-xs text-slate-500">{t('dashboard.needAttention')}</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><CalendarClock size={18} /></div>
          <div>
            <div className="text-2xl font-semibold">{scheduledToday.length}</div>
            <div className="text-xs text-slate-500">{t('dashboard.eventsToday')}</div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Whiteboard */}
        <Card className="lg:col-span-2 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-slate-800">{t('dashboard.caseWhiteboard')}</h2>
            <Link to="/cases" className="text-sm text-blue-600 hover:underline">{t('dashboard.viewAllCases')}</Link>
          </div>
          <div className="space-y-2">
            {activeCases.map((c) => (
              <Link
                to={`/cases/${c.id}`}
                key={c.id}
                className="flex items-center gap-3 rounded-md border border-slate-100 hover:border-slate-300 hover:bg-slate-50 px-3 py-2.5 transition"
              >
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900 truncate">
                    {c.decedent.firstName} {c.decedent.lastName}
                    <span className="text-slate-400 font-normal ml-2">{c.caseNumber}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {isAllLocations && `${locationName(c.locationId)} · `}
                    {t(`enums.dispositionType.${c.disposition}`)} {c.serviceDate && `· ${format(parseISO(c.serviceDate), 'MMM d, h:mm a')}`}
                  </div>
                </div>
                <CaseStatusBadge status={c.status} />
              </Link>
            ))}
            {activeCases.length === 0 && (
              <div className="text-sm text-slate-400 py-8 text-center">{t('dashboard.noActiveCases')}</div>
            )}
          </div>
        </Card>

        {/* Today's schedule */}
        <Card className="p-4">
          <h2 className="font-medium text-slate-800 mb-3">{t('dashboard.todaysSchedule')}</h2>
          <div className="space-y-3">
            {scheduledToday.length === 0 && (
              <div className="text-sm text-slate-400 py-4 text-center">{t('dashboard.nothingScheduledToday')}</div>
            )}
            {scheduledToday
              .sort((a, b) => a.start.localeCompare(b.start))
              .map((e) => (
                <div key={e.id} className="flex gap-3 text-sm">
                  <div className="w-16 shrink-0 text-slate-500">{format(parseISO(e.start), 'h:mm a')}</div>
                  <div>
                    <div className="font-medium text-slate-800">{e.title}</div>
                    <div className="text-xs text-slate-500 capitalize">{t(`enums.eventType.${e.type}`)} {e.location && `· ${e.location}`}</div>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      </div>

      {/* Needs attention */}
      {needsAttention.length > 0 && (
        <Card className="mt-6 p-4">
          <h2 className="font-medium text-slate-800 mb-3 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-amber-500" /> {t('dashboard.needsAttention')}
          </h2>
          <div className="space-y-2">
            {needsAttention.map((c) => (
              <Link to={`/cases/${c.id}`} key={c.id} className="flex items-center justify-between text-sm px-3 py-2 rounded-md hover:bg-slate-50">
                <span>{c.decedent.firstName} {c.decedent.lastName} — {c.caseNumber}</span>
                <CaseStatusBadge status={c.status} />
              </Link>
            ))}
          </div>
        </Card>
      )}

      {overdueTasks.length > 0 && (
        <Card className="mt-6 p-4 border-red-200 bg-red-50">
          <h2 className="font-medium text-red-800 mb-1 flex items-center gap-2">
            <AlertCircle size={16} className="text-red-600" /> Pending Tasks — Past Due
          </h2>
          <p className="text-xs text-red-500 mb-3">Tasks still incomplete after their due date.</p>
          <div className="space-y-2">
            {overdueTasks.map((task) => (
              <Link to={`/cases/${task.caseId}`} key={task.id} className="flex items-center justify-between text-sm px-3 py-2 rounded-md bg-white hover:bg-red-50/50 border border-red-100">
                <span>
                  <span className="font-medium text-slate-800">{task.label}</span>
                  <span className="text-slate-400 ml-2">{task.decedentName} — {task.caseNumber}</span>
                </span>
                <span className="text-xs text-red-600">Due {task.dueDate}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {upcomingAnniversaries.length > 0 && (
        <Card className="mt-6 p-4">
          <h2 className="font-medium text-slate-800 mb-1 flex items-center gap-2">
            <HeartHandshake size={16} className="text-[#b3925a]" /> {t('dashboard.upcomingAnniversaries')}
          </h2>
          <p className="text-xs text-slate-400 mb-3">{t('dashboard.anniversariesSubtitle')}</p>
          <div className="space-y-2">
            {upcomingAnniversaries.map(({ case: c, anniversary, yearsSince }) => {
              const family = families.find((f) => f.id === c.familyId)
              return (
                <Link
                  key={c.id}
                  to={family ? `/families/${family.id}` : `/cases/${c.id}`}
                  className="flex items-center justify-between text-sm px-3 py-2 rounded-md hover:bg-slate-50"
                >
                  <span>
                    {family?.name ?? `${c.decedent.firstName} ${c.decedent.lastName}`}
                    <span className="text-slate-400 ml-2">{yearsSince} {yearsSince !== 1 ? t('dashboard.years') : t('dashboard.year')}</span>
                  </span>
                  <span className="text-xs text-slate-400">{format(anniversary, 'MMM d')}</span>
                </Link>
              )
            })}
          </div>
        </Card>
      )}
    </div>
    <ActivityPanel title={t('dashboard.recentActivity')} />
    </div>
  )
}
