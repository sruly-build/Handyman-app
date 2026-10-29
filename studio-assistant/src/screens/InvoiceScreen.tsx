import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, Bell, Check, CreditCard, FileCheck2, Link2, Mail, Pencil, Send, Wallet } from 'lucide-react'
import { uid, useStore } from '../data/store'
import { isOverdue } from '../data/billing'
import { fmtShort, fmtRelativeInline } from '../lib/dates'
import { money } from '../lib/money'
import type { Invoice } from '../data/types'
import { InvoiceBadge } from '../components/bits'
import { PaymentSheet, SendSheet, payLink } from '../components/sheets'
import { InvoiceDocument } from '../components/InvoiceDocument'
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
          <>
            <Button
              size="sm"
              icon={<Link2 size={14} />}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(payLink(inv.id))
                  toast('Client link copied')
                } catch {
                  toast(payLink(inv.id))
                }
              }}
            >
              Link
            </Button>
            <Button size="sm" icon={<Pencil size={14} />} onClick={() => nav(`/invoices/${inv.id}/edit`)}>
              Edit
            </Button>
          </>
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

      <InvoiceDocument
        inv={inv}
        cardFeePct={s.cardFeePct}
        studio={s}
        client={client ?? null}
        pay={s}
        cardEnabled
      />

      <Card className="mt-4 flex items-center gap-3 px-4 py-3">
        <CreditCard size={18} className="text-ink-2" />
        <div className="flex-1">
          <div className="text-[15px]">Client is paying by card</div>
          <div className="text-[12px] text-ink-3">{inv.cardFee ? `Adds the ${s.cardFeePct}% fee to this invoice` : 'Card fee is off for this invoice'}</div>
        </div>
        <Toggle on={inv.payByCard} onChange={(v) => update((st) => void (st.invoices.find((i) => i.id === inv.id)!.payByCard = v))} label="Paying by card" />
      </Card>

      {inv.payments.length > 0 && (
        <Section title="Payments" icon={<Wallet size={15} />} tone="green">
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
