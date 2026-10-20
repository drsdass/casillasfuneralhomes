import type { InboundEmail } from '@/types'

/**
 * Spots obvious marketing and phishing mail so it does not clutter "Needs Review".
 * Nothing is ever deleted: these go to a "Junk & Marketing" tab and staff can move any email back.
 * Mail already filed to a case is never treated as junk. (The same list lives in supabase/functions/sync-inbox.)
 */
const PHISHING = [
  'verify your account', 'verify your email', 'verify your identity', 'confirm your identity', 'confirm your password',
  'account will be suspended', 'account has been suspended', 'account will be closed', 'account will be deactivated', 'account has been locked',
  'password will expire', 'password expires', 'unusual sign-in', 'unusual activity', 'security alert', 'mailbox is full', 'storage is full',
  'gift card', 'wire transfer', 'dear customer', 'dear user', 'dear account holder', 'dear valued customer', 'click the link below to', 'update your payment',
]
const MARKETING = [
  'unsubscribe', 'view in browser', 'view this email in your browser', 'manage your preferences', 'email preferences', 'newsletter',
  '% off', 'save thousands', 'lowest price', 'limited time', 'act now', 'free shipping', 'special offer', 'exclusive deal', 'buy now', 'order now',
  'best price', 'clearance', 'flash sale', 'webinar', 'free trial', 'promo code', 'this is an advertisement',
]
const BULK_SENDERS = /^(no-?reply|noreply|donotreply|do-not-reply|newsletter|news|marketing|promo|promotions|offers|deals|mailer|bounce|notifications?)@/i

export type JunkKind = 'phishing' | 'marketing'

export function autoJunkKind(e: Pick<InboundEmail, 'from' | 'subject' | 'preview' | 'body' | 'caseId' | 'matchStatus'>): JunkKind | null {
  if (e.caseId && e.matchStatus !== 'suggested') return null // already filed by a person or the system
  const hay = `${e.subject} ${e.preview} ${(e.body ?? '').slice(0, 4000)}`.toLowerCase()
  const hits = (list: string[]) => list.filter((w) => hay.includes(w)).length
  if (hits(PHISHING) >= 1) return 'phishing'
  if (hits(MARKETING) >= 1 || (BULK_SENDERS.test(e.from) && /sale|offer|deal|save|newsletter|discount/i.test(e.subject))) return 'marketing'
  return null
}

/** Staff choice wins (junk: true/false); otherwise the automatic check decides. */
export function junkKind(e: InboundEmail): JunkKind | null {
  if (e.direction === 'out') return null
  if (e.junk === false) return null
  if (e.junk === true) return autoJunkKind({ ...e, caseId: undefined }) ?? 'marketing'
  return autoJunkKind(e)
}

const clip = (t: string) => t.trim().slice(0, 4000)
/** The quoted original that goes under a reply or forward. */
export function quotedOriginal(e: InboundEmail): string {
  const when = new Date(e.receivedAt).toLocaleString()
  return `\n\n----- ${e.direction === 'out' ? 'Sent' : 'Original message'} -----\nFrom: ${e.fromName ? `${e.fromName} <${e.from}>` : e.from}\nDate: ${when}\nSubject: ${e.subject}\n\n${clip(e.body ?? e.preview ?? '')}`
}
export const replySubject = (s: string) => (/^re:/i.test(s) ? s : `Re: ${s}`)
export const forwardSubject = (s: string) => (/^(fwd?):/i.test(s) ? s : `Fwd: ${s}`)
