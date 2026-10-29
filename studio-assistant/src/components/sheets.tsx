import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Mail, MessageCircle, MessageSquareText } from 'lucide-react'
import { scheduleWarning, uid, useStore } from '../data/store'
import { totals } from '../data/billing'
import { addDays, fmtLong, today, fmtRelativeInline } from '../lib/dates'
import { money, round2 } from '../lib/money'
import type { Invoice, PayMethod } from '../data/types'
import { Button, Confirm, Field, Segmented, Sheet, inputCls, cx } from './ui'

type Channel = 'email' | 'whatsapp' | 'text'

/** Send or remind: pick email, WhatsApp or text, edit the message, send. */
export function SendSheet({ inv, open, onClose, remind }: { inv: Invoice; open: boolean; onClose: () => void; remind?: boolean }) {
  const { state, update, toast } = useStore()
  const client = state.clients.find((c) => c.id === inv.clientId)
  const t = totals(inv, state.settings)
  const [channel, setChannel] = useState<Channel>('email')
  const first = client?.name.split(' ')[0] ?? 'there'
  const link = `${state.settings.website}/pay/${inv.number.toLowerCase()}`
  const defaultMsg = remind
    ? `Hi ${first}, a friendly reminder that ${inv.number} for ${money(t.balance)} is due ${fmtRelativeInline(inv.due)}. You can pay by Zelle, check or card here: ${link}\n\nThank you!\n${state.settings.owner}`
    : `Hi ${first}, here is your ${inv.kind} ${inv.number} for ${money(t.total)}. View and pay here: ${link}\n\nThank you!\n${state.settings.owner}`
  const [msg, setMsg] = useState(defaultMsg)
  useEffect(() => {
    if (open) setMsg(defaultMsg)
    // Reset the message each time the sheet opens
  }, [open])

  const send = () => {
    update((s) => {
      const i = s.invoices.find((x) => x.id === inv.id)!
      if (i.status === 'draft') i.status = 'sent'
      if (remind) i.lastReminder = today()
    })
    const where = { email: `by email to ${client?.email}`, whatsapp: 'on WhatsApp', text: 'by text' }[channel]
    toast(`${remind ? 'Reminder' : inv.kind === 'estimate' ? 'Estimate' : 'Invoice'} sent ${where}`)
    onClose()
  }

  const opts: { value: Channel; icon: typeof Mail; label: string; sub: string }[] = [
    { value: 'email', icon: Mail, label: 'Email', sub: client?.email ?? '' },
    { value: 'whatsapp', icon: MessageCircle, label: 'WhatsApp', sub: client?.phone ?? '' },
    { value: 'text', icon: MessageSquareText, label: 'Text', sub: client?.phone ?? '' },
  ]

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={remind ? `Remind ${first}` : `Send ${inv.number}`}
      footer={
        <Button variant="primary" size="lg" onClick={send}>
          {remind ? 'Send reminder' : 'Send'}
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        {opts.map((o) => (
          <button
            key={o.value}
            onClick={() => setChannel(o.value)}
            className={cx(
              'flex flex-col items-center gap-1 rounded-2xl border-2 bg-card px-2 py-3 transition',
              channel === o.value ? 'border-accent' : 'border-transparent',
            )}
          >
            <o.icon size={22} className={channel === o.value ? 'text-accent' : 'text-ink-2'} />
            <span className="text-[14px] font-medium">{o.label}</span>
            <span className="w-full truncate text-center text-[11px] text-ink-3">{o.sub}</span>
          </button>
        ))}
      </div>
      <div className="mt-4">
        <Field label="Message">
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={6} className={inputCls} />
        </Field>
      </div>
      {channel === 'email' && <p className="mt-2 px-1 text-[12px] text-ink-3">The invoice PDF is attached and the client can pay online.</p>}
    </Sheet>
  )
}

