import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AddressField } from '../components/AddressField'
import { HousePlanCard, LandlordCard } from '../components/Plan'
import { PlusIcon, SearchIcon, TrashIcon } from '../components/Icons'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, EmptyState, ErrorNote, Field, GroupLabel, Loading } from '../components/ui'
import { backend } from '../data/backend'
import { refreshAll, useClaims, useHouse, useHouses, useRequests, useServiceSettings } from '../data/queries'
import { repeatIssues, requestFlags } from '../data/requests'
import type { Tenant } from '../data/types'
import { pickLabel } from '../lib/i18n'
import { RequestRow } from './RequestsScreen'

export const planLabel = (status: string | undefined) =>
  status === 'active' ? 'On the plan' : status === 'past_due' ? 'Payment failed' : status === 'pending' ? 'Plan not paid yet' : 'No plan'

/** Every house we know: on the plan or not */
export function HousesScreen() {
  const { data, isLoading, error } = useHouses()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [address, setAddress] = useState('')
  const qc = useQueryClient()
  const add = useMutation({
    mutationFn: () => backend.findOrAddHouse(address),
    onSuccess: () => {
      setAddress('')
      setAdding(false)
      void refreshAll(qc)
    },
  })
  const { data: claims = [] } = useClaims()
  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => backend.decideClaim(id, approve),
    onSuccess: () => void refreshAll(qc),
  })
  const list = (data ?? []).filter((h) =>
    `${h.address} ${h.landlord?.name ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()),
  )
  return (
    <Screen
      title="Houses"
      back={{ to: '/requests', label: 'Requests' }}
      action={
        <button onClick={() => setAdding(!adding)} className="flex h-11 w-11 items-center justify-center text-brand" aria-label="Add a house">
          <PlusIcon size={26} />
        </button>
      }
    >
      {adding && (
        <div className="mb-4 space-y-2">
          <Card>
            <AddressField value={address} onChange={setAddress} />
          </Card>
          {add.error && <ErrorNote error={add.error} />}
          <Button disabled={address.trim().length < 5 || add.isPending} onClick={() => add.mutate()}>
            Add house
          </Button>
        </div>
      )}
      {claims.length > 0 && (
        <section className="mb-5">
          <GroupLabel>Landlords asking to add a house</GroupLabel>
          <Card>
            {claims.map((c, i) => (
              <div key={c.id} className={`px-4 py-3 ${i ? 'border-t border-hairline' : ''}`}>
                <p className="text-[17px] font-semibold">{c.address}</p>
                <p className="text-[15px] text-muted">{c.landlord}</p>
                <div className="mt-2 flex gap-2">
                  <button className="min-h-11 flex-1 rounded-xl bg-brand text-[15px] font-semibold text-white" onClick={() => decide.mutate({ id: c.id, approve: true })}>
                    Approve house claim
                  </button>
                  <button className="min-h-11 flex-1 rounded-xl bg-canvas text-[15px] font-semibold" onClick={() => decide.mutate({ id: c.id, approve: false })}>
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}
      <Card className="mb-4 flex items-center gap-2 px-4">
        <SearchIcon size={18} className="text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search address or landlord" className="min-h-12 flex-1 bg-transparent outline-none" aria-label="Search houses" />
      </Card>
      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}
      {data && list.length === 0 && <EmptyState title="No houses yet">Houses are added when a request comes in, or tap + to add one.</EmptyState>}
      {list.length > 0 && (
        <Card>
          {list.map((h, i) => (
            <Link key={h.id} to={`/houses/${h.id}`} className={`block px-4 py-3 active:bg-canvas ${i ? 'border-t border-hairline' : ''}`}>
              <p className="truncate text-[17px] font-semibold">{h.address}</p>
              <p className="truncate text-[13px] text-muted">
                {planLabel(h.plan?.status)}
                {h.plan?.status === 'active' ? ` · ${h.hours_left} h in the bank` : ''}
                {h.landlord ? ` · ${h.landlord.name || h.landlord.email}` : ''}
                {h.units.length ? ` · ${h.units.length} units` : ''}
              </p>
            </Link>
          ))}
        </Card>
      )}
    </Screen>
  )
}

/** One house: units, tenants (for matching texts), the plan, and its requests */
export function HouseScreen() {
  const { houseId = '' } = useParams()
  const { data: h, isLoading, error } = useHouse(houseId)
  const { data: requests = [] } = useRequests()
  const { data: settings } = useServiceSettings()
  const qc = useQueryClient()
  const run = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: () => void refreshAll(qc) })
  const [newUnit, setNewUnit] = useState('')
  const [tenant, setTenant] = useState<Partial<Tenant> | null>(null)

  const mine = useMemo(() => requests.filter((r) => r.property_id === houseId), [requests, houseId])
  const repeats = useMemo(() => repeatIssues(requests, settings?.repeat_threshold ?? 3), [requests, settings])
  const repeatKeys = [...repeats].filter((k) => k.startsWith(`${houseId}:`)).map((k) => k.split(':')[1])

  if (isLoading || error || !h) {
    return (
      <Screen title="House" back={{ to: '/houses', label: 'Houses' }}>
        {error ? <ErrorNote error={error} /> : <Loading />}
      </Screen>
    )
  }
  const unitName = (id: string | null) => h.units.find((u) => u.id === id)?.label ?? 'Whole house'

  return (
    <Screen title={h.address.split(',')[0]} eyebrow={h.address.split(',').slice(1).join(',').trim() || undefined} back={{ to: '/houses', label: 'Houses' }}>
      <HousePlanCard house={h} />
      <LandlordCard house={h} />

      {repeatKeys.length > 0 && (
        <div className="mt-3 rounded-2xl bg-[#efe7fb] px-4 py-3 text-[15px] text-[#5b2bb5]">
          <p className="font-semibold">Repeat issues</p>
          <p>{repeatKeys.map((k) => pickLabel(k)).join(', ')}</p>
        </div>
      )}

      <Section title="Units">
        <Card>
          {h.units.map((u, i) => (
            <div key={u.id}>
              {i > 0 && <Divider />}
              <div className="flex min-h-12 items-center gap-2 px-4">
                <input
                  defaultValue={u.label}
                  aria-label="Unit name"
                  onBlur={(e) => e.target.value.trim() && e.target.value !== u.label && run.mutate(() => backend.renameUnit(u.id, e.target.value))}
                  className="min-h-11 flex-1 bg-transparent text-[17px] outline-none"
                />
                <button
                  onClick={() => window.confirm(`Remove ${u.label}?`) && run.mutate(() => backend.deleteUnit(u.id))}
                  className="flex h-11 w-11 items-center justify-center text-muted"
                  aria-label={`Remove ${u.label}`}
                >
                  <TrashIcon size={20} />
                </button>
              </div>
            </div>
          ))}
          {h.units.length > 0 && <Divider />}
          <form
            className="flex items-center gap-2 pr-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (newUnit.trim()) run.mutate(() => backend.addUnit(h.id, newUnit).then(() => setNewUnit('')))
            }}
          >
            <Field label="Add a unit" placeholder="e.g. Apartment A, Basement, Upstairs" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} className="flex-1" />
            <button type="submit" className="min-h-11 px-3 font-semibold text-brand" disabled={!newUnit.trim()}>
              Add
            </button>
          </form>
        </Card>
        <p className="mt-1.5 px-4 text-[13px] text-muted">Tenants pick their unit on the request page.</p>
      </Section>

      <Section title="Tenants">
        <Card>
          {h.tenants.length === 0 && <p className="px-4 py-3 text-[15px] text-muted">No tenants yet.</p>}
          {h.tenants.map((t, i) => (
            <button key={t.id} onClick={() => setTenant(t)} className={`block w-full px-4 py-3 text-left active:bg-canvas ${i ? 'border-t border-hairline' : ''}`}>
              <p className="text-[17px]">{t.name || 'No name'}</p>
              <p className="text-[13px] text-muted">
                {unitName(t.unit_id)} · {t.phone || 'no phone'}
              </p>
            </button>
          ))}
        </Card>
        <p className="mt-1.5 px-4 text-[13px] text-muted">
          Requests and texts from these phone numbers are matched to the unit. Unknown numbers on a plan house are flagged “Unverified”.
        </p>
        {tenant ? (
          <Card className="mt-3">
            <Field label="Name" value={tenant.name ?? ''} onChange={(e) => setTenant({ ...tenant, name: e.target.value })} />
            <Divider />
            <Field label="Phone" type="tel" value={tenant.phone ?? ''} onChange={(e) => setTenant({ ...tenant, phone: e.target.value })} />
            <Divider />
            <label className="block px-4 py-2.5">
              <span className="block text-[13px] font-medium text-muted">Unit</span>
              <select value={tenant.unit_id ?? ''} onChange={(e) => setTenant({ ...tenant, unit_id: e.target.value || null })} className="min-h-10 w-full bg-transparent outline-none" aria-label="Unit">
                <option value="">Whole house</option>
                {h.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2 p-3">
              <Button
                disabled={!tenant.name?.trim() && !tenant.phone?.trim()}
                onClick={() => run.mutate(() => backend.saveTenant({ ...tenant, property_id: h.id }).then(() => setTenant(null)))}
              >
                Save tenant
              </Button>
              {tenant.id && (
                <Button variant="danger" className="!w-auto" onClick={() => run.mutate(() => backend.deleteTenant(tenant.id!).then(() => setTenant(null)))}>
                  Remove
                </Button>
              )}
              <Button variant="secondary" className="!w-auto" onClick={() => setTenant(null)}>
                Cancel
              </Button>
            </div>
          </Card>
        ) : (
          <Button variant="secondary" className="mt-3" onClick={() => setTenant({ name: '', phone: '', unit_id: h.units[0]?.id ?? null })}>
            Add a tenant
          </Button>
        )}
      </Section>

      {run.error && <div className="mt-3"><ErrorNote error={run.error} /></div>}

      <Section title={`Requests (${mine.length})`}>
        {mine.length ? (
          <Card>
            {mine.map((r, i) => (
              <RequestRow key={r.id} r={r} flags={requestFlags(r, repeats)} first={i === 0} />
            ))}
          </Card>
        ) : (
          <p className="px-4 text-[15px] text-muted">No requests yet.</p>
        )}
      </Section>
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

