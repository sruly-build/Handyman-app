import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { CheckIcon } from '../components/Icons'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, ErrorNote, Field, GroupLabel, Loading, Toggle } from '../components/ui'
import { backend } from '../data/backend'
import { refreshAll, useJob, useShares } from '../data/queries'
import type { JobShare, ShareOptions } from '../data/types'

const choices: { key: keyof ShareOptions; label: string; hint: string }[] = [
  { key: 'share_parts', label: 'Parts to buy', hint: 'What needs buying, and mark it ordered or received. No costs.' },
  { key: 'share_bring', label: 'Bring list', hint: 'Tools and materials to load. They tick off their own copy.' },
  {
    key: 'share_time',
    label: 'Time',
    hint: 'They can clock in and run task timers. Their hours show on your Time screen and count in your bill.',
  },
]

/** The on/off switches for what another company sees */
function ShareChoices({ value, onChange }: { value: ShareOptions; onChange: (v: ShareOptions) => void }) {
  return (
    <Card>
      <div className="flex min-h-14 items-center gap-3 px-4 py-2.5">
        <span className="flex-1">
          <span className="block text-[17px]">Punch list and photos</span>
          <span className="block text-[13px] text-muted">Always shared</span>
        </span>
        <CheckIcon size={20} className="text-brand" />
      </div>
      {choices.map((c) => (
        <div key={c.key}>
          <Divider />
          <Toggle
            label={c.label}
            hint={c.hint}
            checked={value[c.key]}
            onChange={(on) => onChange({ ...value, [c.key]: on })}
          />
        </div>
      ))}
    </Card>
  )
}

const pick = (s: JobShare): ShareOptions => ({
  share_parts: s.share_parts,
  share_bring: s.share_bring,
  share_time: s.share_time,
})
const summary = (s: ShareOptions) =>
  ['Punch list', 'photos', s.share_parts && 'parts', s.share_bring && 'bring list', s.share_time && 'time']
    .filter(Boolean)
    .join(', ')

/** Share a job with another company, choosing what they see. Prices and billing are never shared. */
export function ShareJobScreen() {
  const { jobId = '' } = useParams()
  const { data: job } = useJob(jobId)
  const { data: shares, isLoading } = useShares(jobId)
  const [email, setEmail] = useState('')
  const [options, setOptions] = useState<ShareOptions>({ share_parts: true, share_bring: true, share_time: false })
  const [editing, setEditing] = useState<string | null>(null)
  const [sharedWith, setSharedWith] = useState<string | null>(null)
  const qc = useQueryClient()

  const share = useMutation({
    mutationFn: (e: string) => backend.shareJob(jobId, e, options),
    onSuccess: (name) => {
      setSharedWith(name)
      setEmail('')
      void refreshAll(qc)
    },
  })
  const change = useMutation({
    mutationFn: ({ companyId, value }: { companyId: string; value: ShareOptions }) =>
      backend.setShareOptions(jobId, companyId, value),
    onSettled: () => refreshAll(qc),
  })
  const unshare = useMutation({
    mutationFn: (companyId: string) => backend.unshareJob(jobId, companyId),
    onSettled: () => refreshAll(qc),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setSharedWith(null)
    share.mutate(email)
  }

  return (
    <Screen title="Share job" eyebrow={job?.customer_name} back={{ to: `/jobs/${jobId}`, label: 'Job' }}>
      {isLoading && <Loading />}
      {shares && shares.length > 0 && (
        <section className="mb-6">
          <GroupLabel>Shared with</GroupLabel>
          <div className="space-y-3">
            {shares.map((s) => (
              <div key={s.company_id}>
                <Card>
                  <button
                    type="button"
                    onClick={() => setEditing(editing === s.company_id ? null : s.company_id)}
                    className="flex min-h-14 w-full items-center gap-2 px-4 py-2 text-left active:bg-canvas"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[17px]">{s.company_name}</span>
                      <span className="block truncate text-[13px] text-muted">{summary(s)}</span>
                    </span>
                    <span className="text-[15px] text-brand">{editing === s.company_id ? 'Done' : 'Change'}</span>
                  </button>
                </Card>
                {editing === s.company_id && (
                  <div className="mt-2 space-y-2">
                    <ShareChoices
                      value={pick(s)}
                      onChange={(value) => change.mutate({ companyId: s.company_id, value })}
                    />
                    <button
                      onClick={() =>
                        confirm(`Stop sharing this job with ${s.company_name}?`) && unshare.mutate(s.company_id)
                      }
                      className="min-h-11 w-full text-[15px] font-semibold text-problem active:opacity-50"
                    >
                      Stop sharing with {s.company_name}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {change.error && <ErrorNote error={change.error} />}
          {unshare.error && <ErrorNote error={unshare.error} />}
        </section>
      )}

      <form onSubmit={submit} className="space-y-3">
        <GroupLabel>Share with a company</GroupLabel>
        <Card>
          <Field
            label="Email someone at that company logs in with"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@theircompany.com"
          />
        </Card>
        <GroupLabel>What they can see and update</GroupLabel>
        <ShareChoices value={options} onChange={setOptions} />
        <p className="px-4 text-[13px] text-muted">
          Never shared: your prices, part costs, estimates, invoices and payments.
        </p>
        {share.error && <ErrorNote error={share.error} />}
        {sharedWith && (
          <p className="rounded-2xl bg-brand-soft px-4 py-3 text-[15px] text-brand-dark">
            Shared with <strong>{sharedWith}</strong>. It now shows in their Jobs list.
          </p>
        )}
        <Button type="submit" disabled={share.isPending || !email.trim()}>
          {share.isPending ? 'Sharing…' : 'Share'}
        </Button>
        <p className="px-4 text-[13px] text-muted">They need to have signed up for the app first.</p>
      </form>
    </Screen>
  )
}
