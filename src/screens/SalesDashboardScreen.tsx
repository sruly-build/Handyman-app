import { Link } from 'react-router-dom'
import { PhoneIcon, PlusIcon } from '../components/Icons'
import { CallButton, LeadCard, SalesNav, whenLabel } from '../components/Sales'
import { Screen } from '../components/Screen'
import { Card, EmptyState, ErrorNote, Loading } from '../components/ui'
import { callQueue, followUpTiming, isOpen } from '../data/sales'
import { useLeads, useProspects } from '../data/queries'
import { useUser } from '../lib/auth'
import { friendlyDate, todayISO } from '../lib/dates'
import type { ProspectView } from '../data/types'

/** Open the app in the morning and see who to contact */
export function SalesDashboardScreen() {
  const user = useUser()
  const { data: leads, isLoading, error } = useProspects()
  const { data: turnovers = [] } = useLeads()
  const all = leads ?? []
  const queue = callQueue(all, user.id)
  const nextUp = queue[0]?.lead
  const open = all.filter(isOpen)
  const withFollowUp = open.filter((l) => l.follow_up)
  const overdue = withFollowUp
    .filter((l) => followUpTiming(l.follow_up!) === 'overdue')
    .sort((a, b) => a.follow_up!.due_at.localeCompare(b.follow_up!.due_at))
  const today = withFollowUp.filter((l) => followUpTiming(l.follow_up!) === 'today')
  const upcoming = withFollowUp
    .filter((l) => followUpTiming(l.follow_up!) === 'upcoming')
    .sort((a, b) => a.follow_up!.due_at.localeCompare(b.follow_up!.due_at))
  const meetings = withFollowUp
    .filter((l) => l.follow_up!.kind === 'meeting' && followUpTiming(l.follow_up!) !== 'overdue')
    .sort((a, b) => a.follow_up!.due_at.localeCompare(b.follow_up!.due_at))
  const interested = open.filter((l) => ['interested', 'meeting', 'proposal'].includes(l.stage))
  // Turnovers not yet won or lost, soonest move-out first
  const coming = turnovers
    .filter((t) => t.from_company === null && t.lead_status !== 'lost')
    .sort((a, b) => (a.move_out_date ?? '9').localeCompare(b.move_out_date ?? '9'))
  const callsToday = queue.filter((q) => q.reason !== 'new').length

  return (
    <Screen
      title="Sales"
      wide
      action={
        <Link
          to="/sales/leads/new"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white active:bg-brand-dark"
          aria-label="New lead"
        >
          <PlusIcon size={24} strokeWidth={2.6} />
        </Link>
      }
    >
      <SalesNav />
      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}

      {leads &&
        (nextUp ? (
          <CallButton
            lead={nextUp}
            className="flex min-h-[72px] items-center gap-3 rounded-3xl bg-brand px-5 text-white shadow-[0_8px_24px_rgba(15,157,122,0.35)] active:bg-brand-dark"
          >
            <PhoneIcon size={28} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold uppercase tracking-wide text-white/80">
                Call next lead
              </span>
              <span className="block truncate text-[20px] font-bold">
                {nextUp.name}
                {nextUp.org ? ` · ${nextUp.org.name}` : ''}
              </span>
            </span>
          </CallButton>
        ) : (
          all.length > 0 && (
            <p className="rounded-2xl bg-brand-soft px-4 py-3 text-[15px] text-brand-dark">
              Nobody to call right now. Nice work.
            </p>
          )
        ))}
      {nextUp && !nextUp.phone && (
        <p className="mt-1.5 px-4 text-[13px] text-muted">
          {nextUp.name} has no phone number.{' '}
          <Link to={`/sales/leads/${nextUp.id}/edit`} className="text-brand">
            Add one
          </Link>
        </p>
      )}

      {leads && all.length === 0 && (
        <EmptyState title="No leads yet">
          Start with the people you already know: landlords, property managers, investors. Tap + to add the first one.
        </EmptyState>
      )}

      {all.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2 lg:grid-cols-6">
          <Stat to="/sales/calls" label="Calls today" value={callsToday} />
          <Stat to="/sales/follow-ups" label="Overdue" value={overdue.length} warn />
          <Stat to="/sales/follow-ups" label="Upcoming" value={upcoming.length} />
          <Stat to="/sales/pipeline" label="Interested" value={interested.length} />
          <Stat to="/sales/follow-ups" label="Meetings" value={meetings.length} />
          <Stat to="/leads" label="Turnovers" value={coming.length} />
        </div>
      )}

      <div className="lg:grid lg:grid-cols-2 lg:gap-6">
        <div>
          <Section title="Overdue follow-ups" list={overdue} warn />
          <Section title="Today" list={today} />
          <Section title="Meetings" list={meetings} />
        </div>
        <div>
          {coming.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-muted">
                Upcoming turnovers
              </h2>
              <Card>
                {coming.slice(0, 5).map((t, i) => (
                  <Link
                    key={t.id}
                    to={`/jobs/${t.id}`}
                    className={`block px-4 py-3 active:bg-canvas ${i > 0 ? 'border-t border-hairline' : ''}`}
                  >
                    <p className="truncate text-[16px] font-semibold">{t.address || t.customer_name}</p>
                    <p className="truncate text-[13px] text-muted">
                      {t.customer_name}
                      {t.move_out_date ? ` · move-out ${friendlyDate(t.move_out_date)}` : ''}
                      {t.walkthrough_at ? ` · walkthrough ${whenLabel(t.walkthrough_at)}` : ''}
                    </p>
                  </Link>
                ))}
              </Card>
            </section>
          )}
          <Section title="Interested" list={interested.slice(0, 5)} />
          <Section title="Coming up" list={upcoming.slice(0, 5)} />
        </div>
      </div>
      <p className="mt-6 px-1 text-[12px] text-muted">Today is {friendlyDate(todayISO())}.</p>
    </Screen>
  )
}

function Stat({ to, label, value, warn }: { to: string; label: string; value: number; warn?: boolean }) {
  return (
    <Link to={to} className="rounded-2xl bg-card px-3 py-2.5 active:opacity-70">
      <p className="truncate text-[12px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`text-[24px] font-bold ${warn && value > 0 ? 'text-problem' : ''}`}>{value}</p>
    </Link>
  )
}

function Section({ title, list, warn }: { title: string; list: ProspectView[]; warn?: boolean }) {
  if (list.length === 0) return null
  return (
    <section className="mt-6">
      <h2
        className={`mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide ${warn ? 'text-problem' : 'text-muted'}`}
      >
        {title}
      </h2>
      <div className="space-y-2">
        {list.map((l) => (
          <LeadCard key={l.id} lead={l} />
        ))}
      </div>
    </section>
  )
}
