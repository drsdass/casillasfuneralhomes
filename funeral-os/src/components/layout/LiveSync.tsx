import type { RealtimeChannel } from '@supabase/supabase-js'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, USE_MOCK } from '@/lib/supabase'

const TABLES = ['cases', 'case_notes', 'service_orders', 'contracts', 'contract_line_items', 'calendar_events', 'custody_log', 'case_documents', 'case_tasks', 'case_contacts', 'payments', 'family_messages', 'obituary_drafts', 'case_statements']

/**
 * Keeps every open screen in step with changes made by OTHER people/devices:
 * instant when Supabase Realtime is on for the table, and a 20-second refresh as a safety net.
 */
export default function LiveSync() {
  const qc = useQueryClient()
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void qc.invalidateQueries() }
    const timer = window.setInterval(refresh, 20_000)
    document.addEventListener('visibilitychange', refresh)
    let channel: RealtimeChannel | null = null
    let pending: number | undefined
    if (!USE_MOCK && supabase) {
      const sb = supabase
      try {
        channel = sb.channel('live-sync')
        for (const t of TABLES) {
          channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => {
            window.clearTimeout(pending)
            pending = window.setTimeout(() => void qc.invalidateQueries(), 400)
          })
        }
        channel.subscribe()
      } catch { /* the 20-second refresh still covers it */ }
    }
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.clearTimeout(pending)
      if (channel && supabase) void supabase.removeChannel(channel)
    }
  }, [qc])
  return null
}
