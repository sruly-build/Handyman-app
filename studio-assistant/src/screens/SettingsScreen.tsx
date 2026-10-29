import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Building2, CalendarOff, Cloud, CreditCard, KeyRound, Link2, LogOut, Mail, Plus, Receipt, RotateCcw, Sparkles, Tags, Trash2, Upload, User, Wallet, X } from 'lucide-react'
import { api, errorText } from '../lib/api'
import { supabase } from '../lib/cloud'
import { uploadLogo } from '../lib/files'
import { uid, useStore } from '../data/store'
import { fmtRelative, today } from '../lib/dates'
import type { Settings } from '../data/types'
import { StudioLogo } from '../components/StudioLogo'
import { Badge, Button, Confirm, Page, PageHeader, Section, Toggle, cx } from '../components/ui'

const LOGO_COLORS = ['#1d1d1f', '#0071e3', '#7b45c7', '#248a3d', '#b8644a', '#a86f00']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function SettingsScreen() {
  const { state, update, reset, toast, live } = useStore()
  const s = state.settings
  const [resetting, setResetting] = useState(false)
  const logoInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [newDate, setNewDate] = useState('')
  const set = (fn: (x: Settings) => void) => update((st) => fn(st.settings))

  return (
    <Page>
      <PageHeader title="Settings" />

      <Section title="Business" className="mt-2" icon={<Building2 size={15} />} tone="blue">
        <Group>
          <div className="flex items-center gap-4 px-4 py-3.5">
            <StudioLogo size={56} />
            <div className="flex-1">
              <div className="text-[15px] font-medium">Logo</div>
              <div className="mt-1.5 flex gap-1.5">
                {LOGO_COLORS.map((c) => (
                  <button
                    key={c}
                    aria-label="Logo colour"
                    onClick={() => set((x) => void (x.logoColor = c))}
                    className={cx('h-6 w-6 rounded-full', s.logoColor === c && 'ring-2 ring-accent ring-offset-2')}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Button size="sm" icon={<Upload size={14} />} disabled={uploading} onClick={() => (live ? logoInput.current?.click() : toast('Logo upload works once the app is live'))}>
                {uploading ? 'Uploading…' : 'Upload'}
              </Button>
              {s.logoUrl && (
                <button onClick={() => set((x) => void (x.logoUrl = undefined))} className="text-[12px] text-red">
                  Remove
                </button>
              )}
            </div>
            <input
              ref={logoInput}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                setUploading(true)
                try {
                  const url = await uploadLogo(file)
                  set((x) => void (x.logoUrl = url))
                  toast('Logo updated')
                } catch (err) {
                  toast(errorText(err))
                }
                setUploading(false)
                e.target.value = ''
              }}
            />
          </div>
          <TextRow label="Business name" value={s.businessName} onChange={(v) => set((x) => void (x.businessName = v))} />
          <TextRow label="Your name" value={s.owner} onChange={(v) => set((x) => void (x.owner = v))} />
          <TextRow label="Email" value={s.email} onChange={(v) => set((x) => void (x.email = v))} />
          <TextRow label="Phone" value={s.phone} onChange={(v) => set((x) => void (x.phone = v))} />
          <TextRow label="Website" value={s.website} onChange={(v) => set((x) => void (x.website = v))} />
          <TextRow label="Address" value={s.address} onChange={(v) => set((x) => void (x.address = v))} />
        </Group>
      </Section>

      <Section title="Getting paid" icon={<Wallet size={15} />} tone="green">
        <Group>
          <TextRow label="Zelle name" value={s.zelleName} onChange={(v) => set((x) => void (x.zelleName = v))} />
          <TextRow label="Zelle email or phone" value={s.zelleContact} onChange={(v) => set((x) => void (x.zelleContact = v))} />
          <TextRow label="Checks payable to" value={s.checkPayee} onChange={(v) => set((x) => void (x.checkPayee = v))} />
          <TextRow label="Check mailing address" value={s.checkAddress} onChange={(v) => set((x) => void (x.checkAddress = v))} />
          <NumRow label="Card processing fee" suffix="%" value={s.cardFeePct} onChange={(v) => set((x) => void (x.cardFeePct = v))} />
          <NumRow label="Hourly rate" prefix="$" value={s.hourlyRate} onChange={(v) => set((x) => void (x.hourlyRate = v))} />
        </Group>
        <p className="mt-2 px-4 text-[12px] text-ink-3">The card fee is only added when a client pays by card. No sales tax is charged.</p>
      </Section>

      <Section
        icon={<Tags size={15} />}
        tone="orange"
        title="Price sheet"
        action={
          <Button
            variant="plain"
            size="sm"
            icon={<Plus size={15} />}
            onClick={() => set((x) => void x.priceSheet.push({ id: uid('pr'), name: 'New shot type', price: 0, unit: 'image' }))}
          >
            Add
          </Button>
        }
      >
        <Group>
          {s.priceSheet.map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <input
                  value={p.name}
                  onChange={(e) => set((x) => void (x.priceSheet.find((y) => y.id === p.id)!.name = e.target.value))}
                  className="w-full bg-transparent text-[15px] outline-none"
                />
                <div className="flex items-center gap-1 text-[12px] text-ink-3">
                  per
                  <input
                    value={p.unit}
                    onChange={(e) => set((x) => void (x.priceSheet.find((y) => y.id === p.id)!.unit = e.target.value))}
                    className="w-24 bg-transparent outline-none"
                  />
                </div>
              </div>
              <div className="relative w-24">
                <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-[14px] text-ink-3">$</span>
                <input
                  inputMode="decimal"
                  value={p.price}
                  onChange={(e) => set((x) => void (x.priceSheet.find((y) => y.id === p.id)!.price = parseFloat(e.target.value) || 0))}
                  className="h-9 w-full rounded-lg bg-fill pr-2 pl-6 text-right text-[15px] outline-none"
                />
              </div>
              <button onClick={() => set((x) => void (x.priceSheet = x.priceSheet.filter((y) => y.id !== p.id)))} className="p-1 text-ink-3" aria-label="Remove">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </Group>
      </Section>

      <Section title="Closed days" icon={<CalendarOff size={15} />} tone="purple">
        <Group>
          <div className="px-4 py-3">
            <div className="text-[15px]">Closed every week</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {WEEKDAYS.map((w, i) => {
                const on = s.closedWeekdays.includes(i)
                return (
                  <button
                    key={w}
                    onClick={() => set((x) => void (x.closedWeekdays = on ? x.closedWeekdays.filter((d) => d !== i) : [...x.closedWeekdays, i]))}
                    className={cx('h-9 w-12 rounded-full text-[13px] font-medium', on ? 'bg-ink text-white' : 'bg-fill text-ink-2')}
                  >
                    {w}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[15px]">Other closed dates</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {s.closedDates
                .filter((d) => d >= today())
                .sort()
                .map((d) => (
                  <span key={d} className="flex h-8 items-center gap-1 rounded-full bg-fill pr-1.5 pl-3 text-[13px]">
                    {fmtRelative(d)}
                    <button onClick={() => set((x) => void (x.closedDates = x.closedDates.filter((y) => y !== d)))} aria-label="Remove date" className="text-ink-3">
                      <X size={15} />
                    </button>
                  </span>
                ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="h-9 flex-1 rounded-lg bg-fill px-3 outline-none" />
              <Button
                size="sm"
                variant="tinted"
                onClick={() => {
                  if (!newDate) return
                  set((x) => void (x.closedDates.includes(newDate) || x.closedDates.push(newDate)))
                  setNewDate('')
                }}
              >
                Add
              </Button>
            </div>
          </div>
          <ToggleRow label="Israel holiday schedule" sub="Off uses the diaspora schedule (2 days Yom Tov)" on={s.israel} onChange={(v) => set((x) => void (x.israel = v))} />
        </Group>
        <p className="mt-2 px-4 text-[12px] text-ink-3">Jewish holidays, Chol Hamoed and fast days are added automatically. Closed days never block scheduling, you just get a heads-up.</p>
      </Section>

      <Section title="Invoices" icon={<Receipt size={15} />} tone="red">
        <Group>
          <ToggleRow label="Automatic receipts" sub="Email a receipt when a payment is recorded" on={s.autoReceipts} onChange={(v) => set((x) => void (x.autoReceipts = v))} />
          <ToggleRow label="Overdue reminders" sub={`Remind every ${s.reminderDays} days after the due date`} on={s.autoReminders} onChange={(v) => set((x) => void (x.autoReminders = v))} />
          {s.autoReminders && <NumRow label="Days between reminders" value={s.reminderDays} onChange={(v) => set((x) => void (x.reminderDays = Math.max(1, v)))} />}
        </Group>
      </Section>

      <Section title="Connections" icon={<Link2 size={15} />} tone="gray">
        {live ? (
          <Connections />
        ) : (
          <>
            <Group>
              <ConnRow icon={<Mail size={18} className="text-red" />} name="Gmail" />
              <ConnRow icon={<Cloud size={18} className="text-accent" />} name="Dropbox" />
              <ConnRow icon={<CreditCard size={18} className="text-purple" />} name="Stripe" />
            </Group>
            <p className="mt-2 px-4 text-[12px] text-ink-3">This is the sample-data preview, so nothing is connected.</p>
          </>
        )}
      </Section>

      {live ? (
        <Account />
      ) : (
        <div className="mt-8">
          <Button variant="danger" size="lg" icon={<RotateCcw size={17} />} onClick={() => setResetting(true)}>
            Reset sample data
          </Button>
        </div>
      )}
      <Confirm
        open={resetting}
        title="Reset sample data?"
        message="Everything you changed in the preview goes back to the start."
        confirmLabel="Reset"
        onCancel={() => setResetting(false)}
        onConfirm={() => {
          reset()
          setResetting(false)
          toast('Sample data reset')
        }}
      />
    </Page>
  )
}

function Group({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-2xl bg-card shadow-card [&>*+*]:border-t [&>*+*]:border-line">{children}</div>
}

function TextRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block px-4 py-2.5">
      <div className="text-[12px] text-ink-3">{label}</div>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent text-[15px] outline-none" />
    </label>
  )
}

function NumRow({ label, value, onChange, prefix, suffix }: { label: string; value: number; onChange: (v: number) => void; prefix?: string; suffix?: string }) {
  return (
    <label className="flex items-center gap-3 px-4 py-3">
      <span className="flex-1 text-[15px]">{label}</span>
      <span className="flex items-center gap-1 rounded-lg bg-fill px-2.5">
        {prefix && <span className="text-ink-3">{prefix}</span>}
        <input inputMode="decimal" value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} className="h-9 w-14 bg-transparent text-right outline-none" />
        {suffix && <span className="text-ink-3">{suffix}</span>}
      </span>
    </label>
  )
}

function ToggleRow({ label, sub, on, onChange }: { label: string; sub?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1">
        <div className="text-[15px]">{label}</div>
        {sub && <div className="text-[12px] text-ink-3">{sub}</div>}
      </div>
      <Toggle on={on} onChange={onChange} label={label} />
    </div>
  )
}

function ConnRow({ icon, name }: { icon: ReactNode; name: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-fill">{icon}</div>
      <span className="flex-1 text-[15px]">{name}</span>
      <Badge>Preview</Badge>
    </div>
  )
}

interface ConnState {
  gmail: { ready: boolean; connected: boolean; account: string | null }
  dropbox: { ready: boolean; connected: boolean; account: string | null }
  stripe: { ready: boolean }
  ai: { ready: boolean }
}

function Connections() {
  const { toast } = useStore()
  const [params, setParams] = useSearchParams()
  const [c, setC] = useState<ConnState | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = () =>
    api<ConnState>('connections')
      .then(setC)
      .catch((e) => setError(errorText(e)))

  useEffect(() => {
    void load()
    const ok = params.get('connected')
    const bad = params.get('error')
    if (ok) toast(`${ok === 'gmail' ? 'Gmail' : 'Dropbox'} connected`)
    if (bad) toast(`Couldn’t connect ${bad === 'gmail' ? 'Gmail' : 'Dropbox'}. Please try again.`)
    if (ok || bad) setParams({}, { replace: true })
    // Only on first open
  }, [])

  const connect = async (provider: 'google' | 'dropbox') => {
    setBusy(provider)
    try {
      const { url } = await api<{ url: string }>(`${provider}/start`)
      location.href = url
    } catch (e) {
      toast(errorText(e))
      setBusy('')
    }
  }

  const disconnect = async (provider: 'google' | 'dropbox') => {
    setBusy(provider)
    try {
      await api(`connections?provider=${provider}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      toast(errorText(e))
    }
    setBusy('')
  }

  if (error) return <p className="rounded-xl bg-red-soft px-3.5 py-3 text-[14px] text-red">{error}</p>
  if (!c) return <div className="rounded-2xl bg-card px-4 py-6 text-center text-ink-2 shadow-card">Checking…</div>

  const oauthRow = (provider: 'google' | 'dropbox', name: string, icon: ReactNode, info: ConnState['gmail']) => (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-fill">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px]">{name}</div>
        <div className="truncate text-[12px] text-ink-3">{info.connected ? info.account ?? 'Connected' : info.ready ? 'Not connected' : 'Needs server setup (see README)'}</div>
      </div>
      {info.connected ? (
        <Button size="sm" disabled={busy === provider} onClick={() => void disconnect(provider)}>
          Disconnect
        </Button>
      ) : (
        <Button size="sm" variant="primary" disabled={!info.ready || busy === provider} onClick={() => void connect(provider)}>
          {busy === provider ? 'Opening…' : 'Connect'}
        </Button>
      )}
    </div>
  )

  const statusRow = (name: string, icon: ReactNode, ready: boolean, sub: string) => (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-fill">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px]">{name}</div>
        <div className="text-[12px] text-ink-3">{ready ? sub : 'Needs server setup (see README)'}</div>
      </div>
      <Badge tone={ready ? 'green' : 'gray'}>{ready ? 'Ready' : 'Off'}</Badge>
    </div>
  )

  return (
    <Group>
      {oauthRow('google', 'Gmail', <Mail size={18} className="text-red" />, c.gmail)}
      {oauthRow('dropbox', 'Dropbox', <Cloud size={18} className="text-accent" />, c.dropbox)}
      {statusRow('Stripe card payments', <CreditCard size={18} className="text-purple" />, c.stripe.ready, 'Clients can pay invoices by card')}
      {statusRow('AI drafts', <Sparkles size={18} className="text-gold" />, c.ai.ready, 'Email summaries, reply drafts and reach-outs')}
    </Group>
  )
}

function Account() {
  const { toast } = useStore()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [changing, setChanging] = useState(params.get('reset') === '1')

  useEffect(() => {
    supabase!.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''))
  }, [])

  return (
    <Section title="Account" icon={<User size={15} />} tone="blue">
      <Group>
        <div className="px-4 py-3">
          <div className="text-[12px] text-ink-3">Logged in as</div>
          <div className="text-[15px]">{email}</div>
        </div>
        {changing ? (
          <form
            className="flex gap-2 px-4 py-3"
            onSubmit={async (e) => {
              e.preventDefault()
              const { error } = await supabase!.auth.updateUser({ password })
              if (error) return toast(error.message)
              setPassword('')
              setChanging(false)
              toast('Password changed')
            }}
          >
            <input
              type="password"
              autoFocus
              minLength={8}
              required
              autoComplete="new-password"
              placeholder="New password (8+ characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 flex-1 rounded-lg bg-fill px-3 outline-none"
            />
            <Button size="sm" variant="primary" type="submit" className="h-10">
              Save
            </Button>
          </form>
        ) : (
          <button onClick={() => setChanging(true)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] text-accent">
            <KeyRound size={18} /> Change password
          </button>
        )}
        <button onClick={() => void supabase!.auth.signOut()} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] text-red">
          <LogOut size={18} /> Log out
        </button>
      </Group>
    </Section>
  )
}
