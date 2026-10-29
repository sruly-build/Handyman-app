import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, ChevronDown, Plus, Search } from 'lucide-react'
import { useStore } from '../data/store'
import { isArchived } from '../data/billing'
import { fmtRelative } from '../lib/dates'
import { STAGES, type Project, type Stage } from '../data/types'
import { PriorityBadge, STAGE_LABEL, STAGE_TONE } from '../components/bits'
import { ScheduleSheet } from '../components/sheets'
import { Badge, Button, Card, Empty, Page, PageHeader, cx, inputCls } from '../components/ui'

type Filter = 'all' | Stage | 'archived'

// Board order: what you're working on first, then what's coming up
const BOARD: { key: Stage; hint: string }[] = [
  { key: 'progress', hint: 'Shooting or editing now' },
  { key: 'todo', hint: 'Upcoming' },
  { key: 'revisions', hint: 'Client asked for changes' },
  { key: 'done', hint: 'Delivered, waiting on payment' },
]

export function ProjectsScreen() {
  const { state } = useStore()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [showArchived, setShowArchived] = useState(false)
  const [scheduling, setScheduling] = useState(false)

  const matches = state.projects.filter((p) => {
    const c = state.clients.find((x) => x.id === p.clientId)
    return `${p.title} ${c?.name} ${c?.company}`.toLowerCase().includes(q.toLowerCase())
  })
  const archived = matches.filter((p) => isArchived(state, p))
  const live = matches.filter((p) => !isArchived(state, p))
  const inStage = (s: Stage) => live.filter((p) => p.stage === s).sort((a, b) => a.shootDate.localeCompare(b.shootDate))
  const count = (f: Filter) => (f === 'all' ? live.length : f === 'archived' ? archived.length : inStage(f).length)

  const chips: Filter[] = ['all', 'progress', 'todo', 'revisions', 'done', 'archived']

  return (
    <Page wide>
      <PageHeader
        title="Projects"
        right={
          <Button variant="tinted" size="sm" icon={<Plus size={16} />} onClick={() => setScheduling(true)}>
            New shoot
          </Button>
        }
      />
      <div className="relative mb-3 lg:max-w-md">
        <Search size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects or clients" className={cx(inputCls, 'border-none bg-fill pl-10')} />
      </div>
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        {chips.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cx(
              'h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition',
              filter === f ? 'bg-ink text-white' : 'bg-card text-ink-2 shadow-card',
            )}
          >
            {f === 'all' ? 'Board' : f === 'archived' ? 'Archived' : STAGE_LABEL[f]} <span className="opacity-60">{count(f)}</span>
          </button>
        ))}
      </div>

      {filter === 'all' && (
        <>
          <div className="grid gap-x-4 gap-y-6 lg:grid-cols-4">
            {BOARD.map(({ key, hint }) => (
              <Column key={key} stage={key} hint={hint} projects={inStage(key)} />
            ))}
          </div>
          <div className="mt-8">
            <button onClick={() => setShowArchived(!showArchived)} className="flex items-center gap-2 px-1 text-[15px] font-medium text-ink-2">
              <Archive size={17} />
              Archived ({archived.length})
              <ChevronDown size={16} className={cx('transition', showArchived && 'rotate-180')} />
            </button>
            {showArchived && (
              <div className="mt-3 grid gap-3 lg:grid-cols-4">
                {archived.map((p) => (
                  <ProjectCard key={p.id} p={p} archived />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {filter !== 'all' && (
        <div className="grid gap-3 lg:grid-cols-3">
          {(filter === 'archived' ? archived : inStage(filter)).map((p) => (
            <ProjectCard key={p.id} p={p} archived={filter === 'archived'} />
          ))}
        </div>
      )}
      {filter !== 'all' && !count(filter) && <Empty title="Nothing here" text={filter === 'archived' ? 'Done projects move here once their invoice is paid.' : undefined} />}

      <ScheduleSheet open={scheduling} onClose={() => setScheduling(false)} />
    </Page>
  )
}

function Column({ stage, hint, projects }: { stage: Stage; hint: string; projects: Project[] }) {
  return (
    <section>
      <div className="mb-2 px-1">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[17px] font-semibold tracking-tight">{STAGE_LABEL[stage]}</h2>
          <span className="text-[13px] text-ink-3">{projects.length}</span>
        </div>
        <div className="text-[12px] text-ink-3">{hint}</div>
      </div>
      <div className="space-y-2.5 lg:min-h-[120px] lg:rounded-2xl lg:bg-fill/70 lg:p-2">
        {projects.map((p) => (
          <ProjectCard key={p.id} p={p} />
        ))}
        {!projects.length && <div className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-[13px] text-ink-3">No projects</div>}
      </div>
    </section>
  )
}

function ProjectCard({ p, archived }: { p: Project; archived?: boolean }) {
  const { state, update, toast } = useStore()
  const nav = useNavigate()
  const c = state.clients.find((x) => x.id === p.clientId)
  const done = p.shotList.filter((s) => s.done).length
  const unpaid = p.stage === 'done' && !archived

  return (
    <Card onClick={() => nav(`/projects/${p.id}`)} className="p-3.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-semibold tracking-tight">{p.title}</div>
          <div className="truncate text-[13px] text-ink-2">{c?.company}</div>
        </div>
        <PriorityBadge priority={p.priority} />
      </div>
      {p.shotList.length > 0 && !archived && (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-fill">
            <div className="h-full bg-accent" style={{ width: `${(done / p.shotList.length) * 100}%` }} />
          </div>
          <span className="text-[12px] text-ink-3 tabular-nums">
            {done}/{p.shotList.length}
          </span>
        </div>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="text-[12px] whitespace-nowrap text-ink-2">{p.stage === 'todo' ? `Shoot ${fmtRelative(p.shootDate)}` : `Due ${fmtRelative(p.dueDate)}`}</span>
        {unpaid && <Badge tone="gold">Invoice unpaid</Badge>}
        {archived ? (
          <Badge className="ml-auto">Archived</Badge>
        ) : (
          <select
            aria-label="Status"
            value={p.stage}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const v = e.target.value as Stage
              update((s) => void (s.projects.find((x) => x.id === p.id)!.stage = v))
              toast(`Moved to ${STAGE_LABEL[v]}`)
            }}
            className={cx(
              'ml-auto h-7 cursor-pointer appearance-none rounded-full border-none px-2.5 text-[12px] font-semibold outline-none',
              {
                gray: 'bg-fill text-ink-2',
                blue: 'bg-accent-soft text-accent',
                orange: 'bg-orange-soft text-orange',
                green: 'bg-green-soft text-green',
              }[STAGE_TONE[p.stage] as 'gray' | 'blue' | 'orange' | 'green'],
            )}
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        )}
      </div>
    </Card>
  )
}
