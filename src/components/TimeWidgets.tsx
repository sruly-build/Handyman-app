import { useMutation, useQueryClient } from '@tanstack/react-query'
import { backend } from '../data/backend'
import { refreshAll, useNow, usePeopleNames, useTime } from '../data/queries'
import { entryMs, formatClock, formatDuration, totalMs, totalsByUser } from '../data/time'
import { useUser } from '../lib/auth'
import { CheckIcon, PlayIcon, StopIcon } from './Icons'
import { Card, ErrorNote } from './ui'

const timeOfDay = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/** "Arrived" / "Finished" for the person using the phone, plus who else is on site */
export function ClockCard({ jobId }: { jobId: string }) {
  const user = useUser()
  const qc = useQueryClient()
  const { data: entries = [] } = useTime(jobId)
  const nameOf = usePeopleNames()
  const now = useNow()
  const open = entries.filter((e) => e.kind === 'visit' && !e.ended_at)
  const mine = open.find((e) => e.user_id === user.id)
  const others = open.filter((e) => e.user_id !== user.id)

  const clock = useMutation({
    mutationFn: () => (mine ? backend.clockOut(jobId) : backend.clockIn(jobId).then(() => undefined)),
    onSettled: () => refreshAll(qc),
  })

  return (
    <Card className="p-4">
      {mine ? (
        <div className="mb-3 flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-progress opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-progress" />
          </span>
          <div className="flex-1">
            <p className="text-[15px] text-muted">On site since {timeOfDay(mine.started_at)}</p>
            <p className="text-[28px] font-bold tabular-nums leading-tight">{formatClock(entryMs(mine, now))}</p>
          </div>
        </div>
      ) : (
        <p className="mb-3 text-[15px] text-muted">Tap Arrived when you get to the job.</p>
      )}
      <button
        onClick={() => {
          if (!mine || confirm('Clock out of this job? Any task timer you have running will stop too.')) clock.mutate()
        }}
        disabled={clock.isPending}
        className={`flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl text-[19px] font-bold text-white transition active:scale-[0.98] disabled:opacity-50 ${
          mine ? 'bg-ink' : 'bg-brand'
        }`}
      >
        {mine ? <CheckIcon size={24} strokeWidth={3} /> : <PlayIcon size={22} />}
        {mine ? 'Finished' : 'Arrived'}
      </button>
      {others.map((e) => (
        <p key={e.id} className="mt-3 text-[15px] text-muted">
          <strong className="text-ink">{nameOf(e.user_id)}</strong> is on site (since {timeOfDay(e.started_at)})
        </p>
      ))}
      {clock.error && <ErrorNote error={clock.error} />}
    </Card>
  )
}

/** Start/stop timer for one punch list item, with totals per person */
export function TaskTimer({ jobId, itemId, onStart }: { jobId: string; itemId: string; onStart?: () => void }) {
  const user = useUser()
  const qc = useQueryClient()
  const { data: entries = [] } = useTime(jobId)
  const nameOf = usePeopleNames()
  const now = useNow()
  const itemEntries = entries.filter((e) => e.kind === 'task' && e.item_id === itemId)
  const mine = itemEntries.find((e) => e.user_id === user.id && !e.ended_at)
  const total = totalMs(itemEntries, now)
  const perPerson = totalsByUser(itemEntries, now)

  const toggle = useMutation({
    mutationFn: () => (mine ? backend.stopTask(itemId) : backend.startTask(jobId, itemId).then(() => undefined)),
    onSuccess: () => {
      if (!mine) onStart?.()
    },
    onSettled: () => refreshAll(qc),
  })

  return (
    <Card className="p-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">{mine ? 'Timer running' : 'Time on this task'}</p>
          <p className={`text-[30px] font-bold tabular-nums leading-tight ${mine ? 'text-[#c26a00]' : ''}`}>
            {mine ? formatClock(total) : formatDuration(total)}
          </p>
        </div>
        <button
          onClick={() => toggle.mutate()}
          disabled={toggle.isPending}
          className={`flex h-16 min-w-[124px] items-center justify-center gap-2 rounded-2xl px-5 text-[19px] font-bold text-white transition active:scale-[0.96] disabled:opacity-50 ${
            mine ? 'bg-progress' : 'bg-brand'
          }`}
        >
          {mine ? <StopIcon size={22} /> : <PlayIcon size={22} />}
          {mine ? 'Stop' : 'Start'}
        </button>
      </div>
      {perPerson.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-x-4 text-[14px] text-muted">
          {perPerson.map((p) => (
            <span key={p.user_id}>
              {nameOf(p.user_id)}: {formatDuration(p.ms)}
            </span>
          ))}
        </div>
      )}
      {toggle.error && <ErrorNote error={toggle.error} />}
    </Card>
  )
}
