import { useState } from 'react'
import { ChevronLeft, ChevronRight, CreditCard, Landmark, Zap } from 'lucide-react'
import { useStore } from '../data/store'
import { fmtShort, parse, today } from '../lib/dates'
import { money } from '../lib/money'
import type { PayMethod } from '../data/types'
import { Card, Empty, Page, PageHeader, Section } from '../components/ui'

const METHOD: Record<PayMethod, { label: string; icon: React.ReactNode; color: string }> = {
  zelle: { label: 'Zelle', icon: <Zap size={16} />, color: '#7b45c7' },
  check: { label: 'Check', icon: <Landmark size={16} />, color: '#0071e3' },
  card: { label: 'Card', icon: <CreditCard size={16} />, color: '#248a3d' },
}

function monthKey(offset: number): string {
  const d = parse(today())
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function ReportScreen() {
  const { state } = useStore()
  const [offset, setOffset] = useState(0)
  const key = monthKey(offset)
  const label = parse(`${key}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const all = state.invoices.flatMap((inv) => inv.payments.map((p) => ({ p, inv })))
  const payments = all.filter(({ p }) => p.date.startsWith(key)).sort((a, b) => b.p.date.localeCompare(a.p.date))
  const total = payments.reduce((n, { p }) => n + p.amount, 0)
  const prev = all.filter(({ p }) => p.date.startsWith(monthKey(offset - 1))).reduce((n, { p }) => n + p.amount, 0)
  const byMethod = (Object.keys(METHOD) as PayMethod[]).map((m) => ({ m, sum: payments.filter(({ p }) => p.method === m).reduce((n, { p }) => n + p.amount, 0) }))

  return (
    <Page>
      <PageHeader back="/invoices" title="Income" />
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => setOffset(offset - 1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-card shadow-card" aria-label="Previous month">
          <ChevronLeft size={18} />
        </button>
        <div className="text-[17px] font-semibold">{label}</div>
        <button
          onClick={() => setOffset(Math.min(0, offset + 1))}
          disabled={offset === 0}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-card shadow-card disabled:opacity-30"
          aria-label="Next month"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <Card className="p-5">
        <div className="text-[14px] text-ink-2">Came in{offset === 0 ? ' this month' : ''}</div>
        <div className="mt-1 text-[40px] leading-tight font-semibold tracking-tight tabular-nums">{money(total)}</div>
        <div className="text-[13px] text-ink-3">
          {payments.length} payment{payments.length === 1 ? '' : 's'} · {money(prev, false)} the month before
        </div>
        {total > 0 && (
          <>
            <div className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-fill">
              {byMethod.map(({ m, sum }) => (
                <div key={m} style={{ width: `${(sum / total) * 100}%`, background: METHOD[m].color }} />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {byMethod.map(({ m, sum }) => (
                <div key={m}>
                  <div className="flex items-center gap-1.5 text-[13px] text-ink-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: METHOD[m].color }} />
                    {METHOD[m].label}
                  </div>
                  <div className="text-[15px] font-semibold tabular-nums">{money(sum, false)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Section title="Payments">
        {payments.length ? (
          <Card className="overflow-hidden">
            {payments.map(({ p, inv }) => {
              const c = state.clients.find((x) => x.id === inv.clientId)
              return (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3 [&+&]:border-t [&+&]:border-line">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-fill" style={{ color: METHOD[p.method].color }}>
                    {METHOD[p.method].icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px]">{c?.company}</div>
                    <div className="text-[12px] text-ink-2">
                      {fmtShort(p.date)} · {inv.number}
                      {p.note && ` · ${p.note}`}
                    </div>
                  </div>
                  <div className="text-[15px] font-semibold text-green tabular-nums">+{money(p.amount)}</div>
                </div>
              )
            })}
          </Card>
        ) : (
          <Card>
            <Empty title="No payments this month" />
          </Card>
        )}
      </Section>
    </Page>
  )
}
