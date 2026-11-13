import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CameraIcon } from '../components/Icons'
import { InspectionReport, inspectionKindLabel } from '../components/InspectionReport'
import { Screen } from '../components/Screen'
import { Button, Card, ErrorNote, Field, GroupLabel, Loading, TextArea, Toggle } from '../components/ui'
import { backend } from '../data/backend'
import { refreshAll, useCompany, useHouse, useHouseProfile, useInspections } from '../data/queries'
import type { Condition, Inspection, InspectionResult } from '../data/types'
import { shrinkPhoto } from '../lib/images'

const ratings: { value: Condition; label: string; on: string }[] = [
  { value: 'good', label: 'Good', on: 'bg-brand text-white' },
  { value: 'fair', label: 'Fair', on: 'bg-progress text-white' },
  { value: 'worn', label: 'Worn', on: 'bg-problem text-white' },
]

/** Walk the house room by room: Good / Fair / Worn, notes and photos. Doubles as the inspection. */
export function InspectionScreen() {
  const { houseId = '', inspectionId = '' } = useParams()
  const { data: list } = useInspections(houseId)
  const { data: house } = useHouse(houseId)
  const { data: profile } = useHouseProfile(houseId)
  const ins = list?.find((i) => i.id === inspectionId)
  const [results, setResults] = useState<InspectionResult[] | null>(null)
  const [summary, setSummary] = useState('')
  const [shared, setShared] = useState(true)
  const [newItem, setNewItem] = useState<Record<string, string>>({})
  const navigate = useNavigate()
  const qc = useQueryClient()
  useEffect(() => {
    if (ins && !results) {
      setResults(ins.results)
      setSummary(ins.summary)
      setShared(ins.shared)
    }
  }, [ins, results])
  const save = useMutation({
    mutationFn: (finish: boolean) =>
      backend.saveInspection({ ...ins!, results: results!, summary, shared, done_at: finish ? new Date().toISOString() : ins!.done_at }),
    onSuccess: (_, finish) => {
      void refreshAll(qc)
      if (finish) navigate(`/houses/${houseId}/inspections/${inspectionId}/report`, { replace: true })
    },
  })
  const photo = useMutation({
    mutationFn: async ({ file, room }: { file: File; room: string }) =>
      backend.addHousePhoto(houseId, await shrinkPhoto(file), { room, kind: 'inspection', inspection_id: inspectionId }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['houseProfile', houseId] }),
  })

  if (!ins || !results) {
    return (
      <Screen title="Inspection" back={{ to: `/houses/${houseId}`, label: 'House' }}>
        {list && !ins ? <p>Not found.</p> : <Loading />}
      </Screen>
    )
  }
  const rooms = [...new Set(results.map((r) => r.room))]
  const set = (i: number, patch: Partial<InspectionResult>) => setResults(results.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const done = results.filter((r) => r.rating).length

  return (
    <Screen title={inspectionKindLabel[ins.kind]} eyebrow={house?.address.split(',')[0]} back={{ to: `/houses/${houseId}`, label: 'House' }}>
      <p className="-mt-3 mb-4 px-1 text-[15px] text-muted">
        {done} of {results.length} checked. Photograph each room, including model stickers on appliances.
      </p>
      {rooms.map((room) => {
        const roomPhotos = (profile?.photos ?? []).filter((p) => p.inspection_id === inspectionId && p.room === room)
        return (
          <section key={room} className="mb-6">
            <GroupLabel>{room}</GroupLabel>
            <Card>
              {results.map((r, i) =>
                r.room !== room ? null : (
                  <div key={i} className="border-b border-hairline px-4 py-3 last:border-b-0">
                    <p className="text-[17px]">{r.label}</p>
                    <div className="mt-2 flex gap-2" role="radiogroup" aria-label={`${room}: ${r.label}`}>
                      {ratings.map((x) => (
                        <button
                          key={x.value}
                          type="button"
                          role="radio"
                          aria-checked={r.rating === x.value}
                          onClick={() => set(i, { rating: r.rating === x.value ? null : x.value })}
                          className={`min-h-10 flex-1 rounded-xl text-[15px] font-semibold ${r.rating === x.value ? x.on : 'bg-canvas'}`}
                        >
                          {x.label}
                        </button>
                      ))}
                    </div>
                    {(r.rating === 'fair' || r.rating === 'worn' || r.note) && (
                      <input
                        className="mt-2 min-h-10 w-full rounded-xl bg-canvas px-3 outline-none"
                        placeholder="Note (what's wrong, model, size…)"
                        aria-label={`Note: ${r.label}`}
                        value={r.note}
                        onChange={(e) => set(i, { note: e.target.value })}
                      />
                    )}
                  </div>
                ),
              )}
              <form
                className="flex items-center gap-2 pr-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  const label = (newItem[room] ?? '').trim()
                  if (!label) return
                  setResults([...results, { room, label, rating: null, note: '', item_id: null }])
                  setNewItem({ ...newItem, [room]: '' })
                }}
              >
                <Field label="Add something to check" value={newItem[room] ?? ''} onChange={(e) => setNewItem({ ...newItem, [room]: e.target.value })} className="flex-1" />
                <button type="submit" className="min-h-11 px-3 font-semibold text-brand">
                  Add
                </button>
              </form>
            </Card>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {roomPhotos.map((p) => (
                <img key={p.id} src={p.url} alt={room} className="h-16 w-16 rounded-xl object-cover" />
              ))}
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-brand-soft px-3 text-[15px] font-semibold text-brand-dark">
                <CameraIcon size={20} /> Photo of {room.toLowerCase()}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    for (const file of Array.from(e.target.files ?? [])) photo.mutate({ file, room })
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
          </section>
        )
      })}
      <Card>
        <TextArea label="Summary for the landlord (optional)" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
        <Toggle label="Landlord can see this report" checked={shared} onChange={setShared} />
      </Card>
      {(save.error || photo.error) && <div className="mt-3"><ErrorNote error={save.error ?? photo.error} /></div>}
      <div className="mt-4 space-y-3">
        <Button disabled={save.isPending} onClick={() => save.mutate(true)}>
          Finish and see the report
        </Button>
        <Button variant="secondary" disabled={save.isPending} onClick={() => save.mutate(false)}>
          {save.isSuccess && !save.variables ? 'Saved' : 'Save for later'}
        </Button>
      </div>
    </Screen>
  )
}

export function InspectionReportScreen() {
  const { houseId = '', inspectionId = '' } = useParams()
  const { data: list } = useInspections(houseId)
  const { data: house } = useHouse(houseId)
  const { data: profile } = useHouseProfile(houseId)
  const { data: company } = useCompany()
  const ins: Inspection | undefined = list?.find((i) => i.id === inspectionId)
  return (
    <Screen title="Inspection report" back={{ to: `/houses/${houseId}`, label: 'House' }}>
      {!ins || !profile ? (
        <Loading />
      ) : (
        <InspectionReport inspection={ins} address={house?.address ?? ''} company={company?.name ?? ''} photos={profile.photos} worn={profile.items.filter((i) => i.replace_soon)} />
      )}
    </Screen>
  )
}
