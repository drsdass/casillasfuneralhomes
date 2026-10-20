export type PresenceDevice = 'phone' | 'computer'
export interface PresenceRow { staffId: string; device: PresenceDevice; online: boolean; lastSeen: string }

/** Phone or computer? Small touch screens count as a phone. */
export function deviceKind(): PresenceDevice {
  try {
    const ua = navigator.userAgent
    if (/iPhone|iPod|Android.+Mobile|Mobile.+Firefox|Windows Phone/i.test(ua)) return 'phone'
    if (window.matchMedia?.('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 700) return 'phone'
  } catch { /* ignore */ }
  return 'computer'
}
