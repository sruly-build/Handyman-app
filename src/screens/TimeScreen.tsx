import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { TrashIcon } from '../components/Icons'
import { Screen } from '../components/Screen'
import { ClockCard } from '../components/TimeWidgets'
import { Card, Divider, EmptyState, GroupLabel, Loading } from '../components/ui'
import { backend } from '../data/backend'
import { compareTime } from '../data/billing'
import { refreshAll, useItems, useJob, useNow, usePeopleNames, useTime } from '../data/queries'
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
  const qc = useQueryClient()

  const remove = useMutation({
    mutationFn: (id: string) => backend.deleteTimeEntry(id),
    onSettled: () => refreshAll(qc),
  })

  const all = entries ?? []
  const visits = all.filter((e) => e.kind === 'visit')
  const tasks = all.filter((e) => e.kind === 'task')
  const people = totalsByUser(all, now).map((p) => p.user_id)
  const comparison = compareTime(items, tasks, now).filter((c) => c.actual > 0 || c.estimated)
  const titleOf = (id: string | null) => items.find((i) => i.id === id)?.title ?? 'Task'

  return (
    <Screen title="Time" eyebrow={job?.customer_name} back={{ to: `/jobs/${jobId}`, label: 'Job' }}>
      <ClockCard jobId={jobId} />

      {isLoading && <Loading />}
      {entries && all.length === 0 && (
        <div className="mt-5">
          <EmptyState title="No time yet">Tap Arrived at the job, and Start on each task you work on.</EmptyState>
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
                  <div className="flex items-center gap-2 py-2.5 pl-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px]">
                        <strong>{nameOf(e.user_id)}</strong> · {e.kind === 'visit' ? 'On site' : titleOf(e.item_id)}
                      </p>
                      <p className="text-[13px] text-muted">
                        {when(e.started_at)} → {e.ended_at ? clockTime(e.ended_at) : 'now'} · {formatDuration(entryMs(e, now))}
                      </p>
                    </div>
                    <button
                      onClick={() => confirm('Delete this time entry?') && remove.mutate(e.id)}
                      className="flex h-12 w-12 shrink-0 items-center justify-center text-muted active:opacity-50"
                      aria-label="Delete time entry"
                    >
                      <TrashIcon size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </Card>
            <p className="mt-1.5 px-4 text-[13px] text-muted">Forgot to stop a timer? Delete the wrong entry here.</p>
          </section>
        </>
      )}
    </Screen>
  )
}
