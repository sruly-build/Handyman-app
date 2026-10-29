import { useState, type ReactNode } from 'react'
import { Building2, CalendarOff, Cloud, CreditCard, Link2, Mail, Plus, Receipt, RotateCcw, Tags, Trash2, Upload, Wallet, X } from 'lucide-react'
import { uid, useStore } from '../data/store'
import { fmtRelative, today } from '../lib/dates'
import type { Settings } from '../data/types'
import { StudioLogo } from '../components/StudioLogo'
import { Badge, Button, Confirm, Page, PageHeader, Section, Toggle, cx } from '../components/ui'

const LOGO_COLORS = ['#1d1d1f', '#0071e3', '#7b45c7', '#248a3d', '#b8644a', '#a86f00']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function SettingsScreen() {
  const { state, update, reset, toast } = useStore()
  const s = state.settings
  const [resetting, setResetting] = useState(false)
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
            <Button size="sm" icon={<Upload size={14} />} onClick={() => toast('Logo upload is off in the preview')}>
              Upload
            </Button>
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
        <Group>
          <ConnRow icon={<Mail size={18} className="text-red" />} name="Gmail" />
          <ConnRow icon={<Cloud size={18} className="text-accent" />} name="Dropbox" />
          <ConnRow icon={<CreditCard size={18} className="text-purple" />} name="Stripe" />
        </Group>
        <p className="mt-2 px-4 text-[12px] text-ink-3">This is a design preview, so nothing is connected and all data is sample data.</p>
      </Section>

      <div className="mt-8">
        <Button variant="danger" size="lg" icon={<RotateCcw size={17} />} onClick={() => setResetting(true)}>
          Reset sample data
        </Button>
      </div>
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
