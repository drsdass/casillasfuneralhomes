// The shared Outlook mailbox connection (admin only). The sign-in itself is kept server-side;
// this file only asks the server what is connected and starts/finishes Microsoft's sign-in.
import { USE_MOCK, supabase } from './supabase'

export interface MailStatus {
  configured: boolean
  connected: boolean
  address: string | null
  status: string | null
  lastError: string | null
  connectedAt: string | null
  tenant: string | null
  provider: 'microsoft' | 'google' | null
  configuredMicrosoft: boolean
  configuredGoogle: boolean
}

export type MailProvider = 'microsoft' | 'google'

async function call(body: Record<string, unknown>) {
  if (USE_MOCK) throw new Error('Email needs the live database.')
  const { data, error } = await supabase!.functions.invoke('mail-connect', { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx) {
      try { const j = await ctx.clone().json(); if (j?.error) throw new Error(j.error) } catch (e) { if (e instanceof Error && !(e instanceof SyntaxError)) throw e }
    }
    throw error
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export const mail = {
  available: !USE_MOCK,
  // Each company (Casillas, Sanders...) has its own mailbox, so every call says which company it is about.
  status: (orgId: string): Promise<MailStatus> => call({ action: 'status', orgId }),
  start: (state: string, orgId: string, provider: MailProvider, tenant?: string): Promise<{ url: string }> => call({ action: 'start', state, orgId, provider, tenant }),
  finish: (code: string, orgId: string, provider: MailProvider, tenant?: string): Promise<{ ok: boolean; address: string }> => call({ action: 'finish', code, orgId, provider, tenant }),
  disconnect: (orgId: string): Promise<{ ok: boolean }> => call({ action: 'disconnect', orgId }),
}
