import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { makeEvaluator, parseEntry, show, colLetter, type Raw, type SheetDef, type SheetStyle } from '@/lib/sheetEngine'

const borderCss = (b?: [string, string]): string | undefined => {
  if (!b) return undefined
  const [style, color] = b
  const w = style === 'thick' ? 3 : style === 'medium' || style === 'mediumDashed' || style === 'mediumDashDot' ? 2 : style === 'double' ? 3 : 1
  const kind = style === 'double' ? 'double' : /dash/i.test(style) ? 'dashed' : style === 'dotted' || style === 'hair' ? 'dotted' : 'solid'
  return `${w}px ${kind} #${color}`
}

const FONTS: Record<string, string> = {
  Tahoma: 'Tahoma, Verdana, sans-serif',
  Arial: 'Arial, Helvetica, sans-serif',
  'Bierstadt Display': '"Bierstadt Display", Bierstadt, "Segoe UI", Arial, sans-serif',
  'Bahnschrift SemiLight Condensed': '"Bahnschrift SemiLight Condensed", "Arial Narrow", Arial, sans-serif',
}

function cellCss(st: SheetStyle | undefined, isNumber: boolean): CSSProperties {
  if (!st) return {}
  const css: CSSProperties = {
    fontFamily: FONTS[st.ff ?? ''] ?? (st.ff ? `"${st.ff}", Arial, sans-serif` : undefined),
    fontSize: st.fs ? `${(st.fs * 96) / 72}px` : undefined,
    fontWeight: st.b ? 700 : undefined, fontStyle: st.i ? 'italic' : undefined, textDecoration: st.u ? 'underline' : undefined,
    color: st.fc ? `#${st.fc}` : undefined, backgroundColor: st.bg ? `#${st.bg}` : undefined,
    borderTop: borderCss(st.bt), borderLeft: borderCss(st.bl), borderBottom: borderCss(st.bb), borderRight: borderCss(st.br),
    verticalAlign: st.va === 'center' ? 'middle' : st.va === 'top' ? 'top' : 'bottom',
    textAlign: (st.ha === 'center' || st.ha === 'centerContinuous') ? 'center' : st.ha === 'right' ? 'right' : st.ha === 'left' ? 'left' : st.ha === 'justify' ? 'justify' : isNumber ? 'right' : 'left',
    paddingLeft: st.ind ? `${st.ind * 9}px` : undefined,
  }
  return css
}

interface Props {
  sheet: SheetDef
  saved: Record<string, Raw>
  defaults: Record<string, Raw>
  canEdit: boolean
  onChange: (key: string, value: Raw) => void
  /** Rendered natural width/height, so printing can scale the whole form to one page. */
}

