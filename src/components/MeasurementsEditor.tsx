import type { Measurement } from '../data/types'
import { PlusIcon, TrashIcon } from './Icons'
import { Card } from './ui'

const units: Measurement['unit'][] = ['in', 'ft', 'cm', 'mm', 'm']

export function newMeasurement(): Measurement {
  return { id: crypto.randomUUID(), label: '', width: '', height: '', depth: '', unit: 'in', note: '' }
}

/** One-line summary like: 30 × 34 × 21 in */
export function measurementSummary(m: Measurement): string {
  const dims = [m.width, m.height, m.depth].filter((d) => d.trim() !== '')
  return dims.length ? `${dims.join(' × ')} ${m.unit}` : ''
}

interface Props {
  value: Measurement[]
  onChange: (next: Measurement[]) => void
}

export function MeasurementsEditor({ value, onChange }: Props) {
  const update = (id: string, patch: Partial<Measurement>) =>
    onChange(value.map((m) => (m.id === id ? { ...m, ...patch } : m)))

  return (
    <div className="space-y-3">
      {value.map((m) => (
        <Card key={m.id} className="p-4">
          <div className="flex items-center gap-2">
            <input
              value={m.label}
              onChange={(e) => update(m.id, { label: e.target.value })}
              placeholder="What is measured? (e.g. Vanity)"
              className="min-w-0 flex-1 bg-transparent py-1 font-semibold outline-none placeholder:font-normal placeholder:text-[#c7c7cc]"
            />
            <button
              onClick={() => confirm('Remove this measurement?') && onChange(value.filter((x) => x.id !== m.id))}
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted active:bg-hairline"
              aria-label="Remove measurement"
            >
              <TrashIcon size={20} />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(['width', 'height', 'depth'] as const).map((dim) => (
              <label key={dim} className="rounded-xl bg-canvas px-3 py-2">
                <span className="block text-[12px] font-medium capitalize text-muted">{dim}</span>
                <input
                  value={m[dim]}
                  onChange={(e) => update(m.id, { [dim]: e.target.value })}
                  inputMode="decimal"
                  placeholder="–"
                  className="w-full bg-transparent text-[19px] font-semibold outline-none placeholder:text-[#c7c7cc]"
                />
              </label>
            ))}
          </div>
          <div className="mt-2 flex gap-1 rounded-xl bg-canvas p-1" role="radiogroup" aria-label="Unit">
            {units.map((u) => (
              <button
                key={u}
                role="radio"
                aria-checked={m.unit === u}
                onClick={() => update(m.id, { unit: u })}
                className={`min-h-10 flex-1 rounded-lg text-[15px] font-semibold ${
                  m.unit === u ? 'bg-white text-ink shadow-sm' : 'text-muted'
                }`}
              >
                {u}
              </button>
            ))}
          </div>
          <input
            value={m.note}
            onChange={(e) => update(m.id, { note: e.target.value })}
            placeholder="Note (optional)"
            className="mt-2 w-full bg-transparent py-1 text-[15px] outline-none placeholder:text-[#c7c7cc]"
          />
        </Card>
      ))}
      <button
        onClick={() => onChange([...value, newMeasurement()])}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#c7c7cc] text-[17px] font-semibold text-brand active:bg-white"
      >
        <PlusIcon size={22} />
        Add measurement
      </button>
    </div>
  )
}
