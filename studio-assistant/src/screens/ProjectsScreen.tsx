import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { useStore } from '../data/store'
import { fmtRelative } from '../lib/dates'
import { STAGES } from '../data/types'
import { PriorityBadge, StageBadge } from '../components/bits'
import { ScheduleSheet } from '../components/sheets'
import { Button, Card, Empty, Page, PageHeader, Segmented, cx, inputCls } from '../components/ui'

type Filter = 'active' | 'done' | 'all'

export function ProjectsScreen() {
  const { state } = useStore()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('active')
  const [scheduling, setScheduling] = useState(false)

  const list = state.projects
    .filter((p) => (filter === 'active' ? p.stage !== 'paid' : filter === 'done' ? p.stage === 'paid' : true))
    .filter((p) => {
      const c = state.clients.find((x) => x.id === p.clientId)
      return `${p.title} ${c?.name} ${c?.company}`.toLowerCase().includes(q.toLowerCase())
    })
    .sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || a.shootDate.localeCompare(b.shootDate))

  return (
    <Page>
      <PageHeader
        title="Projects"
        right={
          <Button variant="tinted" size="sm" icon={<Plus size={16} />} onClick={() => setScheduling(true)}>
            New shoot
          </Button>
        }
      />
      <div className="relative mb-3">
        <Search size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects or clients" className={cx(inputCls, 'border-none bg-fill pl-10')} />
      </div>
      <Segmented
        value={filter}
        onChange={setFilter}
        className="mb-4"
        options={[
          { value: 'active', label: 'Active' },
          { value: 'done', label: 'Paid' },
          { value: 'all', label: 'All' },
        ]}
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {list.map((p) => {
          const c = state.clients.find((x) => x.id === p.clientId)
          const done = p.shotList.filter((s) => s.done).length
          return (
            <Card key={p.id} onClick={() => nav(`/projects/${p.id}`)} className="p-4">
              <div className="flex items-center gap-2">
                <StageBadge stage={p.stage} />
                <PriorityBadge priority={p.priority} />
                <span className="ml-auto text-[13px] text-ink-2">{fmtRelative(p.shootDate)}</span>
              </div>
              <div className="mt-2 text-[17px] font-semibold tracking-tight">{p.title}</div>
              <div className="text-[14px] text-ink-2">{c?.company}</div>
              {p.shotList.length > 0 && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-fill">
                    <div className="h-full bg-accent" style={{ width: `${(done / p.shotList.length) * 100}%` }} />
                  </div>
                  <span className="text-[12px] text-ink-3 tabular-nums">
                    {done}/{p.shotList.length}
                  </span>
                </div>
              )}
            </Card>
          )
        })}
      </div>
      {!list.length && <Empty title="No projects" text="Try a different search." />}
      <ScheduleSheet open={scheduling} onClose={() => setScheduling(false)} />
    </Page>
  )
}
