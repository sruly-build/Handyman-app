import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, ErrorNote, Field, Loading, TextArea } from '../components/ui'
import { backend } from '../data/backend'
import { keys, useJob } from '../data/queries'
import type { JobInput } from '../data/types'
import { todayISO } from '../lib/dates'

const blank: JobInput = {
  customer_name: '',
  customer_phone: '',
  customer_email: '',
  address: '',
  job_date: todayISO(),
  notes: '',
}

/** Used for both "New job" and "Edit job" */
export function JobFormScreen() {
  const { jobId } = useParams()
  const editing = Boolean(jobId)
  const { data: existing, isLoading } = useJob(jobId ?? '', editing)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [form, setForm] = useState<JobInput | null>(editing ? null : blank)

  useEffect(() => {
    if (existing && !form) {
      const { id: _id, created_at: _c, ...rest } = existing
      setForm(rest)
    }
  }, [existing, form])

  const save = useMutation({
    mutationFn: (input: JobInput) => (jobId ? backend.updateJob(jobId, input) : backend.createJob(input)),
    onSuccess: (job) => {
      qc.invalidateQueries({ queryKey: keys.jobs })
      qc.setQueryData(keys.job(job.id), job)
      navigate(`/jobs/${job.id}`, { replace: true })
    },
  })

  const remove = useMutation({
    mutationFn: () => backend.deleteJob(jobId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.jobs })
      navigate('/jobs', { replace: true })
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

  function submit(e: FormEvent) {
    e.preventDefault()
    save.mutate({ ...form!, customer_name: form!.customer_name.trim(), job_date: form!.job_date || null })
  }

  return (
    <Screen title={editing ? 'Edit job' : 'New job'} back={back}>
      <form onSubmit={submit} className="space-y-6">
        <section>
          <h2 className="mb-1.5 px-4 text-[13px] font-semibold uppercase tracking-wide text-muted">Customer</h2>
          <Card>
            <Field
              label="Name"
              required
              autoFocus={!editing}
              autoCapitalize="words"
              value={form.customer_name}
              onChange={(e) => set({ customer_name: e.target.value })}
              placeholder="e.g. Sarah Cohen"
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
            <Field
              label="Address"
              autoComplete="street-address"
              value={form.address}
              onChange={(e) => set({ address: e.target.value })}
              placeholder="12 Oak Street, Springfield"
            />
          </Card>
        </section>

        <section>
          <h2 className="mb-1.5 px-4 text-[13px] font-semibold uppercase tracking-wide text-muted">Job</h2>
          <Card>
            <Field
              label="Job date"
              type="date"
              value={form.job_date ?? ''}
              onChange={(e) => set({ job_date: e.target.value || null })}
            />
            <Divider />
            <TextArea
              label="Notes"
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
              confirm('Delete this job and everything in it (items, photos)? This cannot be undone.') && remove.mutate()
            }
          >
            {remove.isPending ? 'Deleting…' : 'Delete job'}
          </Button>
        )}
        {remove.error && <ErrorNote error={remove.error} />}
      </form>
    </Screen>
  )
}
