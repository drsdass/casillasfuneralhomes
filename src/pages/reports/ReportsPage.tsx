import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'
import { Card, SectionHeading, formatCurrency } from '@/components/ui/Primitives'
import { canViewReports } from '@/lib/permissions'
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { DollarSign, FileText, TrendingUp, AlertCircle } from 'lucide-react'
import { ActivityPanel } from '@/components/activity/ActivityPanel'

const dispositionColors: Record<string, string> = {
  burial: '#3b4a35',
  cremation: '#b3925a',
  entombment: '#6b7f4f',
  donation: '#8b5e34',
  undetermined: '#94a3b8',
}

export default function ReportsPage() {
  const { currentUser, accessibleLocations } = useSession()

  const { data: cases = [] } = useQuery({ queryKey: ['cases', 'all'], queryFn: () => api.getCases() })
  const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: api.getContracts })
  const { data: locations = [] } = useQuery({ queryKey: ['locations'], queryFn: api.getLocations })

  if (!currentUser || !canViewReports(currentUser.role)) return null

  const accessibleIds = new Set(accessibleLocations.map((l) => l.id))
  const scopedCases = cases.filter((c) => accessibleIds.has(c.locationId))
  const scopedContracts = contracts.filter((ct) => accessibleIds.has(ct.locationId))

  const totalRevenue = scopedContracts.reduce((sum, ct) => sum + ct.total, 0)
  const outstandingBalance = scopedContracts.reduce((sum, ct) => sum + (ct.total - ct.amountPaid), 0)
  const avgInvoice = scopedContracts.length ? totalRevenue / scopedContracts.length : 0

  const revenueByLocation = locations
    .filter((l) => accessibleIds.has(l.id))
    .map((l) => ({
      name: l.name.split('—')[1]?.trim() ?? l.name,
      revenue: scopedContracts.filter((ct) => ct.locationId === l.id).reduce((sum, ct) => sum + ct.total, 0),
      cases: scopedCases.filter((c) => c.locationId === l.id).length,
    }))

  const dispositionCounts = scopedCases.reduce<Record<string, number>>((acc, c) => {
    acc[c.disposition] = (acc[c.disposition] ?? 0) + 1
    return acc
  }, {})
  const dispositionData = Object.entries(dispositionCounts).map(([name, value]) => ({ name, value }))

  const statusCounts = scopedCases.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1
    return acc
  }, {})
  const statusData = Object.entries(statusCounts).map(([name, value]) => ({
    name: name.replace(/_/g, ' '),
    value,
  }))

  return (
    <div className="grid grid-cols-[1fr_280px] gap-6 items-start">
    <div>
      <SectionHeading title="Reports" subtitle="Revenue, case volume, and location comparisons" />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><DollarSign size={18} /></div>
          <div>
            <div className="text-xl font-semibold">{formatCurrency(totalRevenue)}</div>
            <div className="text-xs text-slate-500">Total invoiced</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center"><AlertCircle size={18} /></div>
          <div>
            <div className="text-xl font-semibold">{formatCurrency(outstandingBalance)}</div>
            <div className="text-xs text-slate-500">Outstanding balance</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><TrendingUp size={18} /></div>
          <div>
            <div className="text-xl font-semibold">{formatCurrency(avgInvoice)}</div>
            <div className="text-xs text-slate-500">Average invoice</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><FileText size={18} /></div>
          <div>
            <div className="text-xl font-semibold">{scopedCases.length}</div>
            <div className="text-xs text-slate-500">Total cases</div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-5">
          <h3 className="text-sm font-medium text-slate-800 mb-4">Revenue by Location</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={revenueByLocation}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <Bar dataKey="revenue" fill="#3b4a35" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-medium text-slate-800 mb-4">Case Volume by Location</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={revenueByLocation}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="cases" fill="#b3925a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h3 className="text-sm font-medium text-slate-800 mb-4">Disposition Breakdown</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={dispositionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(entry) => entry.name}>
                {dispositionData.map((entry) => (
                  <Cell key={entry.name} fill={dispositionColors[entry.name] ?? '#94a3b8'} />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-medium text-slate-800 mb-4">Cases by Status</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={statusData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
              <Tooltip />
              <Bar dataKey="value" fill="#6b7f4f" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
    <ActivityPanel title="Recent Activity" />
    </div>
  )
}
