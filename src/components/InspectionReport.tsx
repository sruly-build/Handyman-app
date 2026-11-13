import type { Inspection, PropertyItem } from '../data/types'
import { PrintIcon } from './Icons'
import { Button, Card } from './ui'

export const inspectionKindLabel: Record<Inspection['kind'], string> = {
  intake: 'First-visit inspection',
  inspection: 'Inspection',
  winter: 'Before-winter check-up',
  spring: 'Before-spring check-up',
}
const ratingStyle = { good: 'bg-brand-soft text-brand-dark', fair: 'bg-progress-soft text-[#8a4b00]', worn: 'bg-problem-soft text-problem' }
const ratingLabel = { good: 'Good', fair: 'Fair', worn: 'Worn' }

/** An inspection report, room by room. Print it (or "Save as PDF") from the phone. */
export function InspectionReport({
  inspection,
  address,
  company,
  photos,
  worn,
}: {
  inspection: Inspection
  address: string
  company: string
  photos: { id: string; url: string; room: string; inspection_id: string | null }[]
  worn: PropertyItem[]
}) {
  const rooms = [...new Set(inspection.results.map((r) => r.room))]
  const counts = { good: 0, fair: 0, worn: 0 }
  for (const r of inspection.results) if (r.rating) counts[r.rating]++
  return (
    <div>
      <Card className="px-4 py-4 print:shadow-none">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">{company}</p>
        <p className="text-[22px] font-bold leading-tight">{inspectionKindLabel[inspection.kind]}</p>
        <p className="text-[15px]">{address}</p>
        <p className="text-[15px] text-muted">{inspection.done_at ? new Date(inspection.done_at).toLocaleDateString(undefined, { dateStyle: 'long' }) : 'Not finished yet'}</p>
        <p className="mt-2 text-[15px]">
          {counts.good} good · {counts.fair} fair · {counts.worn} worn
        </p>
        {inspection.summary && <p className="mt-2 whitespace-pre-wrap text-[15px]">{inspection.summary}</p>}
      </Card>
      {worn.length > 0 && (
        <Card className="mt-3 px-4 py-3">
          <p className="text-[15px] font-semibold text-[#8a4b00]">Worn, replace soon</p>
          {worn.map((w) => (
            <p key={w.id} className="text-[15px]">
              {w.name}
              {w.room ? ` (${w.room})` : ''}
              {w.worn_note ? `: ${w.worn_note}` : ''}
            </p>
          ))}
        </Card>
      )}
      {rooms.map((room) => {
        const roomPhotos = photos.filter((p) => p.inspection_id === inspection.id && p.room === room)
        return (
          <section key={room} className="mt-4 break-inside-avoid">
            <h3 className="mb-1.5 px-1 text-[17px] font-bold">{room}</h3>
            <Card>
              {inspection.results
                .filter((r) => r.room === room)
                .map((r, i) => (
                  <div key={i} className={`flex items-start gap-3 px-4 py-2.5 ${i ? 'border-t border-hairline' : ''}`}>
                    <span className="min-w-0 flex-1 text-[15px]">
                      {r.label}
                      {r.note && <span className="block text-[13px] text-muted">{r.note}</span>}
                    </span>
                    {r.rating && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold ${ratingStyle[r.rating]}`}>{ratingLabel[r.rating]}</span>}
                  </div>
                ))}
            </Card>
            {roomPhotos.length > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {roomPhotos.map((p) => (
                  <img key={p.id} src={p.url} alt={room} className="aspect-square w-full rounded-xl object-cover" />
                ))}
              </div>
            )}
          </section>
        )
      })}
      <div className="mt-6 print:hidden">
        <Button variant="secondary" onClick={() => window.print()}>
          <PrintIcon size={20} /> Print or save as PDF
        </Button>
      </div>
    </div>
  )
}
