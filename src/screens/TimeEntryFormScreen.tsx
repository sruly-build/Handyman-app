import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, ErrorNote, Field, GroupLabel, Loading } from '../components/ui'
import { backend } from '../data/backend'
import { refreshAll, useItems, useJob, usePeople, useTime } from '../data/queries'
import { formatDuration } from '../data/time'
import { useUser } from '../lib/auth'

interface Form {
  user_id: string
  /** '' = on site (arrived → finished), otherwise a punch list item id */
  item_id: string
  date: string
  start: string
  end: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const dateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const timeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
/** Local date + time boxes → a moment in time */
const toIso = (date: string, time: string) => new Date(`${date}T${time}`).toISOString()

/** Type in time by hand (/jobs/:jobId/time/new) or fix an entry (/jobs/:jobId/time/:entryId) */
export function TimeEntryFormScreen() {
  const { jobId = '', entryId } = useParams()
  const editing = Boolean(entryId)
  const user = useUser()
  const { data: job } = useJob(jobId)
  const { data: entries, isLoading, error } = useTime(jobId)
  const { data: items = [] } = useItems(jobId)
  const { data: people = [] } = usePeople()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const entry = entries?.find((e) => e.id === entryId)
  const [form, setForm] = useState<Form | null>(() => {
    if (editing) return null
    const end = new Date()
    const start = new Date(end.getTime() - 3_600_000)
    return { user_id: user.id, item_id: '', date: dateInput(start), start: timeInput(start), end: timeInput(end) }
  })

  useEffect(() => {
    if (entry && !form) {
      const start = new Date(entry.started_at)
      const end = entry.ended_at ? new Date(entry.ended_at) : new Date()
      setForm({
        user_id: entry.user_id,
        item_id: entry.item_id ?? '',
        date: dateInput(start),
        start: timeInput(start),
        end: timeInput(end),
      })
    }
  }, [entry, form])

  const save = useMutation({
    mutationFn: async (f: Form) => {
      const started_at = toIso(f.date, f.start)
      let ended = new Date(`${f.date}T${f.end}`)
      // Finished after midnight
      if (f.end <= f.start) ended = new Date(ended.getTime() + 86_400_000)
      const input = {
        user_id: f.user_id,
        item_id: f.item_id || null,
        kind: f.item_id ? ('task' as const) : ('visit' as const),
        started_at,
        ended_at: ended.toISOString(),
      }
      return entry ? backend.updateTimeEntry(entry.id, input) : backend.addTimeEntry({ ...input, job_id: jobId })
    },
    onSuccess: () => {
      void refreshAll(qc)
      navigate(-1)
    },
  })

  const remove = useMutation({
    mutationFn: () => backend.deleteTimeEntry(entryId!),
    onSuccess: () => {
      void refreshAll(qc)
      navigate(-1)
    },
  })

  const back = { to: `/jobs/${jobId}/time`, label: 'Time' }
  if (editing && (isLoading || error || !form)) {
    return (
      <Screen title="Time" back={back}>
        {error ? <ErrorNote error={error} /> : entries && !entry ? <p className="px-4">This entry was deleted.</p> : <Loading />}
      </Screen>
    )
  }
  if (!form) return null

  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch })
  // The owner can add time for anyone in the company; others only for themselves
  const canPickPerson = user.role === 'owner' && people.length > 1
  const startMs = Date.parse(`${form.date}T${form.start}`)
  let endMs = Date.parse(`${form.date}T${form.end}`)
  if (endMs <= startMs) endMs += 86_400_000
  const valid = Boolean(form.date && form.start && form.end) && Number.isFinite(startMs) && Number.isFinite(endMs)

  function submit(e: FormEvent) {
    e.preventDefault()
    save.mutate(form!)
  }

  return (
    <Screen title={editing ? 'Edit time' : 'Add time'} eyebrow={job?.customer_name} back={back}>
      <form onSubmit={submit} className="space-y-6">
        {canPickPerson && (
          <section>
            <GroupLabel>Who worked</GroupLabel>
            <Card>
              <label className="block px-4 py-2.5">
                <select
                  value={form.user_id}
                  onChange={(e) => set({ user_id: e.target.value })}
                  className="min-h-10 w-full bg-transparent outline-none"
                  aria-label="Who worked"
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || 'Unnamed'}
                      {p.id === user.id ? ' (me)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </Card>
          </section>
        )}

        <section>
          <GroupLabel>What</GroupLabel>
          <Card>
            <label className="block px-4 py-2.5">
              <select
                value={form.item_id}
                onChange={(e) => set({ item_id: e.target.value })}
                className="min-h-10 w-full bg-transparent outline-none"
                aria-label="What"
              >
                <option value="">On site (arrived → finished)</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    Task: {i.title}
                  </option>
                ))}
              </select>
            </label>
          </Card>
        </section>

        <section>
          <GroupLabel>When</GroupLabel>
          <Card>
            <Field label="Date" type="date" required value={form.date} onChange={(e) => set({ date: e.target.value })} />
            <Divider />
            <div className="grid grid-cols-2">
              <Field label="Start" type="time" required value={form.start} onChange={(e) => set({ start: e.target.value })} />
              <Field
                label="End"
                type="time"
                required
                value={form.end}
                onChange={(e) => set({ end: e.target.value })}
                className="border-l border-hairline"
              />
            </div>
          </Card>
          {valid && (
            <p className="mt-1.5 px-4 text-[14px] text-muted">
              {formatDuration(endMs - startMs)}
              {form.end <= form.start ? ' (finished the next day)' : ''}
            </p>
          )}
        </section>

        {save.error && <ErrorNote error={save.error} />}
        <Button type="submit" disabled={save.isPending || !valid}>
          {save.isPending ? 'Saving…' : editing ? 'Save time' : 'Add time'}
        </Button>
        {editing && (
          <Button
            type="button"
            variant="danger"
            disabled={remove.isPending}
            onClick={() => confirm('Delete this time entry?') && remove.mutate()}
          >
            Delete time entry
          </Button>
        )}
      </form>
    </Screen>
  )
}
