import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ClientNameField } from '../components/ClientNameField'
import { AddressField } from '../components/AddressField'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, ErrorNote, Field, Loading, TextArea } from '../components/ui'
import { backend } from '../data/backend'
import { keys, refreshAll, useContacts, useJob } from '../data/queries'
import type { Contact, JobInput } from '../data/types'
import { useUser } from '../lib/auth'
import { todayISO } from '../lib/dates'

const blank: JobInput = {
  customer_name: '',
  customer_phone: '',
  customer_email: '',
  address: '',
  job_date: todayISO(),
  notes: '',
  bring_extras: [],
}

/** The job's customer details from a client (keeping anything the client doesn't have) */
function withClient(form: JobInput, client: Contact): JobInput {
  return {
    ...form,
    client_id: client.id,
    customer_name: client.name || client.business,
    customer_phone: client.phone || form.customer_phone,
    customer_email: client.email || form.customer_email,
    address: client.address || form.address,
  }
}

/** Used for both "New job" and "Edit job" */
export function JobFormScreen() {
  const { jobId } = useParams()
  const editing = Boolean(jobId)
  const { data: existing, isLoading } = useJob(jobId ?? '', editing)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [form, setForm] = useState<JobInput | null>(editing ? null : blank)
  const [params] = useSearchParams()
  const user = useUser()
  const { data: contacts = [] } = useContacts()
  const clients = contacts.filter((c) => c.kind === 'client' && c.owner_id === user.id)

  // "New job" from a client's page: start with their details
  const fromClient = editing ? undefined : clients.find((c) => c.id === params.get('client'))
  useEffect(() => {
    if (fromClient && form && !form.client_id) setForm((f) => (f ? withClient(f, fromClient) : f))
  }, [fromClient, form])

  useEffect(() => {
    if (existing && !form) {
      const { id: _id, created_at: _c, created_by: _by, company_id: _company, ...rest } = existing
      setForm(rest)
    }
  }, [existing, form])

  const save = useMutation({
    // The bring list is edited on its own screen, so leave it as it is
    mutationFn: ({ bring_extras: _keep, ...input }: JobInput) =>
      jobId ? backend.updateJob(jobId, input) : backend.createJob({ ...input, bring_extras: [] }),
    onSuccess: (job) => {
      void refreshAll(qc)
      qc.setQueryData(keys.job(job.id), job)
      if (editing) navigate(-1)
      else navigate(`/jobs/${job.id}`, { replace: true })
    },
  })

  const remove = useMutation({
    mutationFn: () => backend.deleteJob(jobId!),
    onSuccess: () => {
      void refreshAll(qc)
      navigate(form?.stage === 'lead' ? '/leads' : '/jobs', { replace: true })
    },
  })

  const back = editing ? { to: `/jobs/${jobId}`, label: 'Job' } : { to: '/jobs', label: 'Jobs' }

  if (editing && (isLoading || !form)) {
    return (
      <Screen title="Edit job" back={back}>
        <Loading />
      </Screen>
    )
  }
  if (!form) return null

  const set = (patch: Partial<JobInput>) => setForm({ ...form, ...patch })
  const lead = form.stage === 'lead'
  const linked = clients.find((c) => c.id === form.client_id)

  function submit(e: FormEvent) {
    e.preventDefault()
    save.mutate({ ...form!, customer_name: form!.customer_name.trim(), job_date: form!.job_date || null })
  }

  return (
    <Screen title={editing ? (lead ? 'Edit lead' : 'Edit job') : 'New job'} back={back}>
      <form onSubmit={submit} className="space-y-6">
        <section>
          <h2 className="mb-1.5 px-4 text-[13px] font-semibold uppercase tracking-wide text-muted">Customer</h2>
          <Card>
            <ClientNameField
              value={form.customer_name}
              clients={clients}
              linked={linked}
              autoFocus={!editing && !params.get('client')}
              // Changing the name means a different client (matched or added on save)
              onType={(customer_name) =>
                set({ customer_name, client_id: linked && customer_name === linked.name ? linked.id : null })
              }
              onPick={(client) => setForm(withClient(form, client))}
            />
            <Divider />
            <Field
              label="Phone"
              type="tel"
              autoComplete="tel"
              value={form.customer_phone}
              onChange={(e) => set({ customer_phone: e.target.value })}
              placeholder="(555) 123-4567"
            />
            <Divider />
            <Field
              label="Email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              value={form.customer_email}
              onChange={(e) => set({ customer_email: e.target.value })}
              placeholder="Optional"
            />
            <Divider />
            <AddressField value={form.address} onChange={(address) => set({ address })} />
          </Card>
        </section>

        <section>
          <h2 className="mb-1.5 px-4 text-[13px] font-semibold uppercase tracking-wide text-muted">
            {lead ? 'Lead' : 'Job'}
          </h2>
          <Card>
            {/* A lead's walkthrough is booked on its page; the job date comes when it's converted */}
            {!lead && (
              <>
                <div className="grid grid-cols-2">
                  <Field
                    label="Job date"
                    type="date"
                    value={form.job_date ?? ''}
                    onChange={(e) => set({ job_date: e.target.value || null })}
                  />
                  <Field
                    label="Start time (optional)"
                    type="time"
                    value={form.job_time?.slice(0, 5) ?? ''}
                    onChange={(e) => set({ job_time: e.target.value || null })}
                    className="border-l border-hairline"
                  />
                </div>
                <Divider />
              </>
            )}
            <TextArea
              label={lead ? 'What they need' : 'Notes'}
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Gate code, parking, pets, anything to remember"
            />
          </Card>
        </section>

        {save.error && <ErrorNote error={save.error} />}
        <Button type="submit" disabled={save.isPending || !form.customer_name.trim()}>
          {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create job'}
        </Button>

        {editing && (
          <Button
            type="button"
            variant="danger"
            disabled={remove.isPending}
            onClick={() =>
              confirm(
                `Delete this ${lead ? 'lead' : 'job'} and everything in it (items, photos)? This cannot be undone.`,
              ) && remove.mutate()
            }
          >
            {remove.isPending ? 'Deleting…' : lead ? 'Delete lead' : 'Delete job'}
          </Button>
        )}
        {remove.error && <ErrorNote error={remove.error} />}
      </form>
    </Screen>
  )
}
