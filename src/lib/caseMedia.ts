import { USE_MOCK, supabase } from './supabase'

export interface CaseMedia { id: string; caseId: string; name: string; kind: 'audio' | 'video' | 'image'; mime: string; size: number; path: string; createdAt: string; uploadedBy?: string }

const kindOf = (f: { type: string; name: string }): CaseMedia['kind'] | null => {
  if (f.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|oga|flac|opus|wma)$/i.test(f.name)) return 'audio'
  if (f.type.startsWith('video/') || /\.(mp4|m4v|mov|webm|mkv|avi|wmv|mpg|mpeg)$/i.test(f.name)) return 'video'
  if (f.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic)$/i.test(f.name)) return 'image'
  return null
}
export const mediaKind = kindOf

const store: { items: CaseMedia[]; urls: Map<string, string> } = { items: [], urls: new Map() }
const row = (r: any): CaseMedia => ({ id: r.id, caseId: r.case_id, name: r.name, kind: r.kind, mime: r.mime ?? '', size: Number(r.size ?? 0), path: r.storage_path, createdAt: r.created_at, uploadedBy: r.uploaded_by ?? undefined })

export const caseMedia = {
  async list(caseId: string): Promise<CaseMedia[]> {
    if (USE_MOCK) return store.items.filter((m) => m.caseId === caseId)
    const { data, error } = await supabase!.from('case_media').select('*').eq('case_id', caseId).order('sort').order('created_at')
    if (error) throw error
    return (data ?? []).map(row)
  },
  async upload(caseId: string, file: File, by: string): Promise<CaseMedia> {
    const kind = kindOf(file)
    if (!kind) throw new Error(`“${file.name}” is not a music, video or picture file.`)
    if (USE_MOCK) {
      const m: CaseMedia = { id: crypto.randomUUID(), caseId, name: file.name, kind, mime: file.type, size: file.size, path: `mock/${file.name}`, createdAt: new Date().toISOString(), uploadedBy: by }
      store.items.push(m); store.urls.set(m.id, URL.createObjectURL(file)); return m
    }
    const path = `${caseId}/${Date.now()}-${file.name.replace(/[^a-z0-9.]+/gi, '-')}`
    const { error } = await supabase!.storage.from('case-media').upload(path, file, { contentType: file.type || undefined, upsert: false })
    if (error) {
      if (/exceed|too large|maximum/i.test(error.message)) throw new Error(`“${file.name}” is bigger than the storage limit (${Math.round(file.size / 1048576)} MB). Ask Satish to raise the Supabase upload limit, or use a smaller file.`)
      throw new Error(error.message)
    }
    const { data, error: e2 } = await supabase!.from('case_media').insert({ case_id: caseId, name: file.name, kind, mime: file.type, size: file.size, storage_path: path, uploaded_by: by }).select().single()
    if (e2) { await supabase!.storage.from('case-media').remove([path]); throw e2 }
    return row(data)
  },
  async url(m: CaseMedia): Promise<string> {
    if (USE_MOCK) return store.urls.get(m.id) ?? ''
    const { data, error } = await supabase!.storage.from('case-media').createSignedUrl(m.path, 60 * 60 * 6)
    if (error) throw error
    return data.signedUrl
  },
  async rename(m: CaseMedia, name: string) {
    if (USE_MOCK) { const x = store.items.find((i) => i.id === m.id); if (x) x.name = name; return }
    const { error } = await supabase!.from('case_media').update({ name }).eq('id', m.id)
    if (error) throw error
  },
  async remove(m: CaseMedia) {
    if (USE_MOCK) { store.items = store.items.filter((i) => i.id !== m.id); return }
    await supabase!.storage.from('case-media').remove([m.path])
    const { error } = await supabase!.from('case_media').delete().eq('id', m.id)
    if (error) throw error
  },
}
