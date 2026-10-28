import { useState, type FormEvent } from 'react'
import { GearIcon } from '../components/Icons'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, ErrorNote, Field, RowLink, SectionTitle } from '../components/ui'
import { backend } from '../data/backend'
import { useMyTime, useNow } from '../data/queries'
import { formatDuration, totalMs } from '../data/time'
import { useUser } from '../lib/auth'

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

      <SectionTitle>Business</SectionTitle>
      <Card>
        <RowLink to="/settings" Icon={GearIcon} title="Markup, hourly rate, invoice details" />
      </Card>

      <SectionTitle>App</SectionTitle>
      <Card>
        <div className="px-4 py-3">
          <p className="text-[13px] font-medium text-muted">Data is stored in</p>
          <p className="text-[17px]">
            {backend.mode === 'supabase' ? 'Supabase (shared with your team)' : 'This device only (Demo mode)'}
          </p>
        </div>
      </Card>

      <div className="mt-8">
        <Button variant="danger" onClick={() => void backend.signOut()}>
          Log out
        </Button>
      </div>
    </Screen>
  )
}
