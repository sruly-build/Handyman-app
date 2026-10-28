import { describe, expect, it } from 'vitest'
import { defaultSettings } from './api'
import { buildBill, compareTime, invoiceLines, lineTotals, partsMarkup, paymentSummary, withMarkup } from './billing'
import type { Part, PunchItem, Settings, TimeEntry } from './types'

const item = (id: string, estimated_hours: number | null): PunchItem => ({
  id,
  job_id: 'j',
  title: `Item ${id}`,
  location: '',
  notes: '',
  status: 'done',
  measurements: [],
  tools: [],
  estimated_hours,
  position: 0,
  created_at: '2026-01-01T00:00:00Z',
})
const part = (id: string, item_id: string | null, cost: number | null): Part => ({
  id,
  job_id: 'j',
  item_id,
  name: `Part ${id}`,
  quantity: 1,
  cost,
  supplier: '',
  status: 'received',
  created_at: '2026-01-01T00:00:00Z',
  ordered_at: null,
  received_at: null,
})
const entry = (kind: 'visit' | 'task', item_id: string | null, hours: number, user_id = 'u1'): TimeEntry => ({
  id: Math.random().toString(),
  job_id: 'j',
  item_id,
  user_id,
  kind,
  started_at: '2026-01-01T09:00:00Z',
  ended_at: new Date(Date.parse('2026-01-01T09:00:00Z') + hours * 3_600_000).toISOString(),
})
const settings: Settings = { ...defaultSettings, markup_percent: 20, hourly_rate: 50, markup_labour: true }

describe('markup', () => {
  it('a $50 part shows as $60 with 20% markup', () => {
    expect(withMarkup(50, 20)).toBe(60)
  })
  it('rounds to cents', () => {
    expect(withMarkup(9.99, 20)).toBe(11.99)
  })
})

describe('buildBill', () => {
  const items = [item('a', 2), item('b', null)]
  const parts = [part('p1', 'a', 50), part('p2', null, 10)]

  it('estimate uses expected hours and marks up parts and labour', () => {
    const bill = buildBill({ items, parts, entries: [], settings, now: 0 }, 'estimate')
    // labour: 2h × $50 × 1.2 = $120; parts: $60 + $12
    expect(bill.labourTotal).toBe(120)
    expect(bill.partsTotal).toBe(72)
    expect(bill.partsCost).toBe(60)
    expect(bill.total).toBe(192)
    // Work done first (no time or price per item), then labour for the whole job
    expect(bill.sections.map((s) => s.title)).toEqual(['Item a', 'Item b', 'Other parts', 'Labour'])
    expect(bill.sections.filter((s) => s.itemId).every((s) => s.labour === null)).toBe(true)
  })

  it('actual per task uses task timers from every worker', () => {
    const entries = [entry('task', 'a', 1), entry('task', 'a', 0.5, 'u2'), entry('task', 'b', 1), entry('visit', null, 5)]
    const bill = buildBill({ items, parts, entries, settings, now: 0 }, 'actual')
    expect(bill.labourHours).toBeCloseTo(2.5)
    expect(bill.labourTotal).toBe(150)
  })

  it('actual by visit charges arrival to finish and lists items as work done', () => {
    const entries = [entry('visit', null, 3), entry('visit', null, 3, 'u2'), entry('task', 'a', 1)]
    const bill = buildBill({ items, parts, entries, settings: { ...settings, labour_mode: 'visit' }, now: 0 }, 'actual')
    expect(bill.labourHours).toBe(6)
    expect(bill.labourTotal).toBe(360)
    const lines = invoiceLines(bill)
    expect(lines.filter((l) => l.kind === 'work').map((l) => l.description)).toEqual(['Item a', 'Item b'])
    expect(lines.filter((l) => l.kind === 'labour')).toHaveLength(1)
  })

  it('labour without markup when switched off', () => {
    const bill = buildBill({ items, parts: [], entries: [], settings: { ...settings, markup_labour: false }, now: 0 }, 'estimate')
    expect(bill.labourTotal).toBe(100)
  })

  it('compares expected and actual time', () => {
    const c = compareTime(items, [entry('task', 'a', 3)], 0)
    expect(c[0]).toMatchObject({ estimated: 2, actual: 3 })
  })
})

