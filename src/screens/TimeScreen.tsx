import { Link, useParams } from 'react-router-dom'
import { ChevronIcon, PlusIcon } from '../components/Icons'
import { Screen } from '../components/Screen'
import { ClockCard } from '../components/TimeWidgets'
import { Card, Divider, EmptyState, GroupLabel, Loading } from '../components/ui'
import { compareTime } from '../data/billing'
import { useItems, useJob, useNow, usePeopleNames, useTime } from '../data/queries'
import { entryMs, formatDuration, formatHours, totalMs, totalsByUser } from '../data/time'

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const clockTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/** Totals per person, per task and for the whole job */
export function TimeScreen() {
  const { jobId = '' } = useParams()
  const { data: job } = useJob(jobId)
  const { data: entries, isLoading } = useTime(jobId)
  const { data: items = [] } = useItems(jobId)
  const nameOf = usePeopleNames()
  const now = useNow(15_000)

  const all = entries ?? []
  const visits = all.filter((e) => e.kind === 'visit')
  const tasks = all.filter((e) => e.kind === 'task')
  const people = totalsByUser(all, now).map((p) => p.user_id)
  const comparison = compareTime(items, tasks, now).filter((c) => c.actual > 0 || c.estimated)
  const titleOf = (id: string | null) => items.find((i) => i.id === id)?.title ?? 'Task'

  return (
    <Screen title="Time" eyebrow={job?.customer_name} back={{ to: `/jobs/${jobId}`, label: 'Job' }}>
      <ClockCard jobId={jobId} />
      <Link
        to={`/jobs/${jobId}/time/new`}
        className="mt-3 flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-brand-soft text-[17px] font-semibold text-brand-dark active:opacity-70"
      >
        <PlusIcon size={20} /> Add time by hand
      </Link>

      {isLoading && <Loading />}
      {entries && all.length === 0 && (
        <div className="mt-5">
          <EmptyState title="No time yet">
            Tap Arrived at the job, and Start on each task you work on. Or add time by hand if you forgot.
          </EmptyState>
        </div>
      )}

      {all.length > 0 && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Card className="p-4">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">On site</p>
              <p className="text-[24px] font-bold">{formatDuration(totalMs(visits, now))}</p>
              <p className="text-[13px] text-muted">Arrived → Finished, everyone</p>
            </Card>
            <Card className="p-4">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">On tasks</p>
              <p className="text-[24px] font-bold">{formatDuration(totalMs(tasks, now))}</p>
              <p className="text-[13px] text-muted">Task timers, everyone</p>
            </Card>
          </div>

          <section className="mt-6">
            <GroupLabel>Per person</GroupLabel>
            <Card>
              {people.map((id, i) => (
                <div key={id}>
                  {i > 0 && <Divider />}
                  <div className="flex items-center px-4 py-3">
                    <span className="flex-1 text-[17px] font-medium">{nameOf(id)}</span>
                    <span className="text-right text-[15px] text-muted">
                      {formatDuration(totalMs(visits.filter((e) => e.user_id === id), now))} on site
                      <br />
                      {formatDuration(totalMs(tasks.filter((e) => e.user_id === id), now))} on tasks
                    </span>
                  </div>
                </div>
              ))}
            </Card>
          </section>

          {comparison.length > 0 && (
            <section className="mt-6">
              <GroupLabel>Per task: expected vs actual</GroupLabel>
              <Card>
                {comparison.map((c, i) => {
                  const over = c.estimated != null && c.actual > c.estimated
                  return (
                    <div key={c.id}>
                      {i > 0 && <Divider />}
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span className="min-w-0 flex-1 truncate text-[17px]">{c.title}</span>
                        <span className="text-right text-[15px]">
                          <span className={over ? 'font-semibold text-problem' : 'font-semibold'}>
                            {formatHours(c.actual)} h
                          </span>
                          <span className="text-muted"> / {c.estimated != null ? `${formatHours(c.estimated)} h expected` : 'no estimate'}</span>
                        </span>
                      </div>
                    </div>
                  )
                })}
              </Card>
              <p className="mt-1.5 px-4 text-[13px] text-muted">Use this to price similar jobs better next time.</p>
            </section>
          )}

          <section className="mt-6">
            <GroupLabel>Log</GroupLabel>
            <Card>
              {[...all].reverse().map((e, i) => (
                <div key={e.id}>
                  {i > 0 && <Divider />}
                  <Link
                    to={`/jobs/${jobId}/time/${e.id}`}
                    className="flex min-h-14 items-center gap-2 px-4 py-2.5 active:bg-canvas"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px]">
                        <strong>{nameOf(e.user_id)}</strong> · {e.kind === 'visit' ? 'On site' : titleOf(e.item_id)}
                      </p>
                      <p className="text-[13px] text-muted">
                        {when(e.started_at)} → {e.ended_at ? clockTime(e.ended_at) : 'now'} · {formatDuration(entryMs(e, now))}
                      </p>
                    </div>
                    <ChevronIcon size={18} className="shrink-0 text-[#c7c7cc]" />
                  </Link>
                </div>
              ))}
            </Card>
            <p className="mt-1.5 px-4 text-[13px] text-muted">Forgot to stop a timer, or got a time wrong? Tap an entry to fix or delete it.</p>
          </section>
        </>
      )}
    </Screen>
  )
}
