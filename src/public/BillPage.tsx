import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { MailIcon, PhoneIcon, PrintIcon } from '../components/Icons'
import { ErrorNote, Loading } from '../components/ui'
import { publicApi } from '../data/backend'
import { formatMoney } from '../data/billing'
import { formatDuration } from '../data/time'
import type { InvoiceLine, PublicBill } from '../data/types'
import { phoneLink } from '../lib/links'

const round = (n: number) => Math.round(n * 100) / 100
const longDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

/** Money off: a negative line (typed in as a discount) */
const isDiscount = (l: InvoiceLine) => l.amount < 0

/** The totals the customer sees: before discounts, the discounts, the total, paid and due */
export function billSummary(b: Pick<PublicBill, 'lines' | 'total' | 'paid'>) {
  const discounts = b.lines.filter(isDiscount)
  const saved = round(-discounts.reduce((s, l) => s + l.amount, 0))
  const total = round(Number(b.total))
  const paid = round(Number(b.paid))
  return { discounts, saved, subtotal: round(total + saved), total, paid, due: round(Math.max(0, total - paid)) }
}

/**
 * /b/<token>: the customer's live estimate or invoice. Every line, each
 * discount, payments and what's still due, always the latest (it refreshes
 * itself). Only someone with the link can open it.
 */
