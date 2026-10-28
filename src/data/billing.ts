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
  /** The punch list item this section is for, or null for "Labour" / "Other parts" */
  itemId: string | null
  title: string
  detail: string
  labour: { hours: number; amount: number } | null
  parts: BillPart[]
}

export interface Bill {
  sections: BillSection[]
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
  now: number
}

/** Hourly rate the customer pays (with markup, if markup applies to labour) */
export function billedRate(settings: Settings): number {
  return settings.markup_labour ? withMarkup(settings.hourly_rate, settings.markup_percent) : settings.hourly_rate
}

/**
 * Builds an estimate (from expected hours) or a bill (from tracked time).
 * Labour is charged either per task timer, or from arrival to finish,
 * depending on the setting.
 */
export function buildBill(input: BillInput, basis: 'estimate' | 'actual'): Bill {
  const { items, parts, entries, settings, now } = input
  const rate = billedRate(settings)
  const pct = settings.markup_percent
  const perTask = basis === 'estimate' || settings.labour_mode === 'task'

  const toBillPart = (p: Part): BillPart => ({
    id: p.id,
    name: p.name,
    quantity: p.quantity,
    cost: p.cost ?? 0,
    price: withMarkup(p.cost ?? 0, pct),
  })

  const sections: BillSection[] = []

  if (!perTask) {
    const hours = msToHours(totalMs(entries.filter((e) => e.kind === 'visit'), now))
    sections.push({
      itemId: null,
      title: 'Labour',
      detail: 'Time on site',
      labour: { hours, amount: roundMoney(hours * rate) },
      parts: [],
    })
  }

  for (const item of items) {
    let labour: BillSection['labour'] = null
    if (perTask) {
      const hours =
        basis === 'estimate'
          ? (item.estimated_hours ?? 0)
          : msToHours(totalMs(entries.filter((e) => e.kind === 'task' && e.item_id === item.id), now))
      if (hours > 0) labour = { hours, amount: roundMoney(hours * rate) }
    }
    const itemParts = parts.filter((p) => p.item_id === item.id).map(toBillPart)
    if (labour || itemParts.length || !perTask) {
      sections.push({ itemId: item.id, title: item.title, detail: item.location, labour, parts: itemParts })
    }
  }

  const itemIds = new Set(items.map((i) => i.id))
  const otherParts = parts.filter((p) => !p.item_id || !itemIds.has(p.item_id)).map(toBillPart)
  if (otherParts.length) sections.push({ itemId: null, title: 'Other parts', detail: '', labour: null, parts: otherParts })

  const allParts = sections.flatMap((s) => s.parts)
  const partsCost = roundMoney(allParts.reduce((s, p) => s + p.cost, 0))
  const partsTotal = roundMoney(allParts.reduce((s, p) => s + p.price, 0))
  const labourHours = sections.reduce((s, x) => s + (x.labour?.hours ?? 0), 0)
  const labourTotal = roundMoney(sections.reduce((s, x) => s + (x.labour?.amount ?? 0), 0))
  return {
    sections,
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
      // Work done with no separate labour charge (e.g. labour billed as time on site)
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
