import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PencilIcon, PlusIcon } from '../components/Icons'
import { ListEditor } from '../components/ListEditor'
import { MeasurementsEditor } from '../components/MeasurementsEditor'
import { PartRow } from '../components/PartRow'
import { PhotoGrid, PhotoSection } from '../components/PhotoSection'
import { Screen } from '../components/Screen'
import { TaskTimer } from '../components/TimeWidgets'
import { Button, Card, Divider, ErrorNote, Field, Loading, SectionTitle, StatusPicker, TextArea } from '../components/ui'
import { backend } from '../data/backend'
import { isPartnerJob } from '../data/api'
import { keys, refreshAll, useItem, useJob, useParts, usePhotos } from '../data/queries'
import { useUser } from '../lib/auth'
import type { ItemPatch, PunchItem } from '../data/types'

/** Like the item, but hours are kept as typed text until saved */
type Draft = Omit<Required<ItemPatch>, 'estimated_hours'> & { estimated_hours: string }

const pickDraft = (i: PunchItem): Draft => ({
  title: i.title,
  location: i.location,
  notes: i.notes,
  status: i.status,
  measurements: i.measurements,
  tools: i.tools ?? [],
  estimated_hours: i.estimated_hours == null ? '' : String(i.estimated_hours),
})

/**
 * Everything about one punch list item. Changes save automatically
 * (like Apple Notes), so there is no Save button to forget.
 */
