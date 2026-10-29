import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BarChart3, Bell, Eye, FileCheck2, Pencil, Plus, Send, Wallet } from 'lucide-react'
import { projectSeconds, uid, useStore } from '../data/store'
import { isOverdue, totals } from '../data/billing'
import { addDays, fmtShort, today, fmtRelativeInline } from '../lib/dates'
import { money } from '../lib/money'
import type { BillingMethod, Invoice, State } from '../data/types'
import { InvoiceBadge } from '../components/bits'
import { PaymentSheet, SendSheet } from '../components/sheets'
import { Button, Card, Empty, Field, Page, PageHeader, Segmented, Sheet, cx, inputCls } from '../components/ui'

export function newInvoice(s: State, id: string, projectId: string, kind: 'estimate' | 'invoice', method: BillingMethod) {
  const p = s.projects.find((x) => x.id === projectId)!
  const prefix = kind === 'estimate' ? 'EST-' : 'INV-'
  const nums = s.invoices.filter((i) => i.number.startsWith(prefix)).map((i) => parseInt(i.number.slice(4)))
  const next = String(Math.max(kind === 'estimate' ? 216 : 1000, ...nums) + 1).padStart(4, '0')
  const hours = Math.round((projectSeconds(s, p, Date.now()) / 3600) * 4) / 4
  s.invoices.unshift({
    id,
    number: prefix + next,
    kind,
    projectId,
    clientId: p.clientId,
    method,
    lines: [],
    hours,
    rate: s.settings.hourlyRate,
    discountType: 'pct',
    discount: 0,
    depositType: 'pct',
    deposit: kind === 'estimate' ? 30 : 0,
    cardFee: true,
    payByCard: false,
    status: 'draft',
    issued: today(),
    due: addDays(today(), 14),
    payments: [],
    note: '',
  })
}

/** Turns an estimate into an invoice with the same lines, discount and deposit. The estimate is replaced. */
export function convertEstimate(s: State, estimateId: string, newId: string) {
  const est = s.invoices.find((i) => i.id === estimateId)!
  const nums = s.invoices.filter((i) => i.number.startsWith('INV-')).map((i) => parseInt(i.number.slice(4)))
  const inv: Invoice = {
    ...structuredClone(est),
    id: newId,
    kind: 'invoice',
    number: 'INV-' + String(Math.max(1000, ...nums) + 1),
    status: 'draft',
    issued: today(),
    due: addDays(today(), 14),
    payments: [],
    convertedFrom: est.number,
  }
  s.invoices.unshift(inv)
  s.invoices = s.invoices.filter((i) => i.id !== estimateId)
}

type Filter = 'all' | 'unpaid' | 'estimates' | 'paid'

export function InvoicesScreen() {
  const { state } = useStore()
  const [filter, setFilter] = useState<Filter>('all')
  const [creating, setCreating] = useState(false)
  const s = state.settings
  const invoices = state.invoices.filter((i) => i.kind === 'invoice')
  const outstanding = invoices.filter((i) => i.status !== 'paid').reduce((n, i) => n + totals(i, s).balance, 0)
  const overdue = invoices.filter(isOverdue)
  const month = today().slice(0, 7)
  const thisMonth = state.invoices.flatMap((i) => i.payments).filter((p) => p.date.startsWith(month)).reduce((n, p) => n + p.amount, 0)

  const list = state.invoices
    .filter((i) =>
      filter === 'estimates' ? i.kind === 'estimate' : filter === 'paid' ? i.status === 'paid' : filter === 'unpaid' ? i.kind === 'invoice' && i.status !== 'paid' : true,
    )
    .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || b.issued.localeCompare(a.issued))

  return (
    <Page>
      <PageHeader
        title="Invoices"
        right={
          <>
            <Link to="/invoices/report">
              <Button size="sm" icon={<BarChart3 size={15} />}>
                Income
              </Button>
            </Link>
            <Button variant="tinted" size="sm" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
              New
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3.5">
          <div className="text-[12px] text-ink-2">Outstanding</div>
          <div className="text-[19px] font-semibold tracking-tight tabular-nums">{money(outstanding, false)}</div>
        </Card>
        <Card className="p-3.5">
          <div className="text-[12px] text-ink-2">Overdue</div>
          <div className={cx('text-[19px] font-semibold tracking-tight', overdue.length > 0 && 'text-red')}>{overdue.length}</div>
        </Card>
        <Link to="/invoices/report">
          <Card className="p-3.5">
            <div className="text-[12px] text-ink-2">In this month</div>
            <div className="text-[19px] font-semibold tracking-tight text-green tabular-nums">{money(thisMonth, false)}</div>
          </Card>
        </Link>
      </div>

      <Segmented
        value={filter}
        onChange={setFilter}
        className="mt-5 mb-3"
        options={[
          { value: 'all', label: 'All' },
          { value: 'unpaid', label: 'Unpaid' },
          { value: 'estimates', label: 'Estimates' },
          { value: 'paid', label: 'Paid' },
        ]}
      />

      <div className="space-y-3">
        {list.map((inv) => (
          <InvoiceRow key={inv.id} inv={inv} />
        ))}
      </div>
      {!list.length && <Empty title="Nothing here" />}
      <NewInvoiceSheet open={creating} onClose={() => setCreating(false)} />
    </Page>
  )
}