export function StatementSheet({ sheet, saved, defaults, canEdit, onChange }: Props) {
  const over = useMemo(() => ({ ...defaults, ...saved }), [defaults, saved])
  const ev = useMemo(() => makeEvaluator(sheet, over), [sheet, over])
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)

  const width = useMemo(() => sheet.cols.reduce((a, b) => a + b, 0), [sheet])
  const height = useMemo(() => sheet.rows.reduce((a, b) => a + b, 0), [sheet])
  const printZoom = Math.min(1, 760 / width, 1000 / height)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const fit = () => setZoom(Math.max(0.72, Math.min(1, (el.clientWidth - 2) / width)))
    fit()
    const ro = new ResizeObserver(fit); ro.observe(el)
    return () => ro.disconnect()
  }, [width])
  useEffect(() => { setEditing(null) }, [sheet.name])

  const covered = useMemo(() => {
    const spans = new Map<string, { rs: number; cs: number }>(); const hidden = new Set<string>()
    for (const [r1, c1, r2, c2] of sheet.merges) {
      spans.set(`${r1},${c1}`, { rs: r2 - r1 + 1, cs: c2 - c1 + 1 })
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (r !== r1 || c !== c1) hidden.add(`${r},${c}`)
    }
    return { spans, hidden }
  }, [sheet])

  const colX = useMemo(() => { let x = 0; return sheet.cols.map((w) => { const s = x; x += w; return s }) }, [sheet])
  const rowY = useMemo(() => { let y = 0; return sheet.rows.map((h) => { const s = y; y += h; return s }) }, [sheet])

  function commit() {
    if (editing === null) return
    const st = sheet.styles[sheet.cells[editing]?.s ?? -1]
    onChange(editing, parseEntry(draft, st?.nf))
    setEditing(null)
  }

  const img = sheet.image
  const imgStyle: CSSProperties | null = img ? {
    position: 'absolute', pointerEvents: 'none',
    left: colX[img.from[0]] + img.from[2], top: rowY[img.from[1]] + img.from[3],
    width: colX[img.to[0]] + img.to[2] - (colX[img.from[0]] + img.from[2]), height: rowY[img.to[1]] + img.to[3] - (rowY[img.from[1]] + img.from[3]),
  } : null

  const rows: ReactElement[] = []
  for (let r = 1; r <= sheet.rows.length; r++) {
    const tds: ReactElement[] = []
    for (let c = 1; c <= sheet.cols.length; c++) {
      const key = `${r},${c}`
      if (covered.hidden.has(key) || sheet.cols[c - 1] === 0) continue
      const cell = sheet.cells[key]
      const st = cell ? sheet.styles[cell.s] : undefined
      const val = ev.get(key)
      const sp = covered.spans.get(key)
      const shown = show(val, st?.nf)
      const readOnly = !canEdit || (cell?.f !== undefined && !(key in over))
      const isEditing = editing === key
      const rot = st?.rot === 90 || st?.rot === 255
      const css = cellCss(st, typeof val === 'number')
      const wrap = !!st?.wr
      // like Excel: text runs on into empty cells to its right, but stops at one that has something in it
      const rightKey = `${r},${c + (sp?.cs ?? 1)}`
      const leftKey = `${r},${c - 1}`
      const flowsLeft = st?.ha === 'right' && !wrap
      const nb = flowsLeft ? ev.get(leftKey) : ev.get(rightKey)
      const rightFilled = nb !== '' && nb !== undefined
      tds.push(
        <td key={key} rowSpan={sp?.rs} colSpan={sp?.cs} data-cell={`${colLetter(c)}${r}`}
          onClick={() => { if (!readOnly && !isEditing) { setEditing(key); setDraft(typeof val === 'number' && !st?.nf?.includes('$') && !/mmm|mm-dd/.test(st?.nf ?? '') ? String(val) : (shown.kind === 'acct' ? (shown.text === '-' ? '' : shown.text) : shown.text)) } }}
          className={readOnly ? '' : 'stmt-edit'}
          style={{ ...css, padding: css.paddingLeft ? undefined : '0 2px', position: 'relative', overflow: wrap || rot || rightFilled ? 'hidden' : 'visible', whiteSpace: wrap ? 'normal' : 'nowrap', wordBreak: wrap ? 'break-word' : undefined, lineHeight: 1.15, boxSizing: 'border-box' }}>
          {isEditing ? (
            <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
              onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(null) }}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', font: 'inherit', color: 'inherit', background: '#fffbe0', border: '2px solid #b3925a', padding: '0 2px', textAlign: css.textAlign as CSSProperties['textAlign'], zIndex: 5, outline: 'none' }} />
          ) : rot ? (
            <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%) rotate(180deg)', writingMode: 'vertical-rl', whiteSpace: 'nowrap' }}>{shown.text}</span>
          ) : shown.kind === 'acct' ? (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>$</span><span>{shown.text}{shown.neg ? '' : ' '}</span></div>
          ) : flowsLeft ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}><span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{shown.text}</span></div>
          ) : shown.text}
        </td>
      )
    }
    rows.push(<tr key={r} style={{ height: sheet.rows[r - 1] }}>{tds}</tr>)
  }

  return (
    <div ref={wrapRef} className="w-full">
      <style>{`
        .stmt-sheet { zoom: var(--sz); }
        .stmt-edit:hover { outline: 1px dashed #b3925a; outline-offset: -1px; cursor: text; }
        main table.stmt-table { display: table !important; overflow: visible; }
        @page stmt { size: letter portrait; margin: 0.25in; }
        @media print { .stmt-print { page: stmt; } .stmt-sheet { zoom: var(--pz) !important; } .stmt-edit:hover { outline: none; } }
      `}</style>
      <div className="print-target stmt-print">
        <div className="stmt-sheet" style={{ ['--sz' as string]: zoom, ['--pz' as string]: printZoom, width, background: '#fff', position: 'relative' } as CSSProperties}>
          <table className="stmt-table" style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width, color: '#000' }}>
            <colgroup>{sheet.cols.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <tbody>{rows}</tbody>
          </table>
          {imgStyle && <img src="/statement-logo.png" alt="" style={imgStyle} />}
        </div>
      </div>
    </div>
  )
}
