import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Archive,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  FolderPlus,
  ListPlus,
  Pause,
  Play,
  Reply,
  Send,
  Settings,
  Sparkles,
  Sun,
  UserPlus,
} from 'lucide-react'
import { projectSeconds, startTimer, stopTimer, uid, useNow, useStore } from '../data/store'
import { fmtClock, fmtLong, fmtMonthsAgo, fmtStamp, greeting, today, tomorrow } from '../lib/dates'
import { hebrewDate } from '../lib/jewish'
import type { Email, Project } from '../data/types'
import { AddTaskSheet } from '../components/sheets'
import { Avatar, Badge, Button, Card, Checkbox, Empty, Page, Section, Sheet, cx, inputCls } from '../components/ui'
import { PriorityBadge } from '../components/bits'

export function HomeScreen() {
  const { state } = useStore()
  const t = today()
  const tm = tomorrow()
  const heb = hebrewDate(t)
  const todayShoots = state.projects.filter((p) => p.shootDate === t)
  const tomorrowShoots = state.projects.filter((p) => p.shootDate === tm)

  return (
    <Page>
      <header className="flex items-start justify-between pt-4 lg:pt-0">
        <div>
          <div className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">
            {fmtLong(t)} · {heb.day} {heb.month}
          </div>
          <h1 className="mt-1 text-[30px] leading-tight font-bold tracking-tight lg:text-[34px]">
            {greeting()}, {state.settings.owner}
          </h1>
          <p className="mt-1 text-[15px] text-ink-2">
            {todayShoots.length ? `${todayShoots.length} shoot${todayShoots.length > 1 ? 's' : ''} today` : 'No shoots today'}
            {tomorrowShoots.length ? `, ${tomorrowShoots.length} tomorrow.` : '.'}
          </p>
        </div>
        <Link to="/settings" aria-label="Settings" className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-card text-ink-2 shadow-card lg:hidden">
          <Settings size={20} />
        </Link>
      </header>

      <Section title="Today">
        <div className="space-y-3">
          {todayShoots.map((p) => (
            <ShootCard key={p.id} project={p} />
          ))}
          <TodayTasks />
        </div>
      </Section>

      <ToOrder />

      <Section title="Prep for tomorrow">
        {tomorrowShoots.length ? (
          <div className="space-y-3">
            {tomorrowShoots.map((p) => (
              <PrepCard key={p.id} project={p} />
            ))}
          </div>
        ) : (
          <Card className="px-4 py-5 text-[15px] text-ink-2">Nothing booked tomorrow.</Card>
        )}
      </Section>

      <Emails />

      <ReachOutCard />
    </Page>
  )
}

function ShootCard({ project: p }: { project: Project }) {
  const { state, update } = useStore()
  const nav = useNavigate()
  const running = state.timer?.projectId === p.id
  const now = useNow(running)
  const client = state.clients.find((c) => c.id === p.clientId)
  const secs = projectSeconds(state, p, now)
  const done = p.shotList.filter((s) => s.done).length
  const next = p.shotList.find((s) => !s.done) ?? p.shotList[0]
  const currentItem = running ? p.shotList.find((s) => s.id === state.timer?.itemId) : next

  const toggle = () => {
    if (running) update(stopTimer)
    else if (next) update((s) => startTimer(s, p.id, next.id))
  }

  return (
    <Card className="overflow-hidden">
      <button onClick={() => nav(`/projects/${p.id}`)} className="block w-full px-4 pt-4 text-left">
        <div className="flex items-center gap-2 text-[13px] text-ink-2">
          <Camera size={15} />
          {p.shootTime ?? 'All day'} · {client?.company}
          <PriorityBadge priority={p.priority} />
        </div>
        <div className="mt-1 text-[19px] font-semibold tracking-tight">{p.title}</div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-fill">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${p.shotList.length ? (done / p.shotList.length) * 100 : 0}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[12px] text-ink-2">
          <span>
            {done} of {p.shotList.length} shots done
          </span>
          <span className="tabular-nums">{fmtClock(secs)} total</span>
        </div>
      </button>
      <div className="mt-3 flex items-center gap-3 border-t border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-ink-3">{running ? 'Timing now' : 'Up next'}</div>
          <div className="truncate text-[15px] font-medium">{currentItem?.title ?? 'Add shots to the list'}</div>
        </div>
        {currentItem && (
          <Button variant={running ? 'secondary' : 'primary'} onClick={toggle} icon={running ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}>
            {running ? 'Pause' : secs > 0 ? 'Resume' : 'Start'}
          </Button>
        )}
      </div>
    </Card>
  )
}

