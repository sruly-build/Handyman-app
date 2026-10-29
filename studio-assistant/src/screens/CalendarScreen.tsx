import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, ChevronLeft, ChevronRight, CircleCheck, Lock, PackageCheck, Plus, Unlock } from 'lucide-react'
import { dayInfo, useStore } from '../data/store'
import { addDays, fmtLong, iso, monthGrid, parse, startOfWeek, today } from '../lib/dates'
import { hebrewDate, KIND_STYLE } from '../lib/jewish'
import type { State } from '../data/types'
import { ScheduleSheet } from '../components/sheets'
import { Badge, Button, Card, Page, PageHeader, Segmented, Toggle, cx } from '../components/ui'

type View = 'day' | 'week' | 'month'

interface CalEvent {
  id: string
  kind: 'shoot' | 'due' | 'task'
  title: string
  sub?: string
  to: string
}

function eventsOn(state: State, date: string): CalEvent[] {
  const out: CalEvent[] = []
  for (const p of state.projects) {
    const c = state.clients.find((x) => x.id === p.clientId)
    if (p.shootDate === date) out.push({ id: `s${p.id}`, kind: 'shoot', title: p.title, sub: `${p.shootTime ?? 'All day'} · ${c?.company}`, to: `/projects/${p.id}` })
    if (p.dueDate === date && p.stage !== 'done')
      out.push({ id: `d${p.id}`, kind: 'due', title: `Delivery: ${p.title}`, sub: c?.company, to: `/projects/${p.id}` })
    for (const it of p.shotList)
      if (it.due === date && !it.done && p.shootDate !== date) out.push({ id: it.id, kind: 'task', title: it.title, sub: p.title, to: `/projects/${p.id}` })
  }
  for (const t of state.tasks) if (t.due === date && !t.done) out.push({ id: t.id, kind: 'task', title: t.title, to: t.projectId ? `/projects/${t.projectId}` : '/' })
  return out
}

const EV_STYLE = {
  shoot: { chip: 'bg-accent text-white', dot: 'bg-accent', icon: Camera },
  due: { chip: 'bg-orange-soft text-orange', dot: 'bg-orange', icon: PackageCheck },
  task: { chip: 'bg-fill text-ink-2', dot: 'bg-ink-3', icon: CircleCheck },
}

