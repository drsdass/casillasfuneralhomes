import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FolderKanban, CalendarDays, Receipt,
  Settings, Building2, ChevronDown, Truck, LogOut, BarChart3, Tv, Mail, Users, MessageCircle,
  Volume2, VolumeX, X, Users2, MapPin,
} from 'lucide-react'
import { useSession } from '@/context/SessionContext'
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { visibleNavKeys } from '@/lib/permissions'
import { ROLE_LABELS } from '@/types'
import { playMessageChime, isMessageSoundEnabled, setMessageSoundEnabled } from '@/lib/notificationSound'
import { LanguageToggle } from '@/components/layout/LanguageToggle'
import { useLanguage } from '@/i18n/LanguageContext'

const allNavItems = [
  { key: 'dashboard', to: '/', label: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { key: 'cases', to: '/cases', label: 'nav.cases', icon: FolderKanban, end: false },
  { key: 'families', to: '/families', label: 'nav.families', icon: Users2, end: false },
  { key: 'custody', to: '/custody', label: 'nav.custody', icon: Truck, end: false },
  { key: 'calendar', to: '/calendar', label: 'nav.calendar', icon: CalendarDays, end: false },
  { key: 'staff-schedule', to: '/staff-schedule', label: 'nav.staffSchedule', icon: Users, end: false },
  { key: 'messages', to: '/messages', label: 'nav.messages', icon: MessageCircle, end: false },
  { key: 'inbox', to: '/inbox', label: 'nav.inbox', icon: Mail, end: false },
  { key: 'financials', to: '/financials', label: 'nav.financials', icon: Receipt, end: false },
  { key: 'reports', to: '/reports', label: 'nav.reports', icon: BarChart3, end: false },
  { key: 'board', to: '/board', label: 'nav.board', icon: Tv, end: false },
  { key: 'admin', to: '/admin', label: 'nav.admin', icon: Settings, end: false },
  { key: 'invoices', to: '/invoices', label: 'nav.invoices', icon: Receipt, end: false },
]

export default function AppShell() {
  const { currentUser, activeLocationId, setActiveLocationId, accessibleLocations, logout } = useSession()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [soundOn, setSoundOn] = useState(isMessageSoundEnabled())
  const [toast, setToast] = useState<{ senderName: string; body: string } | null>(null)

  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations', currentUser?.id],
    queryFn: () => api.getConversations(currentUser!.id),
    enabled: !!currentUser,
  })
  const { data: allStaff = [] } = useQuery({ queryKey: ['staff'], queryFn: api.getStaff, enabled: !!currentUser })
  const unreadCount = conversations.reduce((sum, c) => sum + c.unreadCount, 0)

  // Ask once for OS-level notification permission — this is what lets a
  // message reach someone even when they're in a different browser tab or
  // app entirely, not just this one. The in-app toast below works
  // regardless of whether permission is ever granted.
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Keeps the sidebar badge live even when the user isn't on the Messages
  // page, and is also where the pop-up + chime + OS notification actually
  // fire from — this runs everywhere in the app, not just on /messages.
  useEffect(() => {
    if (!currentUser) return
    const unsubscribe = api.subscribeToMessages(currentUser.id, (newMessage) => {
      queryClient.invalidateQueries({ queryKey: ['conversations', currentUser.id] })
      queryClient.invalidateQueries({ queryKey: ['conversation-messages'] })

      // Only notify for a conversation I'm actually part of, and not for
      // my own outgoing messages echoing back through the subscription
      // (it has no server-side filter — see subscribeToMessages).
      if (!newMessage || newMessage.senderId === currentUser.id) return
      const inMyConversation = conversations.some((c) => c.id === newMessage.conversationId)
      if (!inMyConversation) return

      const sender = allStaff.find((s) => s.id === newMessage.senderId)
      const senderName = sender?.name ?? t('common.someone')

      playMessageChime() // no-ops internally if the user has muted it

      // Always show the in-app toast — this is the "pop up should always
      // do something" part, regardless of OS notification permission.
      setToast({ senderName, body: newMessage.body })
      setTimeout(() => setToast(null), 6000)

      // Layer an OS-level notification on top when we can — reaches
      // someone even if this tab isn't the one they're looking at.
      if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
        new Notification(t('common.newMessageFrom', { name: senderName }), { body: newMessage.body, icon: '/casillas-logo.png' })
      }
    })
    return unsubscribe
  }, [currentUser, queryClient, allStaff, conversations])

  if (!currentUser) return null // RequireAuth guarantees this won't render, but keeps TS happy

  const navItems = allNavItems.filter((item) => visibleNavKeys(currentUser).includes(item.key))
  const activeLocation = accessibleLocations.find((l) => l.id === activeLocationId)

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-[#3b4a35] text-slate-100 flex flex-col">
        <div className="px-5 py-5 border-b border-white/10 flex items-center gap-3">
          <img src="/casillas-logo.png" alt="Casillas Funeral Home" className="h-10 w-auto shrink-0 brightness-0 invert opacity-90" />
          <div>
            <div className="text-lg font-display font-semibold tracking-tight">Casillas OS</div>
            <div className="text-xs text-slate-300">Casillas Funeral Home</div>
          </div>
        </div>

        {/* Location switcher */}
        {accessibleLocations.length > 0 && (
          <div className="relative px-3 py-3 border-b border-white/10">
            <button
              onClick={() => setSwitcherOpen((s) => !s)}
              className="w-full flex items-center justify-between gap-2 rounded-md bg-white/5 hover:bg-white/10 px-3 py-2 text-sm transition"
            >
              <span className="flex items-center gap-2 truncate">
                <Building2 size={16} className="shrink-0 text-slate-300" />
                <span className="truncate">{activeLocation?.name ?? 'Select location'}</span>
              </span>
              <ChevronDown size={14} className="shrink-0 text-slate-400" />
            </button>
            {switcherOpen && (
              <div className="absolute left-3 right-3 mt-1 rounded-md bg-white text-slate-800 shadow-lg overflow-hidden z-20">
                {accessibleLocations.map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => { setActiveLocationId(loc.id); setSwitcherOpen(false) }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-100 ${loc.id === activeLocationId ? 'bg-slate-100 font-medium' : ''}`}
                  >
                    {loc.name}
                    <div className="text-xs text-slate-400">{loc.city}, {loc.state}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map(({ key, to, label, icon: Icon, end }) => (
            <NavLink
              key={key}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                  isActive ? 'bg-[#b3925a] text-[#2b3327] font-medium' : 'text-slate-200 hover:bg-white/10'
                }`
              }
            >
              <Icon size={17} />
              <span className="flex-1">{t(label)}</span>
              {key === 'messages' && unreadCount > 0 && (
                <span className="text-[10px] font-semibold bg-red-500 text-white rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="px-3 py-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
              style={{ backgroundColor: currentUser.avatarColor ?? '#b3925a' }}
            >
              {currentUser.name.split(' ').map((n) => n[0]).join('')}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{currentUser.name}</div>
              <div className="text-xs text-slate-400 truncate">{ROLE_LABELS[currentUser.role]}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 text-xs text-slate-300 hover:text-white hover:bg-white/10 rounded-md px-2 py-1.5 transition"
          >
            <LogOut size={13} /> {t('nav.logout')}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-slate-200 bg-white flex items-center px-6 justify-between">
          <div className="text-sm text-slate-500">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://www.icloud.com/find"
              target="_blank"
              rel="noopener noreferrer"
              title="Track vehicles (opens Apple Find My — logs in with whatever Apple ID this browser is already signed into, same as any bookmark)"
              className="text-slate-400 hover:text-slate-600 transition"
            >
              <MapPin size={16} />
            </a>
            <button
              onClick={() => { const next = !soundOn; setSoundOn(next); setMessageSoundEnabled(next) }}
              title={soundOn ? 'Message sound on — click to mute' : 'Message sound muted — click to unmute'}
              className="text-slate-400 hover:text-slate-600 transition"
            >
              {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <LanguageToggle variant="dark" />
            {accessibleLocations.length > 0 && (
              <div className="text-sm text-slate-500">
                {accessibleLocations.length} {t('nav.locationsAccessible')}
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>

      {toast && (
        <button
          onClick={() => { navigate('/messages'); setToast(null) }}
          className="fixed bottom-5 right-5 z-50 w-80 bg-white border border-slate-200 shadow-lg rounded-lg px-4 py-3 flex items-start gap-3 text-left hover:shadow-xl transition"
        >
          <div className="h-8 w-8 rounded-full bg-[#3b4a35]/10 text-[#3b4a35] flex items-center justify-center shrink-0">
            <MessageCircle size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-slate-800">{toast.senderName}</div>
            <div className="text-sm text-slate-500 truncate">{toast.body}</div>
          </div>
          <span
            onClick={(e) => { e.stopPropagation(); setToast(null) }}
            className="text-slate-300 hover:text-slate-500 shrink-0"
          >
            <X size={14} />
          </span>
        </button>
      )}
    </div>
  )
}
