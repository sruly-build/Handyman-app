import { useItems } from '../data/queries'
import { quickDates } from '../data/sales'
import { clockLabel, todayISO } from '../lib/dates'
import { Card } from './ui'

export const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  if (iso === todayISO()) return 'Today'
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * The day I plan to do this item. Days already picked for other items on the
 * job come first, so things can be grouped and done together.
 */
export function PlannedDay({
  jobId,
  itemId,
  value,
  onChange,
  time,
  onTime,
}: {
  jobId: string
  itemId: string
  value: string | null
  onChange: (date: string | null) => void
  time: string | null
  onTime: (time: string | null) => void
}) {
  const { data: items = [] } = useItems(jobId)
  const others = items.filter((i) => i.id !== itemId && i.planned_date && i.status !== 'done')
  const usedDays = [...new Set(others.map((i) => i.planned_date!))].filter((d) => d >= todayISO()).sort()
  const quick = [{ label: 'Today', date: todayISO() }, ...quickDates()].filter((q) => !usedDays.includes(q.date))
  const sameDay = value ? others.filter((i) => i.planned_date === value) : []
  // Times already picked for other items that day (to line them up)
  const sameDayTimes = [...new Set(sameDay.map((i) => i.planned_time).filter((t): t is string => Boolean(t)))].sort()
  const chip = (on: boolean) =>
    `min-h-10 rounded-full px-3 text-[14px] font-semibold transition ${on ? 'bg-brand text-white' : 'bg-canvas text-ink active:opacity-60'}`

  return (
    <Card className="p-3">
      {usedDays.length > 0 && (
        <>
          <p className="mb-1.5 px-1 text-[13px] font-medium text-muted">With other items on this job</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {usedDays.map((d) => {
              const n = others.filter((i) => i.planned_date === d).length
              return (
                <button key={d} type="button" className={chip(value === d)} onClick={() => onChange(value === d ? null : d)}>
                  {dayLabel(d)} · {n} item{n === 1 ? '' : 's'}
                </button>
              )
            })}
          </div>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {quick.map((q) => (
          <button key={q.date} type="button" className={chip(value === q.date)} onClick={() => onChange(value === q.date ? null : q.date)}>
            {q.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-canvas px-3">
        <input
          type="date"
          aria-label="Planned day"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className="min-h-11 flex-1 bg-transparent outline-none"
        />
        {value && (
          <button type="button" className="min-h-11 px-1 text-[15px] font-semibold text-problem" onClick={() => onChange(null)}>
            Clear
          </button>
        )}
      </div>
      {value && (
        <>
          {sameDayTimes.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {sameDayTimes.map((t) => (
                <button key={t} type="button" className={chip(time === t)} onClick={() => onTime(time === t ? null : t)}>
                  {clockLabel(t)}
                </button>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-canvas px-3">
            <span className="text-[15px] text-muted">Time</span>
            <input
              type="time"
              aria-label="Planned time"
              value={time ?? ''}
              onChange={(e) => onTime(e.target.value || null)}
              className="min-h-11 flex-1 bg-transparent outline-none"
            />
            {time && (
              <button type="button" className="min-h-11 px-1 text-[15px] font-semibold text-problem" onClick={() => onTime(null)}>
                Any time
              </button>
            )}
          </div>
        </>
      )}
      <p className="mt-2 px-1 text-[13px] text-muted">
        {value
          ? sameDay.length
            ? `Planned for ${dayLabel(value)}${time ? ` at ${clockLabel(time)}` : ''}, with ${sameDay.map((i) => i.title).join(', ')}.`
            : `Planned for ${dayLabel(value)}${time ? ` at ${clockLabel(time)}` : ''}. It shows on the Schedule that day.`
          : 'Pick the day you plan to do it. Items on the same day show together on the Schedule.'}
      </p>
    </Card>
  )
}
