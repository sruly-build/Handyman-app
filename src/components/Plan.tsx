import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { backend } from '../data/backend'
import type { HouseView } from '../data/requestsApi'
import { refreshAll, useCompany, useHours, useHouse, useJobApprovals, useLandlords, useParts, useServiceSettings, useSettings } from '../data/queries'
import { money } from '../data/requests'
import type { Job, Landlord } from '../data/types'
import { ReadyTextSheet } from './ReadyText'
import { Button, Card, Divider, ErrorNote, Field, GroupLabel } from './ui'

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

function useRun() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: () => void refreshAll(qc) })
}

/** On a house: the plan, its hour bank, and the buttons to manage it */
export function HousePlanCard({ house }: { house: HouseView }) {
  const run = useRun()
  const { data: hours = [] } = useHours(house.id)
  const { data: company } = useCompany()
  const [link, setLink] = useState<string | null>(null)
  const [extraNote, setExtraNote] = useState('')
  const plan = house.plan
  const live = hours.filter((h) => !h.used_at && Date.parse(h.expires_at) > Date.now())
  const used = hours.filter((h) => h.used_at).sort((a, b) => b.used_at!.localeCompare(a.used_at!))
  const usedYear = used.filter((h) => Date.parse(h.used_at!) > Date.now() - 365 * 86400000).length

  return (
    <section className="mt-6">
      <GroupLabel>Maintenance plan</GroupLabel>
      <Card>
        <div className="px-4 py-3">
          <p className="text-[17px] font-semibold">
            {!plan ? 'Not on the plan' : plan.status === 'active' ? `On the plan · ${money(plan.price)}/month` : plan.status === 'past_due' ? 'Payment failed: no new hours' : 'Waiting for payment'}
          </p>
          {plan?.status === 'active' && (
            <p className="text-[15px] text-muted">
              {live.length} h in the bank · {usedYear} used this year
              {live[0] ? ` · next expires ${day(live[0].expires_at)}` : ''}
              {plan.next_hour_at ? ` · next hour ${day(plan.next_hour_at)}` : ''}
            </p>
          )}
          {plan?.status === 'past_due' && <p className="text-[15px] text-muted">You decide: wait for the card to be fixed, or cancel.</p>}
        </div>
        {plan?.status === 'active' && (
          <>
            <Divider />
            <div className="grid grid-cols-2 gap-2 p-3">
              <Button variant="secondary" disabled={!live.length || run.isPending} onClick={() => run.mutate(() => backend.useHour(house.id))}>
                Use 1 hour
              </Button>
              <Button variant="secondary" disabled={run.isPending} onClick={() => run.mutate(() => backend.addHour(house.id, extraNote || 'Added by hand'))}>
                Add an hour
              </Button>
            </div>
            <Field label="Note for an added hour (optional)" value={extraNote} onChange={(e) => setExtraNote(e.target.value)} />
          </>
        )}
      </Card>

      <div className="mt-3 space-y-2">
        {(!plan || plan.status === 'pending') && (
          <>
            <Button
              disabled={run.isPending || !house.landlord}
              onClick={() => run.mutate(async () => setLink((await backend.planCheckoutLink(house.id)).url))}
            >
              Payment link for the landlord
            </Button>
            {!house.landlord && <p className="px-4 text-[13px] text-muted">Link a landlord below first.</p>}
            <Button variant="secondary" disabled={run.isPending} onClick={() => window.confirm('Start the plan now, paid outside the app (cash or check)? Hours start today.') && run.mutate(() => backend.startPlanManually(house.id))}>
              Start the plan (paid by cash or check)
            </Button>
          </>
        )}
        {plan?.status === 'active' && !plan.stripe_subscription_id && (
          <Button variant="secondary" onClick={() => run.mutate(() => backend.setPlanStatus(plan, 'past_due'))}>
            Mark as not paid (stop new hours)
          </Button>
        )}
        {plan?.status === 'past_due' && (
          <Button variant="secondary" onClick={() => run.mutate(() => backend.setPlanStatus(plan, 'active'))}>
            Paid again: back to active
          </Button>
        )}
        {plan && plan.status !== 'pending' && (
          <Button variant="danger" onClick={() => window.confirm(plan.stripe_subscription_id ? 'Cancel here only? Also cancel the subscription in Stripe so the card stops being charged.' : 'Cancel this plan? Banked hours stay until they expire.') && run.mutate(() => backend.setPlanStatus(plan, 'cancelled'))}>
            Cancel the plan
          </Button>
        )}
        {run.error && <ErrorNote error={run.error} />}
      </div>

      {hours.length > 0 && (
        <Card className="mt-3">
          {hours.slice(0, 20).map((h, i) => (
            <div key={h.id} className={`flex min-h-12 items-center gap-3 px-4 py-2 ${i ? 'border-t border-hairline' : ''}`}>
              <span className="min-w-0 flex-1 text-[15px]">
                {h.kind === 'referral' ? 'Referral hour' : h.kind === 'manual' ? `Added: ${h.note || 'by hand'}` : 'Plan hour'} · {day(h.added_at)}
                <span className="block text-[13px] text-muted">
                  {h.used_at ? `Used ${day(h.used_at)}` : Date.parse(h.expires_at) < Date.now() ? `Expired ${day(h.expires_at)}` : `Expires ${day(h.expires_at)}`}
                </span>
              </span>
              {h.used_at && (
                <button className="text-[15px] font-semibold text-brand" onClick={() => run.mutate(() => backend.undoHour(h))}>
                  Give back
                </button>
              )}
            </div>
          ))}
        </Card>
      )}

      {link && house.landlord && (
        <ReadyTextSheet
          phone={house.landlord.phone}
          title="Send the payment link"
          choices={[{ label: 'Payment link', text: `Hi ${house.landlord.name.split(/\s+/)[0] || ''}, here's the link to start the maintenance plan for ${house.address.split(',')[0]}: ${link}${company?.name ? ` – ${company.name}` : ''}` }]}
          onClose={() => setLink(null)}
        />
      )}
    </section>
  )
}

