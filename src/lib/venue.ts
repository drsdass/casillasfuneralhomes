import type { CalendarEvent } from '@/types'

const fold = (s?: string) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
// "Main Chapel" at Cathedral City is a different room from "Main Chapel" at Coachella; a church or cemetery name is the same place for everyone.
const INHOUSE = /\b(chapel|room|parlor|parlour|hall|suite|reposing|visitation|funeral home|our home)\b/

export interface VenueConflict { event: CalendarEvent }

/** Events booked in the same place at an overlapping time. Ignores the case's own entries and the event being edited. */
export function findVenueConflicts(
  events: CalendarEvent[],
  q: { start?: string; end?: string; venue?: string; locationId?: string; caseId?: string; excludeEventId?: string },
): VenueConflict[] {
  const v = fold(q.venue)
  if (!v || v.length < 3 || !q.start || !q.end || q.start >= q.end) return []
  return events
    .filter((e) => e.id !== q.excludeEventId && !(q.caseId && e.caseId === q.caseId))
    .filter((e) => fold(e.location) === v && (!INHOUSE.test(v) || !q.locationId || e.locationId === q.locationId))
    .filter((e) => q.start! < e.end && e.start < q.end!)
    .map((event) => ({ event }))
}
