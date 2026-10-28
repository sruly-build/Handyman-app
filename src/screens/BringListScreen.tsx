import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { BellIcon, CloseIcon } from '../components/Icons'
import { ListEditor } from '../components/ListEditor'
import { Screen } from '../components/Screen'
import { Card, CheckCircle, Divider, EmptyState, ErrorNote, GroupLabel, Loading, ProgressBar } from '../components/ui'
import { backend } from '../data/backend'
import { buildBringList, normalize, type BringEntry } from '../data/bring'
import { keys, refreshAll, useBringChecks, useItems, useJob, useParts } from '../data/queries'
import type { BringCheck } from '../data/types'
import { bringReminderIcs, downloadFile } from '../lib/calendar'
import { friendlyDate } from '../lib/dates'
import { isPartnerJob } from '../data/api'
import { useUser } from '../lib/auth'

/** Everything to load in the van for one job, checked off as you go */
export function BringListScreen() {
  const { jobId = '' } = useParams()
  const { data: job, isLoading, error } = useJob(jobId)
  const { data: items = [] } = useItems(jobId)
  // Another company's job: we tick our own copy, but can't change their list
  const partner = job ? isPartnerJob(job, useUser()) : false
  const { data: parts = [] } = useParts(jobId, partner, Boolean(job))
  const { data: checks = [] } = useBringChecks(jobId)
  const qc = useQueryClient()

  const toggle = useMutation({
    mutationFn: ({ key, checked }: { key: string; checked: boolean }) => backend.setBringCheck(jobId, key, checked),
    onMutate: ({ key, checked }) => {
      // Tick instantly; the save happens in the background
      qc.setQueryData<BringCheck[]>(keys.bring(jobId), (old = []) =>
        checked ? [...old, { id: `new:${jobId}:${key}`, job_id: jobId, key }] : old.filter((c) => c.key !== key),
      )
    },
    onSettled: () => refreshAll(qc),
  })

  const setExtras = useMutation({
    mutationFn: (bring_extras: string[]) => backend.updateJob(jobId, { bring_extras }),
    onSettled: () => refreshAll(qc),
  })

  const reset = useMutation({
    mutationFn: async () => {
      for (const c of checks) await backend.setBringCheck(jobId, c.key, false)
    },
    onSettled: () => refreshAll(qc),
  })

  const back = { to: `/jobs/${jobId}`, label: 'Job' }
  if (isLoading || error || !job) {
    return (
      <Screen title="Bring list" back={back}>
        {error ? <ErrorNote error={error} /> : <Loading />}
      </Screen>
    )
  }

  const extras = job.bring_extras ?? []
  const list = buildBringList(items, parts, extras)
  const isChecked = (e: BringEntry) => checks.some((c) => c.key === e.key)
  const packed = list.filter(isChecked).length
  const tools = list.filter((e) => e.kind === 'tool')
  const partsToBring = list.filter((e) => e.kind === 'part')
  const isExtra = (e: BringEntry) => extras.some((x) => `tool:${normalize(x)}` === e.key)

  function remindMe() {
    try {
      downloadFile(`bring-list-${job!.customer_name}.ics`, bringReminderIcs(job!, window.location.href), 'text/calendar')
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    }
  }

  const renderRows = (entries: BringEntry[]) => (
    <Card>
      {entries.map((e, i) => {
        const checked = isChecked(e)
        return (
          <div key={e.key}>
            {i > 0 && <Divider />}
            <div className="flex items-center">
              <button
                onClick={() => toggle.mutate({ key: e.key, checked: !checked })}
                className="flex min-h-14 flex-1 items-center gap-3 px-4 py-2 text-left active:bg-canvas"
              >
                <CheckCircle checked={checked} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[17px] ${checked ? 'text-muted line-through decoration-[#c7c7cc]' : ''}`}>
                    {e.label}
                  </span>
                  {e.sources.length > 0 && (
                    <span className="block truncate text-[13px] text-muted">For: {e.sources.join(', ')}</span>
                  )}
                </span>
              </button>
              {!partner && isExtra(e) && e.sources.length === 0 && (
                <button
                  onClick={() => setExtras.mutate(extras.filter((x) => `tool:${normalize(x)}` !== e.key))}
                  className="flex h-14 w-12 items-center justify-center text-muted"
                  aria-label={`Remove ${e.label}`}
                >
                  <CloseIcon size={18} />
                </button>
              )}
            </div>
          </div>
        )
      })}
    </Card>
  )

  return (
    <Screen title="Bring list" eyebrow={`${job.customer_name} · ${friendlyDate(job.job_date)}`} back={back}>
      {list.length > 0 && (
        <div className="mb-5 px-1">
          <div className="mb-1.5 flex justify-between text-[15px]">
            <span className="font-semibold">{packed === list.length ? 'All packed!' : 'Packed'}</span>
            <span className="text-muted">
              {packed} of {list.length}
            </span>
          </div>
          <ProgressBar done={packed} total={list.length} />
        </div>
      )}

      {list.length === 0 && (
        <EmptyState title="Nothing to bring yet">
          Add tools and materials on each punch list item, or add things below.
        </EmptyState>
      )}

      {tools.length > 0 && (
        <section className="mb-5">
          <GroupLabel>Tools and materials</GroupLabel>
          {renderRows(tools)}
        </section>
      )}
      {partsToBring.length > 0 && (
        <section className="mb-5">
          <GroupLabel>Parts ordered for this job</GroupLabel>
          {renderRows(partsToBring)}
        </section>
      )}

      {!partner && (
        <section className="mb-5">
          <GroupLabel>Add something else to bring</GroupLabel>
          <ListEditor
            value={[]}
            onChange={(fresh) => setExtras.mutate([...extras, ...fresh])}
            placeholder="e.g. Ladder, drop cloths"
          />
        </section>
      )}

      <div className="space-y-3">
        {job.job_date && (
          <button
            onClick={remindMe}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand-soft text-[17px] font-semibold text-brand-dark active:opacity-70"
          >
            <BellIcon size={22} />
            Remind me the night before
          </button>
        )}
        {checks.length > 0 && (
          <button
            onClick={() => confirm('Untick everything (for the next trip)?') && reset.mutate()}
            className="min-h-11 w-full text-[15px] font-medium text-brand active:opacity-50"
          >
            Untick everything
          </button>
        )}
      </div>
      {job.job_date && (
        <p className="mt-2 px-2 text-center text-[13px] text-muted">
          Adds the job to your phone's calendar with an alert at 7pm the evening before.
        </p>
      )}
    </Screen>
  )
}
