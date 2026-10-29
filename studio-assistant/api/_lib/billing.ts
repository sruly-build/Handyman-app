import type { Invoice } from '../../src/data/types'

// Same maths as src/data/billing.ts (totals), kept here so the server doesn't load app files at runtime.

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

/** What the client still owes, without any card fee. */
export function invoiceTotals(inv: Invoice): { total: number; paid: number; balance: number } {
  const items = inv.lines.reduce((sum, l) => sum + l.qty * l.price, 0)
  const hourly = inv.method === 'hourly' ? inv.hours * inv.rate : 0
  const subtotal = round2(items + hourly)
  const discount = round2(inv.discountType === 'pct' ? (subtotal * inv.discount) / 100 : Math.min(inv.discount, subtotal))
  const total = round2(subtotal - discount)
  const paid = round2(inv.payments.reduce((sum, p) => sum + p.amount, 0))
  return { total, paid, balance: round2(Math.max(0, total - paid)) }
}

export { round2 }