function TodayTasks() {
  const { state, update } = useStore()
  const t = today()
  const tasks = state.tasks.filter((x) => x.due === t)
  // Shot list items due today on projects that aren't shooting today
  const shotItems = state.projects
    .filter((p) => p.shootDate !== t)
    .flatMap((p) => p.shotList.filter((s) => s.due === t).map((s) => ({ p, s })))
  const [adding, setAdding] = useState(false)

  return (
    <Card>
      <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
        <div className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Tasks</div>
        <Button variant="plain" size="sm" onClick={() => setAdding(true)}>
          Add
        </Button>
      </div>
      {tasks.length + shotItems.length === 0 && <div className="px-4 pb-4 text-[15px] text-ink-2">No tasks for today.</div>}
      <div className="pb-1">
        {tasks.map((task) => {
          const p = state.projects.find((x) => x.id === task.projectId)
          return (
            <div key={task.id} className="flex items-center gap-3 px-4 py-2.5">
              <Checkbox checked={task.done} onChange={() => update((s) => void (s.tasks.find((x) => x.id === task.id)!.done = !task.done))} />
              <div className="min-w-0 flex-1">
                <div className={cx('text-[15px]', task.done && 'text-ink-3 line-through')}>{task.title}</div>
                {p && (
                  <Link to={`/projects/${p.id}`} className="text-[12px] text-ink-2">
                    {p.title}
                  </Link>
                )}
              </div>
            </div>
          )
        })}
        {shotItems.map(({ p, s: item }) => (
          <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
            <Checkbox
              checked={item.done}
              onChange={() =>
                update((s) => {
                  const it = s.projects.find((x) => x.id === p.id)!.shotList.find((x) => x.id === item.id)!
                  it.done = !it.done
                })
              }
            />
            <div className="min-w-0 flex-1">
              <div className={cx('text-[15px]', item.done && 'text-ink-3 line-through')}>{item.title}</div>
              <Link to={`/projects/${p.id}`} className="text-[12px] text-ink-2">
                {p.title}
                {item.assignee && ` · ${item.assignee}`}
              </Link>
            </div>
          </div>
        ))}
      </div>
      <AddTaskSheet open={adding} onClose={() => setAdding(false)} />
    </Card>
  )
}

function ToOrder() {
  const { state, update } = useStore()
  const t = today()
  const tm = tomorrow()
  const items = state.projects.flatMap((p) => p.toOrder.filter((o) => o.due === t || o.due === tm).map((o) => ({ p, o })))
  const tasks = state.tasks.filter((x) => x.due === tm)
  if (!items.length && !tasks.length) return null
  return (
    <Section title="To order and plan">
      <Card className="py-1">
        {items.map(({ p, o }) => (
          <div key={o.id} className="flex items-center gap-3 px-4 py-2.5">
            <Checkbox
              checked={o.done}
              onChange={() =>
                update((s) => {
                  const it = s.projects.find((x) => x.id === p.id)!.toOrder.find((x) => x.id === o.id)!
                  it.done = !it.done
                })
              }
            />
            <div className="min-w-0 flex-1">
              <div className={cx('text-[15px]', o.done && 'text-ink-3 line-through')}>{o.title}</div>
              <Link to={`/projects/${p.id}`} className="text-[12px] text-ink-2">
                {p.title}
              </Link>
            </div>
            <Badge tone={o.due === t ? 'orange' : 'gray'}>{o.due === t ? 'Today' : 'Tomorrow'}</Badge>
          </div>
        ))}
        {tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-3 px-4 py-2.5">
            <Checkbox checked={task.done} onChange={() => update((s) => void (s.tasks.find((x) => x.id === task.id)!.done = !task.done))} />
            <div className={cx('min-w-0 flex-1 text-[15px]', task.done && 'text-ink-3 line-through')}>{task.title}</div>
            <Badge>Tomorrow</Badge>
          </div>
        ))}
      </Card>
    </Section>
  )
}

