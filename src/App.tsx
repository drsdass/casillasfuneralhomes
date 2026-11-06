import { lazy, Suspense } from 'react'
import SignPage from '@/pages/sign/SignPage'
import DriverView from '@/pages/driver/DriverView'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query'
import LiveSync from '@/components/layout/LiveSync'
import { SessionProvider } from '@/context/SessionContext'
import { LanguageProvider } from '@/i18n/LanguageContext'
import { EasyViewProvider } from '@/context/EasyViewContext'
import AppShell from '@/components/layout/AppShell'
import RequireAuth from '@/components/layout/RequireAuth'
import LoginPage from '@/pages/auth/LoginPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'
import Dashboard from '@/pages/Dashboard'
import CaseList from '@/pages/cases/CaseList'
import CaseForm from '@/pages/cases/CaseForm'
import FirstCallIntake from '@/pages/cases/FirstCallIntake'
import VitalSheetIntake from '@/pages/cases/VitalSheetIntake'
import SlideshowPlayer from '@/pages/cases/SlideshowPlayer'
import EdrsEntry from '@/pages/cases/EdrsEntry'
import UploadToCreate from '@/pages/cases/UploadToCreate'
import CaseDetail from '@/pages/cases/CaseDetail'
import CustodyBoard from '@/pages/custody/CustodyBoard'
import CalendarPage from '@/pages/calendar/CalendarPage'
import StaffSchedule from '@/pages/staff/StaffSchedule'
import Messages from '@/pages/messages/Messages'
import FamiliesList from '@/pages/families/FamiliesList'
import FamilyDetail from '@/pages/families/FamilyDetail'
import EventForm from '@/pages/calendar/EventForm'
import EmailInbox from '@/pages/inbox/EmailInbox'
import FinancialsPage from '@/pages/financials/FinancialsPage'
import InvoicesPage from '@/pages/financials/InvoicesPage'
import QuickQuotes from '@/pages/quotes/QuickQuotes'
import AdminPage from '@/pages/admin/AdminPage'
import FamilyPortal from '@/pages/family/FamilyPortal'
import TvBoard from '@/pages/board/TvBoard'
import TvScreenPage from '@/pages/board/TvScreenPage'
import { PublicObituaries, PublicObituaryPage } from '@/pages/obituaries/PublicObituaries'
import ObituaryManager from '@/pages/obituaries/ObituaryManager'
import { PublicEvents } from '@/pages/events/PublicEvents'
import EventsManager from '@/pages/events/EventsManager'
import CaseGuide from '@/pages/cases/CaseGuide'
import ChapelPlayerPage from '@/pages/player/ChapelPlayerPage'
import ChapelTvPage from '@/pages/player/ChapelTvPage'
import ServiceRoom from '@/pages/service/ServiceRoom'
import WatchPage from '@/pages/service/WatchPage'
import RemotePage from '@/pages/service/RemotePage'
import MusicPage from '@/pages/music/MusicPage'

// Code-split: recharts is a heavy dependency only needed by manager+ roles
// viewing the Reports page, so it shouldn't bloat everyone else's initial load.
const ReportsPage = lazy(() => import('@/pages/reports/ReportsPage'))

// Any successful save, anywhere, refreshes every screen that is open - so a change made on one
// tab (status, dates, orders, notes...) shows up everywhere for that case without a manual reload.
const queryClient: QueryClient = new QueryClient({
  mutationCache: new MutationCache({ onSuccess: () => { void queryClient.invalidateQueries() } }),
  defaultOptions: { queries: { refetchOnWindowFocus: true, refetchOnReconnect: true, staleTime: 5_000 } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LiveSync />
      <SessionProvider>
        <EasyViewProvider>
        <BrowserRouter>
          <ErrorBoundary>
          <Routes>
            {/* Public routes — no staff auth */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route
              path="/portal/:token"
              element={
                // A family's language choice has nothing to do with any
                // staff member's — separate provider, separate storage key,
                // so the two never bleed into each other.
                <LanguageProvider storageKey="casillas_os_family_language">
                  <FamilyPortal />
                </LanguageProvider>
              }
            />

            <Route path="/watch/:token" element={<WatchPage />} />
            <Route path="/remote/:token" element={<RemotePage />} />
            <Route path="/tv/:token" element={<TvScreenPage />} />
            <Route path="/sign/:token" element={<SignPage />} />
            <Route path="/obituaries" element={<PublicObituaries />} />
            <Route path="/events" element={<PublicEvents />} />
            <Route path="/obituaries/:slug" element={<PublicObituaryPage />} />

            {/* Staff-facing app, behind auth */}
            <Route element={<RequireAuth />}>
              {/* Full-screen, no sidebar — meant for a TV/monitor, not staff browsing */}
              <Route path="/board" element={<TvBoard />} />
              <Route path="/player" element={<ChapelPlayerPage />} />

              <Route
                element={
                  <LanguageProvider>
                    <AppShell />
                  </LanguageProvider>
                }
              >
                <Route path="/" element={<Dashboard />} />
                <Route path="/cases" element={<CaseList />} />
                <Route path="/cases/upload" element={<UploadToCreate />} />
                <Route path="/cases/first-call" element={<FirstCallIntake />} />
                <Route path="/cases/:caseId/guide" element={<CaseGuide />} />
                <Route path="/cases/:caseId/first-call" element={<FirstCallIntake />} />
                <Route path="/cases/:caseId/vital-sheet" element={<VitalSheetIntake />} />
                <Route path="/cases/:caseId/edrs" element={<EdrsEntry />} />
                <Route path="/cases/:caseId/slideshow" element={<SlideshowPlayer />} />
                <Route path="/cases/:caseId/service" element={<ServiceRoom />} />
                <Route path="/cases/new" element={<CaseForm />} />
                <Route path="/cases/:caseId/edit" element={<CaseForm />} />
                <Route path="/cases/:caseId" element={<CaseDetail />} />
                <Route path="/custody" element={<CustodyBoard />} />
                <Route path="/driver" element={<DriverView />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/music" element={<MusicPage />} />
                <Route path="/chapel-tv" element={<ChapelTvPage />} />
                <Route path="/obituary-manager" element={<ObituaryManager />} />
                <Route path="/site-events" element={<EventsManager />} />
                <Route path="/staff-schedule" element={<StaffSchedule />} />
                <Route path="/messages" element={<Messages />} />
                <Route path="/families" element={<FamiliesList />} />
                <Route path="/families/:familyId" element={<FamilyDetail />} />
                <Route path="/calendar/new" element={<EventForm />} />
                <Route path="/calendar/:eventId/edit" element={<EventForm />} />
                <Route path="/inbox" element={<EmailInbox />} />
                <Route path="/financials" element={<FinancialsPage />} />
                <Route path="/invoices" element={<InvoicesPage />} />
                <Route path="/quotes" element={<QuickQuotes />} />
                <Route
                  path="/reports"
                  element={
                    <Suspense fallback={<div className="text-slate-400 text-sm">Loading reports…</div>}>
                      <ReportsPage />
                    </Suspense>
                  }
                />
                <Route path="/admin" element={<AdminPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </ErrorBoundary>
        </BrowserRouter>
        </EasyViewProvider>
      </SessionProvider>
    </QueryClientProvider>
  )
}
