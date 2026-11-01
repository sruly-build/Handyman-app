import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CallButton, FollowUpLine, SalesNav } from '../components/Sales'
import { Screen } from '../components/Screen'
import { ErrorNote, Loading } from '../components/ui'
import { backend } from '../data/backend'
import { refreshAll, useProspects } from '../data/queries'
import { stageLabels, stageOrder } from '../data/sales'
import type { ProspectStage, ProspectView } from '../data/types'

/** Leads by stage: a list on a phone, columns on a computer. Move a lead with its stage menu. */
export function PipelineScreen() {
  const { data: leads, isLoading, error } = useProspects()
  const qc = useQueryClient()
  const [openStage, setOpenStage] = useState<ProspectStage | null>('new')
  const move = useMutation({
    mutationFn: ({ lead, stage }: { lead: ProspectView; stage: ProspectStage }) =>
      backend.setProspectStage(lead, stage),
    onSettled: () => refreshAll(qc),
  })
  const active = (leads ?? []).filter((l) => !l.archived_at)
  const inStage = (s: ProspectStage) => active.filter((l) => l.stage === s)

  const card = (l: ProspectView) => (
    <div key={l.id} className="rounded-2xl bg-card p-3">
      <div className="flex items-start gap-2">
        <Link to={`/sales/leads/${l.id}`} className="min-w-0 flex-1 active:opacity-60">
          <p className="truncate text-[16px] font-semibold">{l.name}</p>
          {l.org && <p className="truncate text-[13px] text-muted">{l.org.name}</p>}
          <FollowUpLine lead={l} />
        </Link>
        <CallButton
          lead={l}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white"
        />
      </div>
      <select
        aria-label={`Move ${l.name}`}
        value={l.stage}
        onChange={(e) => move.mutate({ lead: l, stage: e.target.value as ProspectStage })}
        className="mt-2 min-h-9 w-full rounded-lg bg-canvas px-2 text-[13px] font-semibold outline-none"
      >
        {stageOrder
          .filter((s) => s !== 'converted' || l.stage === 'converted')
          .map((s) => (
            <option key={s} value={s}>
              {s === l.stage ? stageLabels[s] : `Move to: ${stageLabels[s]}`}
            </option>
          ))}
      </select>
    </div>
  )

  return (
    <Screen title="Pipeline" wide>
      <SalesNav />
      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}
      {move.error && <ErrorNote error={move.error} />}

      {/* Phone: each stage folds open */}
      <div className="space-y-2 lg:hidden">
        {stageOrder.map((s) => {
          const list = inStage(s)
          const open = openStage === s
          return (
            <section key={s} className="rounded-2xl bg-card">
              <button
                onClick={() => setOpenStage(open ? null : s)}
                aria-expanded={open}
                className="flex min-h-12 w-full items-center px-4 text-left"
              >
                <span className="flex-1 text-[16px] font-semibold">{stageLabels[s]}</span>
                <span className="rounded-full bg-canvas px-2.5 py-0.5 text-[14px] font-semibold">{list.length}</span>
              </button>
              {open && list.length > 0 && <div className="space-y-2 bg-canvas p-2">{list.map(card)}</div>}
            </section>
          )
        })}
      </div>

      {/* Computer: columns */}
      <div className="hidden gap-3 overflow-x-auto pb-2 lg:flex">
        {stageOrder.map((s) => (
          <section key={s} className="w-60 shrink-0">
            <h2 className="mb-2 flex items-center px-1 text-[13px] font-semibold uppercase tracking-wide text-muted">
              <span className="flex-1">{stageLabels[s]}</span>
              <span>{inStage(s).length}</span>
            </h2>
            <div className="space-y-2">{inStage(s).map(card)}</div>
          </section>
        ))}
      </div>
    </Screen>
  )
}
