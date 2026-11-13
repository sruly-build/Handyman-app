import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AddressField } from '../components/AddressField'
import { InspectionReport, inspectionKindLabel } from '../components/InspectionReport'
import { Sheet } from '../components/Sales'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, EmptyState, ErrorNote, Field, GroupLabel, Loading, TextArea, Toggle } from '../components/ui'
import { backend } from '../data/backend'
import type { LandlordSummary } from '../data/landlordApi'
import { refreshAll, useHouseHistory, useHouseProfile, useLandlordSummary, useMyLandlordAccounts } from '../data/queries'
import { issueSummary } from '../data/requests'
import type { Tenant } from '../data/types'
import { useQuery } from '@tanstack/react-query'
import { LandlordStatus, planText } from './LandlordStatus'

/** Everything a landlord sees after logging in. Only their own approved houses. */
export function LandlordApp() {
  const { data: accounts, isLoading, error } = useMyLandlordAccounts()
  const landlordId = accounts?.[0]?.id
  const { data: summary, error: summaryError } = useLandlordSummary(landlordId)
  if (isLoading || (landlordId && !summary && !summaryError)) return <Loading />
  if (error || summaryError) {
    return (
      <Screen title="My houses">
        <ErrorNote error={error ?? summaryError} />
        <LogOut />
      </Screen>
    )
  }
  if (!landlordId || !summary) {
    return (
      <Screen title="My houses">
        <p className="px-1 text-[17px]">This login isn't linked to a landlord account yet. Please contact your handyman.</p>
        <LogOut />
      </Screen>
    )
  }
  return (
    <Routes>
      <Route path="/landlord" element={<LandlordHome summary={summary} />} />
      <Route path="/landlord/add-house" element={<AddHouse landlordId={landlordId} />} />
      <Route path="/landlord/settings" element={<LandlordSettings summary={summary} />} />
      <Route path="/landlord/houses/:houseId" element={<LandlordHouse summary={summary} />} />
      <Route path="/landlord/houses/:houseId/inspections/:inspectionId" element={<LandlordInspection summary={summary} />} />
      <Route path="*" element={<Navigate to="/landlord" replace />} />
    </Routes>
  )
}

function LogOut() {
  return (
    <div className="mt-8">
      <Button variant="danger" onClick={() => void backend.signOut()}>
        Log out
      </Button>
    </div>
  )
}

