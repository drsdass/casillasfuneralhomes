import { MapPin } from 'lucide-react'
import { useSession } from '@/context/SessionContext'

/**
 * "Which location is this case for?" — big, obvious buttons so it is never chosen by accident.
 * Value '' means nothing chosen yet (the form should block saving until something is picked).
 */
export function LocationPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { accessibleLocations } = useSession()
  if (accessibleLocations.length === 0) return null
  return (
    <div className={`rounded-lg border-2 p-3 ${value ? 'border-emerald-300 bg-emerald-50/50' : 'border-amber-400 bg-amber-50'}`}>
      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 mb-2">
        <MapPin size={15} /> Which location is this case for? {!value && <span className="text-amber-700 font-medium">(please choose one)</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {accessibleLocations.map((l) => (
          <button key={l.id} type="button" onClick={() => onChange(l.id)}
            className={`text-sm rounded-md border px-3.5 py-2 text-left ${value === l.id ? 'bg-[#3b4a35] text-white border-[#3b4a35] font-semibold' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>
            {l.name}{l.city ? <span className={`block text-xs ${value === l.id ? 'text-white/80' : 'text-slate-400'}`}>{l.city}, {l.state}</span> : null}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Pre-select only when there is exactly one choice; otherwise make the person pick. */
export function useDefaultLocation(): string {
  const { accessibleLocations } = useSession()
  return accessibleLocations.length === 1 ? accessibleLocations[0].id : ''
}