function PrepCard({ project: p }: { project: Project }) {
  const { state, update } = useStore()
  const nav = useNavigate()
  const client = state.clients.find((c) => c.id === p.clientId)
  const shots = p.shotList.filter((s) => s.due === tomorrow()).length || p.shotList.length
  return (
    <Card className="overflow-hidden">
      <button onClick={() => nav(`/projects/${p.id}`)} className="flex w-full items-center gap-3 px-4 pt-4 pb-2 text-left">
        <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Sun size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[13px] text-ink-2">
            {p.shootTime} · {client?.company}
            <PriorityBadge priority={p.priority} />
          </div>
          <div className="truncate text-[17px] font-semibold">{p.title}</div>
          <div className="text-[12px] text-ink-3">{shots} shots planned</div>
        </div>
        <ChevronRight size={18} className="text-ink-3" />
      </button>
      <div className="px-4 pb-3">
        <div className="mb-1 text-[12px] font-semibold tracking-wide text-ink-3 uppercase">Get ready</div>
        {p.prep.length === 0 && <div className="py-1 text-[14px] text-ink-2">No prep items yet.</div>}
        {p.prep.map((item) => (
          <div key={item.id} className="flex items-center gap-3 py-1.5">
            <Checkbox
              size={22}
              checked={item.done}
              onChange={() =>
                update((s) => {
                  const it = s.projects.find((x) => x.id === p.id)!.prep.find((x) => x.id === item.id)!
                  it.done = !it.done
                })
              }
            />
            <span className={cx('text-[15px]', item.done && 'text-ink-3 line-through')}>{item.title}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function Emails() {
  const { state } = useStore()
  const emails = state.emails.filter((e) => !e.archived).sort((a, b) => b.receivedAt - a.receivedAt)
  return (
    <Section title="Important emails" action={<span className="text-[13px] text-ink-3">From Gmail · sample</span>}>
      {emails.length ? (
        <div className="space-y-3">
          {emails.map((e) => (
            <EmailCard key={e.id} email={e} />
          ))}
        </div>
      ) : (
        <Card>
          <Empty icon={<CheckCircle2 size={32} />} title="Inbox zero" text="All important emails are handled." />
        </Card>
      )}
    </Section>
  )
}

const REWRITES = [
  (d: string) => d,
  (d: string) => d.replace(/\n\n(Best|Warmly|Thanks)?,?\n?Shira$/, '\n\nThanks so much,\nShira').replace('Thank you', 'Thanks so much'),
  (d: string) => d.split('\n\n').slice(0, 2).join('\n\n') + '\n\nShira',
]

export function EmailCard({ email: e, compact }: { email: Email; compact?: boolean }) {
  const { state, update, toast } = useStore()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [replying, setReplying] = useState(false)
  const [draft, setDraft] = useState(e.draft)
  const [variant, setVariant] = useState(0)
  const [linkSheet, setLinkSheet] = useState(false)
  const [taskSheet, setTaskSheet] = useState(false)
  const project = state.projects.find((p) => p.id === e.projectId)
  const lead = state.leads.find((l) => l.id === e.leadId)

  const send = () => {
    update((s) => {
      const m = s.emails.find((x) => x.id === e.id)!
      m.replied = true
      const l = s.leads.find((x) => x.id === e.leadId)
      if (l && l.status === 'new') l.status = 'contacted'
    })
    setReplying(false)
    toast(`Reply sent to ${e.from.split(' ')[0]}`)
  }

  const archive = () => {
    update((s) => void (s.emails.find((x) => x.id === e.id)!.archived = true))
    toast('Archived in Studio Assistant only')
  }

  return (
    <Card className="overflow-hidden">
      <button onClick={() => setOpen(!open)} className="block w-full px-4 pt-3.5 text-left">
        <div className="flex items-start gap-3">
          <Avatar name={e.from} size={38} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[15px] font-semibold">{e.from}</span>
              {e.isLead && <Badge tone="blue">New lead</Badge>}
              {e.replied && <Badge tone="green">Replied</Badge>}
              <span className="ml-auto shrink-0 text-[12px] text-ink-3">{fmtStamp(e.receivedAt)}</span>
            </div>
            <div className="truncate text-[15px]">{e.subject}</div>
            <div className={cx('text-[14px] text-ink-2', !open && 'line-clamp-1')}>{e.summary}</div>
          </div>
        </div>
        {open && <div className="anim-fade mt-3 ml-[50px] rounded-xl bg-fill px-3.5 py-3 text-[14px] whitespace-pre-line">{e.body}</div>}
        {(project || lead) && !compact && (
          <div className="mt-2 ml-[50px] flex flex-wrap gap-1.5">
            {project && (
              <span
                onClick={(ev) => {
                  ev.stopPropagation()
                  nav(`/projects/${project.id}`)
                }}
                className="inline-flex items-center gap-1 rounded-full bg-fill px-2.5 py-1 text-[12px] text-ink-2"
              >
                <FolderPlus size={12} /> {project.title}
              </span>
            )}
            {lead && (
              <span
                onClick={(ev) => {
                  ev.stopPropagation()
                  nav('/clients/leads')
                }}
                className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[12px] text-accent"
              >
                <UserPlus size={12} /> Lead · {lead.status}
              </span>
            )}
          </div>
        )}
      </button>

      {replying && (
        <div className="anim-fade mx-4 mt-3 rounded-2xl border border-line bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-purple">
              <Sparkles size={14} /> AI draft
            </span>
            <button
              onClick={() => {
                const v = (variant + 1) % REWRITES.length
                setVariant(v)
                setDraft(REWRITES[v](e.draft))
              }}
              className="text-[12px] font-medium text-accent"
            >
              Try another
            </button>
          </div>
          <textarea value={draft} onChange={(ev) => setDraft(ev.target.value)} rows={6} className={cx(inputCls, 'border-none px-0 py-0 focus:ring-0')} />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" onClick={() => setReplying(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" icon={<Send size={14} />} onClick={send}>
              Send
            </Button>
          </div>
        </div>
      )}

      <div className="no-scrollbar mt-3 flex gap-1 overflow-x-auto border-t border-line px-2 py-1.5">
        <ActionBtn icon={<Reply size={16} />} label="Reply" onClick={() => setReplying(!replying)} active={replying} />
        <ActionBtn icon={<UserPlus size={16} />} label={e.isLead ? 'Lead' : 'Link'} onClick={() => setLinkSheet(true)} />
        <ActionBtn icon={<ListPlus size={16} />} label="Task" onClick={() => setTaskSheet(true)} />
        <ActionBtn icon={<Archive size={16} />} label="Archive" onClick={archive} />
      </div>

      <LinkSheet email={e} open={linkSheet} onClose={() => setLinkSheet(false)} />
      <AddTaskSheet open={taskSheet} onClose={() => setTaskSheet(false)} defaultTitle={`Follow up: ${e.subject}`} projectId={e.projectId} />
    </Card>
  )
}

function ActionBtn({ icon, label, onClick, active }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-1.5 text-[13px] font-medium whitespace-nowrap active:bg-fill',
        active ? 'text-accent' : 'text-ink-2',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function LinkSheet({ email: e, open, onClose }: { email: Email; open: boolean; onClose: () => void }) {
  const { state, update, toast } = useStore()
  const nav = useNavigate()
  const lead = state.leads.find((l) => l.id === e.leadId)

  const makeLead = () => {
    const id = uid('ld')
    update((s) => {
      s.leads.unshift({
        id,
        name: e.from,
        company: '',
        email: e.fromEmail,
        phone: '',
        source: 'Email',
        status: 'new',
        note: e.summary,
        value: 0,
        createdAt: today(),
        emailId: e.id,
      })
      const m = s.emails.find((x) => x.id === e.id)!
      m.isLead = true
      m.leadId = id
    })
    toast('Added to leads')
    onClose()
  }

  const link = (pid: string) => {
    update((s) => {
      const m = s.emails.find((x) => x.id === e.id)!
      const p = s.projects.find((x) => x.id === pid)!
      m.projectId = pid
      m.clientId = p.clientId
    })
    toast('Linked to project')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Lead or project">
      {lead ? (
        <Card className="flex items-center gap-3 p-4">
          <UserPlus className="text-accent" />
          <div className="flex-1">
            <div className="font-semibold">Already a lead</div>
            <div className="text-[13px] text-ink-2">Status: {lead.status}</div>
          </div>
          <Button
            size="sm"
            variant="tinted"
            onClick={() => {
              onClose()
              nav('/clients/leads')
            }}
          >
            View
          </Button>
        </Card>
      ) : (
        <Button variant="primary" size="lg" icon={<UserPlus size={18} />} onClick={makeLead}>
          Make it a lead
        </Button>
      )}
      <div className="mt-6 mb-2 px-1 text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Or link to a project</div>
      <div className="overflow-hidden rounded-2xl bg-card shadow-card">
        {state.projects
          .filter((p) => p.stage !== 'paid')
          .map((p) => {
            const c = state.clients.find((x) => x.id === p.clientId)
            return (
              <button key={p.id} onClick={() => link(p.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-fill [&+&]:border-t [&+&]:border-line">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px]">{p.title}</div>
                  <div className="text-[12px] text-ink-2">{c?.company}</div>
                </div>
                {e.projectId === p.id && <CheckCircle2 size={20} className="text-accent" />}
              </button>
            )
          })}
      </div>
    </Sheet>
  )
}

function ReachOutCard() {
  const { state, update, toast } = useStore()
  const r = state.reachOuts.find((x) => x.status === 'pending')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState(false)

  const set = (status: 'skipped' | 'never' | 'sent', msg: string) => {
    if (!r) return
    update((s) => void (s.reachOuts.find((x) => x.id === r.id)!.status = status))
    setEditing(false)
    toast(msg)
  }

  return (
    <Section title="Reach out today">
      {r ? (
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Avatar name={r.name} size={44} />
            <div className="min-w-0 flex-1">
              <div className="text-[17px] font-semibold">{r.name}</div>
              <div className="text-[13px] text-ink-2">
                {r.company} · <Clock size={12} className="inline -mt-0.5" /> last emailed {fmtMonthsAgo(r.lastContact)}
              </div>
            </div>
          </div>
          <p className="mt-3 text-[15px] text-ink-2">{r.note}</p>
          {editing ? (
            <textarea
              autoFocus
              value={draft[r.id] ?? r.draft}
              onChange={(e) => setDraft({ ...draft, [r.id]: e.target.value })}
              rows={7}
              className={cx(inputCls, 'mt-3')}
            />
          ) : (
            <button onClick={() => setEditing(true)} className="mt-3 block w-full rounded-xl bg-fill px-3.5 py-3 text-left text-[14px] whitespace-pre-line text-ink">
              <span className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-purple">
                <Sparkles size={13} /> Draft · tap to edit
              </span>
              <span className="line-clamp-3">{draft[r.id] ?? r.draft}</span>
            </button>
          )}
          <div className="mt-3 flex items-center gap-2">
            <Button variant="primary" icon={<Send size={15} />} onClick={() => set('sent', `Sent to ${r.name.split(' ')[0]}`)}>
              Send
            </Button>
            <Button onClick={() => set('skipped', 'Skipped for today')}>Skip</Button>
            <Button variant="plain" size="sm" className="ml-auto text-ink-2" onClick={() => set('never', `Won’t suggest ${r.name.split(' ')[0]} again`)}>
              Never suggest
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <Empty icon={<CheckCircle2 size={30} />} title="Done for today" text="A new contact will be suggested tomorrow." />
        </Card>
      )}
    </Section>
  )
}
