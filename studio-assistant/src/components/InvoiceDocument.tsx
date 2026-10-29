import type { ReactNode } from 'react'
import { CreditCard, Landmark, Zap } from 'lucide-react'
import { isOverdue, totals } from '../data/billing'
import { fmtShort } from '../lib/dates'
import { money } from '../lib/money'
import type { Invoice, Settings } from '../data/types'
import { BrandMark } from './StudioLogo'
import { Card, IconTile, cx, type Tone } from './ui'

interface Props {
  inv: Invoice
  cardFeePct: number
  studio: { businessName: string; email: string; phone: string; logoColor: string; logoUrl?: string }
  client: { company: string; name: string; email: string } | null
  pay: { zelleName: string; zelleContact: string; checkPayee: string; checkAddress: string }
  /** Shows the card button; it is only clickable when onPayCard is given */
  cardEnabled: boolean
  onPayCard?: () => void
  payBusy?: boolean
}

/** The invoice or estimate exactly as the client sees it. */
export function InvoiceDocument({ inv, cardFeePct, studio, client, pay, cardEnabled, onPayCard, payBusy }: Props) {
  const t = totals(inv, { cardFeePct } as Settings)
  const overdue = isOverdue(inv)
  const due = inv.kind === 'invoice' && t.balance > 0
  return (
    <Card className="overflow-hidden">
      <div className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandMark size={44} color={studio.logoColor} url={studio.logoUrl} />
            <div>
              <div className="text-[17px] font-semibold">{studio.businessName}</div>
              <div className="text-[12px] text-ink-2">{[studio.email, studio.phone].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[12px] font-semibold tracking-wider text-ink-3 uppercase">{inv.kind}</div>
            <div className="text-[15px] font-semibold">{inv.number}</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 text-[14px]">
          <div>
            <div className="text-[12px] text-ink-3">Bill to</div>
            <div className="font-medium">{client?.company}</div>
            <div className="text-ink-2">{client?.name}</div>
            <div className="text-ink-2">{client?.email}</div>
          </div>
          <div className="text-right">
            <div className="text-[12px] text-ink-3">Issued</div>
            <div>{fmtShort(inv.issued)}</div>
            <div className="mt-1 text-[12px] text-ink-3">{inv.kind === 'estimate' ? 'Valid until' : 'Due'}</div>
            <div className={cx(overdue && 'font-semibold text-red')}>{fmtShort(inv.due)}</div>
          </div>
        </div>

        <div className="mt-6 border-t border-line">
          {inv.method === 'hourly' && <LineRow desc={`Studio time (${inv.hours} h × ${money(inv.rate, false)})`} amount={inv.hours * inv.rate} />}
          {inv.lines.map((l) => (
            <LineRow key={l.id} desc={l.desc} sub={l.qty > 1 ? `${l.qty} × ${money(l.price)}` : undefined} amount={l.qty * l.price} />
          ))}
        </div>

        <div className="mt-4 ml-auto max-w-xs space-y-1.5 text-[14px]">
          <TotalRow label="Subtotal" value={money(t.subtotal)} />
          {t.discount > 0 && <TotalRow label={`Discount${inv.discountType === 'pct' ? ` (${inv.discount}%)` : ''}`} value={`−${money(t.discount)}`} />}
          {t.cardFee > 0 && <TotalRow label={`Card processing (${cardFeePct}%)`} value={money(t.cardFee)} />}
          <div className="flex justify-between border-t border-line pt-2 text-[17px] font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{money(t.total)}</span>
          </div>
          {t.deposit > 0 && <TotalRow label={`Deposit${inv.depositType === 'pct' ? ` (${inv.deposit}%)` : ''}`} value={money(t.deposit)} muted />}
          {t.paid > 0 && <TotalRow label="Paid" value={`−${money(t.paid)}`} muted />}
          {inv.kind === 'invoice' && (
            <div className={cx('flex justify-between rounded-xl px-3 py-2 text-[16px] font-semibold', due ? 'bg-orange-soft text-orange' : 'bg-green-soft text-green')}>
              <span>{due ? 'Balance due' : 'Paid in full'}</span>
              <span className="tabular-nums">{money(t.balance)}</span>
            </div>
          )}
        </div>
        <p className="mt-3 text-right text-[12px] text-ink-3">No sales tax.</p>
        {inv.note && <p className="mt-4 rounded-xl bg-fill px-3.5 py-3 text-[14px] text-ink-2">{inv.note}</p>}
        {inv.convertedFrom && <p className="mt-3 text-[12px] text-ink-3">From estimate {inv.convertedFrom}</p>}
      </div>

      {(due || inv.kind === 'estimate') && (
        <div className="border-t border-line bg-fill/60 p-5 sm:p-7">
          <div className="mb-3 text-[13px] font-semibold tracking-wide text-ink-2 uppercase">How to pay</div>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {pay.zelleContact && <PayOption icon={<Zap size={16} />} tone="purple" title="Zelle" lines={[pay.zelleName, pay.zelleContact]} />}
            {pay.checkAddress && <PayOption icon={<Landmark size={16} />} tone="blue" title="Check" lines={[`Payable to ${pay.checkPayee}`, pay.checkAddress]} />}
            {cardEnabled && (
              <PayOption icon={<CreditCard size={16} />} tone="green" title="Credit card" lines={['Pay securely with Stripe', inv.cardFee ? `A ${cardFeePct}% processing fee is added` : 'No card fee']}>
                {inv.kind === 'invoice' && (
                  <button
                    onClick={onPayCard}
                    disabled={!onPayCard || payBusy}
                    className="mt-2.5 w-full rounded-lg bg-green py-2 text-center text-[13px] font-semibold text-white disabled:opacity-60"
                  >
                    {payBusy ? 'Opening Stripe…' : `Pay ${money(t.balance)} by card`}
                  </button>
                )}
              </PayOption>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

function LineRow({ desc, sub, amount }: { desc: string; sub?: string; amount: number }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-3 text-[14px]">
      <div>
        <div>{desc}</div>
        {sub && <div className="text-[12px] text-ink-3">{sub}</div>}
      </div>
      <div className="tabular-nums">{money(amount)}</div>
    </div>
  )
}

function TotalRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cx('flex justify-between', muted && 'text-ink-2')}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

function PayOption({ icon, title, lines, tone, children }: { icon: ReactNode; title: string; lines: string[]; tone: Tone; children?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-card p-3.5 shadow-card">
      <div className="flex items-center gap-2 text-[15px] font-semibold">
        <IconTile icon={icon} tone={tone} size={26} />
        {title}
      </div>
      {lines.map((l) => (
        <div key={l} className="mt-0.5 text-[13px] text-ink-2">
          {l}
        </div>
      ))}
      {children}
    </div>
  )
}