function LandlordHome({ summary }: { summary: LandlordSummary }) {
  const [params] = useSearchParams()
  const paid = params.get('paid')
  return (
    <Screen
      title="My houses"
      eyebrow={summary.company.name}
      action={
        <Link to="/landlord/settings" className="min-h-11 px-2 py-2 text-[17px] text-brand">
          Settings
        </Link>
      }
    >
      {paid === '1' && <p className="mb-4 rounded-2xl bg-brand-soft px-4 py-3 text-[15px] text-brand-dark">Thank you! Your plan starts as soon as the payment goes through (usually a few seconds).</p>}
      {paid === '0' && <p className="mb-4 rounded-2xl bg-progress-soft px-4 py-3 text-[15px] text-[#8a4b00]">The payment wasn't finished. You can try again any time.</p>}
      {summary.houses.length === 0 && summary.claims.length === 0 ? (
        <EmptyState title="No houses yet">Add your first house. Your handyman approves it, or it's approved right away when you start the plan.</EmptyState>
      ) : (
        <LandlordStatus summary={summary} houseLink={(id) => `/landlord/houses/${id}`} />
      )}
      {summary.claims.length > 0 && (
        <section className="mt-6">
          <GroupLabel>Waiting for approval</GroupLabel>
          <Card>
            {summary.claims.map((c, i) => (
              <div key={c.id} className={`px-4 py-3 ${i ? 'border-t border-hairline' : ''}`}>
                <p className="text-[17px]">{c.address}</p>
                <p className="text-[13px] text-muted">{c.status === 'declined' ? 'Not approved. Please call us.' : 'Your handyman will approve it soon.'}</p>
                {c.status === 'pending' && <PayButton houseId={c.property_id} label="Start the plan (approves it right away)" />}
              </div>
            ))}
          </Card>
        </section>
      )}
      <div className="mt-6 space-y-3">
        <Link to="/landlord/add-house" className="flex min-h-14 items-center justify-center rounded-2xl bg-brand-soft text-[17px] font-semibold text-brand-dark">
          Add a house
        </Link>
        {summary.company.slug && (
          <a href={`/r/${summary.company.slug}`} className="flex min-h-14 items-center justify-center rounded-2xl bg-brand text-[17px] font-semibold text-white">
            Send a repair request
          </a>
        )}
      </div>
    </Screen>
  )
}

/** Start (pay for) the plan on a house, on Stripe's secure page */
function PayButton({ houseId, label = 'Start the plan' }: { houseId?: string; label?: string }) {
  const pay = useMutation({
    mutationFn: () => backend.planCheckoutLink(houseId!),
    onSuccess: ({ url }) => window.location.assign(url),
  })
  if (!houseId) return null
  return (
    <div className="mt-3">
      <Button disabled={pay.isPending} onClick={() => pay.mutate()}>
        {pay.isPending ? 'Opening the payment page…' : label}
      </Button>
      {pay.error && <div className="mt-2"><ErrorNote error={pay.error} /></div>}
    </div>
  )
}

function AddHouse({ landlordId }: { landlordId: string }) {
  const [address, setAddress] = useState('')
  const [units, setUnits] = useState('')
  const navigate = useNavigate()
  const qc = useQueryClient()
  const add = useMutation({
    mutationFn: () => backend.claimHouse(landlordId, address, units.split(',').map((u) => u.trim()).filter(Boolean)),
    onSuccess: () => {
      void refreshAll(qc)
      navigate('/landlord', { replace: true })
    },
  })
  return (
    <Screen title="Add a house" back={{ to: '/landlord', label: 'My houses' }}>
      <Card>
        <AddressField value={address} onChange={setAddress} />
        <Divider />
        <Field label="Units (optional, separated by commas)" placeholder="e.g. Apartment A, Apartment B, Basement" value={units} onChange={(e) => setUnits(e.target.value)} />
      </Card>
      <p className="mt-1.5 px-4 text-[13px] text-muted">Your handyman approves the house before you can see it. Starting the plan approves it right away.</p>
      {add.error && <div className="mt-3"><ErrorNote error={add.error} /></div>}
      <Button className="mt-4" disabled={address.trim().length < 5 || add.isPending} onClick={() => add.mutate()}>
        Add house
      </Button>
    </Screen>
  )
}

function LandlordSettings({ summary }: { summary: LandlordSummary }) {
  const qc = useQueryClient()
  const [newReq, setNewReq] = useState(summary.landlord.notify_new_request)
  const [done, setDone] = useState(summary.landlord.notify_done)
  const save = useMutation({
    mutationFn: (v: { a: boolean; b: boolean }) => backend.setMyNotifications(v.a, v.b),
    onSuccess: () => void refreshAll(qc),
  })
  const portal = useMutation({ mutationFn: () => backend.billingPortal(), onSuccess: ({ url }) => window.location.assign(url) })
  const referral = summary.company.slug ? `${window.location.origin}/l/${summary.company.slug}?ref=${summary.landlord.referral_code}` : ''
  const [copied, setCopied] = useState(false)
  return (
    <Screen title="Settings" back={{ to: '/landlord', label: 'My houses' }}>
      <Card>
        <div className="px-4 py-3">
          <p className="text-[17px] font-semibold">{summary.landlord.name || summary.landlord.email}</p>
          <p className="text-[15px] text-muted">{summary.landlord.email}</p>
        </div>
      </Card>

      <Section title="Email me when">
        <Card>
          <Toggle label="A new repair request comes in" checked={newReq} onChange={(v) => { setNewReq(v); save.mutate({ a: v, b: done }) }} />
          <Divider />
          <Toggle label="A repair is done" checked={done} onChange={(v) => { setDone(v); save.mutate({ a: newReq, b: v }) }} />
        </Card>
        <p className="mt-1.5 px-4 text-[13px] text-muted">Both are off unless you turn them on.</p>
      </Section>

      {referral && (
        <Section title="Refer a landlord, get a free hour">
          <Card className="px-4 py-3">
            <p className="text-[15px]">Share your link. When the landlord you refer signs up and their first payment goes through, you get a free hour.</p>
            <p className="mt-2 break-all text-[15px] font-semibold text-brand">{referral}</p>
            <button
              className="mt-2 min-h-11 rounded-xl bg-brand-soft px-4 text-[15px] font-semibold text-brand-dark"
              onClick={() => void navigator.clipboard?.writeText(referral).then(() => setCopied(true))}
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </Card>
        </Section>
      )}

      <Section title="Payments">
        <Button variant="secondary" disabled={portal.isPending} onClick={() => portal.mutate()}>
          Change card or cancel a plan
        </Button>
        {portal.error && <div className="mt-2"><ErrorNote error={portal.error} /></div>}
        <p className="mt-1.5 px-4 text-[13px] text-muted">Opens Stripe's secure page. Each house has its own monthly plan.</p>
      </Section>
      <LogOut />
    </Screen>
  )
}

function LandlordHouse({ summary }: { summary: LandlordSummary }) {
  const { houseId = '' } = useParams()
  const house = summary.houses.find((h) => h.id === houseId)
  const { data: history } = useHouseHistory(houseId)
  const { data: profile } = useHouseProfile(houseId)
  const allPhotoPaths = (history?.visits ?? []).flatMap((v) => v.photos.map((p) => p.path))
  const { data: urls = [] } = useQuery({
    queryKey: ['photos', 'landlord', houseId, allPhotoPaths.join()],
    queryFn: () => backend.jobPhotoUrls(allPhotoPaths),
    enabled: allPhotoPaths.length > 0,
  })
  const url = (path: string) => urls[allPhotoPaths.indexOf(path)]
  const [moving, setMoving] = useState(false)
  if (!house) return <Navigate to="/landlord" replace />
  const p = profile?.house
  const facts = p
    ? ([
        ['Water shut-off', p.water_shutoff],
        ['Breaker panel', p.breaker_panel],
        ['Paint colours', p.paint_colors],
        ['HVAC filter', [p.filter_type, p.filter_size].filter(Boolean).join(' · ')],
      ] as [string, string | undefined][]).filter(([, v]) => v)
    : []

  return (
    <Screen title={house.address.split(',')[0]} eyebrow={planText(house)} back={{ to: '/landlord', label: 'My houses' }}>
      <Card>
        <div className="grid grid-cols-3 text-center">
          <Big label="Hours left" value={house.hours_left} />
          <Big label="Used (12 mo)" value={house.hours_used_year} border />
          <Big label="Open requests" value={house.open_requests} border />
        </div>
        {house.next_expiry && <p className="border-t border-hairline px-4 py-2 text-[13px] text-muted">Next hour expires {new Date(house.next_expiry).toLocaleDateString()}. Unused hours roll over, up to the bank's limit.</p>}
      </Card>
      {(!house.plan || house.plan.status === 'pending') && <PayButton houseId={house.id} />}
      {house.plan?.status === 'past_due' && <p className="mt-3 rounded-2xl bg-problem-soft px-4 py-3 text-[15px] text-problem">The last payment failed, so no new hours are added. Update your card in Settings.</p>}

      <div className="mt-3 grid grid-cols-2 gap-3">
        {summary.company.slug && (
          <a href={`/r/${summary.company.slug}`} className="flex min-h-14 items-center justify-center rounded-2xl bg-brand text-[16px] font-semibold text-white">
            Repair request
          </a>
        )}
        <button onClick={() => setMoving(true)} className="min-h-14 rounded-2xl bg-brand-soft text-[16px] font-semibold text-brand-dark">
          Move-out
        </button>
      </div>

      <Section title="History">
        {!history ? (
          <Loading />
        ) : history.visits.length === 0 ? (
          <p className="px-4 text-[15px] text-muted">No visits yet.</p>
        ) : (
          <div className="space-y-3">
            {history.visits.map((v) => (
              <Card key={v.id} className="px-4 py-3">
                <p className="text-[15px] font-semibold">
                  {new Date(`${v.date}T12:00`).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                  {v.hours_used ? ` · ${v.hours_used} plan hour${v.hours_used === 1 ? '' : 's'}` : ''}
                </p>
                {v.items.map((i) => (
                  <p key={i.id} className="text-[15px]">
                    {i.status === 'done' ? '✓' : '○'} {i.title}
                    {i.location ? ` · ${i.location}` : ''}
                  </p>
                ))}
                {v.photos.length > 0 && (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {v.photos.map((ph) => (
                      <div key={ph.path} className="relative aspect-square overflow-hidden rounded-xl bg-canvas">
                        {url(ph.path) && <img src={url(ph.path)} alt="" className="h-full w-full object-cover" />}
                        <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[11px] font-semibold text-white">{ph.kind === 'before' ? 'Before' : 'After'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </Section>

      {history && history.requests.length > 0 && (
        <Section title="Requests">
          <Card>
            {history.requests.map((r, i) => (
              <div key={r.id} className={`px-4 py-3 ${i ? 'border-t border-hairline' : ''}`}>
                <p className="text-[15px]">{issueSummary({ issues: r.issues, punch_list: '' })}</p>
                <p className="text-[13px] text-muted">
                  {new Date(r.created_at).toLocaleDateString()}
                  {r.unit ? ` · ${r.unit}` : ''} · {r.status === 'new' ? 'Received' : r.status === 'scheduled' ? `Scheduled${r.scheduled_at ? ` ${new Date(r.scheduled_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}` : r.status === 'done' ? 'Done' : 'Closed'}
                  {r.needs_approval ? ' · needs your approval' : ''}
                </p>
              </div>
            ))}
          </Card>
        </Section>
      )}

      {profile && (facts.length > 0 || profile.items.length > 0) && (
        <Section title="House profile">
          <Card>
            {facts.map(([k, v], i) => (
              <div key={k} className={`px-4 py-2.5 ${i ? 'border-t border-hairline' : ''}`}>
                <p className="text-[13px] text-muted">{k}</p>
                <p className="text-[15px]">{v}</p>
              </div>
            ))}
            {profile.items.map((it, i) => (
              <div key={it.id} className={`px-4 py-2.5 ${i || facts.length ? 'border-t border-hairline' : ''}`}>
                <p className="text-[15px]">
                  {it.name}
                  {it.room ? ` · ${it.room}` : ''}
                  {it.condition ? ` · ${it.condition === 'good' ? 'Good' : it.condition === 'fair' ? 'Fair' : 'Worn'}` : ''}
                </p>
                <p className="text-[13px] text-muted">{[it.brand, it.model].filter(Boolean).join(' ')}</p>
                {it.replace_soon && <p className="text-[13px] font-semibold text-[#8a4b00]">Worn, replace soon{it.worn_note ? `: ${it.worn_note}` : ''}</p>}
              </div>
            ))}
          </Card>
        </Section>
      )}

      {profile && profile.inspections.length > 0 && (
        <Section title="Inspection reports">
          <Card>
            {profile.inspections.map((ins, i) => (
              <Link key={ins.id} to={`/landlord/houses/${houseId}/inspections/${ins.id}`} className={`block px-4 py-3 active:bg-canvas ${i ? 'border-t border-hairline' : ''}`}>
                <p className="text-[17px]">{inspectionKindLabel[ins.kind]}</p>
                <p className="text-[13px] text-muted">{new Date(ins.done_at!).toLocaleDateString()}</p>
              </Link>
            ))}
          </Card>
        </Section>
      )}

      <Tenants houseId={houseId} units={house.units} />

      {moving && <MoveOutSheet houseId={houseId} units={house.units} onClose={() => setMoving(false)} />}
    </Screen>
  )
}

function Tenants({ houseId, units }: { houseId: string; units: { id: string; label: string }[] }) {
  const qc = useQueryClient()
  const { data: tenants = [] } = useQuery({ queryKey: ['myTenants', houseId], queryFn: () => backend.houseTenants(houseId) })
  const [edit, setEdit] = useState<Partial<Tenant> | null>(null)
  const save = useMutation({
    mutationFn: (t: Partial<Tenant>) => backend.saveMyTenant({ ...t, property_id: houseId }),
    onSuccess: () => {
      setEdit(null)
      void qc.invalidateQueries({ queryKey: ['myTenants', houseId] })
    },
  })
  const unitName = (id: string | null) => units.find((u) => u.id === id)?.label ?? 'Whole house'
  return (
    <Section title="Tenants">
      <Card>
        {tenants.length === 0 && <p className="px-4 py-3 text-[15px] text-muted">No tenants listed.</p>}
        {tenants.map((t, i) => (
          <button key={t.id} onClick={() => setEdit(t)} className={`block w-full px-4 py-3 text-left ${i ? 'border-t border-hairline' : ''}`}>
            <p className="text-[17px]">{t.name || 'No name'}</p>
            <p className="text-[13px] text-muted">
              {unitName(t.unit_id)} · {t.phone}
            </p>
          </button>
        ))}
      </Card>
      <p className="mt-1.5 px-4 text-[13px] text-muted">Requests from these phone numbers are matched to their unit.</p>
      {edit ? (
        <Card className="mt-3">
          <Field label="Name" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <Divider />
          <Field label="Phone" type="tel" value={edit.phone ?? ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
          {units.length > 0 && (
            <>
              <Divider />
              <label className="block px-4 py-2.5">
                <span className="block text-[13px] font-medium text-muted">Unit</span>
                <select className="min-h-10 w-full bg-transparent outline-none" value={edit.unit_id ?? ''} onChange={(e) => setEdit({ ...edit, unit_id: e.target.value || null })} aria-label="Unit">
                  <option value="">Whole house</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <div className="flex gap-2 p-3">
            <Button disabled={save.isPending || !(edit.name?.trim() || edit.phone?.trim())} onClick={() => save.mutate(edit)}>
              Save tenant
            </Button>
            <Button variant="secondary" className="!w-auto" onClick={() => setEdit(null)}>
              Cancel
            </Button>
          </div>
          {save.error && <div className="px-3 pb-3"><ErrorNote error={save.error} /></div>}
        </Card>
      ) : (
        <Button variant="secondary" className="mt-3" onClick={() => setEdit({ name: '', phone: '', unit_id: units[0]?.id ?? null })}>
          Add a tenant
        </Button>
      )}
    </Section>
  )
}

function MoveOutSheet({ houseId, units, onClose }: { houseId: string; units: { id: string; label: string }[]; onClose: () => void }) {
  const [unit, setUnit] = useState(units[0]?.id ?? '')
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [sent, setSent] = useState(false)
  const send = useMutation({ mutationFn: () => backend.requestMoveOut(houseId, unit || null, date, note), onSuccess: () => setSent(true) })
  return (
    <Sheet title="Tenant moving out" onClose={onClose}>
      {sent ? (
        <div className="py-4 text-center">
          <p className="text-[19px] font-semibold">Got it! We'll call to book the turnover walkthrough.</p>
          <Button className="mt-4" onClick={onClose}>
            OK
          </Button>
        </div>
      ) : (
        <>
          <Card className="bg-canvas">
            {units.length > 0 && (
              <>
                <label className="block px-4 py-2.5">
                  <span className="block text-[13px] font-medium text-muted">Unit</span>
                  <select className="min-h-10 w-full bg-transparent outline-none" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit">
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label}
                      </option>
                    ))}
                    <option value="">Whole house</option>
                  </select>
                </label>
                <Divider />
              </>
            )}
            <label className="block px-4 py-2.5">
              <span className="block text-[13px] font-medium text-muted">Move-out date</span>
              <input type="date" aria-label="Move-out date" className="min-h-10 w-full bg-transparent outline-none" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <Divider />
            <TextArea label="Anything we should know (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Card>
          <p className="mt-1.5 px-1 text-[13px] text-muted">We'll do a walkthrough and send an estimate. Turnovers are billed as regular jobs.</p>
          {send.error && <div className="mt-2"><ErrorNote error={send.error} /></div>}
          <Button className="mt-4" disabled={!date || send.isPending} onClick={() => send.mutate()}>
            Book a turnover walkthrough
          </Button>
        </>
      )}
    </Sheet>
  )
}

function LandlordInspection({ summary }: { summary: LandlordSummary }) {
  const { houseId = '', inspectionId = '' } = useParams()
  const { data: profile } = useHouseProfile(houseId)
  const house = summary.houses.find((h) => h.id === houseId)
  const ins = profile?.inspections.find((i) => i.id === inspectionId)
  return (
    <Screen title="Inspection report" back={{ to: `/landlord/houses/${houseId}`, label: 'House' }}>
      {!profile ? <Loading /> : !ins ? <p>Not found.</p> : (
        <InspectionReport inspection={ins} address={house?.address ?? ''} company={summary.company.name} photos={profile.photos} worn={profile.items.filter((i) => i.replace_soon)} />
      )}
    </Screen>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <GroupLabel>{title}</GroupLabel>
      {children}
    </section>
  )
}

function Big({ label, value, border }: { label: string; value: number; border?: boolean }) {
  return (
    <div className={`px-2 py-3 ${border ? 'border-l border-hairline' : ''}`}>
      <p className="text-[26px] font-bold leading-tight">{value}</p>
      <p className="text-[12px] font-semibold text-muted">{label}</p>
    </div>
  )
}
