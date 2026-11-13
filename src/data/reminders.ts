import { seasonDue } from './inspections'
import type { Inspection, Membership, Property } from './types'

export interface Reminder {
  houseId: string
  address: string
  kind: 'filter' | 'winter' | 'spring'
  /** YYYY-MM-DD for filters; the season for check-ups */
  due: string
  overdue: boolean
}

/** Filter due date: last change + the house's interval (or the company's) */
export function filterDue(house: Pick<Property, 'last_filter_at' | 'filter_months'>, companyMonths: number): string | null {
  if (!house.last_filter_at) return null
  const d = new Date(`${house.last_filter_at}T12:00`)
  d.setMonth(d.getMonth() + (house.filter_months ?? companyMonths))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** When this season's check-up window started (Sept 1 for winter, Feb 1 for spring) */
export function seasonStart(kind: 'winter' | 'spring', now = new Date()): Date {
  return new Date(now.getFullYear(), kind === 'winter' ? 8 : 1, 1)
}

/**
 * What's coming up at plan houses: HVAC filters due in the next two weeks (or
 * overdue), and the before-winter / before-spring check-up while its season is on.
 */
export function dueReminders(
  houses: (Pick<Property, 'id' | 'address' | 'last_filter_at' | 'filter_months'> & { plan: Pick<Membership, 'status'> | null; inspections: Pick<Inspection, 'kind' | 'done_at'>[] })[],
  companyMonths: number,
  hasSeasonalList: { winter: boolean; spring: boolean },
  now = new Date(),
): Reminder[] {
  const soon = new Date(now.getTime() + 14 * 86400000)
  const out: Reminder[] = []
  const season = seasonDue(now)
  for (const h of houses) {
    if (h.plan?.status !== 'active') continue
    const due = filterDue(h, companyMonths)
    if (due && new Date(`${due}T12:00`) <= soon) {
      out.push({ houseId: h.id, address: h.address, kind: 'filter', due, overdue: new Date(`${due}T23:59`) < now })
    }
    if (season && hasSeasonalList[season]) {
      const start = seasonStart(season, now)
      const done = h.inspections.some((i) => i.kind === season && i.done_at && new Date(i.done_at) >= start)
      if (!done) out.push({ houseId: h.id, address: h.address, kind: season, due: season, overdue: false })
    }
  }
  return out.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.due.localeCompare(b.due))
}
