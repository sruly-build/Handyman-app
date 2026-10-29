import { useState } from 'react'
import { PartRow, partStatusLabels } from '../components/PartRow'
import { Screen } from '../components/Screen'
import { Card, Divider, EmptyState, ErrorNote, Loading, Segmented } from '../components/ui'
import { formatMoney } from '../data/billing'
import { useAllItems, useParts, useSchedule } from '../data/queries'
import type { PartStatus } from '../data/types'

/** One combined list of parts across all jobs, so nothing is missed */
export function OrdersScreen() {
  const [tab, setTab] = useState<PartStatus>('needed')
  const { data: parts, isLoading, error } = useParts()
  // Jobs and leads (parts can be added at a walkthrough)
  const { data: jobs = [] } = useSchedule()
  const { data: items = [] } = useAllItems()

  const count = (s: PartStatus) => (parts ?? []).filter((p) => p.status === s).length
  const shown = (parts ?? []).filter((p) => p.status === tab)
  const jobName = (id: string) => jobs.find((j) => j.id === id)?.customer_name ?? 'Job'
  const itemName = (id: string | null) => items.find((i) => i.id === id)?.title

  // Group by job so it's clear where each part is going
  const groups = [...new Set(shown.map((p) => p.job_id))].map((jobId) => ({
    jobId,
    parts: shown.filter((p) => p.job_id === jobId),
  }))
  const tabTotal = shown.reduce((s, p) => s + (p.cost ?? 0), 0)

  return (
    <Screen title="Orders">
      <Segmented
        label="Show parts that are"
        value={tab}
        onChange={setTab}
        options={(['needed', 'ordered', 'received'] as const).map((s) => ({
          value: s,
          label: `${partStatusLabels[s]}${count(s) ? ` (${count(s)})` : ''}`,
        }))}
      />
      <p className="mb-4 mt-2 px-2 text-[13px] text-muted">
        Tap the coloured label to move a part along: needed → ordered → received.
      </p>

      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}
      {parts && shown.length === 0 && (
        <EmptyState title={tab === 'needed' ? 'Nothing left to order' : `No ${tab} parts`}>
          {tab === 'needed' ? 'Parts you add on jobs show up here until they are ordered.' : null}
        </EmptyState>
      )}

      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g.jobId}>
            <h2 className="mb-1.5 px-4 text-[13px] font-semibold uppercase tracking-wide text-muted">{jobName(g.jobId)}</h2>
            <Card>
              {g.parts.map((p, i) => (
                <div key={p.id}>
                  {i > 0 && <Divider />}
                  <PartRow part={p} context={itemName(p.item_id)} />
                </div>
              ))}
            </Card>
          </section>
        ))}
      </div>

      {shown.length > 0 && tabTotal > 0 && (
        <p className="mt-4 px-4 text-right text-[15px] text-muted">
          Total {tab === 'needed' ? 'expected' : 'paid'}: <strong className="text-ink">{formatMoney(tabTotal)}</strong>
        </p>
      )}
    </Screen>
  )
}
