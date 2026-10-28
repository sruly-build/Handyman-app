import type { TimeEntry } from './types'

/** Length of one time entry in milliseconds (a running one counts up to `now`) */
export function entryMs(entry: TimeEntry, now: number): number {
  const end = entry.ended_at ? Date.parse(entry.ended_at) : now
  return Math.max(0, end - Date.parse(entry.started_at))
}

export function totalMs(entries: TimeEntry[], now: number): number {
  return entries.reduce((sum, e) => sum + entryMs(e, now), 0)
}

export const msToHours = (ms: number) => ms / 3_600_000

/** "2 h 05 min", "1 h", "45 min", "0 min" */
export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${String(m).padStart(2, '0')} min`
}

/** Stopwatch style: "1:02:09" or "12:09" */
export function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** "1.5" hours, for estimates and invoices */
export function formatHours(hours: number): string {
  return (Math.round(hours * 100) / 100).toString()
}

/** Totals per person, biggest first */
export function totalsByUser(entries: TimeEntry[], now: number): { user_id: string; ms: number }[] {
  const map = new Map<string, number>()
  for (const e of entries) map.set(e.user_id, (map.get(e.user_id) ?? 0) + entryMs(e, now))
  return [...map.entries()].map(([user_id, ms]) => ({ user_id, ms })).sort((a, b) => b.ms - a.ms)
}