export function BillPage() {
  const { token = '' } = useParams()
  const [params] = useSearchParams()
  const peek = params.get('preview') === '1'
  const { data: bill, isLoading, error } = useQuery({
    queryKey: ['public-bill', token],
    queryFn: () => publicApi.bill(token, peek),
    retry: false,
    refetchInterval: 60_000,
  })
  useEffect(() => {
    if (bill) document.title = `${bill.kind === 'invoice' ? `Invoice #${bill.number}` : 'Estimate'} · ${bill.company.name}`
  }, [bill])

  if (isLoading) return <Frame><Loading /></Frame>
  if (error || !bill) {
    return (
      <Frame>
        {error ? <ErrorNote error={error} /> : <p className="text-[17px]">This link isn't active. Please ask for a new one.</p>}
      </Frame>
    )
  }
  const s = billSummary(bill)
  const invoice = bill.kind === 'invoice'
  const paidUp = invoice && (bill.status === 'paid' || (s.total > 0 && s.due === 0))
  const qty = (l: InvoiceLine) =>
    l.kind === 'labour' ? formatDuration(l.quantity * 3_600_000) : l.kind === 'part' && l.quantity !== 1 ? `× ${l.quantity}` : ''

  return (
    <Frame>
      {/* Who it's from */}
      <header className="flex items-start justify-between gap-3 print:mb-4">
        <div className="min-w-0">
          <p className="text-[22px] font-bold leading-tight text-[#064e3b]">{bill.company.name || 'Invoice'}</p>
          {bill.company.address && <p className="text-[14px] text-muted">{bill.company.address}</p>}
        </div>
        <div className="flex shrink-0 gap-2 print:hidden">
          {bill.company.phone && (
            <a href={phoneLink(bill.company.phone)} aria-label="Call" className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-brand ring-1 ring-black/[0.06]">
              <PhoneIcon size={19} />
            </a>
          )}
          {bill.company.email && (
            <a href={`mailto:${bill.company.email}`} aria-label="Email" className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-brand ring-1 ring-black/[0.06]">
              <MailIcon size={19} />
            </a>
          )}
        </div>
      </header>

      {/* The amount */}
      <section className="mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-[#064e3b] to-[#047857] px-5 py-5 text-white print:bg-none print:px-0 print:text-ink">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-bold uppercase tracking-wide text-[#a7f3d0] print:text-muted">
            {invoice ? `Invoice #${bill.number}` : 'Estimate'} · {longDate(bill.date)}
          </p>
          {invoice && (
            <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-extrabold uppercase tracking-wide ${paidUp ? 'bg-[#6ee7b7] text-[#064e3b]' : 'bg-[#fbbf24] text-[#3b2a00]'}`}>
              {paidUp ? 'Paid' : 'Balance due'}
            </span>
          )}
        </div>
        <p className="mt-2 text-[15px] text-white/80 print:text-muted">{invoice ? (paidUp ? 'Paid in full' : 'Amount due') : 'Estimated total'}</p>
        <p className="text-[40px] font-extrabold leading-none tracking-tight">{formatMoney(Math.max(0, invoice && !paidUp ? s.due : s.total))}</p>
        <p className="mt-2 text-[14px] text-white/80 print:text-muted">For {bill.customer.name}{bill.customer.address ? ` · ${bill.customer.address}` : ''}</p>
      </section>

      {s.saved > 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[#dcfce7] px-4 py-3 text-[#14532d]">
          <span className="text-[22px]" aria-hidden>🎉</span>
          <p className="text-[15px]">
            <strong>You save {formatMoney(s.saved)}</strong> with {s.discounts.length === 1 ? 'a discount' : `${s.discounts.length} discounts`}.
          </p>
        </div>
      )}

      {/* Every line */}
      <section className="mt-4 rounded-2xl bg-card px-4 py-2 ring-1 ring-black/[0.05]">
        {bill.lines.length === 0 && <p className="py-3 text-[15px] text-muted">No lines yet.</p>}
        {bill.lines.map((l, i) => (
          <div key={i} className={`flex items-start gap-3 py-2.5 ${i ? 'border-t border-hairline' : ''} ${l.kind === 'part' ? 'pl-3' : ''}`}>
            <div className="min-w-0 flex-1">
              <p className={`text-[15px] leading-snug ${l.kind === 'part' ? '' : 'font-semibold'} ${isDiscount(l) ? 'text-[#15803d]' : ''}`}>
                {isDiscount(l) && <span className="mr-1.5 rounded bg-[#dcfce7] px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">Discount</span>}
                {l.description}
              </p>
              {l.kind !== 'part' && l.detail && <p className="text-[13px] text-muted">{l.detail}</p>}
              {qty(l) && <p className="text-[13px] text-muted">{qty(l)}</p>}
            </div>
            <p className={`shrink-0 text-[15px] tabular-nums ${isDiscount(l) ? 'font-semibold text-[#15803d]' : ''}`}>
              {l.kind === 'work' ? <span className="text-[13px] text-muted">included</span> : isDiscount(l) ? `−${formatMoney(-l.amount)}` : formatMoney(l.amount)}
            </p>
          </div>
        ))}
      </section>

      {/* Totals */}
      <section className="mt-3 space-y-1.5 rounded-2xl bg-card px-4 py-3 text-[15px] ring-1 ring-black/[0.05]">
        {s.saved > 0 && (
          <>
            <Row label="Before discounts" value={formatMoney(s.subtotal)} />
            <Row label="Discounts" value={`−${formatMoney(s.saved)}`} green />
          </>
        )}
        <Row label="Total" value={formatMoney(s.total)} bold />
        {invoice && s.paid > 0 && <Row label="Paid" value={`−${formatMoney(s.paid)}`} />}
        {invoice && <Row label="Balance due" value={formatMoney(s.due)} bold />}
      </section>

      {bill.note.trim() && (
        <section className="mt-3 rounded-2xl bg-card px-4 py-3 ring-1 ring-black/[0.05]">
          <p className="text-[12px] font-bold uppercase tracking-wide text-muted">{invoice ? 'How to pay' : 'Note'}</p>
          <p className="mt-0.5 whitespace-pre-wrap text-[15px]">{bill.note}</p>
        </section>
      )}

      {!invoice && <p className="mt-3 px-1 text-[13px] text-muted">This is an estimate; the final bill is based on the actual time and parts.</p>}
      <div className="mt-5 flex items-center justify-between gap-3 print:hidden">
        <p className="text-[12px] text-muted">This page always shows the latest. Thank you for your business!</p>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-card px-3 text-[14px] font-semibold ring-1 ring-black/[0.06]"
        >
          <PrintIcon size={17} /> Save PDF
        </button>
      </div>
    </Frame>
  )
}

function Row({ label, value, bold, green }: { label: string; value: string; bold?: boolean; green?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'text-[17px] font-bold' : ''} ${green ? 'text-[#15803d]' : ''}`}>
      <span className={bold || green ? '' : 'text-muted'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas print:bg-white">
      <div className="mx-auto w-full max-w-lg px-4 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-[calc(env(safe-area-inset-top)+20px)]">{children}</div>
    </div>
  )
}