/** On a house: who the landlord is (pick, add, or change), and their parts auto-approve limit */
export function LandlordCard({ house }: { house: HouseView }) {
  const run = useRun()
  const { data: landlords = [] } = useLandlords()
  const [editing, setEditing] = useState<Partial<Landlord> | null>(null)
  const l = house.landlord
  return (
    <section className="mt-6">
      <GroupLabel>Landlord</GroupLabel>
      {editing ? (
        <Card>
          <Field label="Name" value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          <Divider />
          <Field label="Email (they log in with it)" type="email" value={editing.email ?? ''} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
          <Divider />
          <Field label="Phone" type="tel" value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
          <Divider />
          <Field
            label="Parts auto-approve up to ($, empty = default)"
            inputMode="decimal"
            value={editing.auto_approve_limit ?? ''}
            onChange={(e) => setEditing({ ...editing, auto_approve_limit: e.target.value.trim() ? Number(e.target.value.replace(/[^0-9.]/g, '')) : null })}
          />
          <div className="flex gap-2 p-3">
            <Button
              disabled={!(editing.name?.trim() || editing.email?.trim())}
              onClick={() =>
                run.mutate(async () => {
                  const saved = await backend.saveLandlord(editing)
                  if (!editing.id) await backend.linkLandlord(house.id, saved.id)
                  setEditing(null)
                })
              }
            >
              Save
            </Button>
            <Button variant="secondary" className="!w-auto" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          {l ? (
            <>
              <div className="px-4 py-3">
                <p className="text-[17px] font-semibold">{l.name || l.email}</p>
                <p className="text-[15px] text-muted">
                  {[l.phone, l.email].filter(Boolean).join(' · ')}
                  {l.user_id ? ' · has a login' : ' · no login yet'}
                </p>
                <p className="text-[13px] text-muted">Parts auto-approve: {l.auto_approve_limit != null ? money(l.auto_approve_limit) : 'company default'}</p>
                <Link to={`/landlords/${l.id}`} className="mt-1 block text-[15px] font-semibold text-brand">
                  See what they see
                </Link>
              </div>
              <Divider />
              <div className="flex">
                <button className="min-h-12 flex-1 text-[17px] text-brand" onClick={() => setEditing(l)}>
                  Edit
                </button>
                <button className="min-h-12 flex-1 border-l border-hairline text-[17px] text-problem" onClick={() => window.confirm('Unlink this landlord from the house? They will no longer see it.') && run.mutate(() => backend.linkLandlord(house.id, null))}>
                  Unlink
                </button>
              </div>
            </>
          ) : (
            <div className="p-3">
              {landlords.length > 0 && (
                <label className="mb-2 block rounded-xl bg-canvas px-3 py-2">
                  <span className="block text-[13px] font-medium text-muted">Pick a landlord</span>
                  <select className="min-h-10 w-full bg-transparent outline-none" value="" onChange={(e) => e.target.value && run.mutate(() => backend.linkLandlord(house.id, e.target.value))} aria-label="Pick a landlord">
                    <option value="">Choose…</option>
                    {landlords.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name || x.email}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <Button variant="secondary" onClick={() => setEditing({ name: '', email: '', phone: '' })}>
                Add a landlord
              </Button>
            </div>
          )}
        </Card>
      )}
      {run.error && <div className="mt-2"><ErrorNote error={run.error} /></div>}
    </section>
  )
}

/** On a job at a plan house: use an hour for the visit, and ask the landlord to approve parts */
export function JobPlanPanel({ job }: { job: Job }) {
  const run = useRun()
  const { data: house } = useHouse(job.property_id ?? '')
  const { data: hours = [] } = useHours(job.property_id ?? null)
  const { data: parts = [] } = useParts(job.id)
  const { data: settings } = useSettings()
  const { data: approvals = [] } = useJobApprovals(job.id)
  const { data: company } = useCompany()
  const [sendFor, setSendFor] = useState<{ token: string; title: string } | null>(null)
  if (!house?.plan || house.plan.status === 'cancelled') return null
  const live = hours.filter((h) => !h.used_at && Date.parse(h.expires_at) > Date.now())
  const usedHere = hours.filter((h) => h.job_id === job.id).length
  const markup = settings?.markup_percent ?? 20
  const priced = parts
    .filter((p) => p.cost != null && p.cost > 0 && !p.vendor_orders)
    .map((p) => ({ name: p.name, qty: p.quantity || 1, price: Math.round(((p.cost! * (1 + markup / 100)) / (p.quantity || 1)) * 100) / 100 }))
  const partsAsked = new Set(approvals.filter((a) => a.kind === 'parts' && a.status !== 'cancelled').flatMap((a) => a.parts.map((p) => p.name)))
  const toAsk = priced.filter((p) => !partsAsked.has(p.name))

  return (
    <section className="mt-6">
      <GroupLabel>Maintenance plan</GroupLabel>
      <Card>
        <div className="px-4 py-3">
          <p className="text-[17px] font-semibold">{house.plan.status === 'active' ? `${live.length} h left in the bank` : 'Plan payment failed'}</p>
          <p className="text-[15px] text-muted">{usedHere ? `${usedHere} h used for this job` : 'Each visit uses one full hour. Over an hour is only flagged, never billed automatically.'}</p>
        </div>
        <Divider />
        <div className="p-3">
          <Button variant="secondary" disabled={!live.length || run.isPending} onClick={() => run.mutate(() => backend.useHour(job.property_id!, job.id))}>
            Use 1 hour for this visit
          </Button>
        </div>
      </Card>

      {(approvals.some((a) => a.kind === 'parts') || toAsk.length > 0) && (
        <Card className="mt-3">
          {approvals
            .filter((a) => a.kind === 'parts')
            .map((a, i) => (
              <div key={a.id} className={`px-4 py-3 ${i ? 'border-t border-hairline' : ''}`}>
                <p className="text-[17px]">
                  Parts {money(a.estimate_amount)} ·{' '}
                  {a.status === 'approved' ? (a.auto ? 'Auto-approved' : 'Approved') : a.status === 'declined' ? 'Declined' : a.status === 'pending' ? 'Waiting' : 'Cancelled'}
                  {a.charge_status === 'charged' ? ' · Charged' : a.charge_status === 'failed' ? ' · Card charge failed' : ''}
                </p>
                <p className="text-[13px] text-muted">{a.parts.map((p) => `${p.qty} × ${p.name}`).join(', ')}</p>
                {a.status === 'pending' && (
                  <button className="mt-1 text-[15px] font-semibold text-brand" onClick={() => setSendFor({ token: a.token, title: a.title })}>
                    Text the link again
                  </button>
                )}
                {a.status === 'approved' && a.charge_status !== 'charged' && (
                  <button className="mt-1 text-[15px] font-semibold text-brand" onClick={() => run.mutate(() => backend.chargeParts(a.id))}>
                    Charge the card on file
                  </button>
                )}
              </div>
            ))}
          {toAsk.length > 0 && (
            <div className={`p-3 ${approvals.some((a) => a.kind === 'parts') ? 'border-t border-hairline' : ''}`}>
              <p className="mb-2 px-1 text-[15px]">
                {toAsk.length} part{toAsk.length === 1 ? '' : 's'} with your {markup}% markup: {money(toAsk.reduce((s, p) => s + p.price * p.qty, 0))}
              </p>
              <Button
                variant="secondary"
                disabled={run.isPending}
                onClick={() =>
                  run.mutate(async () => {
                    const a = await backend.createPartsApproval(job.id, job.property_id ?? null, `Parts for ${job.address.split(',')[0]}`, toAsk)
                    if (a.status === 'pending') setSendFor({ token: a.token, title: a.title })
                  })
                }
              >
                Ask the landlord to approve parts
              </Button>
              <p className="mt-1 px-1 text-[13px] text-muted">Under their auto-approve limit it's approved right away. Approved parts are charged to their card on file.</p>
            </div>
          )}
        </Card>
      )}
      {run.error && <div className="mt-2"><ErrorNote error={run.error} /></div>}
      {sendFor && house.landlord && (
        <ReadyTextSheet
          phone={house.landlord.phone}
          title="Send the parts link"
          choices={[{ label: 'Parts approval', text: `Hi ${house.landlord.name.split(/\s+/)[0] || ''}, parts are needed at ${job.address.split(',')[0]}. See them and approve or decline here: ${window.location.origin}/a/${sendFor.token}${company?.name ? ` – ${company.name}` : ''}` }]}
          onClose={() => setSendFor(null)}
        />
      )}
    </section>
  )
}

/** On a lead (walkthrough): load the standard turnover checklist as punch list items */
export function TurnoverChecklistButton({ job }: { job: Job }) {
  const run = useRun()
  const { data: settings } = useServiceSettings()
  const list = settings?.turnover_checklist.filter((x) => x.trim()) ?? []
  if (!list.length) return null
  return (
    <div className="mt-4">
      <Button
        variant="secondary"
        disabled={run.isPending || run.isSuccess}
        onClick={() =>
          run.mutate(async () => {
            for (const title of list) await backend.createItem(job.id, title, '')
          })
        }
      >
        {run.isSuccess ? 'Checklist added' : `Load the standard turnover checklist (${list.length})`}
      </Button>
    </div>
  )
}
