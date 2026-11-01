import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { CheckIcon } from '../components/Icons'
import { FollowUpSheet, LeadCard, SalesNav } from '../components/Sales'
import { Screen } from '../components/Screen'
import { EmptyState, ErrorNote, Loading } from '../components/ui'
import { backend } from '../data/backend'
import { refreshAll, useProspects } from '../data/queries'
import { followUpTiming, isOpen } from '../data/sales'
import type { ProspectView } from '../data/types'

/** Every open follow-up: overdue (in red), today, and coming up */
export function FollowUpsScreen() {
  const { data: leads, isLoading, error } = useProspects()
  const [moving, setMoving] = useState<ProspectView | null>(null)
  const qc = useQueryClient()
  const complete = useMutation({
    mutationFn: (id: string) => backend.completeFollowUp(id),
    onSettled: () => refreshAll(qc),
  })
  const withFollowUp = (leads ?? [])
    .filter((l) => l.follow_up && (isOpen(l) || l.stage === 'converted'))
    .sort((a, b) => a.follow_up!.due_at.localeCompare(b.follow_up!.due_at))
  const groups = [
    { key: 'overdue', title: 'Overdue', list: withFollowUp.filter((l) => followUpTiming(l.follow_up!) === 'overdue') },
    { key: 'today', title: 'Today', list: withFollowUp.filter((l) => followUpTiming(l.follow_up!) === 'today') },
    {
      key: 'upcoming',
      title: 'Coming up',
      list: withFollowUp.filter((l) => followUpTiming(l.follow_up!) === 'upcoming'),
    },
  ]
  return (
    <Screen title="Follow-ups" wide>
      <SalesNav />
      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}
      {complete.error && <ErrorNote error={complete.error} />}
      {leads && withFollowUp.length === 0 && (
        <EmptyState title="No follow-ups">After a call, pick when to call back and it shows up here.</EmptyState>
      )}
      {groups.map(
        (g) =>
          g.list.length > 0 && (
            <section key={g.key} className="mb-6">
              <h2
                className={`mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide ${g.key === 'overdue' ? 'text-problem' : 'text-muted'}`}
              >
                {g.title} ({g.list.length})
              </h2>
              <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
                {g.list.map((l) => (
                  <div key={l.id}>
                    <LeadCard
                      lead={l}
                      extra={l.follow_up!.note ? <p className="truncate text-[14px]">{l.follow_up!.note}</p> : null}
                    />
                    <div className="mt-1 flex gap-2 px-1">
                      <button
                        onClick={() => complete.mutate(l.follow_up!.id)}
                        className="flex min-h-10 flex-1 items-center justify-center gap-1 rounded-xl bg-brand-soft text-[14px] font-semibold text-brand-dark"
                      >
                        <CheckIcon size={15} strokeWidth={3} /> Done
                      </button>
                      <button
                        onClick={() => setMoving(l)}
                        className="min-h-10 flex-1 rounded-xl bg-card text-[14px] font-semibold text-brand"
                      >
                        Reschedule
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ),
      )}
      {moving && <FollowUpSheet lead={moving} onClose={() => setMoving(null)} />}
    </Screen>
  )
}
