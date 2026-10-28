import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, Bell, Check, CreditCard, FileCheck2, Landmark, Mail, Pencil, Send, Wallet, Zap } from 'lucide-react'
import { uid, useStore } from '../data/store'
import { isOverdue, totals } from '../data/billing'
import { fmtShort, fmtRelativeInline } from '../lib/dates'
import { money } from '../lib/money'
import type { Invoice } from '../data/types'
import { InvoiceBadge } from '../components/bits'
import { PaymentSheet, SendSheet } from '../components/sheets'
import { StudioLogo } from '../components/StudioLogo'
import { Badge, Button, Card, Empty, Page, PageHeader, Section, Toggle, cx } from '../components/ui'
import { convertEstimate } from './InvoicesScreen'

const STEPS: Invoice['status'][] = ['sent', 'viewed', 'partly paid', 'paid']

export function InvoiceScreen() {
  const { id } = useParams()
  const { state, update, toast } = useStore()
  const nav = useNavigate()
  const [sending, setSending] = useState(false)
  const [paying, setPaying] = useState(false)
  const inv = state.invoices.find((i) => i.id === id)
  if (!inv)
    return (
      <Page>
        <PageHeader title="Invoice" back="/invoices" />
        <Empty title="Invoice not found" />
      </Page>
    )
  const s = state.settings
  const t = totals(inv, s)
  const client = state.clients.find((c) => c.id === inv.clientId)
  const project = state.projects.find((p) => p.id === inv.projectId)
  const overdue = isOverdue(inv)
  const remind = inv.kind === 'invoice' && inv.status !== 'draft'
  const stepIdx = STEPS.indexOf(inv.status)

  return (
    <Page>
      <PageHeader
        back="/invoices"
        title={inv.number}
        subtitle={
          <span className="flex items-center gap-2">
            <InvoiceBadge inv={inv} />
            <Link to={`/projects/${project?.id}/billing`} className="text-accent">
              {project?.title}
            </Link>
          </span>
        }
        right={
          <Button size="sm" icon={<Pencil size={14} />} onClick={() => nav(`/invoices/${inv.id}/edit`)}>
            Edit
          </Button>
        }
      />

      {overdue && (
        <div className="mb-4 flex gap-3 rounded-2xl bg-red-soft p-4 text-red">
          <AlertCircle size={20} className="mt-0.5 shrink-0" />
          <div className="flex-1 text-[14px]">
            <div className="font-semibold">Overdue since {fmtShort(inv.due)}</div>
            <div className="text-red/80">
              {s.autoReminders ? `Automatic reminder every ${s.reminderDays} days.` : 'Automatic reminders are off.'}
              {inv.lastReminder && ` Last sent ${fmtRelativeInline(inv.lastReminder)}.`}
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex">
        {inv.status !== 'paid' && (
          <Button variant="primary" icon={remind ? <Bell size={16} /> : <Send size={16} />} onClick={() => setSending(true)} className="sm:flex-1">
            {remind ? 'Remind' : 'Send'}
          </Button>
        )}
        {inv.kind === 'estimate' ? (
          <Button
            variant="tinted"
            icon={<FileCheck2 size={16} />}
            className="sm:flex-1"
            onClick={() => {
              const nid = uid('i')
              update((st) => convertEstimate(st, inv.id, nid))
              toast('Estimate turned into an invoice')
              nav(`/invoices/${nid}`, { replace: true })
            }}
          >
            Turn into invoice
          </Button>
        ) : (
          inv.status !== 'paid' && (
            <Button variant="tinted" icon={<Wallet size={16} />} onClick={() => setPaying(true)} className="sm:flex-1">
              Add payment
            </Button>
          )
        )}
      </div>

      {inv.kind === 'invoice' && (
        <Card className="mb-4 px-4 py-3.5">
          <div className="flex">
            {STEPS.map((st, i) => (
              <div key={st} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full items-center">
                  <div className={cx('h-[2px] flex-1', i === 0 ? 'opacity-0' : i <= stepIdx ? 'bg-green' : 'bg-line')} />
                  <div className={cx('flex h-5 w-5 items-center justify-center rounded-full', i <= stepIdx ? 'bg-green text-white' : 'border-2 border-line bg-white')}>
                    {i <= stepIdx && <Check size={12} strokeWidth={3} />}
                  </div>
                  <div className={cx('h-[2px] flex-1', i === STEPS.length - 1 ? 'opacity-0' : i < stepIdx ? 'bg-green' : 'bg-line')} />
                </div>
                <span className={cx('text-[11px] font-medium capitalize', i <= stepIdx ? 'text-ink' : 'text-ink-3')}>{st}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* The document the client sees */}
      <Card className="overflow-hidden">
        <div className="p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <StudioLogo size={44} />
              <div>
                <div className="text-[17px] font-semibold">{s.businessName}</div>
                <div className="text-[12px] text-ink-2">
                  {s.email} · {s.phone}
                </div>
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
            {inv.method === 'hourly' && (
              <LineRow desc={`Studio time (${inv.hours} h × ${money(inv.rate, false)})`} sub="From tracked shot timers" amount={inv.hours * inv.rate} />
            )}
            {inv.lines.map((l) => (
              <LineRow key={l.id} desc={l.desc} sub={l.qty > 1 ? `${l.qty} × ${money(l.price)}` : undefined} amount={l.qty * l.price} />
            ))}
          </div>

          <div className="mt-4 ml-auto max-w-xs space-y-1.5 text-[14px]">
            <TotalRow label="Subtotal" value={money(t.subtotal)} />
            {t.discount > 0 && <TotalRow label={`Discount${inv.discountType === 'pct' ? ` (${inv.discount}%)` : ''}`} value={`−${money(t.discount)}`} />}
            {t.cardFee > 0 && <TotalRow label={`Card processing (${s.cardFeePct}%)`} value={money(t.cardFee)} />}
            <div className="flex justify-between border-t border-line pt-2 text-[17px] font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{money(t.total)}</span>
            </div>
            {t.deposit > 0 && <TotalRow label={`Deposit${inv.depositType === 'pct' ? ` (${inv.deposit}%)` : ''}`} value={money(t.deposit)} muted />}
            {t.paid > 0 && <TotalRow label="Paid" value={`−${money(t.paid)}`} muted />}
            {inv.kind === 'invoice' && (
              <div className="flex justify-between rounded-xl bg-fill px-3 py-2 text-[16px] font-semibold">
                <span>Balance due</span>
                <span className="tabular-nums">{money(t.balance)}</span>
              </div>
            )}
          </div>
          <p className="mt-3 text-right text-[12px] text-ink-3">No sales tax.</p>
          {inv.note && <p className="mt-4 rounded-xl bg-fill px-3.5 py-3 text-[14px] text-ink-2">{inv.note}</p>}
          {inv.convertedFrom && <p className="mt-3 text-[12px] text-ink-3">From estimate {inv.convertedFrom}</p>}
        </div>

        <div className="border-t border-line bg-fill/60 p-5 sm:p-7">
          <div className="mb-3 text-[13px] font-semibold tracking-wide text-ink-2 uppercase">How to pay</div>
          <div className="grid gap-2.5 sm:grid-cols-3">
            <PayOption icon={<Zap size={18} />} title="Zelle" lines={[s.zelleName, s.zelleContact]} />
            <PayOption icon={<Landmark size={18} />} title="Check" lines={[`Payable to ${s.checkPayee}`, s.checkAddress]} />
            <PayOption
              icon={<CreditCard size={18} />}
              title="Credit card"
              lines={['Pay securely with Stripe', inv.cardFee ? `A ${s.cardFeePct}% processing fee is added` : 'No card fee']}
              action
            />
          </div>
        </div>
      </Card>

      <Card className="mt-4 flex items-center gap-3 px-4 py-3">
        <CreditCard size={18} className="text-ink-2" />
        <div className="flex-1">
          <div className="text-[15px]">Client is paying by card</div>
          <div className="text-[12px] text-ink-3">{inv.cardFee ? `Adds the ${s.cardFeePct}% fee to this invoice` : 'Card fee is off for this invoice'}</div>
        </div>
        <Toggle on={inv.payByCard} onChange={(v) => update((st) => void (st.invoices.find((i) => i.id === inv.id)!.payByCard = v))} label="Paying by card" />
      </Card>

      {inv.payments.length > 0 && (
        <Section title="Payments">
          <Card className="overflow-hidden">
            {inv.payments.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3 [&+&]:border-t [&+&]:border-line">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-soft text-green">
                  <Check size={18} />
                </div>
                <div className="flex-1">
                  <div className="text-[15px] font-medium tabular-nums">{money(p.amount)}</div>
                  <div className="text-[12px] text-ink-2">
                    {fmtShort(p.date)} · {p.method === 'card' ? 'Card (Stripe)' : p.method === 'zelle' ? 'Zelle' : 'Check'}
                    {p.note && ` · ${p.note}`}
                  </div>
                </div>
                {s.autoReceipts && (
                  <Badge tone="green" className="gap-1">
                    <Mail size={11} /> Receipt sent
                  </Badge>
                )}
              </div>
            ))}
          </Card>
        </Section>
      )}

      <SendSheet inv={inv} open={sending} onClose={() => setSending(false)} remind={remind} />
      <PaymentSheet inv={inv} open={paying} onClose={() => setPaying(false)} />
    </Page>
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

function PayOption({ icon, title, lines, action }: { icon: React.ReactNode; title: string; lines: string[]; action?: boolean }) {
  return (
    <div className="rounded-2xl bg-card p-3.5 shadow-card">
      <div className="flex items-center gap-2 text-[15px] font-semibold">
        <span className="text-accent">{icon}</span>
        {title}
      </div>
      {lines.map((l) => (
        <div key={l} className="mt-0.5 text-[13px] text-ink-2">
          {l}
        </div>
      ))}
      {action && <div className="mt-2.5 rounded-lg bg-ink py-2 text-center text-[13px] font-semibold text-white">Pay with card</div>}
    </div>
  )
}