export function ItemScreen() {
  const { jobId = '', itemId = '' } = useParams()
  const { data: item, isLoading, error } = useItem(itemId)
  const { data: job } = useJob(jobId)
  // Another company's shared job: punch list and photos only, no time, parts or pricing
  const partner = job ? isPartnerJob(job, useUser()) : false
  const { data: parts = [] } = useParts(jobId)
  const { data: photos = [] } = usePhotos(itemId)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const { saveState, saveError } = useAutosave(itemId, draft)

  useEffect(() => {
    if (item && !draft) setDraft(pickDraft(item))
  }, [item, draft])

  const remove = useMutation({
    mutationFn: () => backend.deleteItem(itemId),
    onSuccess: () => {
      void refreshAll(qc)
      navigate(-1)
    },
  })

  const back = { to: `/jobs/${jobId}`, label: 'Job' }
  if (isLoading || error || !draft) {
    return (
      <Screen title="Item" back={back}>
        {error ? <ErrorNote error={error} /> : <Loading />}
      </Screen>
    )
  }

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })
  const itemParts = parts.filter((p) => p.item_id === itemId)
  const sketches = photos.filter((p) => p.kind === 'sketch')

  return (
    <Screen
      title={draft.title || 'Untitled item'}
      eyebrow={draft.location || undefined}
      back={back}
      action={<SaveIndicator state={saveState} />}
    >
      <StatusPicker value={draft.status} onChange={(status) => set({ status })} />
      {!partner && (
        <div className="mt-3">
          <TaskTimer
            jobId={jobId}
            itemId={itemId}
            onStart={() => setDraft((d) => (d && d.status === 'todo' ? { ...d, status: 'in_progress' } : d))}
          />
        </div>
      )}

      <SectionTitle>Before photos</SectionTitle>
      <PhotoSection jobId={jobId} itemId={itemId} kind="before" />

      <SectionTitle>After photos</SectionTitle>
      <PhotoSection jobId={jobId} itemId={itemId} kind="after" />

      <SectionTitle>Sketches</SectionTitle>
      <PhotoGrid photos={sketches} jobId={jobId} itemId={itemId} />
      <Link
        to={`/jobs/${jobId}/items/${itemId}/sketch`}
        className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-brand-soft text-[17px] font-semibold text-brand-dark active:opacity-70"
      >
        <PencilIcon size={22} />
        New sketch
      </Link>
      <p className="mt-1.5 px-2 text-center text-[13px] text-muted">To draw on a photo, tap the photo, then Draw on it.</p>

      <SectionTitle>Details</SectionTitle>
      <Card>
        <Field label="What needs doing?" value={draft.title} onChange={(e) => set({ title: e.target.value })} />
        <Divider />
        <Field
          label="Where? (room or area)"
          value={draft.location}
          onChange={(e) => set({ location: e.target.value })}
          placeholder="e.g. Upstairs bathroom"
        />
        {!partner && (
          <>
            <Divider />
            <Field
              label="Expected time (hours), for the estimate"
              inputMode="decimal"
              value={draft.estimated_hours}
              onChange={(e) => set({ estimated_hours: e.target.value.replace(/[^\d.]/g, '') })}
              placeholder="e.g. 1.5"
            />
          </>
        )}
      </Card>

      <SectionTitle>Measurements</SectionTitle>
      <MeasurementsEditor value={draft.measurements} onChange={(measurements) => set({ measurements })} />

      {!partner && (
        <>
          <SectionTitle>Parts to order</SectionTitle>
          {itemParts.length > 0 && (
            <Card className="mb-3">
              {itemParts.map((p, i) => (
                <div key={p.id}>
                  {i > 0 && <Divider />}
                  <PartRow part={p} />
                </div>
              ))}
            </Card>
          )}
          <Link
            to={`/jobs/${jobId}/parts/new?item=${itemId}`}
            className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#c7c7cc] text-[17px] font-semibold text-brand active:bg-white"
          >
            <PlusIcon size={22} />
            Add part
          </Link>
        </>
      )}

      <SectionTitle>Tools and materials</SectionTitle>
      <ListEditor
        value={draft.tools}
        onChange={(tools) => set({ tools })}
        placeholder="e.g. Drill, 1/4in bit, wall anchors x8"
      />
      <p className="mt-1.5 px-2 text-[13px] text-muted">These go on the job's bring list automatically.</p>

      <SectionTitle>Notes</SectionTitle>
      <Card>
        <TextArea
          value={draft.notes}
          onChange={(e) => set({ notes: e.target.value })}
          rows={5}
          placeholder="What you saw, what the customer asked for, how you plan to fix it…"
        />
      </Card>

      {Boolean(saveError) && (
        <div className="mt-4">
          <ErrorNote error={saveError} />
        </div>
      )}

      <div className="mt-10">
        <Button
          variant="danger"
          disabled={remove.isPending}
          onClick={() => confirm('Delete this item, its photos and its timers? This cannot be undone.') && remove.mutate()}
        >
          {remove.isPending ? 'Deleting…' : 'Delete item'}
        </Button>
        {remove.error && <ErrorNote error={remove.error} />}
      </div>
    </Screen>
  )
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/** Saves the draft about half a second after the last change, and right away when leaving the screen. */
function useAutosave(itemId: string, draft: Draft | null) {
  const qc = useQueryClient()
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<unknown>(null)
  const lastSaved = useRef<string | null>(null)
  const pending = useRef<Draft | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const flush = useRef(async () => {})
  flush.current = async () => {
    window.clearTimeout(timer.current)
    const next = pending.current
    if (!next) return
    pending.current = null
    const snapshot = JSON.stringify(next)
    setSaveState('saving')
    try {
      const hours = parseFloat(next.estimated_hours)
      const saved = await backend.updateItem(itemId, {
        ...next,
        title: next.title.trim() || 'Untitled item',
        estimated_hours: Number.isFinite(hours) ? hours : null,
      })
      lastSaved.current = snapshot
      qc.setQueryData(keys.item(itemId), saved)
      void refreshAll(qc)
      setSaveError(null)
      setSaveState('saved')
    } catch (err) {
      setSaveError(err)
      setSaveState('error')
    }
  }

  useEffect(() => {
    if (!draft) return
    const snapshot = JSON.stringify(draft)
    if (lastSaved.current === null) {
      lastSaved.current = snapshot // first load: nothing to save yet
      return
    }
    if (snapshot === lastSaved.current) return
    pending.current = draft
    window.clearTimeout(timer.current)
    // Status taps save at once; typing waits for a short pause
    const statusChanged = (JSON.parse(lastSaved.current) as Draft).status !== draft.status
    timer.current = window.setTimeout(() => void flush.current(), statusChanged ? 0 : 600)
  }, [draft])

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && void flush.current()
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      void flush.current()
    }
  }, [])

  return { saveState, saveError }
}

function SaveIndicator({ state }: { state: SaveState }) {
  const text = { idle: '', saving: 'Saving…', saved: 'Saved', error: 'Not saved' }[state]
  return (
    <span
      className={`text-[15px] font-medium transition-opacity ${state === 'error' ? 'text-problem' : 'text-muted'} ${
        state === 'idle' ? 'opacity-0' : 'opacity-100'
      }`}
      aria-live="polite"
    >
      {text}
    </span>
  )
}