export function CalendarScreen() {
  const [view, setView] = useState<View>('month')
  const [cursor, setCursor] = useState(today())
  const [selected, setSelected] = useState(today())
  const [scheduling, setScheduling] = useState(false)

  const move = (dir: 1 | -1) => {
    if (view === 'day') {
      const n = addDays(cursor, dir)
      setCursor(n)
      setSelected(n)
    } else if (view === 'week') setCursor(addDays(cursor, dir * 7))
    else {
      const d = parse(cursor)
      d.setDate(1)
      d.setMonth(d.getMonth() + dir)
      setCursor(iso(d))
    }
  }

  const d = parse(cursor)
  const title =
    view === 'month'
      ? d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : view === 'week'
        ? `Week of ${parse(startOfWeek(cursor)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : parse(cursor).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  const hebSpan = (() => {
    const days = view === 'month' ? monthGrid(d.getFullYear(), d.getMonth()).slice(7, 35) : view === 'week' ? [startOfWeek(cursor), addDays(startOfWeek(cursor), 6)] : [cursor]
    const a = hebrewDate(days[0])
    const b = hebrewDate(days[days.length - 1])
    return a.month === b.month ? `${a.month} ${a.year}` : `${a.month} – ${b.month} ${b.year}`
  })()

  return (
    <Page wide>
      <PageHeader
        title="Calendar"
        right={
          <Button variant="tinted" size="sm" icon={<Plus size={16} />} onClick={() => setScheduling(true)}>
            Shoot
          </Button>
        }
      />
      <Segmented
        value={view}
        onChange={(v) => {
          setView(v)
          setCursor(selected)
        }}
        className="mb-4 lg:max-w-sm"
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
        ]}
      />
      <div className="mb-3 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[20px] font-semibold tracking-tight">{title}</div>
          <div className="text-[13px] text-ink-2">{hebSpan}</div>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setCursor(today())
            setSelected(today())
          }}
        >
          Today
        </Button>
        <button onClick={() => move(-1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-card shadow-card" aria-label="Previous">
          <ChevronLeft size={18} />
        </button>
        <button onClick={() => move(1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-card shadow-card" aria-label="Next">
          <ChevronRight size={18} />
        </button>
      </div>

      {view === 'month' && (
        <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-5">
          <MonthGrid cursor={cursor} selected={selected} onSelect={setSelected} />
          <div className="mt-4 lg:mt-0">
            <DayPanel date={selected} onSchedule={() => setScheduling(true)} />
          </div>
        </div>
      )}
      {view === 'week' && (
        <div className="space-y-2">
          {Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i)).map((day) => (
            <WeekRow
              key={day}
              date={day}
              onOpen={() => {
                setSelected(day)
                setCursor(day)
                setView('day')
              }}
            />
          ))}
        </div>
      )}
      {view === 'day' && <DayPanel date={cursor} onSchedule={() => setScheduling(true)} big />}

      <Legend />
      <ScheduleSheet open={scheduling} onClose={() => setScheduling(false)} date={view === 'day' ? cursor : selected} />
    </Page>
  )
}

function MonthGrid({ cursor, selected, onSelect }: { cursor: string; selected: string; onSelect: (d: string) => void }) {
  const { state } = useStore()
  const d = parse(cursor)
  const days = monthGrid(d.getFullYear(), d.getMonth())
  const month = d.getMonth()
  const t = today()
  return (
    <Card className="overflow-hidden p-1.5 lg:p-2">
      <div className="grid grid-cols-7 pb-1 text-center text-[11px] font-semibold text-ink-3">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => (
          <div key={i} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day) => {
          const info = dayInfo(day, state.settings)
          const evs = eventsOn(state, day)
          const heb = hebrewDate(day)
          const inMonth = parse(day).getMonth() === month
          const hol = info.holidays[0]
          return (
            <button
              key={day}
              onClick={() => onSelect(day)}
              className={cx(
                'relative flex min-h-[64px] flex-col items-stretch rounded-xl p-1 text-left transition lg:min-h-[104px] lg:p-1.5',
                !inMonth && 'opacity-35',
                selected === day ? 'bg-accent-soft ring-2 ring-accent/40' : info.closed ? 'bg-fill' : 'hover:bg-fill/60',
              )}
              style={
                info.closed && selected !== day
                  ? { backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 6px, rgba(0,0,0,0.035) 6px 7px)' }
                  : undefined
              }
            >
              <div className="flex items-start justify-between">
                <span
                  className={cx(
                    'flex h-6 min-w-6 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums',
                    day === t ? 'bg-red text-white' : info.closed ? 'text-ink-3' : 'text-ink',
                  )}
                >
                  {parse(day).getDate()}
                </span>
                <span className="pt-0.5 text-[10px] text-ink-3 tabular-nums">
                  {heb.day}
                  {(heb.day === 1 || day === days[0]) && <span className="hidden lg:inline"> {heb.month}</span>}
                </span>
              </div>
              {hol && (
                <>
                  <div className={cx('mt-1 h-1 rounded-full lg:hidden', KIND_STYLE[hol.kind].dot)} title={hol.name} />
                  <div className={cx('mt-0.5 hidden truncate rounded px-1 text-[11px] leading-[18px] font-medium lg:block', KIND_STYLE[hol.kind].chip)}>
                    {hol.name}
                  </div>
                </>
              )}
              <div className="mt-auto hidden flex-col gap-0.5 pt-1 lg:flex">
                {evs.slice(0, 2).map((e) => (
                  <div key={e.id} className={cx('truncate rounded px-1 text-[11px] leading-[18px] font-medium', EV_STYLE[e.kind].chip)}>
                    {e.title}
                  </div>
                ))}
                {evs.length > 2 && <div className="px-1 text-[10px] text-ink-3">+{evs.length - 2} more</div>}
              </div>
              <div className="mt-auto flex justify-center gap-0.5 pt-1 lg:hidden">
                {evs.slice(0, 4).map((e) => (
                  <span key={e.id} className={cx('h-1.5 w-1.5 rounded-full', EV_STYLE[e.kind].dot)} />
                ))}
              </div>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

function DayPanel({ date, onSchedule, big }: { date: string; onSchedule: () => void; big?: boolean }) {
  const { state, update, toast } = useStore()
  const nav = useNavigate()
  const info = dayInfo(date, state.settings)
  const heb = hebrewDate(date)
  const evs = eventsOn(state, date)
  const weekday = parse(date).getDay()

  const setClosed = (closed: boolean) => {
    update((s) => {
      const st = s.settings
      st.closedDates = st.closedDates.filter((x) => x !== date)
      st.openDates = st.openDates.filter((x) => x !== date)
      const weekdayClosed = st.closedWeekdays.includes(weekday)
      if (closed && !weekdayClosed) st.closedDates.push(date)
      if (!closed && weekdayClosed) st.openDates.push(date)
    })
    toast(closed ? 'Marked closed' : 'Marked open')
  }

  return (
    <Card className={cx('p-4', big && 'lg:p-6')}>
      <div className="text-[17px] font-semibold">{fmtLong(date)}</div>
      <div className="text-[14px] text-ink-2">
        {heb.full} · <bdi dir="rtl">{heb.hebrew}</bdi>
      </div>
      {info.holidays.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {info.holidays.map((h) => (
            <span key={h.name} className={cx('rounded-full px-2.5 py-1 text-[12px] font-semibold', KIND_STYLE[h.kind].chip)}>
              {h.name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 rounded-xl bg-fill px-3.5 py-2.5">
        {info.closed ? <Lock size={18} className="text-ink-2" /> : <Unlock size={18} className="text-ink-3" />}
        <div className="flex-1">
          <div className="text-[15px]">{info.closed ? 'Closed' : 'Open'}</div>
          <div className="text-[12px] text-ink-3">{info.closed ? info.closedReason : 'Tap to mark this day closed'}</div>
        </div>
        <Toggle on={info.closed} onChange={setClosed} label="Closed" />
      </div>

      <div className="mt-4 space-y-2">
        {evs.map((e) => {
          const I = EV_STYLE[e.kind].icon
          return (
            <button key={e.id} onClick={() => nav(e.to)} className="flex w-full items-center gap-3 rounded-xl px-1 py-1.5 text-left active:bg-fill">
              <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', EV_STYLE[e.kind].chip)}>
                <I size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium">{e.title}</div>
                {e.sub && <div className="truncate text-[12px] text-ink-2">{e.sub}</div>}
              </div>
              <ChevronRight size={16} className="text-ink-3" />
            </button>
          )
        })}
        {!evs.length && <div className="py-2 text-[14px] text-ink-3">Nothing scheduled.</div>}
      </div>
      <Button variant="secondary" className="mt-3 w-full" icon={<Plus size={16} />} onClick={onSchedule}>
        Schedule a shoot this day
      </Button>
    </Card>
  )
}

function WeekRow({ date, onOpen }: { date: string; onOpen: () => void }) {
  const { state } = useStore()
  const info = dayInfo(date, state.settings)
  const evs = eventsOn(state, date)
  const heb = hebrewDate(date)
  const isToday = date === today()
  return (
    <Card onClick={onOpen} className={cx('flex gap-3 p-3', info.closed && 'bg-fill shadow-none')}>
      <div className="w-12 shrink-0 text-center">
        <div className={cx('text-[12px] font-semibold uppercase', isToday ? 'text-red' : 'text-ink-3')}>{parse(date).toLocaleDateString('en-US', { weekday: 'short' })}</div>
        <div className={cx('mx-auto flex h-9 w-9 items-center justify-center rounded-full text-[20px] font-semibold', isToday && 'bg-red text-white')}>
          {parse(date).getDate()}
        </div>
        <div className="text-[10px] text-ink-3">
          {heb.day} {heb.month.slice(0, 4)}
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1 py-0.5">
        {info.holidays.map((h) => (
          <span key={h.name} className={cx('mr-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold', KIND_STYLE[h.kind].chip)}>
            {h.name}
          </span>
        ))}
        {info.closed && <Badge className="gap-1"><Lock size={10} /> Closed</Badge>}
        {evs.map((e) => (
          <div key={e.id} className={cx('truncate rounded-lg px-2 py-1 text-[13px] font-medium', EV_STYLE[e.kind].chip)}>
            {e.title}
          </div>
        ))}
        {!evs.length && !info.closed && !info.holidays.length && <div className="pt-2 text-[13px] text-ink-3">Free</div>}
      </div>
    </Card>
  )
}

function Legend() {
  return (
    <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1.5 px-1 text-[12px] text-ink-2">
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" />Shoot</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-orange" />Delivery due</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ink-3" />Task</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-purple" />Yom Tov / Chol Hamoed</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gold" />Erev / minor holiday</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-fill ring-1 ring-line" />Closed</span>
    </div>
  )
}
