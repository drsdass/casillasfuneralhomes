import { useState } from 'react'
import { MEXICAN_STATES, CANADIAN_PROVINCES, matchPlace } from '@/lib/places'
import { US_STATES, US_TERRITORIES } from '@/lib/edrsFormat'

type Kind = '' | 'us' | 'terr' | 'mx' | 'ca' | 'other' | 'raw'
const US_NAMES = Object.values(US_STATES)
const TERR_NAMES = Object.values(US_TERRITORIES)

function parse(v: string): { kind: Kind; name: string } {
  const s = (v ?? '').trim()
  if (!s) return { kind: '', name: '' }
  if (/^unk(nown)?$/i.test(s)) return { kind: 'us', name: 'Unknown' }
  const other = s.match(/^other:\s*(.*)$/i)
  if (other) return { kind: 'other', name: other[1] }
  const combo = s.match(/^(.+?),\s*(mexico|m[eé]xico|mx|canada)\s*$/i)
  if (combo) return /^(m)/i.test(combo[2]) ? { kind: 'mx', name: matchPlace(combo[1], MEXICAN_STATES)?.name ?? combo[1] } : { kind: 'ca', name: matchPlace(combo[1], CANADIAN_PROVINCES)?.name ?? combo[1] }
  const abbr = s.toUpperCase().replace(/\./g, '')
  if (US_STATES[abbr]) return { kind: 'us', name: US_STATES[abbr] }
  const us = US_NAMES.find((n) => n.toLowerCase() === s.toLowerCase())
  if (us) return { kind: 'us', name: us }
  if (US_TERRITORIES[abbr]) return { kind: 'terr', name: US_TERRITORIES[abbr] }
  const terr = TERR_NAMES.find((n) => n.toLowerCase() === s.toLowerCase())
  if (terr) return { kind: 'terr', name: terr }
  const mx = matchPlace(s, MEXICAN_STATES)
  if (mx) return { kind: 'mx', name: mx.name }
  return { kind: 'raw', name: s }
}

const compose = (kind: Kind, name: string): string => {
  if (kind === 'mx') return name ? `${name}, Mexico` : ''
  if (kind === 'ca') return name ? `${name}, Canada` : ''
  if (kind === 'other') return name ? `Other: ${name}` : ''
  return name
}

/** Two boxes like EDRS has: first the type (US State, Mexican State…), then the name from that type's list. */
export function PlacePicker({ value, onChange, className }: { value: string; onChange: (v: string) => void; className: string }) {
  const parsed = parse(value)
  const [pick, setPick] = useState<Kind>('')
  // The chosen type is remembered here so an empty list (nothing picked yet) stays on screen.
  const kind: Kind = parsed.kind || pick
  const name = parsed.name
  const list: readonly string[] = kind === 'us' ? ['Unknown', ...US_NAMES] : kind === 'terr' ? TERR_NAMES : kind === 'mx' ? MEXICAN_STATES : kind === 'ca' ? CANADIAN_PROVINCES : []
  const current = kind === 'raw' ? '' : kind
  return (
    <div className="space-y-1.5">
      <select value={current} onChange={(e) => { const k = e.target.value as Kind; setPick(k); onChange(k === '' ? '' : k === 'other' ? 'Other: ' : k === 'us' || k === 'terr' ? '' : compose(k, '')) }} className={className} aria-label="Type">
        <option value="">— type —</option>
        <option value="us">US State</option>
        <option value="mx">Mexican State</option>
        <option value="ca">Canadian Province</option>
        <option value="terr">US Territory</option>
        <option value="other">Other country</option>
      </select>
      {kind === 'raw' && (
        <div>
          <input value={name} onChange={(e) => onChange(e.target.value)} className={className} />
          <div className="text-[11px] text-amber-600 mt-0.5">Typed by hand — pick the type above, then the name from the list.</div>
        </div>
      )}
      {(kind === 'us' || kind === 'terr' || kind === 'mx' || kind === 'ca') && (
        <select value={name} onChange={(e) => onChange(compose(kind, e.target.value))} className={className} aria-label="Name">
          <option value="">— choose —</option>
          {list.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      )}
      {kind === 'other' && <input value={name} onChange={(e) => onChange(compose('other', e.target.value))} placeholder="Country" className={className} aria-label="Country" />}
    </div>
  )
}
