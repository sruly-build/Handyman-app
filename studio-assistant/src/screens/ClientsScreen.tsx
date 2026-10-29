import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Mail, Phone, Plus, Search, Sparkles } from 'lucide-react'
import { uid, useStore } from '../data/store'
import { addDays, fmtRelative, today } from '../lib/dates'
import { money } from '../lib/money'
import { LEAD_STATUSES, type Lead, type LeadStatus } from '../data/types'
import { LEAD_TONE, LeadBadge } from '../components/bits'
import { Avatar, Button, Card, Empty, Field, Page, PageHeader, Segmented, Sheet, cx, inputCls } from '../components/ui'

export function ClientsScreen({ leads }: { leads?: boolean }) {
  const nav = useNavigate()
  const { state } = useStore()
  const newLeads = state.leads.filter((l) => l.status === 'new' && !l.convertedProjectId).length
  return (
    <Page>
      <PageHeader title="Clients" />
      <Segmented
        value={leads ? 'leads' : 'clients'}
        onChange={(v) => nav(v === 'leads' ? '/clients/leads' : '/clients', { replace: true })}
        className="mb-4"
        options={[
          { value: 'clients', label: 'Clients' },
          { value: 'leads', label: newLeads ? `Leads · ${newLeads} new` : 'Leads' },
        ]}
      />
      {leads ? <Leads /> : <ClientList />}
    </Page>
  )
}

function ClientList() {
  const { state, update, toast } = useStore()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', company: '', email: '', phone: '' })
  const list = state.clients
    .filter((c) => `${c.name} ${c.company} ${c.email}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.company.localeCompare(b.company))

  return (
    <>
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients" className={cx(inputCls, 'border-none bg-fill pl-10')} />
        </div>
        <Button variant="tinted" icon={<Plus size={16} />} onClick={() => setAdding(true)} aria-label="Add client">
          <span className="hidden sm:inline">Add</span>
        </Button>
      </div>
      <Card className="overflow-hidden">
        {list.map((c) => {
          const active = state.projects.filter((p) => p.clientId === c.id && p.stage !== 'done').length
          return (
            <button key={c.id} onClick={() => nav(`/clients/${c.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-fill [&+&]:border-t [&+&]:border-line">
              <Avatar name={c.company} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[16px] font-medium">{c.company}</div>
                <div className="truncate text-[13px] text-ink-2">{c.name}</div>
              </div>
              {active > 0 && <span className="text-[12px] text-ink-3">{active} active</span>}
            </button>
          )
        })}
        {!list.length && <Empty title="No clients found" />}
      </Card>
      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="New client"
        footer={
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              if (!form.name.trim()) return
              const id = uid('c')
              update((s) => s.clients.push({ id, ...form, company: form.company || form.name, address: '', notes: '', since: today() }))
              setAdding(false)
              setForm({ name: '', company: '', email: '', phone: '' })
              toast('Client added')
              nav(`/clients/${id}`)
            }}
          >
            Add client
          </Button>
        }
      >
        <div className="space-y-3">
          {(['name', 'company', 'email', 'phone'] as const).map((k) => (
            <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
              <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={inputCls} />
            </Field>
          ))}
        </div>
      </Sheet>
    </>
  )
}

const LEAD_SOLID: Record<string, string> = { blue: 'bg-accent text-white', purple: 'bg-purple text-white', orange: 'bg-orange text-white', green: 'bg-green text-white' }
const LEAD_DOT: Record<string, string> = { blue: 'bg-accent', purple: 'bg-purple', orange: 'bg-orange', green: 'bg-green' }

function Leads() {
  const { state, update, toast } = useStore()
  const [filter, setFilter] = useState<LeadStatus | 'all'>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', company: '', email: '', phone: '', source: '', note: '' })
  const leads = state.leads.filter((l) => !l.convertedProjectId && (filter === 'all' || l.status === filter))
  const lead = state.leads.find((l) => l.id === openId)

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button variant="tinted" size="sm" icon={<Plus size={15} />} onClick={() => setAdding(true)}>
          Add lead
        </Button>
      </div>
      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="New lead"
        footer={
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              if (!form.name.trim()) return toast('Add a name first')
              update((s) =>
                s.leads.unshift({ id: uid('ld'), ...form, source: form.source || 'Other', status: 'new', value: 0, createdAt: today() }),
              )
              setAdding(false)
              setForm({ name: '', company: '', email: '', phone: '', source: '', note: '' })
              toast('Lead added')
            }}
          >
            Add lead
          </Button>
        }
      >
        <div className="space-y-3">
          {(
            [
              ['name', 'Name'],
              ['company', 'Company'],
              ['email', 'Email'],
              ['phone', 'Phone'],
              ['source', 'Where they found you'],
              ['note', 'What they want'],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={inputCls} />
            </Field>
          ))}
        </div>
      </Sheet>
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {(['all', ...LEAD_STATUSES] as const).map((s) => {
          const n = s === 'all' ? state.leads.filter((l) => !l.convertedProjectId).length : state.leads.filter((l) => l.status === s && !l.convertedProjectId).length
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cx(
                'flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium capitalize transition',
                filter === s ? (s === 'all' ? 'bg-ink text-white' : LEAD_SOLID[LEAD_TONE[s]]) : 'bg-card text-ink-2 shadow-card',
              )}
            >
              {s !== 'all' && filter !== s && <span className={cx('h-2 w-2 rounded-full', LEAD_DOT[LEAD_TONE[s]])} />}
              {s} <span className="opacity-70">{n}</span>
            </button>
          )
        })}
      </div>
      <div className="space-y-3">
        {leads.map((l) => (
          <LeadCard key={l.id} lead={l} onOpen={() => setOpenId(l.id)} />
        ))}
      </div>
      {!leads.length && <Empty title="No leads here" text="New inquiries from email show up as leads." />}
      {lead && <LeadSheet lead={lead} onClose={() => setOpenId(null)} />}
    </>
  )
}

