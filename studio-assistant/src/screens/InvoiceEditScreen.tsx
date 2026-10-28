import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Clock, Minus, Plus, Trash2 } from 'lucide-react'
import { projectSeconds, uid, useStore } from '../data/store'
import { totals } from '../data/billing'
import { fmtDuration } from '../lib/dates'
import { money } from '../lib/money'
import type { Invoice } from '../data/types'
import { Button, Card, Empty, Field, Page, PageHeader, Section, Segmented, Sheet, Toggle, cx, inputCls } from '../components/ui'

export function InvoiceEditScreen() {
  const { id } = useParams()
  const { state, update, toast } = useStore()
  const nav = useNavigate()
  const [picking, setPicking] = useState(false)
  const inv = state.invoices.find((i) => i.id === id)
  if (!inv)
    return (
      <Page>
        <PageHeader title="Edit" back="/invoices" />
        <Empty title="Invoice not found" />
      </Page>
    )
  const s = state.settings
  const t = totals(inv, s)
  const project = state.projects.find((p) => p.id === inv.projectId)
  const tracked = project ? projectSeconds(state, project, Date.now()) : 0
  const edit = (fn: (i: Invoice) => void) => update((st) => fn(st.invoices.find((x) => x.id === inv.id)!))
  const num = (v: string) => Math.max(0, parseFloat(v) || 0)

  return (
    <Page>
      <PageHeader
        back={`/invoices/${inv.id}`}
        title={`Edit ${inv.number}`}
        subtitle={project?.title}
        right={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              toast('Saved')
              nav(`/invoices/${inv.id}`)
            }}
          >
            Done
          </Button>
        }
      />

      <Field label="Bill by">
        <Segmented
          value={inv.method}
          onChange={(v) => edit((i) => void (i.method = v))}
          options={[
            { value: 'items', label: 'Price sheet items' },
            { value: 'hourly', label: 'Hourly' },
          ]}
        />
      </Field>

      {inv.method === 'hourly' && (
        <Section title="Hours">
          <Card className="p-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Hours">
                <input inputMode="decimal" value={inv.hours} onChange={(e) => edit((i) => void (i.hours = num(e.target.value)))} className={inputCls} />
              </Field>
              <Field label="Rate per hour">
                <input inputMode="decimal" value={inv.rate} onChange={(e) => edit((i) => void (i.rate = num(e.target.value)))} className={inputCls} />
              </Field>
            </div>
            <button
              onClick={() => edit((i) => void (i.hours = Math.round((tracked / 3600) * 4) / 4))}
              className="mt-3 flex w-full items-center gap-2 rounded-xl bg-accent-soft px-3.5 py-2.5 text-left text-[14px] text-accent"
            >
              <Clock size={16} />
              <span className="flex-1">Use tracked time: {fmtDuration(tracked)}</span>
              <span className="font-semibold">Use</span>
            </button>
          </Card>
        </Section>
      )}

      <Section
        title={inv.method === 'hourly' ? 'Extras' : 'Items'}
        action={
          <Button variant="plain" size="sm" onClick={() => setPicking(true)}>
            Add from price sheet
          </Button>
        }
      >
        <Card className="overflow-hidden">
          {inv.lines.map((l) => (
            <div key={l.id} className="px-4 py-3 [&+&]:border-t [&+&]:border-line">
              <div className="flex items-center gap-2">
                <input value={l.desc} onChange={(e) => edit((i) => void (i.lines.find((x) => x.id === l.id)!.desc = e.target.value))} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
                <button onClick={() => edit((i) => void (i.lines = i.lines.filter((x) => x.id !== l.id)))} aria-label="Remove line" className="text-ink-3">
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="flex items-center rounded-full bg-fill">
                  <button onClick={() => edit((i) => void (i.lines.find((x) => x.id === l.id)!.qty = Math.max(1, l.qty - 1)))} className="flex h-8 w-8 items-center justify-center" aria-label="Less">
                    <Minus size={14} />
                  </button>
                  <span className="w-7 text-center text-[14px] font-semibold tabular-nums">{l.qty}</span>
                  <button onClick={() => edit((i) => void (i.lines.find((x) => x.id === l.id)!.qty = l.qty + 1))} className="flex h-8 w-8 items-center justify-center" aria-label="More">
                    <Plus size={14} />
                  </button>
                </div>
                <span className="text-ink-3">×</span>
                <div className="relative w-24">
                  <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-[14px] text-ink-3">$</span>
                  <input
                    inputMode="decimal"
                    value={l.price}
                    onChange={(e) => edit((i) => void (i.lines.find((x) => x.id === l.id)!.price = num(e.target.value)))}
                    className="h-8 w-full rounded-lg bg-fill pr-2 pl-6 text-[14px] outline-none"
                  />
                </div>
                <span className="ml-auto text-[15px] font-semibold tabular-nums">{money(l.qty * l.price)}</span>
              </div>
            </div>
          ))}
          <button
            onClick={() => edit((i) => i.lines.push({ id: uid('l'), desc: 'Custom item', qty: 1, price: 0 }))}
            className="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left text-[15px] text-accent first:border-t-0"
          >
            <Plus size={20} /> Custom line
          </button>
        </Card>
      </Section>

      <Section title="Discount and deposit">
        <Card className="space-y-4 p-4">
          <div>
            <div className="mb-1 px-1 text-[13px] font-medium text-ink-2">Discount</div>
            <div className="flex gap-2">
              <Segmented
                value={inv.discountType}
                onChange={(v) => edit((i) => void (i.discountType = v))}
                className="w-28"
                options={[
                  { value: 'pct', label: '%' },
                  { value: 'amt', label: '$' },
                ]}
              />
              <input inputMode="decimal" value={inv.discount} onChange={(e) => edit((i) => void (i.discount = num(e.target.value)))} className={inputCls} />
            </div>
          </div>
          <div>
            <div className="mb-1 px-1 text-[13px] font-medium text-ink-2">Deposit</div>
            <div className="flex gap-2">
              <Segmented
                value={inv.depositType}
                onChange={(v) => edit((i) => void (i.depositType = v))}
                className="w-28"
                options={[
                  { value: 'pct', label: '%' },
                  { value: 'amt', label: '$' },
                ]}
              />
              <input inputMode="decimal" value={inv.deposit} onChange={(e) => edit((i) => void (i.deposit = num(e.target.value)))} className={inputCls} />
            </div>
          </div>
        </Card>
      </Section>

      <Section title="Card payments">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1">
              <div className="text-[15px]">Add {s.cardFeePct}% card fee</div>
              <div className="text-[12px] text-ink-3">Only charged if the client pays by card</div>
            </div>
            <Toggle on={inv.cardFee} onChange={(v) => edit((i) => void (i.cardFee = v))} label="Card fee" />
          </div>
          <div className="flex items-center gap-3 border-t border-line px-4 py-3">
            <div className="flex-1">
              <div className="text-[15px]">Client is paying by card</div>
              <div className="text-[12px] text-ink-3">Preview the total with the fee</div>
            </div>
            <Toggle on={inv.payByCard} onChange={(v) => edit((i) => void (i.payByCard = v))} label="Paying by card" />
          </div>
        </Card>
      </Section>

      <Section title="Details">
        <Card className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Issued">
              <input type="date" value={inv.issued} onChange={(e) => edit((i) => void (i.issued = e.target.value))} className={inputCls} />
            </Field>
            <Field label={inv.kind === 'estimate' ? 'Valid until' : 'Due'}>
              <input type="date" value={inv.due} onChange={(e) => edit((i) => void (i.due = e.target.value))} className={inputCls} />
            </Field>
          </div>
          <Field label="Note to client">
            <textarea value={inv.note} onChange={(e) => edit((i) => void (i.note = e.target.value))} rows={3} className={inputCls} />
          </Field>
        </Card>
      </Section>

      <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] mt-6 lg:bottom-4">
        <Card className="flex items-center justify-between gap-4 px-4 py-3 shadow-float">
          <div className="text-[13px] text-ink-2">
            {t.discount > 0 && <div>Discount −{money(t.discount)}</div>}
            {t.cardFee > 0 && <div>Card fee {money(t.cardFee)}</div>}
            {t.deposit > 0 && <div>Deposit {money(t.deposit)}</div>}
            {!t.discount && !t.cardFee && !t.deposit && <div>No sales tax</div>}
          </div>
          <div className="text-right">
            <div className="text-[12px] text-ink-2">Total</div>
            <div className="text-[22px] font-semibold tracking-tight tabular-nums">{money(t.total)}</div>
          </div>
        </Card>
      </div>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Price sheet">
        <div className="overflow-hidden rounded-2xl bg-card shadow-card">
          {s.priceSheet.map((item) => {
            const existing = inv.lines.find((l) => l.desc === item.name)
            return (
              <button
                key={item.id}
                onClick={() => {
                  edit((i) => {
                    const l = i.lines.find((x) => x.desc === item.name)
                    if (l) l.qty++
                    else i.lines.push({ id: uid('l'), desc: item.name, qty: 1, price: item.price })
                  })
                  toast(`Added ${item.name}`)
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-fill [&+&]:border-t [&+&]:border-line"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[15px]">{item.name}</div>
                  <div className="text-[12px] text-ink-3">
                    {money(item.price)} per {item.unit}
                  </div>
                </div>
                {existing && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-semibold text-accent">×{existing.qty}</span>}
                <Plus size={20} className={cx('text-accent')} />
              </button>
            )
          })}
        </div>
      </Sheet>
    </Page>
  )
}
