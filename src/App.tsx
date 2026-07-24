import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from '@/context/SessionContext'
import { LanguageProvider } from '@/i18n/LanguageContext'
import AppShell from '@/components/layout/AppShell'
import RequireAuth from '@/components/layout/RequireAuth'
import LoginPage from '@/pages/auth/LoginPage'
import Dashboard from '@/pages/Dashboard'
import CaseList from '@/pages/cases/CaseList'
import CaseForm from '@/pages/cases/CaseForm'
import FirstCallIntake from '@/pages/cases/FirstCallIntake'
import VitalSheetIntake from '@/pages/cases/VitalSheetIntake'
import SlideshowPlayer from '@/pages/cases/SlideshowPlayer'
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
import AdminPage from '@/pages/admin/AdminPage'
import FamilyPortal from '@/pages/family/FamilyPortal'
import TvBoard from '@/pages/board/TvBoard'

// Code-split: recharts is a heavy dependency only needed by manager+ roles
// viewing the Reports page, so it shouldn't bloat everyone else's initial load.
const ReportsPage = lazy(() => import('@/pages/reports/ReportsPage'))

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes — no staff auth */}
            <Route path="/login" element={<LoginPage />} />
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

            {/* Staff-facing app, behind auth */}
            <Route element={<RequireAuth />}>
              {/* Full-screen, no sidebar — meant for a TV/monitor, not staff browsing */}
              <Route path="/board" element={<TvBoard />} />

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
                <Route path="/cases/:caseId/first-call" element={<FirstCallIntake />} />
                <Route path="/cases/:caseId/vital-sheet" element={<VitalSheetIntake />} />
                <Route path="/cases/:caseId/slideshow" element={<SlideshowPlayer />} />
                <Route path="/cases/new" element={<CaseForm />} />
                <Route path="/cases/:caseId/edit" element={<CaseForm />} />
                <Route path="/cases/:caseId" element={<CaseDetail />} />
                <Route path="/custody" element={<CustodyBoard />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/staff-schedule" element={<StaffSchedule />} />
                <Route path="/messages" element={<Messages />} />
                <Route path="/families" element={<FamiliesList />} />
                <Route path="/families/:familyId" element={<FamilyDetail />} />
                <Route path="/calendar/new" element={<EventForm />} />
                <Route path="/calendar/:eventId/edit" element={<EventForm />} />
                <Route path="/inbox" element={<EmailInbox />} />
                <Route path="/financials" element={<FinancialsPage />} />
                <Route path="/invoices" element={<InvoicesPage />} />
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
          </Routes>
        </BrowserRouter>
      </SessionProvider>
    </QueryClientProvider>
  )
}
