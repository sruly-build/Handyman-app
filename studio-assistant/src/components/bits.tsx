import { Check, Flag } from 'lucide-react'
import { STAGES, type Invoice, type LeadStatus, type Priority, type Stage } from '../data/types'
import { isOverdue } from '../data/billing'
import { Badge, cx, type Tone } from './ui'

export const STAGE_LABEL: Record<Stage, string> = {
  todo: 'To do',
  progress: 'In progress',
  revisions: 'Revisions',
  done: 'Done',
}

export const STAGE_TONE: Record<Stage, Tone> = {
  todo: 'purple',
  progress: 'blue',
  revisions: 'orange',
  done: 'green',
}

export function StageBadge({ stage, archived }: { stage: Stage; archived?: boolean }) {
  if (archived) return <Badge>Archived</Badge>
  return <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority !== 'high') return null
  return (
    <Badge tone="red" className="gap-1">
      <Flag size={11} fill="currentColor" />
      High
    </Badge>
  )
}

export function StageStepper({ stage, onChange }: { stage: Stage; onChange: (s: Stage) => void }) {
  const idx = STAGES.indexOf(stage)
  return (
    <div className="no-scrollbar -mx-1 flex overflow-x-auto px-1">
      {STAGES.map((s, i) => {
        const done = i < idx
        const current = i === idx
        return (
          <button key={s} onClick={() => onChange(s)} className="group flex min-w-[72px] flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center">
              <div className={cx('h-[2px] flex-1', i === 0 ? 'opacity-0' : i <= idx ? 'bg-accent' : 'bg-line')} />
              <div
                className={cx(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold transition',
                  done && 'border-accent bg-accent text-white',
                  current && 'border-accent bg-white text-accent ring-4 ring-accent/15',
                  !done && !current && 'border-line bg-white text-ink-3 group-hover:border-ink-3',
                )}
              >
                {done ? <Check size={13} strokeWidth={3} /> : i + 1}
              </div>
              <div className={cx('h-[2px] flex-1', i === STAGES.length - 1 ? 'opacity-0' : i < idx ? 'bg-accent' : 'bg-line')} />
            </div>
            <span className={cx('text-[11px] font-medium', current ? 'text-accent' : done ? 'text-ink' : 'text-ink-3')}>{STAGE_LABEL[s]}</span>
          </button>
        )
      })}
    </div>
  )
}

export function InvoiceBadge({ inv }: { inv: Invoice }) {
  if (isOverdue(inv)) return <Badge tone="red">Overdue</Badge>
  if (inv.kind === 'estimate' && inv.status === 'draft') return <Badge>Draft</Badge>
  const map: Record<Invoice['status'], Tone> = {
    draft: 'gray',
    sent: 'blue',
    viewed: 'purple',
    'partly paid': 'orange',
    paid: 'green',
  }
  const label = inv.status.charAt(0).toUpperCase() + inv.status.slice(1)
  return <Badge tone={map[inv.status]}>{label}</Badge>
}

export const LEAD_TONE: Record<LeadStatus, Tone> = { new: 'blue', contacted: 'purple', quoted: 'orange', booked: 'green' }

export function LeadBadge({ status }: { status: LeadStatus }) {
  return <Badge tone={LEAD_TONE[status]}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>
}
