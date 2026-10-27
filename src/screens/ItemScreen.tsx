import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MeasurementsEditor } from '../components/MeasurementsEditor'
import { PhotoSection } from '../components/PhotoSection'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, ErrorNote, Field, Loading, SectionTitle, StatusPicker, TextArea } from '../components/ui'
import { backend } from '../data/backend'
import { keys, useItem } from '../data/queries'
import type { ItemPatch, PunchItem } from '../data/types'

type Draft = Required<ItemPatch>

const pickDraft = (i: PunchItem): Draft => ({
  title: i.title,
  location: i.location,
  notes: i.notes,
  status: i.status,
  measurements: i.measurements,
})

/**
 * Everything about one punch list item. Changes save automatically
 * (like Apple Notes) — there is no Save button to forget.
 */
export function ItemScreen() {
  const { jobId = '', itemId = '' } = useParams()
  const { data: item, isLoading, error } = useItem(itemId)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const { saveState, saveError } = useAutosave(itemId, jobId, draft)

  useEffect(() => {
    if (item && !draft) setDraft(pickDraft(item))
  }, [item, draft])

  const remove = useMutation({
    mutationFn: () => backend.deleteItem(itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.items(jobId) })
      qc.invalidateQueries({ queryKey: keys.jobs })
      navigate(`/jobs/${jobId}`, { replace: true })
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

  return (
    <Screen
      title={draft.title || 'Untitled item'}
      eyebrow={draft.location || undefined}
      back={back}
      action={<SaveIndicator state={saveState} />}
    >
      <StatusPicker value={draft.status} onChange={(status) => set({ status })} />

      <SectionTitle>Before photos</SectionTitle>
      <PhotoSection itemId={itemId} kind="before" />

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
      </Card>

      <SectionTitle>Measurements</SectionTitle>
      <MeasurementsEditor value={draft.measurements} onChange={(measurements) => set({ measurements })} />

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
          onClick={() => confirm('Delete this item and its photos? This cannot be undone.') && remove.mutate()}
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
function useAutosave(itemId: string, jobId: string, draft: Draft | null) {
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
      const saved = await backend.updateItem(itemId, { ...next, title: next.title.trim() || 'Untitled item' })
      lastSaved.current = snapshot
      qc.setQueryData(keys.item(itemId), saved)
      qc.invalidateQueries({ queryKey: keys.items(jobId) })
      qc.invalidateQueries({ queryKey: keys.jobs })
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
    const statusChanged = JSON.parse(lastSaved.current).status !== draft.status
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
