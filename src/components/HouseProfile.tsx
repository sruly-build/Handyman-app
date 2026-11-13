import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { backend } from '../data/backend'
import { startResults } from '../data/inspections'
import { refreshAll, useHouseProfile, useServiceSettings } from '../data/queries'
import type { HouseView } from '../data/requestsApi'
import type { Condition, Inspection, PropertyItem } from '../data/types'
import { todayISO } from '../lib/dates'
import { shrinkPhoto } from '../lib/images'
import { CameraIcon } from './Icons'
import { inspectionKindLabel } from './InspectionReport'
import { Button, Card, Divider, ErrorNote, Field, GroupLabel, TextArea, Toggle } from './ui'

const kinds: { value: PropertyItem['kind']; label: string }[] = [
  { value: 'appliance', label: 'Appliance' },
  { value: 'fixture', label: 'Fixture' },
  { value: 'filter', label: 'Filter' },
  { value: 'system', label: 'System' },
  { value: 'other', label: 'Other' },
]

/** On a house: shut-offs, filter, paint, the appliances and fixtures, and inspections */
export function HouseProfileSection({ house }: { house: HouseView }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data: profile } = useHouseProfile(house.id)
  const { data: settings } = useServiceSettings()
  const [item, setItem] = useState<Partial<PropertyItem> | null>(null)
  const run = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: () => void refreshAll(qc) })
  const saveField = (patch: Parameters<typeof backend.updateHouse>[1]) => run.mutate(() => backend.updateHouse(house.id, patch))
  const start = useMutation({
    mutationFn: (kind: Inspection['kind']) =>
      backend.saveInspection({ property_id: house.id, kind, results: startResults(kind, settings), shared: true }),
    onSuccess: (ins) => {
      void refreshAll(qc)
      navigate(`/houses/${house.id}/inspections/${ins.id}`)
    },
  })
  const filterEvery = house.filter_months ?? settings?.filter_months ?? 4
  const filterDue = house.last_filter_at
    ? (() => {
        const d = new Date(`${house.last_filter_at}T12:00`)
        d.setMonth(d.getMonth() + filterEvery)
        return d
      })()
    : null
  const text = (label: string, key: 'water_shutoff' | 'breaker_panel' | 'paint_colors' | 'filter_type' | 'filter_size', placeholder: string) => (
    <Field label={label} placeholder={placeholder} defaultValue={house[key] ?? ''} onBlur={(e) => e.target.value !== (house[key] ?? '') && saveField({ [key]: e.target.value.trim() })} />
  )

  return (
    <>
      <section className="mt-6">
        <GroupLabel>House profile</GroupLabel>
        <Card>
          {text('Main water shut-off', 'water_shutoff', 'e.g. Basement, left of the water heater')}
          <Divider />
          {text('Breaker panel', 'breaker_panel', 'e.g. Garage wall; apartment B has its own')}
          <Divider />
          {text('Paint colours', 'paint_colors', 'e.g. Walls: SW Agreeable Gray, eggshell')}
          <Divider />
          <div className="grid grid-cols-2">
            {text('Filter type', 'filter_type', 'e.g. MERV 8')}
            <div className="border-l border-hairline">{text('Filter size', 'filter_size', 'e.g. 16x25x1')}</div>
          </div>
          <Divider />
          <div className="grid grid-cols-2">
            <Field
              label={`Change filter every (months, default ${settings?.filter_months ?? 4})`}
              inputMode="numeric"
              defaultValue={house.filter_months ?? ''}
              onBlur={(e) => saveField({ filter_months: e.target.value.trim() ? Number(e.target.value.replace(/\D/g, '')) || null : null })}
            />
            <div className="border-l border-hairline px-4 py-2.5">
              <p className="text-[13px] font-medium text-muted">Last changed</p>
              <p className="text-[15px]">{house.last_filter_at ? new Date(`${house.last_filter_at}T12:00`).toLocaleDateString() : 'Not recorded'}</p>
              {filterDue && <p className={`text-[13px] ${filterDue.getTime() < Date.now() ? 'font-semibold text-problem' : 'text-muted'}`}>Due {filterDue.toLocaleDateString()}</p>}
            </div>
          </div>
          <Divider />
          <button className="min-h-12 w-full px-4 text-left text-[17px] text-brand" onClick={() => saveField({ last_filter_at: todayISO() })}>
            Filter changed today
          </button>
        </Card>
      </section>

      <section className="mt-6">
        <GroupLabel>Appliances and fixtures</GroupLabel>
        <Card>
          {(profile?.items ?? []).length === 0 && <p className="px-4 py-3 text-[15px] text-muted">Nothing yet. Add them at the first visit.</p>}
          {(profile?.items ?? []).map((it, i) => (
            <button key={it.id} onClick={() => setItem(it)} className={`block w-full px-4 py-3 text-left active:bg-canvas ${i ? 'border-t border-hairline' : ''}`}>
              <p className="text-[17px]">
                {it.name}
                {it.room ? <span className="text-muted"> · {it.room}</span> : null}
              </p>
              <p className="text-[13px] text-muted">
                {[it.brand, it.model && `Model ${it.model}`, it.condition && { good: 'Good', fair: 'Fair', worn: 'Worn' }[it.condition]].filter(Boolean).join(' · ')}
              </p>
              {it.replace_soon && <p className="text-[13px] font-semibold text-[#8a4b00]">Worn, replace soon (landlord sees this)</p>}
            </button>
          ))}
        </Card>
        {item ? (
          <ItemForm house={house} item={item} onDone={() => setItem(null)} />
        ) : (
          <Button variant="secondary" className="mt-3" onClick={() => setItem({ kind: 'appliance', name: '', room: '' })}>
            Add appliance or fixture
          </Button>
        )}
      </section>

      <section className="mt-6">
        <GroupLabel>Inspections</GroupLabel>
        {(profile?.inspections ?? []).length > 0 && (
          <Card className="mb-3">
            {profile!.inspections.map((ins, i) => (
              <Link key={ins.id} to={`/houses/${house.id}/inspections/${ins.id}/report`} className={`block px-4 py-3 active:bg-canvas ${i ? 'border-t border-hairline' : ''}`}>
                <p className="text-[17px]">{inspectionKindLabel[ins.kind]}</p>
                <p className="text-[13px] text-muted">
                  {new Date(ins.done_at!).toLocaleDateString()}
                  {ins.shared ? ' · landlord can see it' : ' · private'}
                </p>
              </Link>
            ))}
          </Card>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={start.isPending} onClick={() => start.mutate(house.intake_done_at || profile?.inspections.some((i) => i.kind === 'intake') ? 'inspection' : 'intake')}>
            {profile?.inspections.some((i) => i.kind === 'intake') ? 'New inspection' : 'First-visit intake'}
          </Button>
          <Button variant="secondary" disabled={start.isPending} onClick={() => start.mutate(new Date().getMonth() >= 6 ? 'winter' : 'spring')}>
            Seasonal check-up
          </Button>
        </div>
        <p className="mt-1.5 px-4 text-[13px] text-muted">Room by room: Good, Fair or Worn, with photos. Finished reports can be shared with the landlord and printed as a PDF.</p>
      </section>
      {(run.error || start.error) && <div className="mt-2"><ErrorNote error={run.error ?? start.error} /></div>}
    </>
  )
}

function ItemForm({ house, item, onDone }: { house: HouseView; item: Partial<PropertyItem>; onDone: () => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState(item)
  const save = useMutation({
    mutationFn: () => backend.saveHouseItem({ ...f, property_id: house.id, name: f.name ?? '' }),
    onSuccess: () => {
      void refreshAll(qc)
      onDone()
    },
  })
  const remove = useMutation({
    mutationFn: () => backend.deleteHouseItem(item.id!),
    onSuccess: () => {
      void refreshAll(qc)
      onDone()
    },
  })
  const photo = useMutation({
    mutationFn: async (file: File) => {
      const saved = f.id ? f : await backend.saveHouseItem({ ...f, property_id: house.id, name: f.name || 'Appliance' })
      setF(saved)
      return backend.addHousePhoto(house.id, await shrinkPhoto(file), { room: f.room ?? '', kind: f.replace_soon ? 'worn' : 'sticker', item_id: saved.id })
    },
    onSuccess: () => void refreshAll(qc),
  })
  const read = useMutation({
    mutationFn: (file: File) => backend.readSticker(file),
    onSuccess: (r) => setF({ ...f, brand: r.brand || f.brand, model: r.model || f.model, serial: r.serial || f.serial, name: f.name || r.kind || '' }),
  })
  const chip = (on: boolean) => `min-h-10 flex-1 rounded-xl text-[15px] font-semibold ${on ? 'bg-brand text-white' : 'bg-canvas'}`
  return (
    <Card className="mt-3">
      <div className="grid grid-cols-2">
        <Field label="What" placeholder="e.g. Stove" value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Field label="Room" placeholder="e.g. Kitchen" className="border-l border-hairline" value={f.room ?? ''} onChange={(e) => setF({ ...f, room: e.target.value })} />
      </div>
      <Divider />
      <label className="block px-4 py-2.5">
        <span className="block text-[13px] font-medium text-muted">Type</span>
        <select className="min-h-10 w-full bg-transparent outline-none" value={f.kind ?? 'appliance'} onChange={(e) => setF({ ...f, kind: e.target.value as PropertyItem['kind'] })} aria-label="Type">
          {kinds.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <Divider />
      <div className="grid grid-cols-2">
        <Field label="Brand" value={f.brand ?? ''} onChange={(e) => setF({ ...f, brand: e.target.value })} />
        <Field label="Model" className="border-l border-hairline" value={f.model ?? ''} onChange={(e) => setF({ ...f, model: e.target.value })} />
      </div>
      <Divider />
      <Field label="Serial (optional)" value={f.serial ?? ''} onChange={(e) => setF({ ...f, serial: e.target.value })} />
      <Divider />
      <div className="px-4 py-2.5">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-brand-soft px-3 text-[15px] font-semibold text-brand-dark">
          <CameraIcon size={20} /> {read.isPending ? 'Reading the sticker…' : 'Read brand and model from a sticker photo'}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                read.mutate(file)
                photo.mutate(file)
              }
              e.target.value = ''
            }}
          />
        </label>
        {read.error && <p className="mt-1 text-[13px] text-problem">{read.error instanceof Error ? read.error.message : 'Could not read it'}</p>}
      </div>
      <Divider />
      <div className="flex gap-2 px-4 py-2.5" role="radiogroup" aria-label="Condition">
        {(['good', 'fair', 'worn'] as Condition[]).map((c) => (
          <button key={c} type="button" role="radio" aria-checked={f.condition === c} className={chip(f.condition === c)} onClick={() => setF({ ...f, condition: f.condition === c ? null : c })}>
            {{ good: 'Good', fair: 'Fair', worn: 'Worn' }[c]}
          </button>
        ))}
      </div>
      <Divider />
      <Toggle label="Worn, replace soon" hint="Shown to the landlord" checked={f.replace_soon ?? false} onChange={(v) => setF({ ...f, replace_soon: v })} />
      {f.replace_soon && <TextArea label="Note for the landlord" rows={2} value={f.worn_note ?? ''} onChange={(e) => setF({ ...f, worn_note: e.target.value })} />}
      {f.replace_soon && (
        <div className="px-4 pb-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-canvas px-3 text-[15px] font-semibold text-brand">
            <CameraIcon size={20} /> Photo of the wear
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && photo.mutate(e.target.files[0])} />
          </label>
        </div>
      )}
      {(save.error || photo.error) && <div className="px-3"><ErrorNote error={save.error ?? photo.error} /></div>}
      <div className="flex gap-2 p-3">
        <Button disabled={!f.name?.trim() || save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
        {item.id && (
          <Button variant="danger" className="!w-auto" onClick={() => window.confirm('Remove this from the house profile?') && remove.mutate()}>
            Remove
          </Button>
        )}
        <Button variant="secondary" className="!w-auto" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  )
}
