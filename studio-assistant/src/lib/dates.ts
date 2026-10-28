// Dates are stored as local 'YYYY-MM-DD' strings so a shoot never shifts a day across time zones.

export function iso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function parse(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function today(): string {
  return iso(new Date())
}

export function addDays(s: string, n: number): string {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}

export function tomorrow(): string {
  return addDays(today(), 1)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000)
}

export function fmtLong(s: string): string {
  return parse(s).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export function fmtShort(s: string): string {
  return parse(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function fmtWeekday(s: string): string {
  return parse(s).toLocaleDateString('en-US', { weekday: 'short' })
}

/** "Today", "Tomorrow", "Yesterday", or "Mon, Nov 3". */
export function fmtRelative(s: string): string {
  const diff = daysBetween(today(), s)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return parse(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** For timestamps (emails, comments): "9:14 AM", "Yesterday", "Oct 12". */
export function fmtStamp(ts: number): string {
  const d = new Date(ts)
  const diff = daysBetween(iso(d), today())
  if (diff === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function fmtMonthsAgo(s: string): string {
  const months = Math.round(daysBetween(s, today()) / 30)
  if (months <= 1) return 'about a month ago'
  if (months < 12) return `${months} months ago`
  const years = Math.round(months / 12)
  return years === 1 ? 'about a year ago' : `${years} years ago`
}

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/** Seconds → "1:05:09" or "5:09". */
export function fmtClock(sec: number): string {
  const s = Math.floor(sec % 60)
  const m = Math.floor((sec / 60) % 60)
  const h = Math.floor(sec / 3600)
  const mm = String(m).padStart(h ? 2 : 1, '0')
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Seconds → "2h 15m". */
export function fmtDuration(sec: number): string {
  const m = Math.round(sec / 60)
  const h = Math.floor(m / 60)
  if (!h) return `${m}m`
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`
}

/** Monday-first is not used; weeks start on Sunday like a Jewish calendar. */
export function startOfWeek(s: string): string {
  const d = parse(s)
  return addDays(s, -d.getDay())
}

export function monthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1)
  const start = addDays(iso(first), -first.getDay())
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

/** fmtRelative for mid-sentence use: "due today", but "due Wed, Oct 21". */
export function fmtRelativeInline(s: string): string {
  const r = fmtRelative(s)
  return Math.abs(daysBetween(today(), s)) <= 1 ? r.toLowerCase() : r
}
