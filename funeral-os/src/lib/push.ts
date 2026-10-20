import { api } from '@/lib/api'
import { deviceKind } from '@/lib/presence'

// Public key only (safe to be in the website). The matching private key lives in the Supabase secret VAPID_PRIVATE_KEY.
export const VAPID_PUBLIC_KEY: string = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || 'BINHskStlGS0hZeA9WYEa78tbbrnJo0pcgnEO_ukGY5Z3zHvmCGvtY0yqEN__QATy_9Of-uPOLoQBNNs3Ym4-u4'

const FLAG = 'casillas_push_on'

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}
export function isIos(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}
/** True once this phone/computer has been signed up (used so the page doesn't also pop its own copy). */
export function isPushOn(): boolean {
  try { return localStorage.getItem(FLAG) === '1' && 'Notification' in window && Notification.permission === 'granted' } catch { return false }
}

function toKey(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    return reg ? await reg.pushManager.getSubscription() : null
  } catch { return null }
}

export type EnableResult = { ok: true } | { ok: false; reason: 'unsupported' | 'denied' | 'ios-install' | 'error'; message?: string }

/** Asks permission and signs this phone/computer up for notifications. */
export async function enablePush(userId: string): Promise<EnableResult> {
  if (!pushSupported()) return { ok: false, reason: isIos() && !isStandalone() ? 'ios-install' : 'unsupported' }
  try {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return { ok: false, reason: 'denied' }
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'))
    await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC_KEY) as BufferSource }))
    await api.savePushSubscription(userId, sub.toJSON(), deviceKind())
    try { localStorage.setItem(FLAG, '1') } catch { /* ignore */ }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: 'error', message: String((e as Error)?.message ?? e) }
  }
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (sub) { await api.removePushSubscription(sub.endpoint).catch(() => undefined); await sub.unsubscribe().catch(() => undefined) }
  try { localStorage.removeItem(FLAG) } catch { /* ignore */ }
}
