import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { backend } from '../data/backend'
import { formatMoney } from '../data/billing'
import { refreshAll } from '../data/queries'
import type { Part, PartStatus } from '../data/types'
import { CheckIcon, ChevronIcon } from './Icons'

export const partStatusLabels: Record<PartStatus, string> = {
  needed: 'Needed',
  ordered: 'Ordered',
  received: 'Received',
}

const nextPartStatus: Record<PartStatus, PartStatus> = {
  needed: 'ordered',
  ordered: 'received',
  received: 'needed',
}

/**
 * One part: tap the coloured pill to move it along, tap the rest to edit.
 * shared: on another company's job, where only the status can be changed and costs are hidden.
 */
export function PartRow({ part, context, shared = false }: { part: Part; context?: string; shared?: boolean }) {
  const qc = useQueryClient()
  const advance = useMutation({
    mutationFn: async () => {
      if (shared) await backend.setSharedPartStatus(part.id, nextPartStatus[part.status])
      else await backend.updatePart(part, { status: nextPartStatus[part.status] })
    },
    onSettled: () => refreshAll(qc),
  })
  const pill = {
    needed: 'bg-problem-soft text-problem',
    ordered: 'bg-progress-soft text-[#c26a00]',
    received: 'bg-brand-soft text-brand-dark',
  }[part.status]

  const details = [
    part.quantity !== 1 ? `× ${part.quantity}` : '',
    !shared && part.cost != null ? formatMoney(part.cost) : '',
    part.supplier,
  ].filter(Boolean)

  const text = (
    <div className="min-w-0 flex-1">
      <p className="truncate text-[17px] font-medium">{part.name}</p>
      {details.length > 0 && <p className="truncate text-[14px] text-muted">{details.join(' · ')}</p>}
      {context && <p className="truncate text-[13px] text-muted">{context}</p>}
    </div>
  )

  return (
    <div className="flex items-center">
      {shared ? (
        <div className="flex min-h-16 min-w-0 flex-1 items-center py-2.5 pl-4">{text}</div>
      ) : (
        <Link
          to={`/parts/${part.id}`}
          className="flex min-h-16 min-w-0 flex-1 items-center gap-2 py-2.5 pl-4 active:opacity-60"
        >
          {text}
          <ChevronIcon size={18} className="shrink-0 text-[#c7c7cc]" />
        </Link>
      )}
      <button
        onClick={() => advance.mutate()}
        disabled={advance.isPending}
        className="flex min-h-16 shrink-0 items-center px-3"
        aria-label={`${partStatusLabels[part.status]}. Tap to mark ${partStatusLabels[nextPartStatus[part.status]].toLowerCase()}.`}
      >
        <span
          className={`flex min-w-[92px] items-center justify-center gap-1 rounded-full px-3 py-2 text-[14px] font-semibold ${pill}`}
        >
          {part.status === 'received' && <CheckIcon size={15} strokeWidth={3} />}
          {partStatusLabels[part.status]}
        </span>
      </button>
    </div>
  )
}