function InvoiceRow({ inv }: { inv: Invoice }) {
  const { state, update, toast } = useStore()
  const nav = useNavigate()
  const [sending, setSending] = useState(false)
  const [paying, setPaying] = useState(false)
  const t = totals(inv, state.settings)
  const client = state.clients.find((c) => c.id === inv.clientId)
  const project = state.projects.find((p) => p.id === inv.projectId)
  const overdue = isOverdue(inv)
  const remind = inv.status !== 'draft' && inv.kind === 'invoice'

  return (
    <Card className="overflow-hidden">
      <button onClick={() => nav(`/invoices/${inv.id}`)} className="block w-full px-4 pt-3.5 pb-3 text-left">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[16px] font-semibold">{client?.company}</span>
              <InvoiceBadge inv={inv} />
            </div>
            <div className="truncate text-[13px] text-ink-2">
              {inv.number} · {project?.title}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[17px] font-semibold tabular-nums">{money(t.total)}</div>
            <div className={cx('text-[12px]', overdue ? 'text-red' : 'text-ink-3')}>
              {inv.status === 'paid'
                ? `Paid ${fmtShort(inv.payments[inv.payments.length - 1]?.date ?? inv.due)}`
                : inv.kind === 'estimate'
                  ? `Sent ${fmtShort(inv.issued)}`
                  : t.paid > 0
                    ? `${money(t.balance)} left`
                    : `Due ${fmtRelativeInline(inv.due)}`}
            </div>
          </div>
        </div>
        {overdue && inv.lastReminder && <div className="mt-1.5 text-[12px] text-ink-3">Reminder sent {fmtRelativeInline(inv.lastReminder)}</div>}
      </button>
      <div className="grid grid-cols-4 border-t border-line">
        <QuickBtn icon={remind ? <Bell size={17} /> : <Send size={17} />} label={remind ? 'Remind' : 'Send'} onClick={() => setSending(true)} disabled={inv.status === 'paid'} />
        {inv.kind === 'estimate' ? (
          <QuickBtn
            icon={<FileCheck2 size={17} />}
            label="Invoice it"
            onClick={() => {
              const id = uid('i')
              update((s) => convertEstimate(s, inv.id, id))
              toast('Estimate turned into an invoice')
              nav(`/invoices/${id}`)
            }}
          />
        ) : (
          <QuickBtn icon={<Wallet size={17} />} label="Payment" onClick={() => setPaying(true)} disabled={inv.status === 'paid'} />
        )}
        <QuickBtn icon={<Eye size={17} />} label="View" onClick={() => nav(`/invoices/${inv.id}`)} />
        <QuickBtn icon={<Pencil size={17} />} label="Edit" onClick={() => nav(`/invoices/${inv.id}/edit`)} />
      </div>
      <SendSheet inv={inv} open={sending} onClose={() => setSending(false)} remind={remind} />
      <PaymentSheet inv={inv} open={paying} onClose={() => setPaying(false)} />
    </Card>
  )
}

function QuickBtn({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-[52px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-accent active:bg-fill disabled:text-ink-3 [&+&]:border-l [&+&]:border-line"
    >
      {icon}
      {label}
    </button>
  )
}

function NewInvoiceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, update } = useStore()
  const nav = useNavigate()
  const [pid, setPid] = useState(state.projects[0]?.id ?? '')
  const [kind, setKind] = useState<'estimate' | 'invoice'>('invoice')
  const [method, setMethod] = useState<BillingMethod>('items')
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New"
      footer={
        <Button
          variant="primary"
          size="lg"
          onClick={() => {
            const id = uid('i')
            update((s) => newInvoice(s, id, pid, kind, method))
            onClose()
            nav(`/invoices/${id}/edit`)
          }}
        >
          Create {kind}
        </Button>
      }
    >
      <div className="space-y-4">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'invoice', label: 'Invoice' },
            { value: 'estimate', label: 'Estimate' },
          ]}
        />
        <Field label="Project">
          <select value={pid} onChange={(e) => setPid(e.target.value)} className={inputCls}>
            {state.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} · {state.clients.find((c) => c.id === p.clientId)?.company}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bill by">
          <Segmented
            value={method}
            onChange={setMethod}
            options={[
              { value: 'items', label: 'Price sheet items' },
              { value: 'hourly', label: 'Hourly (timer)' },
            ]}
          />
        </Field>
      </div>
    </Sheet>
  )
}
