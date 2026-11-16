import { describe, expect, it } from 'vitest'
import { billSummary } from './BillPage'

describe('billSummary', () => {
  it('adds up discounts, payments and what is due', () => {
    const s = billSummary({
      total: 425,
      paid: 100,
      lines: [
        { kind: 'labour', description: 'Labour', detail: '', quantity: 3, amount: 285 },
        { kind: 'part', description: 'Cartridge', detail: '', quantity: 1, amount: 64 },
        { kind: 'extra', description: 'Handles', detail: '', quantity: 5, amount: 116 },
        { kind: 'extra', description: 'Loyal customer', detail: '', quantity: 1, amount: -40 },
      ],
    })
    expect(s).toMatchObject({ saved: 40, subtotal: 465, total: 425, paid: 100, due: 325 })
    expect(s.discounts).toHaveLength(1)
  })
  it('never shows a negative balance', () => {
    expect(billSummary({ total: 50, paid: 80, lines: [] }).due).toBe(0)
  })
})