describe('first hour rate', () => {
  const plain: Settings = { ...settings, first_hour_rate: 150, hourly_rate: 90, markup_labour: false }

  it('charges the first hour of the job at the first-hour rate, then the hourly rate', () => {
    // 3 hours on site: $150 + 2 × $90 = $330
    const bill = buildBill(
      { items: [item('a', null)], parts: [], entries: [entry('visit', null, 3)], settings: { ...plain, labour_mode: 'visit' }, now: 0 },
      'actual',
    )
    expect(bill.labourTotal).toBe(330)
  })

  it('adds up the time of everyone on every task into one service call plus additional time', () => {
    // 0.5 h + 2 h = 2.5 h → $150 first hour + 1.5 h × $90
    const entries = [entry('task', 'a', 0.5), entry('task', 'b', 2, 'u2')]
    const bill = buildBill({ items: [item('a', null), item('b', null)], parts: [], entries, settings: plain, now: 0 }, 'actual')
    expect(bill.labourTotal).toBe(285)
    const lines = invoiceLines(bill)
    expect(lines.map((l) => [l.kind, l.description, l.amount])).toEqual([
      ['work', 'Item a', 0],
      ['work', 'Item b', 0],
      ['labour', 'Service call', 150],
      ['labour', 'Additional time', 135],
    ])
    expect(lines[3]).toMatchObject({ quantity: 1.5, detail: '$90.00/hour' })
  })

  it('a job shorter than an hour is charged the full service call', () => {
    // 20 minutes on site → $150
    const bill = buildBill(
      { items: [item('a', null)], parts: [], entries: [entry('visit', null, 1 / 3)], settings: { ...plain, labour_mode: 'visit' }, now: 0 },
      'actual',
    )
    expect(bill.labourTotal).toBe(150)
    const lines = invoiceLines(bill)
    expect(lines.map((l) => l.description)).toEqual(['Item a', 'Service call'])
    expect(lines[1]).toMatchObject({ detail: 'First hour (minimum charge)', quantity: 1, amount: 150 })
  })

  it('the 1 hour minimum also applies without a first-hour rate, but not when there is no labour', () => {
    const flat = { ...plain, first_hour_rate: null }
    const short = buildBill({ items: [item('a', 0.25)], parts: [], entries: [], settings: flat, now: 0 }, 'estimate')
    expect(short.labourTotal).toBe(90)
    const none = buildBill({ items: [item('a', null)], parts: [], entries: [], settings: flat, now: 0 }, 'estimate')
    expect(none.labourTotal).toBe(0)
    expect(none.sections.some((s) => s.labour)).toBe(false)
  })

  it('with no first-hour rate every hour is the same', () => {
    const bill = buildBill({ items: [item('a', 2)], parts: [], entries: [], settings: { ...plain, first_hour_rate: null }, now: 0 }, 'estimate')
    expect(bill.labourTotal).toBe(180)
    expect(bill.firstRate).toBeNull()
  })
})

describe('markup on materials switch', () => {
  const parts = [part('p1', null, 50)]
  it('is on by default', () => {
    expect(buildBill({ items: [], parts, entries: [], settings, now: 0 }, 'estimate').partsTotal).toBe(60)
  })
  it('can be turned off in settings', () => {
    const off = { ...settings, markup_parts: false }
    expect(buildBill({ items: [], parts, entries: [], settings: off, now: 0 }, 'estimate').partsTotal).toBe(50)
  })
  it('a job can override the setting either way', () => {
    expect(buildBill({ items: [], parts, entries: [], settings, job: { markup_parts: false }, now: 0 }, 'estimate').partsTotal).toBe(50)
    const off = { ...settings, markup_parts: false }
    expect(buildBill({ items: [], parts, entries: [], settings: off, job: { markup_parts: true }, now: 0 }, 'estimate').partsTotal).toBe(60)
    expect(partsMarkup(off, { markup_parts: null })).toBe(0)
  })
})

describe('extra charges and payments', () => {
  const charge = (id: string, quantity: number, unit_price: number) => ({
    id,
    job_id: 'j',
    description: `Charge ${id}`,
    quantity,
    unit_price,
    created_at: '2026-01-01T00:00:00Z',
  })

  it('adds line items at the price entered, with no markup', () => {
    const bill = buildBill(
      { items: [item('a', 1)], parts: [part('p1', 'a', 50)], entries: [], settings, charges: [charge('c1', 1, 25), charge('c2', 3, 10)], now: 0 },
      'estimate',
    )
    // labour 1 h × $50 × 1.2 = $60, parts $60, extras $25 + $30
    expect(bill.extrasTotal).toBe(55)
    expect(bill.total).toBe(175)
    const extras = invoiceLines(bill).filter((l) => l.kind === 'extra')
    expect(extras).toEqual([
      { kind: 'extra', description: 'Charge c1', detail: '', quantity: 1, amount: 25, charge_id: 'c1' },
      { kind: 'extra', description: 'Charge c2', detail: '3 × $10.00', quantity: 3, amount: 30, charge_id: 'c2' },
    ])
    expect(lineTotals(invoiceLines(bill))).toEqual({ labour: 60, parts: 60, extras: 55 })
  })

  it('works out what has been paid and the balance', () => {
    const pay = (amount: number) => ({ id: String(amount), job_id: 'j', amount, paid_on: '2026-01-01', method: 'cash' as const, note: '', created_at: '' })
    expect(paymentSummary(345, [])).toEqual({ paid: 0, balance: 345 })
    expect(paymentSummary(345, [pay(100), pay(45.5)])).toEqual({ paid: 145.5, balance: 199.5 })
    expect(paymentSummary(345, [pay(345)]).balance).toBe(0)
  })
})
