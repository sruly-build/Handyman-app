import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { StagePill } from '../components/Sales'
import { Button, Card, Divider, ErrorNote, Field, GroupLabel, Loading, Segmented, TextArea } from '../components/ui'
import { backend } from '../data/backend'
import { refreshAll, usePeople, useProspects, useSalesOrgs } from '../data/queries'
import { findDuplicates, interestLabels, orgTypeLabels, stageLabels, stageOrder } from '../data/sales'
import type { Interest, OrgType, ProspectInput } from '../data/types'
import { useUser } from '../lib/auth'

const blank = (me: string): ProspectInput => ({
  name: '',
  phone: '',
  email: '',
  known_by: [],
  mutual: false,
  cold: false,
  how_known: '',
  assigned_to: me,
  stage: 'new',
  interest: 'unknown',
  notes: '',
  project_notes: '',
  org_name: '',
  org_type: 'landlord',
  service_area: '',
  units_estimate: null,
})

/** Add a lead (/sales/leads/new) or edit one (/sales/leads/:leadId/edit) */
export function ProspectFormScreen() {
  const { leadId } = useParams()
  const editing = Boolean(leadId)
  const user = useUser()
  const { data: leads, isLoading } = useProspects()
  const { data: orgs = [] } = useSalesOrgs()
  const { data: people = [] } = usePeople()
  const lead = leads?.find((l) => l.id === leadId)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [form, setForm] = useState<ProspectInput | null>(editing ? null : blank(user.id))
  const [ignoreDuplicates, setIgnoreDuplicates] = useState(false)

  useEffect(() => {
    if (lead && !form) {
      setForm({
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        known_by: lead.known_by,
        mutual: lead.mutual,
        cold: lead.cold,
        how_known: lead.how_known,
        assigned_to: lead.assigned_to,
        stage: lead.stage,
        interest: lead.interest,
        notes: lead.notes,
        project_notes: lead.project_notes,
        org_name: lead.org?.name ?? '',
        org_type: lead.org?.org_type ?? 'other',
        service_area: lead.org?.service_area ?? '',
        units_estimate: lead.org?.units_estimate ?? null,
      })
    }
  }, [lead, form])

  const save = useMutation({
    mutationFn: (f: ProspectInput) => backend.saveProspect(f, leadId),
    onSuccess: (saved) => {
      void refreshAll(qc)
      if (editing) navigate(-1)
      else navigate(`/sales/leads/${saved.id}`, { replace: true })
    },
  })

  const back = editing ? { to: `/sales/leads/${leadId}`, label: 'Lead' } : { to: '/sales/leads', label: 'Leads' }
  if (editing && (isLoading || !form)) {
    return (
      <Screen title="Edit lead" back={back}>
        {leads && !lead ? <p className="px-4">This lead was deleted.</p> : <Loading />}
      </Screen>
    )
  }
  if (!form) return null

  const set = (patch: Partial<ProspectInput>) => {
    setForm({ ...form, ...patch })
    setIgnoreDuplicates(false)
  }
  const duplicates = findDuplicates(leads ?? [], form, leadId)
  // Picking an existing company fills in its details
  const pickOrg = (name: string) => {
    const org = orgs.find((o) => o.name.toLowerCase() === name.trim().toLowerCase())
    set(
      org
        ? { org_name: name, org_type: org.org_type, service_area: org.service_area, units_estimate: org.units_estimate }
        : { org_name: name },
    )
  }
  const toggleKnown = (id: string) =>
    set({
      known_by: form.known_by.includes(id) ? form.known_by.filter((k) => k !== id) : [...form.known_by, id],
      cold: false,
    })
  const chip = (active: boolean) =>
    `min-h-10 rounded-full px-3 text-[14px] font-semibold transition ${active ? 'bg-brand text-white' : 'bg-canvas text-ink active:opacity-60'}`

  function submit(e: FormEvent) {
    e.preventDefault()
    if (duplicates.length && !ignoreDuplicates) {
      setIgnoreDuplicates(true)
      return
    }
    save.mutate(form!)
  }

  return (
    <Screen title={editing ? 'Edit lead' : 'New lead'} back={back}>
      <form onSubmit={submit} className="space-y-6">
        <Card>
          <Field
            label="Contact name"
            required
            autoFocus={!editing}
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
          />
          <Divider />
          <Field
            label="Phone"
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => set({ phone: e.target.value })}
            placeholder="(732) 555-1234"
          />
          <Divider />
          <Field
            label="Email (optional)"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            value={form.email}
            onChange={(e) => set({ email: e.target.value })}
          />
        </Card>

        {duplicates.length > 0 && (
          <div className="rounded-2xl bg-progress-soft px-4 py-3 text-[14px] text-[#8a4b00]" role="alert">
            <p className="font-semibold">This may already be a lead:</p>
            {duplicates.map((d) => (
              <p key={d.id}>
                <Link to={`/sales/leads/${d.id}`} className="font-semibold underline">
                  {d.name}
                  {d.org ? ` (${d.org.name})` : ''}
                </Link>{' '}
                <StagePill stage={d.stage} />
              </p>
            ))}
            {ignoreDuplicates && <p className="mt-1">Tap Save again to add it anyway.</p>}
          </div>
        )}

        <section>
          <GroupLabel>Company</GroupLabel>
          <Card>
            <Field
              label="Company name (optional)"
              list="sales-orgs"
              value={form.org_name}
              onChange={(e) => pickOrg(e.target.value)}
              placeholder="e.g. Acme Property Management"
            />
            <datalist id="sales-orgs">
              {orgs.map((o) => (
                <option key={o.id} value={o.name} />
              ))}
            </datalist>
            <Divider />
            <label className="block px-4 py-2.5">
              <span className="block text-[13px] font-medium text-muted">Type</span>
              <select
                value={form.org_type}
                onChange={(e) => set({ org_type: e.target.value as OrgType })}
                className="min-h-10 w-full bg-transparent outline-none"
                aria-label="Type"
              >
                {(Object.keys(orgTypeLabels) as OrgType[]).map((t) => (
                  <option key={t} value={t}>
                    {orgTypeLabels[t]}
                  </option>
                ))}
              </select>
            </label>
            <Divider />
            <div className="grid grid-cols-2">
              <Field
                label="Area"
                value={form.service_area}
                onChange={(e) => set({ service_area: e.target.value })}
                placeholder="e.g. Lakewood"
              />
              <Field
                label="Units (about)"
                inputMode="numeric"
                value={form.units_estimate ?? ''}
                onChange={(e) =>
                  set({
                    units_estimate: e.target.value ? parseInt(e.target.value.replace(/\D/g, ''), 10) || null : null,
                  })
                }
                className="border-l border-hairline"
              />
            </div>
          </Card>
        </section>

        <section>
          <GroupLabel>How we know them</GroupLabel>
          <Card className="p-3">
            <div className="flex flex-wrap gap-2">
              {people.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={chip(form.known_by.includes(p.id))}
                  onClick={() => toggleKnown(p.id)}
                >
                  Known by {p.id === user.id ? 'me' : (p.full_name || 'partner').split(/\s+/)[0]}
                </button>
              ))}
              <button
                type="button"
                className={chip(form.mutual)}
                onClick={() => set({ mutual: !form.mutual, cold: false })}
              >
                Mutual connection
              </button>
              <button
                type="button"
                className={chip(form.cold)}
                onClick={() => set({ cold: !form.cold, known_by: [], mutual: false })}
              >
                Cold lead
              </button>
            </div>
            <div className="mt-2 rounded-xl bg-canvas">
              <Field
                label="How we know them (optional)"
                value={form.how_known}
                onChange={(e) => set({ how_known: e.target.value })}
                placeholder="e.g. From shul, owns 4 buildings"
              />
            </div>
          </Card>
        </section>

        <section>
          <GroupLabel>Sales</GroupLabel>
          <Card>
            <label className="block px-4 py-2.5">
              <span className="block text-[13px] font-medium text-muted">Who's calling them</span>
              <select
                value={form.assigned_to ?? ''}
                onChange={(e) => set({ assigned_to: e.target.value || null })}
                className="min-h-10 w-full bg-transparent outline-none"
                aria-label="Who's calling them"
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || 'Unnamed'}
                    {p.id === user.id ? ' (me)' : ''}
                  </option>
                ))}
                <option value="">Nobody yet</option>
              </select>
            </label>
            <Divider />
            <label className="block px-4 py-2.5">
              <span className="block text-[13px] font-medium text-muted">Stage</span>
              <select
                value={form.stage}
                onChange={(e) => set({ stage: e.target.value as ProspectInput['stage'] })}
                className="min-h-10 w-full bg-transparent outline-none"
                aria-label="Stage"
              >
                {stageOrder
                  .filter((s) => s !== 'converted' || form.stage === 'converted')
                  .map((s) => (
                    <option key={s} value={s}>
                      {stageLabels[s]}
                    </option>
                  ))}
              </select>
            </label>
          </Card>
          <p className="mb-1.5 mt-4 px-4 text-[13px] font-semibold uppercase tracking-wide text-muted">Interest</p>
          <Segmented
            label="Interest"
            value={form.interest}
            onChange={(interest: Interest) => set({ interest })}
            options={(Object.keys(interestLabels) as Interest[]).map((i) => ({
              value: i,
              label: i === 'unknown' ? '?' : interestLabels[i],
            }))}
          />
        </section>

        <Card>
          <TextArea label="Notes" rows={3} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          <Divider />
          <TextArea
            label="Possible projects"
            rows={2}
            value={form.project_notes}
            onChange={(e) => set({ project_notes: e.target.value })}
            placeholder="e.g. 12 units, about 3 turnovers a year"
          />
        </Card>

        {save.error && <ErrorNote error={save.error} />}
        <Button type="submit" disabled={save.isPending || !form.name.trim()}>
          {save.isPending ? 'Saving…' : ignoreDuplicates ? 'Save anyway' : editing ? 'Save' : 'Add lead'}
        </Button>
      </form>
    </Screen>
  )
}
