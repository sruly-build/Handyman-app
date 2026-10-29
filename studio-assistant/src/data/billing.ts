import { round2 } from '../lib/money'
import { today } from '../lib/dates'
import type { Invoice, Project, Settings, State } from './types'

export interface Totals {
  subtotal: number
  discount: number
  afterDiscount: number
  cardFee: number
  total: number
  deposit: number
  paid: number
  balance: number
}

export function totals(inv: Invoice, s: Settings): Totals {
  const items = inv.lines.reduce((sum, l) => sum + l.qty * l.price, 0)
  const hourly = inv.method === 'hourly' ? inv.hours * inv.rate : 0
  const subtotal = round2(items + hourly)
  const discount = round2(inv.discountType === 'pct' ? (subtotal * inv.discount) / 100 : Math.min(inv.discount, subtotal))
  const afterDiscount = round2(subtotal - discount)
  // The fee is only added when the client actually pays by card
  const cardFee = inv.cardFee && inv.payByCard ? round2((afterDiscount * s.cardFeePct) / 100) : 0
  const total = round2(afterDiscount + cardFee)
  const deposit = round2(inv.depositType === 'pct' ? (afterDiscount * inv.deposit) / 100 : inv.deposit)
  const paid = round2(inv.payments.reduce((sum, p) => sum + p.amount, 0))
  return { subtotal, discount, afterDiscount, cardFee, total, deposit, paid, balance: round2(Math.max(0, total - paid)) }
}

/** A done project is archived once it has an invoice and every invoice on it is paid. */
export function isArchived(state: State, p: Project): boolean {
  if (p.stage !== 'done') return false
  const invs = state.invoices.filter((i) => i.projectId === p.id && i.kind === 'invoice')
  return invs.length > 0 && invs.every((i) => i.status === 'paid')
}

export function isOverdue(inv: Invoice): boolean {
  return inv.kind === 'invoice' && inv.status !== 'paid' && inv.status !== 'draft' && inv.due < today()
}

export function statusFor(inv: Invoice, s: Settings): Invoice['status'] {
  const t = totals(inv, s)
  if (t.paid > 0 && t.balance <= 0) return 'paid'
  if (t.paid > 0) return 'partly paid'
  return inv.status === 'paid' || inv.status === 'partly paid' ? 'sent' : inv.status
}