function LeadCard({ lead: l, onOpen }: { lead: Lead; onOpen: () => void }) {
  const convert = useConvert()
  return (
    <Card className="overflow-hidden">
      <button onClick={onOpen} className="block w-full p-4 text-left">
        <div className="flex items-center gap-3">
          <Avatar name={l.name} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[16px] font-semibold">{l.name}</span>
              <LeadBadge status={l.status} />
            </div>
            <div className="truncate text-[13px] text-ink-2">
              {l.company || l.email} · {l.source}
            </div>
          </div>
          {l.value > 0 && <span className="text-[14px] font-medium text-ink-2 tabular-nums">{money(l.value, false)}</span>}
        </div>
        <p className="mt-2 line-clamp-2 text-[14px] text-ink-2">{l.note}</p>
      </button>
      {l.status === 'booked' && (
        <div className="border-t border-line p-3">
          <Button variant="primary" size="lg" icon={<Sparkles size={17} />} onClick={() => convert(l)}>
            Make client and project
          </Button>
        </div>
      )}
    </Card>
  )
}

function useConvert() {
  const { update, toast } = useStore()
  const nav = useNavigate()
  return (l: Lead) => {
    const cid = uid('c')
    const pid = uid('p')
    update((s) => {
      s.clients.push({ id: cid, name: l.name, company: l.company || l.name, email: l.email, phone: l.phone, address: '', notes: l.note, since: today() })
      s.projects.unshift({
        id: pid,
        clientId: cid,
        title: `${l.company || l.name} shoot`,
        stage: 'todo',
        shootDate: addDays(today(), 21),
        dueDate: addDays(today(), 31),
        priority: 'normal',
        notes: l.note,
        shotList: [],
        toOrder: [],
        prep: [],
        files: [],
        stickies: [],
        strokes: [],
      })
      s.leads.find((x) => x.id === l.id)!.convertedProjectId = pid
    })
    toast(`${l.company || l.name} is now a client`)
    nav(`/projects/${pid}`)
  }
}

function LeadSheet({ lead: l, onClose }: { lead: Lead; onClose: () => void }) {
  const { state, update } = useStore()
  const nav = useNavigate()
  const convert = useConvert()
  const email = state.emails.find((e) => e.id === l.emailId)
  const set = (fn: (x: Lead) => void) => update((s) => fn(s.leads.find((x) => x.id === l.id)!))

  return (
    <Sheet
      open
      onClose={onClose}
      title={l.name}
      footer={
        l.status === 'booked' ? (
          <Button variant="primary" size="lg" icon={<Sparkles size={17} />} onClick={() => convert(l)}>
            Make client and project
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            icon={<ArrowRight size={17} />}
            onClick={() => set((x) => void (x.status = LEAD_STATUSES[LEAD_STATUSES.indexOf(x.status) + 1]))}
          >
            Move to {LEAD_STATUSES[LEAD_STATUSES.indexOf(l.status) + 1]}
          </Button>
        )
      }
    >
      <div className="mb-4 text-[14px] text-ink-2">
        {l.company} · from {l.source} · {fmtRelative(l.createdAt)}
      </div>
      <Segmented value={l.status} onChange={(v) => set((x) => void (x.status = v))} options={LEAD_STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <a href={`mailto:${l.email}`} className="flex items-center gap-2 rounded-2xl bg-card p-3 text-[14px] shadow-card">
          <Mail size={16} className="text-accent" /> <span className="truncate">{l.email}</span>
        </a>
        <a href={`tel:${l.phone}`} className="flex items-center gap-2 rounded-2xl bg-card p-3 text-[14px] shadow-card">
          <Phone size={16} className="text-accent" /> <span className="truncate">{l.phone || 'No phone'}</span>
        </a>
      </div>
      <div className="mt-4 space-y-3">
        <Field label="Estimated value">
          <input inputMode="decimal" value={l.value} onChange={(e) => set((x) => void (x.value = parseFloat(e.target.value) || 0))} className={inputCls} />
        </Field>
        <Field label="Notes">
          <textarea value={l.note} onChange={(e) => set((x) => void (x.note = e.target.value))} rows={3} className={inputCls} />
        </Field>
      </div>
      {email && (
        <button
          onClick={() => {
            onClose()
            nav('/')
          }}
          className="mt-4 block w-full rounded-2xl bg-card p-3.5 text-left shadow-card"
        >
          <div className="text-[12px] text-ink-3">Original email</div>
          <div className="text-[15px] font-medium">{email.subject}</div>
          <div className="line-clamp-2 text-[13px] text-ink-2">{email.summary}</div>
        </button>
      )}
    </Sheet>
  )
}
