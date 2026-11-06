// supabase/functions/esign/index.ts
//
// The electronic-signature service built into Casillas OS. One function, two audiences:
//   staff (logged in):   { action: 'create', caseId, documentName, documentStoragePath, signerName, signerEmail, mode, fields? }
//                         fields = boxes placed on the pages: signature, initials, date, name, text, checkbox
//   the signer (public): { action: 'get', token } · { action: 'sign', token, name, signature?, values?, consent } · { action: 'decline', token }
//
// The signer never needs a login: the long secret token in their link is what lets them in, for 14 days, for one document.
// When they sign, a signature page (their drawn signature, typed name, date and time, network address, device and a fingerprint
// of the exact document they saw) is added to the end of the PDF, and the signed copy is filed with the case.
//
// Deploy via the Supabase Dashboard: name it exactly "esign", and turn OFF "Verify JWT" (the signer is not logged in;
// the function checks the staff login itself for 'create').

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const BUCKET = 'case-documents'
const DAYS = 14

async function sha256(bytes: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('')
}
function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const FIELD_TYPES = ['signature', 'initials', 'date', 'name', 'text', 'checkbox']
// deno-lint-ignore no-explicit-any
function cleanFields(raw: any, pageCount: number) {
  if (!Array.isArray(raw)) return []
  const num = (v: unknown) => Math.min(1, Math.max(0, Number(v) || 0))
  return raw.slice(0, 120).filter((f) => f && FIELD_TYPES.includes(f.type) && Number.isInteger(f.page) && f.page >= 0 && f.page < pageCount).map((f) => ({
    id: String(f.id ?? '').slice(0, 20) || crypto.randomUUID().slice(0, 8), type: f.type, page: f.page, x: num(f.x), y: num(f.y), w: Math.max(0.01, num(f.w)), h: Math.max(0.01, num(f.h)),
    label: typeof f.label === 'string' ? f.label.slice(0, 80) : undefined, required: f.required !== false && f.type !== 'checkbox',
  }))
}
const pngBytes = (v: unknown): Uint8Array | null => {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(v ?? ''))
  return m && m[1].length <= 600_000 ? Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)) : null
}
const winAnsi = (t: string) => t.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')
const pacific = (d: Date) => d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'long', timeStyle: 'long' })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })
  try {
    const b = await req.json()

    // ---------------------------------------------------------------- staff: create
    if (b.action === 'create') {
      const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
      const { data: u } = await asUser.auth.getUser()
      if (!u?.user) return reply({ error: 'Please sign in again.' }, 401)
      const { data: theCase } = await asUser.from('cases').select('id').eq('id', String(b.caseId ?? '')).maybeSingle()   // the database's own rules decide access
      if (!theCase) return reply({ error: 'That case was not found, or you do not have access to it.' }, 403)
      const signerEmail = String(b.signerEmail ?? '').trim()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(signerEmail)) return reply({ error: 'A valid email address for the signer is needed.' }, 400)
      const path = String(b.documentStoragePath ?? '')
      const { data: file, error: dlErr } = await db.storage.from(BUCKET).download(path)
      if (dlErr || !file) return reply({ error: `Could not read the document: ${dlErr?.message ?? 'missing'}` }, 400)
      const bytes = new Uint8Array(await file.arrayBuffer())
      let pageCount = 0
      try { pageCount = (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount() } catch { return reply({ error: 'That file is not a readable PDF.' }, 400) }
      const { data: row, error } = await db.from('signature_requests').insert({
        case_id: theCase.id, document_name: String(b.documentName ?? 'Document').slice(0, 150), status: 'sent', signer_name: String(b.signerName ?? '').trim() || 'Family Contact',
        signer_email: signerEmail, sent_by: u.user.id, sent_at: new Date().toISOString(), mode: b.mode === 'inperson' ? 'inperson' : 'email', document_path: path,
        token: newToken(), expires_at: new Date(Date.now() + DAYS * 86400_000).toISOString(), document_sha256: await sha256(bytes), fields: cleanFields(b.fields, pageCount),
      }).select().single()
      if (error) throw error
      return reply(row)
    }

    // ---------------------------------------------------------------- everything below is the signer, by token
    const token = String(b.token ?? '')
    if (token.length < 20) return reply({ error: 'This signing link is not valid.' }, 404)
    const { data: row } = await db.from('signature_requests').select('*').eq('token', token).maybeSingle()
    if (!row) return reply({ error: 'This signing link is not valid.' }, 404)
    const org = (await db.from('cases').select('organizations(name)').eq('id', row.case_id).maybeSingle()).data as { organizations?: { name?: string } } | null
    const orgName = org?.organizations?.name ?? 'Casillas Funeral Home'
    const expired = row.expires_at && new Date(row.expires_at) < new Date()
    if (expired && (row.status === 'sent' || row.status === 'viewed')) { await db.from('signature_requests').update({ status: 'expired' }).eq('id', row.id); row.status = 'expired' }

    if (b.action === 'get') {
      const out: Record<string, unknown> = { documentName: row.document_name, signerName: row.signer_name, status: row.status, orgName, signedAt: row.signed_at, fields: row.fields ?? [] }
      if (row.status === 'sent' || row.status === 'viewed') {
        if (row.status === 'sent') await db.from('signature_requests').update({ status: 'viewed', viewed_at: new Date().toISOString() }).eq('id', row.id)
        out.pdfUrl = (await db.storage.from(BUCKET).createSignedUrl(row.document_path, 60 * 30)).data?.signedUrl
      }
      if (row.status === 'signed' && row.signed_document_url) out.signedUrl = (await db.storage.from(BUCKET).createSignedUrl(row.signed_document_url, 60 * 60)).data?.signedUrl
      return reply(out)
    }

    if (b.action === 'decline') {
      if (row.status === 'sent' || row.status === 'viewed') await db.from('signature_requests').update({ status: 'declined' }).eq('id', row.id)
      return reply({ ok: true })
    }

    if (b.action === 'sign') {
      if (row.status !== 'sent' && row.status !== 'viewed') return reply({ error: row.status === 'signed' ? 'This document was already signed.' : 'This signing link can no longer be used. Please ask the funeral home to send a new one.' }, 400)
      const name = String(b.name ?? '').trim().slice(0, 100)
      if (name.length < 2) return reply({ error: 'Please type your full name.' }, 400)
      if (b.consent !== true) return reply({ error: 'Please tick the box to agree to sign electronically.' }, 400)
      // deno-lint-ignore no-explicit-any
      const fields: any[] = Array.isArray(row.fields) ? row.fields : []
      const values: Record<string, string> = b.values && typeof b.values === 'object' ? b.values : {}
      let certSig: Uint8Array | null
      if (fields.length) {
        for (const f of fields) {
          if (!f.required) continue
          if ((f.type === 'signature' || f.type === 'initials') && !pngBytes(values[f.id])) return reply({ error: 'Please fill in every highlighted box.' }, 400)
          if (f.type === 'text' && !String(values[f.id] ?? '').trim()) return reply({ error: 'Please fill in every highlighted box.' }, 400)
        }
        const firstSig = fields.find((f) => f.type === 'signature' && pngBytes(values[f.id]))
        certSig = pngBytes(firstSig ? values[firstSig.id] : b.signature)
      } else {
        certSig = pngBytes(b.signature)
        if (!certSig) return reply({ error: 'Please draw your signature.' }, 400)
      }

      const { data: file } = await db.storage.from(BUCKET).download(row.document_path)
      if (!file) throw new Error('The document could not be found.')
      const original = new Uint8Array(await file.arrayBuffer())
      if (row.document_sha256 && (await sha256(original)) !== row.document_sha256) throw new Error('The document changed after it was sent. Please ask for a new one.')

      const when = new Date()
      const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
      const agent = (req.headers.get('user-agent') ?? '').slice(0, 200)
      const pdf = await PDFDocument.load(original, { ignoreEncryption: true })
      const font = await pdf.embedFont(StandardFonts.Helvetica)
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
      const ink = rgb(0.1, 0.12, 0.15)

      // Put what they filled in exactly where the staff placed the boxes.
      const pages = pdf.getPages()
      const dateStr = when.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: '2-digit', day: '2-digit', year: 'numeric' })
      for (const f of fields) {
        const pg = pages[f.page]
        if (!pg) continue
        const W = pg.getWidth(), H = pg.getHeight()
        const bx = f.x * W, bw = f.w * W, bh = f.h * H, by = H - (f.y + f.h) * H
        if (f.type === 'signature' || f.type === 'initials') {
          const bytes = pngBytes(values[f.id])
          if (!bytes) continue
          const img = await pdf.embedPng(bytes)
          const sc = Math.min(bw / img.width, bh / img.height)
          pg.drawImage(img, { x: bx + (bw - img.width * sc) / 2, y: by + (bh - img.height * sc) / 2, width: img.width * sc, height: img.height * sc })
          continue
        }
        const text = f.type === 'date' ? dateStr : f.type === 'name' ? name : f.type === 'text' ? String(values[f.id] ?? '').slice(0, 200) : f.type === 'checkbox' && values[f.id] ? 'X' : ''
        if (!text) continue
        const size = Math.max(7, Math.min(12, bh * 0.7))
        pg.drawText(winAnsi(text), { x: bx + 2, y: by + bh / 2 - size * 0.35, size, font, color: ink })
      }

      const page = pdf.addPage([612, 792])
      page.drawText('Electronic Signature', { x: 54, y: 730, size: 22, font: bold, color: ink })
      page.drawText(`${orgName} — signed electronically`, { x: 54, y: 708, size: 11, font, color: rgb(0.35, 0.38, 0.42) })
      if (certSig) {
        const png = await pdf.embedPng(certSig)
        let w = Math.min(300, png.width), h = (png.height * w) / png.width
        if (h > 100) { w = (w * 100) / h; h = 100 }
        page.drawImage(png, { x: 54, y: 630, width: w, height: h })
      }
      page.drawLine({ start: { x: 54, y: 628 }, end: { x: 400, y: 628 }, thickness: 0.8, color: ink })
      page.drawText(name, { x: 54, y: 612, size: 13, font: bold, color: ink })
      const lines: [string, string][] = [
        ['Document', String(row.document_name)], ['Signed by', `${name} (requested for ${row.signer_name}, ${row.signer_email})`], ['Date and time', pacific(when)],
        ['Network address', ip], ['Device', agent || 'unknown'], ['Document fingerprint (SHA-256)', String(row.document_sha256 ?? await sha256(original))], ['Request number', String(row.id)],
      ]
      let y = 560
      for (const [k, v] of lines) {
        page.drawText(k, { x: 54, y, size: 9, font: bold, color: rgb(0.35, 0.38, 0.42) }); y -= 13
        const parts = v.match(/.{1,92}/g) ?? ['']
        for (const p of parts) { page.drawText(p, { x: 54, y, size: 10, font, color: ink }); y -= 13 }
        y -= 8
      }
      page.drawText('The signer agreed to sign electronically. This page was added when the document was signed.', { x: 54, y: 60, size: 9, font, color: rgb(0.45, 0.48, 0.52) })
      const signedBytes = await pdf.save()
      const path = `signed/${row.case_id}/${row.id}.pdf`
      const up = await db.storage.from(BUCKET).upload(path, signedBytes, { contentType: 'application/pdf', upsert: true })
      if (up.error) throw up.error
      await db.from('signature_requests').update({ status: 'signed', signed_at: when.toISOString(), signed_document_url: path, signed_name: name, signer_ip: ip, signer_agent: agent }).eq('id', row.id)
      await db.from('case_documents').insert({ case_id: row.case_id, name: `Signed — ${row.document_name}`, category: 'contract', storage_path: path, uploaded_by: row.sent_by, signed: true })
      const hook = (Deno.env.get('SLACK_WEBHOOK_URL') ?? '').trim()
      if (hook) fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `✅ Signed: *${row.document_name}* by ${name}` }) }).catch(() => {})
      return reply({ ok: true, signedUrl: (await db.storage.from(BUCKET).createSignedUrl(path, 60 * 60)).data?.signedUrl })
    }
    return reply({ error: 'Unknown request.' }, 400)
  } catch (e) {
    console.error(e)
    return reply({ error: e instanceof Error ? e.message : 'Something went wrong.' }, 500)
  }
})
