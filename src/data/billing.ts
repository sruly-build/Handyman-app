import { msToHours, totalMs } from './time'
import type { InvoiceLine, Part, PunchItem, Settings, TimeEntry } from './types'

/** Round to whole cents */
export const roundMoney = (n: number) => Math.round(n * 100) / 100

/** Cost plus markup, e.g. $50 with 20% → $60 */
export const withMarkup = (cost: number, percent: number) => roundMoney(cost * (1 + percent / 100))

export function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

export interface BillPart {
  id: string
  name: string
  quantity: number
  cost: number
  price: number
}

export interface BillSection {
  /** The punch list item this section is for, or null for labour lines and "Other parts" */
  itemId: string | null
  title: string
  detail: string
  /** Only on the job's labour lines (service call, additional time); items show no time or price */
  labour: { hours: number; amount: number } | null
  parts: BillPart[]
}

export interface Bill {
  sections: BillSection[]
  /** Hourly rate after the first hour, and the first-hour rate (null if there isn't one) */
  rate: number
  firstRate: number | null
  /** Markup % used on materials (0 when switched off) */
  partsMarkup: number
  partsCost: number
  partsTotal: number
  labourHours: number
  labourTotal: number
  total: number
}

export interface BillInput {
  items: PunchItem[]
  parts: Part[]
  entries: TimeEntry[]
  settings: Settings
  /** The job, for its own "markup on materials" switch */
  job?: { markup_parts?: boolean | null }
  now: number
}

/** Hourly rate the customer pays (with markup, if markup applies to labour) */
export function billedRate(settings: Settings): number {
  return settings.markup_labour ? withMarkup(settings.hourly_rate, settings.markup_percent) : settings.hourly_rate
}

/** First-hour rate the customer pays, or null when the first hour costs the same as the rest */
export function billedFirstRate(settings: Settings): number | null {
  const first = settings.first_hour_rate
  if (!first || first <= 0) return null
  return settings.markup_labour ? withMarkup(first, settings.markup_percent) : first
}

/** Markup % on materials for a job: its own switch if set, otherwise the setting (0 = off) */
export function partsMarkup(settings: Settings, job?: { markup_parts?: boolean | null }): number {
  const on = job?.markup_parts ?? settings.markup_parts
  return on ? settings.markup_percent : 0
}

/**
 * Builds an estimate (from expected hours) or a bill (from tracked time).
 *
 * The bill lists the work done (each item and its parts, without time or
 * price per item), then labour for the whole job as at most two lines:
 * the service call / first hour, then any additional time at the hourly
 * rate. Labour is always at least 1 hour. The time comes from the expected
 * hours (estimate), the task timers, or arrival to finish (setting).
 */
export function buildBill(input: BillInput, basis: 'estimate' | 'actual'): Bill {
  const { items, parts, entries, settings, job, now } = input
  const rate = billedRate(settings)
  const firstRate = billedFirstRate(settings)
  const pct = partsMarkup(settings, job)

  const toBillPart = (p: Part): BillPart => ({
    id: p.id,
    name: p.name,
    quantity: p.quantity,
    cost: p.cost ?? 0,
    price: withMarkup(p.cost ?? 0, pct),
  })

  const sections: BillSection[] = items.map((item) => ({
    itemId: item.id,
    title: item.title,
    detail: item.location,
    labour: null,
    parts: parts.filter((p) => p.item_id === item.id).map(toBillPart),
  }))

  const itemIds = new Set(items.map((i) => i.id))
  const otherParts = parts.filter((p) => !p.item_id || !itemIds.has(p.item_id)).map(toBillPart)
  if (otherParts.length) sections.push({ itemId: null, title: 'Other parts', detail: '', labour: null, parts: otherParts })

  const worked =
    basis === 'estimate'
      ? items.reduce((sum, i) => sum + (i.estimated_hours ?? 0), 0)
      : msToHours(totalMs(entries.filter((e) => e.kind === (settings.labour_mode === 'visit' ? 'visit' : 'task')), now))

  if (worked > 0) {
    const billed = Math.max(worked, 1) // 1 hour minimum
    if (firstRate !== null) {
      sections.push({
        itemId: null,
        title: 'Service call',
        detail: worked < 1 ? 'First hour (minimum charge)' : 'First hour',
        labour: { hours: 1, amount: firstRate },
        parts: [],
      })
      if (billed > 1) {
        sections.push({
          itemId: null,
          title: 'Additional time',
          detail: `${formatMoney(rate)}/hour`,
          labour: { hours: billed - 1, amount: roundMoney((billed - 1) * rate) },
          parts: [],
        })
      }
    } else {
      sections.push({
        itemId: null,
        title: 'Labour',
        detail: worked < 1 ? `${formatMoney(rate)}/hour, 1 hour minimum` : `${formatMoney(rate)}/hour`,
        labour: { hours: billed, amount: roundMoney(billed * rate) },
        parts: [],
      })
    }
  }

  const allParts = sections.flatMap((x) => x.parts)
  const partsCost = roundMoney(allParts.reduce((sum, p) => sum + p.cost, 0))
  const partsTotal = roundMoney(allParts.reduce((sum, p) => sum + p.price, 0))
  const labourHours = sections.reduce((sum, x) => sum + (x.labour?.hours ?? 0), 0)
  const labourTotal = roundMoney(sections.reduce((sum, x) => sum + (x.labour?.amount ?? 0), 0))
  return {
    sections,
    rate,
    firstRate,
    partsMarkup: pct,
    partsCost,
    partsTotal,
    labourHours,
    labourTotal,
    total: roundMoney(partsTotal + labourTotal),
  }
}

/** Flattens a bill into the fixed lines saved on an invoice */
export function invoiceLines(bill: Bill): InvoiceLine[] {
  return bill.sections.flatMap((s) => {
    const lines: InvoiceLine[] = []
    if (s.labour) {
      lines.push({ kind: 'labour', description: s.title, detail: s.detail, quantity: s.labour.hours, amount: s.labour.amount })
    } else if (s.itemId) {
      // Work done; its labour is in the job's labour lines
      lines.push({ kind: 'work', description: s.title, detail: s.detail, quantity: 0, amount: 0 })
    }
    for (const p of s.parts) {
      lines.push({ kind: 'part', description: p.name, detail: s.title, quantity: p.quantity, amount: p.price })
    }
    return lines
  })
}

/** Estimated vs tracked hours per task, to improve future pricing */
export function compareTime(items: PunchItem[], entries: TimeEntry[], now: number) {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    estimated: item.estimated_hours,
    actual: msToHours(totalMs(entries.filter((e) => e.kind === 'task' && e.item_id === item.id), now)),
  }))
}