export function PaymentSheet({ inv, open, onClose }: { inv: Invoice; open: boolean; onClose: () => void }) {
  const { state, update, toast } = useStore()
  const t = totals(inv, state.settings)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PayMethod>('zelle')
  const [note, setNote] = useState('')
  useEffect(() => {
    if (open) {
      setAmount(String(t.paid === 0 && t.deposit > 0 ? t.deposit : t.balance))
      setNote(t.paid === 0 && t.deposit > 0 ? 'Deposit' : '')
    }
  }, [open])

  const save = () => {
    const n = round2(parseFloat(amount) || 0)
    if (n <= 0) return
    update((s) => {
      const i = s.invoices.find((x) => x.id === inv.id)!
      i.payments.push({ id: uid('pay'), amount: n, date: today(), method, note: note || undefined })
      const paid = i.payments.reduce((sum, p) => sum + p.amount, 0)
      i.status = paid >= totals(i, s.settings).total - 0.001 ? 'paid' : 'partly paid'
    })
    toast(state.settings.autoReceipts ? `${money(n)} recorded · receipt emailed` : `${money(n)} recorded`)
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add payment"
      footer={
        <Button variant="primary" size="lg" onClick={save}>
          Save payment
        </Button>
      }
    >
      <div className="mb-4 rounded-2xl bg-card p-4 text-[14px]">
        <div className="flex justify-between">
          <span className="text-ink-2">{inv.number} total</span>
          <span className="tabular-nums">{money(t.total)}</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-ink-2">Paid so far</span>
          <span className="tabular-nums">{money(t.paid)}</span>
        </div>
        <div className="mt-1 flex justify-between font-semibold">
          <span>Balance</span>
          <span className="tabular-nums">{money(t.balance)}</span>
        </div>
      </div>
      <div className="space-y-4">
        <Field label="Amount">
          <div className="relative">
            <span className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-2">$</span>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={cx(inputCls, 'pl-7 text-[20px] font-semibold')} />
          </div>
        </Field>
        <div className="flex gap-2">
          {t.deposit > 0 && t.paid === 0 && (
            <Button size="sm" onClick={() => setAmount(String(t.deposit))}>
              Deposit {money(t.deposit)}
            </Button>
          )}
          <Button size="sm" onClick={() => setAmount(String(t.balance))}>
            Full balance
          </Button>
        </div>
        <Field label="Paid by">
          <Segmented
            value={method}
            onChange={setMethod}
            options={[
              { value: 'zelle', label: 'Zelle' },
              { value: 'check', label: 'Check' },
              { value: 'card', label: 'Card' },
            ]}
          />
        </Field>
        <Field label="Note (optional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Check #1042" className={inputCls} />
        </Field>
        {state.settings.autoReceipts && <p className="px-1 text-[12px] text-ink-3">A receipt is emailed to the client automatically.</p>}
      </div>
    </Sheet>
  )
}

/** New shoot: closed days and holidays don't block it, they just ask first. */
export function ScheduleSheet({ open, onClose, date: initialDate }: { open: boolean; onClose: () => void; date?: string }) {
  const { state, update, toast } = useStore()
  const nav = useNavigate()
  const [date, setDate] = useState(initialDate ?? addDays(today(), 1))
  const [time, setTime] = useState('10:00')
  const [title, setTitle] = useState('')
  const [clientId, setClientId] = useState(state.clients[0].id)
  const [confirm, setConfirm] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setDate(initialDate ?? addDays(today(), 1))
      setTitle('')
    }
  }, [open, initialDate])

  const warning = scheduleWarning(date, state.settings)

  const doSave = () => {
    const id = uid('p')
    const [h, m] = time.split(':').map(Number)
    const label = `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
    update((s) => {
      s.projects.unshift({
        id,
        clientId,
        title: title.trim() || 'New shoot',
        stage: 'todo',
        shootDate: date,
        shootTime: label,
        dueDate: addDays(date, 10),
        priority: 'normal',
        notes: '',
        shotList: [],
        toOrder: [],
        prep: [],
        files: [],
        stickies: [],
        strokes: [],
      })
    })
    setConfirm(null)
    onClose()
    toast('Shoot scheduled')
    nav(`/projects/${id}`)
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title="Schedule a shoot"
        footer={
          <Button variant="primary" size="lg" onClick={() => (warning ? setConfirm(warning) : doSave())}>
            Schedule
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="What are we shooting?">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Ceramic salad bowls" className={inputCls} />
          </Field>
          <Field label="Client">
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputCls}>
              {state.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company} ({c.name})
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Time">
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <div className="px-1 text-[13px] text-ink-2">{fmtLong(date)}</div>
          {warning && (
            <div className="flex gap-2.5 rounded-xl bg-gold-soft px-3.5 py-3 text-[14px] text-gold">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span>{warning.replace(' Schedule anyway?', '')} You can still schedule it.</span>
            </div>
          )}
        </div>
      </Sheet>
      <Confirm open={!!confirm} title="Heads-up" message={confirm ?? ''} confirmLabel="Schedule" onConfirm={doSave} onCancel={() => setConfirm(null)} />
    </>
  )
}

export function AddTaskSheet({
  open,
  onClose,
  defaultTitle = '',
  projectId,
}: {
  open: boolean
  onClose: () => void
  defaultTitle?: string
  projectId?: string
}) {
  const { state, update, toast } = useStore()
  const [title, setTitle] = useState(defaultTitle)
  const [due, setDue] = useState(today())
  const [pid, setPid] = useState(projectId ?? '')
  useEffect(() => {
    if (open) {
      setTitle(defaultTitle)
      setDue(today())
      setPid(projectId ?? '')
    }
  }, [open, defaultTitle, projectId])
  const save = () => {
    if (!title.trim()) return
    update((s) => {
      s.tasks.unshift({ id: uid('t'), title: title.trim(), due, done: false, projectId: pid || undefined })
    })
    toast('Task added')
    onClose()
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add task"
      footer={
        <Button variant="primary" size="lg" onClick={save}>
          Add task
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Task">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Due">
          <div className="mb-2 flex gap-2">
            <Button size="sm" variant={due === today() ? 'tinted' : 'secondary'} onClick={() => setDue(today())}>
              Today
            </Button>
            <Button size="sm" variant={due === addDays(today(), 1) ? 'tinted' : 'secondary'} onClick={() => setDue(addDays(today(), 1))}>
              Tomorrow
            </Button>
          </div>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Project (optional)">
          <select value={pid} onChange={(e) => setPid(e.target.value)} className={inputCls}>
            <option value="">None</option>
            {state.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Sheet>
  )
}
