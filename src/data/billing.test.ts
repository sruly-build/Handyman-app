import { describe, expect, it } from 'vitest'
import { defaultSettings } from './api'
import { buildBill, compareTime, invoiceLines, withMarkup } from './billing'
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
    expect(bill.sections.map((s) => s.title)).toEqual(['Item a', 'Other parts'])
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
