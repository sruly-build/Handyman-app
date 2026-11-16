import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { BookIcon, CheckIcon, GearIcon, InvoiceIcon, LeadIcon, LinkIcon, PeopleIcon } from '../components/Icons'
import { EmergencyAlerts } from '../components/EmergencyAlerts'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, ErrorNote, Field, RowLink, SectionTitle } from '../components/ui'
import { backend } from '../data/backend'
import { useCompany, useMyTime, useNow } from '../data/queries'
import { formatDuration, totalMs } from '../data/time'
import { useUser } from '../lib/auth'
import { buildLabel, checkForUpdate } from '../lib/updates'

/** Monday 00:00 of this week, local time */
function startOfWeek(now: Date): number {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

export function MeScreen() {
  const user = useUser()
  const [name, setName] = useState(user.name)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<unknown>(null)
  const { data: myTime = [] } = useMyTime()
  const { data: company } = useCompany()
  const now = useNow(60_000)

  const weekStart = startOfWeek(new Date(now))
  const thisWeek = myTime.filter((e) => Date.parse(e.started_at) >= weekStart)
  const onSite = totalMs(thisWeek.filter((e) => e.kind === 'visit'), now)
  const onTasks = totalMs(thisWeek.filter((e) => e.kind === 'task'), now)

  async function saveName(e: FormEvent) {
    e.preventDefault()
    setStatus('saving')
    setError(null)
    try {
      await backend.updateMyName(name.trim())
      setStatus('saved')
    } catch (err) {
      setError(err)
      setStatus('idle')
    }
  }

  return (
    <Screen title="Me">
      <Link
        to="/sales"
        className="shine mb-6 flex min-h-[76px] items-center gap-4 rounded-[24px] bg-gradient-to-br from-[#0f172a] to-[#1e293b] px-5 text-white shadow-[0_10px_24px_-10px_rgba(15,23,42,0.5)] transition active:scale-[0.98]"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20">
          <LeadIcon size={24} />
        </span>
        <span className="flex-1">
          <span className="block text-[19px] font-bold">Sales</span>
          <span className="block text-[14px] text-white/85">Leads, calls, follow-ups, turnovers</span>
        </span>
      </Link>

      <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-muted">Directory</h2>
      <div className="mb-6 grid grid-cols-2 gap-3">
        <DirectoryLink to="/directory?show=clients" label="Clients" hint="Jobs and history" Icon={PeopleIcon} tone="bg-grape-soft text-grape" />
        <DirectoryLink to="/directory" label="Vendors" hint="Subs and suppliers" Icon={BookIcon} tone="bg-teal-soft text-teal" />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">This week on site</p>
          <p className="text-[24px] font-bold">{formatDuration(onSite)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">This week on tasks</p>
          <p className="text-[24px] font-bold">{formatDuration(onTasks)}</p>
        </Card>
      </div>

      <form onSubmit={saveName} className="space-y-3">
        <Card>
          <Field
            label="Your name (used in greetings and on time sheets)"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setStatus('idle')
            }}
          />
          <Divider />
          <div className="px-4 py-3">
            <p className="text-[13px] font-medium text-muted">Logged in as</p>
            <p className="text-[17px]">{user.email}</p>
          </div>
        </Card>
        {Boolean(error) && <ErrorNote error={error} />}
        <Button type="submit" variant="secondary" disabled={!name.trim() || name.trim() === user.name || status === 'saving'}>
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Save name'}
        </Button>
      </form>

      <SectionTitle>Alerts</SectionTitle>
      <EmergencyAlerts />

      <SectionTitle>{company?.name || 'Business'}</SectionTitle>
      <Card>
        <RowLink to="/business" tone="bg-sky-soft text-sky" Icon={InvoiceIcon} title="Business profile" value={user.role === 'owner' ? undefined : 'View'} />
        <Divider />
        <RowLink to="/settings" tone="bg-sun-soft text-sun" Icon={GearIcon} title="Prices" value={user.role === 'owner' ? undefined : 'View'} />
        <Divider />
        <RowLink to="/team" tone="bg-grape-soft text-grape" Icon={PeopleIcon} title="Team" />
        <Divider />
        <RowLink to="/request-page" tone="bg-rose-soft text-rose" Icon={LinkIcon} title="Request page & plan" />
      </Card>

      {user.isAdmin && (
        <>
          <SectionTitle>App admin</SectionTitle>
          <Card>
            <RowLink to="/approvals" Icon={CheckIcon} title="Approve sign-ups" />
          </Card>
          <p className="mt-1.5 px-4 text-[13px] text-muted">
            Only you can approve people. Nobody else can sign up, start a company or join one.
          </p>
        </>
      )}

      <div className="mt-8">
        <Button variant="danger" onClick={() => void backend.signOut()}>
          Log out
        </Button>
      </div>
      <AppVersion />
    </Screen>
  )
}

function DirectoryLink({
  to,
  label,
  hint,
  Icon,
  tone,
}: {
  tone: string
  to: string
  label: string
  hint: string
  Icon: (p: { size?: number }) => React.ReactNode
}) {
  return (
    <Link to={to} className="transition active:scale-[0.97]">
      <Card className="flex min-h-[96px] flex-col justify-between gap-2 p-4">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>
          <Icon size={22} />
        </span>
        <span>
          <span className="block text-[17px] font-semibold">{label}</span>
          <span className="block truncate text-[13px] text-muted">{hint}</span>
        </span>
      </Card>
    </Link>
  )
}

/** Which version is on this phone, and a button to get the newest one */
function AppVersion() {
  const [state, setState] = useState<'idle' | 'checking' | 'found' | 'latest'>('idle')
  return (
    <div className="mt-6 text-center">
      <p className="text-[13px] text-muted">App version: {buildLabel()}</p>
      <button
        className="mt-1 min-h-11 px-3 text-[15px] font-semibold text-brand disabled:opacity-50"
        disabled={state === 'checking'}
        onClick={async () => {
          setState('checking')
          try {
            setState((await checkForUpdate()) ? 'found' : 'latest')
          } catch {
            setState('idle')
            window.location.reload()
          }
        }}
      >
        {state === 'checking'
          ? 'Checking…'
          : state === 'found'
            ? 'Updating… the app will reload'
            : state === 'latest'
              ? 'You have the newest version'
              : 'Check for updates'}
      </button>
    </div>
  )
}
