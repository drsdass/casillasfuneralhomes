import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { Card, SectionHeading } from '@/components/ui/Primitives'
import { Search, Users, Phone } from 'lucide-react'
import { ActivityPanel } from '@/components/activity/ActivityPanel'

export default function FamiliesList() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const { data: families = [] } = useQuery({ queryKey: ['families'], queryFn: api.getFamilies })

  const filtered = families.filter((f) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return f.name.toLowerCase().includes(q) || f.primaryContactName?.toLowerCase().includes(q) || f.primaryContactPhone?.includes(q)
  })

  return (
    <div className="grid grid-cols-[1fr_280px] gap-6 items-start">
    <div>
      <SectionHeading
        title="Families"
        subtitle={`${families.length} famil${families.length === 1 ? 'y' : 'ies'} served — every case they've ever had with you, in one place`}
      />

      <div className="relative max-w-md mb-5">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by family name, contact, or phone…"
          className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]"
        />
      </div>

      <Card className="divide-y divide-slate-50">
        {filtered.map((f) => (
          <button
            key={f.id}
            onClick={() => navigate(`/families/${f.id}`)}
            className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition"
          >
            <div className="h-9 w-9 rounded-full bg-[#3b4a35]/10 text-[#3b4a35] flex items-center justify-center shrink-0">
              <Users size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-900">{f.name}</div>
              <div className="text-xs text-slate-500 flex items-center gap-3">
                {f.primaryContactName && <span>{f.primaryContactName}</span>}
                {f.primaryContactPhone && <span className="flex items-center gap-1"><Phone size={11} /> {f.primaryContactPhone}</span>}
              </div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="text-sm text-slate-400 text-center py-16">
            {families.length === 0 ? 'No families yet — link a case to a family to get started.' : 'No matches.'}
          </div>
        )}
      </Card>
    </div>
    <ActivityPanel entityType="family" title="Family Activity" />
    </div>
  )
}
