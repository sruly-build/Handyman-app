import { LeadCard, SalesNav } from '../components/Sales'
import { Screen } from '../components/Screen'
import { EmptyState, ErrorNote, Loading } from '../components/ui'
import { useProspects } from '../data/queries'
import { callQueue } from '../data/sales'
import { useUser } from '../lib/auth'

const reasonLabel = { overdue: 'Overdue', today: 'Due today', new: 'New lead' }

/** Today's calls in order: overdue first, then today's, then new leads */
export function CallListScreen() {
  const user = useUser()
  const { data: leads, isLoading, error } = useProspects()
  const queue = callQueue(leads ?? [], user.id)
  return (
    <Screen title="Call list" wide>
      <SalesNav />
      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}
      {leads && queue.length === 0 && (
        <EmptyState title="Nobody to call">No follow-ups due and no new leads waiting.</EmptyState>
      )}
      <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
        {queue.map(({ lead, reason }, i) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            extra={
              <p className={`text-[12px] font-semibold ${reason === 'overdue' ? 'text-problem' : 'text-muted'}`}>
                {i + 1}. {reasonLabel[reason]}
              </p>
            }
          />
        ))}
      </div>
    </Screen>
  )
}
