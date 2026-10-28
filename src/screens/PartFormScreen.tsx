import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, ErrorNote, Field, GroupLabel, Loading, Segmented } from '../components/ui'
import { partStatusLabels } from '../components/PartRow'
import { backend } from '../data/backend'
import { formatMoney, withMarkup } from '../data/billing'
import { refreshAll, useItems, useJob, usePart, useSettings } from '../data/queries'
import type { PartStatus } from '../data/types'

interface Form {
  name: string
  quantity: string
  cost: string
  supplier: string
  status: PartStatus
  item_id: string
}

/** Add a part (/jobs/:jobId/parts/new?item=…) or edit one (/parts/:partId) */
export function PartFormScreen() {
  const { jobId: jobFromUrl, partId } = useParams()
  const [search] = useSearchParams()
  const editing = Boolean(partId)
  const { data: part, isLoading, error } = usePart(partId ?? '', editing)
  const jobId = jobFromUrl ?? part?.job_id ?? ''
  const { data: items = [] } = useItems(jobId)
  const { data: job } = useJob(jobId, Boolean(jobId))
  const { data: settings } = useSettings(job?.created_by, Boolean(job))
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [form, setForm] = useState<Form | null>(
    editing ? null : { name: '', quantity: '1', cost: '', supplier: '', status: 'needed', item_id: search.get('item') ?? '' },
  )

  useEffect(() => {
    if (part && !form) {
      setForm({
        name: part.name,
        quantity: String(part.quantity),
        cost: part.cost == null ? '' : String(part.cost),
        supplier: part.supplier,
        status: part.status,
        item_id: part.item_id ?? '',
      })
    }
  }, [part, form])

  const save = useMutation({
    mutationFn: async (f: Form) => {
      const cost = parseFloat(f.cost)
      const input = {
        job_id: jobId,
        item_id: f.item_id || null,
        name: f.name.trim(),
        quantity: parseFloat(f.quantity) > 0 ? parseFloat(f.quantity) : 1,
        cost: Number.isFinite(cost) ? cost : null,
        supplier: f.supplier.trim(),
        status: f.status,
      }
      return part ? backend.updatePart(part, input) : backend.createPart(input)
    },
    onSuccess: () => {
      void refreshAll(qc)
      navigate(-1)
    },
  })

  const remove = useMutation({
    mutationFn: () => backend.deletePart(partId!),
    onSuccess: () => {
      void refreshAll(qc)
      navigate(-1)
    },
  })

  const back = { to: jobId ? `/jobs/${jobId}/parts` : '/orders', label: 'Back' }
  if (editing && (isLoading || error || !form)) {
    return (
      <Screen title="Part" back={back}>
        {error ? <ErrorNote error={error} /> : <Loading />}
      </Screen>
    )
  }
  if (!form) return null

  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch })
  const costNumber = parseFloat(form.cost)

  function submit(e: FormEvent) {
    e.preventDefault()
    save.mutate(form!)
  }

  return (
    <Screen title={editing ? 'Edit part' : 'New part'} back={back}>
      <form onSubmit={submit} className="space-y-6">
        <Segmented
          label="Order status"
          value={form.status}
          onChange={(status) => set({ status })}
          options={(['needed', 'ordered', 'received'] as const).map((v) => ({ value: v, label: partStatusLabels[v] }))}
        />
        <Card>
          <Field
            label="Part"
            required
            autoFocus={!editing}
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. Moen 1225 cartridge"
          />
          <Divider />
          <div className="grid grid-cols-2">
            <Field
              label="Quantity"
              inputMode="decimal"
              value={form.quantity}
              onChange={(e) => set({ quantity: e.target.value.replace(/[^\d.]/g, '') })}
            />
            <Field
              label="Cost paid (total) $"
              inputMode="decimal"
              value={form.cost}
              onChange={(e) => set({ cost: e.target.value.replace(/[^\d.]/g, '') })}
              placeholder="0.00"
              className="border-l border-hairline"
            />
          </div>
          <Divider />
          <Field
            label="Supplier (optional)"
            value={form.supplier}
            onChange={(e) => set({ supplier: e.target.value })}
            placeholder="e.g. Home Depot"
          />
        </Card>
        {settings && Number.isFinite(costNumber) && costNumber > 0 && (
          <p className="-mt-3 px-4 text-[14px] text-muted">
            Customer pays {formatMoney(withMarkup(costNumber, settings.markup_percent))} with your{' '}
            {settings.markup_percent}% markup.
          </p>
        )}

        {items.length > 0 && (
          <section>
            <GroupLabel>For which item?</GroupLabel>
            <Card>
              <label className="block px-4 py-2.5">
                <select
                  value={form.item_id}
                  onChange={(e) => set({ item_id: e.target.value })}
                  className="min-h-10 w-full bg-transparent outline-none"
                >
                  <option value="">Whole job (no specific item)</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title}
                      {i.location ? ` (${i.location})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </Card>
          </section>
        )}

        {save.error && <ErrorNote error={save.error} />}
        <Button type="submit" disabled={save.isPending || !form.name.trim()}>
          {save.isPending ? 'Saving…' : editing ? 'Save part' : 'Add part'}
        </Button>
        {editing && (
          <Button
            type="button"
            variant="danger"
            disabled={remove.isPending}
            onClick={() => confirm('Delete this part?') && remove.mutate()}
          >
            Delete part
          </Button>
        )}
      </form>
    </Screen>
  )
}
