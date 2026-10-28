import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { backend } from '../data/backend'
import { extraLine, formatMoney, paymentSummary, roundMoney } from '../data/billing'
import { refreshAll, useCharges, usePayments, usePriceList } from '../data/queries'
import type { Invoice, JobCharge, Payment, PaymentMethod } from '../data/types'
import { useUser } from '../lib/auth'
import { TrashIcon } from './Icons'
import { Button, Card, Divider, ErrorNote, Field, GroupLabel } from './ui'

const money = (v: string) => v.replace(/[^\d.]/g, '')
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const shortDate = (day: string) =>
  new Date(`${day}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export const methodLabels: Record<PaymentMethod, string> = {
  cash: 'Cash',
  check: 'Check',
  card: 'Card',
  transfer: 'Bank transfer / Zelle',
  other: 'Other',
}

/** Marks the invoice paid once payments cover it, and unpaid again if they no longer do */
export async function syncInvoicePaid(invoice: Pick<Invoice, 'id' | 'status' | 'total'>, payments: Pick<Payment, 'amount'>[]) {
  const paidUp = paymentSummary(Number(invoice.total), payments as Payment[]).balance <= 0
  if (paidUp !== (invoice.status === 'paid')) await backend.setInvoicePaid(invoice.id, paidUp)
}

/** Line items typed in by hand: add-ons, flat-price jobs, trip fees, discounts… */
export function ExtraCharges({ jobId, invoice }: { jobId: string; invoice: Invoice | null }) {
  const user = useUser()
  const { data: charges = [] } = useCharges(jobId)
  const { data: priceList = [] } = usePriceList()
  const { data: payments = [] } = usePayments(jobId)
  const qc = useQueryClient()
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [price, setPrice] = useState('')
  const [discount, setDiscount] = useState(false)

  const add = useMutation({
    mutationFn: async () => {
      const q = parseFloat(quantity) > 0 ? parseFloat(quantity) : 1
      const unit = (parseFloat(price) || 0) * (discount ? -1 : 1)
      const charge = await backend.addCharge(jobId, description.trim(), q, unit)
      // An invoice already made gets the new line too
      if (invoice) {
        const line = extraLine({ id: charge.id, description: charge.description, quantity: q, unitPrice: unit, amount: roundMoney(q * unit) })
        const total = roundMoney(Number(invoice.total) + line.amount)
        await backend.updateInvoice(invoice.id, { lines: [...invoice.lines, line], total })
        await syncInvoicePaid({ ...invoice, total }, payments)
      }
    },
    onSuccess: () => {
      setDescription('')
      setQuantity('1')
      setPrice('')
      setDiscount(false)
    },
    onSettled: () => refreshAll(qc),
  })

  const remove = useMutation({
    mutationFn: async (charge: JobCharge) => {
      await backend.deleteCharge(charge.id)
      if (invoice && invoice.lines.some((l) => l.charge_id === charge.id)) {
        const line = invoice.lines.find((l) => l.charge_id === charge.id)!
        const total = roundMoney(Number(invoice.total) - line.amount)
        await backend.updateInvoice(invoice.id, { lines: invoice.lines.filter((l) => l.charge_id !== charge.id), total })
        await syncInvoicePaid({ ...invoice, total }, payments)
      }
    },
    onSettled: () => refreshAll(qc),
  })

  function pick(id: string) {
    const item = priceList.find((p) => p.id === id)
    if (!item) return
    setDescription(item.name)
    setPrice(String(item.price))
    setDiscount(false)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    add.mutate()
  }

  const amount = roundMoney((parseFloat(quantity) > 0 ? parseFloat(quantity) : 1) * (parseFloat(price) || 0))

  return (
    <section className="print:hidden">
      <GroupLabel>Extra charges</GroupLabel>
      {charges.length > 0 && (
        <Card className="mb-3">
          {charges.map((c, i) => (
            <div key={c.id}>
              {i > 0 && <Divider />}
              <div className="flex items-center gap-2 py-2 pl-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px]">{c.description}</p>
                  {c.quantity !== 1 && (
                    <p className="text-[13px] text-muted">
                      {c.quantity} × {formatMoney(c.unit_price)}
                    </p>
                  )}
                </div>
                <span className="text-[16px] font-semibold">{formatMoney(roundMoney(c.quantity * c.unit_price))}</span>
                <button
                  type="button"
                  onClick={() => confirm(`Remove "${c.description}"?`) && remove.mutate(c)}
                  className="flex h-12 w-12 shrink-0 items-center justify-center text-muted active:opacity-50"
                  aria-label={`Remove ${c.description}`}
                >
                  <TrashIcon size={18} />
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <form onSubmit={submit} className="space-y-3">
        <Card>
          {priceList.length > 0 && (
            <>
              <label className="block px-4 py-2.5">
                <span className="block text-[13px] font-medium text-muted">From your price list</span>
                <select
                  value=""
                  onChange={(e) => pick(e.target.value)}
                  className="min-h-10 w-full bg-transparent outline-none"
                  aria-label="From your price list"
                >
                  <option value="">Choose…</option>
                  {priceList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({formatMoney(p.price)})
                    </option>
                  ))}
                </select>
              </label>
              <Divider />
            </>
          )}
          <Field
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Haul away old vanity"
          />
          <Divider />
          <div className="grid grid-cols-2">
            <Field label="Quantity" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(money(e.target.value))} />
            <Field
              label="Price each $"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(money(e.target.value))}
              placeholder="0.00"
              className="border-l border-hairline"
            />
          </div>
          <Divider />
          <label className="flex min-h-12 items-center gap-3 px-4 py-2">
            <input type="checkbox" checked={discount} onChange={(e) => setDiscount(e.target.checked)} className="h-5 w-5 accent-brand" />
            <span className="text-[16px]">This is a discount (takes money off)</span>
          </label>
        </Card>
        {add.error && <ErrorNote error={add.error} />}
        {remove.error && <ErrorNote error={remove.error} />}
        <Button type="submit" variant="secondary" disabled={add.isPending || !description.trim() || !(parseFloat(price) > 0)}>
          {add.isPending ? 'Adding…' : amount > 0 ? `Add ${discount ? '−' : ''}${formatMoney(amount)}` : 'Add charge'}
        </Button>
      </form>
      <p className="mt-1.5 px-4 text-[13px] text-muted">
        Added to the estimate and the bill{invoice ? ', and to this invoice' : ''}. The markup isn't added to these.{' '}
        {user.role === 'owner' && (
          <Link to="/price-list" className="text-brand">
            Edit price list
          </Link>
        )}
      </p>
    </section>
  )
}

/** Deposits and payments received for a job */
export function Payments({ jobId, invoice, billTotal }: { jobId: string; invoice: Invoice | null; billTotal: number }) {
  const { data: payments = [] } = usePayments(jobId)
  const qc = useQueryClient()
  const total = invoice ? Number(invoice.total) : billTotal
  const { paid, balance } = paymentSummary(total, payments)
  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState(today)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [note, setNote] = useState('')

  const add = useMutation({
    mutationFn: async () => {
      const payment = await backend.addPayment({ job_id: jobId, amount: roundMoney(parseFloat(amount)), paid_on: paidOn, method, note: note.trim() })
      if (invoice) await syncInvoicePaid(invoice, [...payments, payment])
    },
    onSuccess: () => {
      setAmount('')
      setNote('')
    },
    onSettled: () => refreshAll(qc),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await backend.deletePayment(id)
      if (invoice) await syncInvoicePaid(invoice, payments.filter((p) => p.id !== id))
    },
    onSettled: () => refreshAll(qc),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    add.mutate()
  }

  return (
    <section className="print:hidden">
      <GroupLabel>Payments</GroupLabel>
      <Card className="mb-3 p-4">
        <div className="flex justify-between text-[16px]">
          <span className="text-muted">{invoice ? `Invoice #${invoice.number}` : 'Bill so far'}</span>
          <span>{formatMoney(total)}</span>
        </div>
        <div className="flex justify-between text-[16px]">
          <span className="text-muted">Paid</span>
          <span>{formatMoney(paid)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-hairline pt-2 text-[20px] font-bold">
          <span>{balance < 0 ? 'Overpaid' : 'Balance due'}</span>
          <span className={balance <= 0 && paid > 0 ? 'text-brand' : ''}>{formatMoney(Math.abs(balance))}</span>
        </div>
        {invoice && balance <= 0 && paid > 0 && <p className="mt-1 text-[14px] font-semibold text-brand">Paid in full</p>}
      </Card>

      {payments.length > 0 && (
        <Card className="mb-3">
          {payments.map((p, i) => (
            <div key={p.id}>
              {i > 0 && <Divider />}
              <div className="flex items-center gap-2 py-2 pl-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-semibold">{formatMoney(p.amount)}</p>
                  <p className="truncate text-[13px] text-muted">
                    {shortDate(p.paid_on)} · {methodLabels[p.method]}
                    {p.note ? ` · ${p.note}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => confirm(`Delete the ${formatMoney(p.amount)} payment?`) && remove.mutate(p.id)}
                  className="flex h-12 w-12 shrink-0 items-center justify-center text-muted active:opacity-50"
                  aria-label={`Delete ${formatMoney(p.amount)} payment`}
                >
                  <TrashIcon size={18} />
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <form onSubmit={submit} className="space-y-3">
        <Card>
          <div className="grid grid-cols-2">
            <Field
              label="Amount received $"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(money(e.target.value))}
              placeholder={balance > 0 ? String(balance) : '0.00'}
            />
            <Field
              label="Date"
              type="date"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
              className="border-l border-hairline"
            />
          </div>
          <Divider />
          <label className="block px-4 py-2.5">
            <span className="block text-[13px] font-medium text-muted">How they paid</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="min-h-10 w-full bg-transparent outline-none"
              aria-label="How they paid"
            >
              {Object.entries(methodLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Divider />
          <Field label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Deposit, check #1042" />
        </Card>
        {add.error && <ErrorNote error={add.error} />}
        {remove.error && <ErrorNote error={remove.error} />}
        <div className="flex gap-3">
          {balance > 0 && (
            <Button type="button" variant="secondary" onClick={() => setAmount(String(balance))}>
              Full balance
            </Button>
          )}
          <Button type="submit" disabled={add.isPending || !(parseFloat(amount) > 0) || !paidOn}>
            {add.isPending ? 'Saving…' : 'Record payment'}
          </Button>
        </div>
      </form>
      <p className="mt-1.5 px-4 text-[13px] text-muted">
        Record deposits and partial payments here.{invoice ? ' The invoice is marked paid once the balance is $0.' : ''}
      </p>
    </section>
  )
}
