import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { BackIcon } from './Icons'

interface ScreenProps {
  title: string
  /** Small grey line above the big title (e.g. today's date) */
  eyebrow?: string
  /** Where the back button goes. Leave out for top-level tab screens. */
  back?: { to: string; label: string }
  /** Button shown at the top right, e.g. "Edit" */
  action?: ReactNode
  children: ReactNode
}

/** Standard page: Apple-style large bold title, then content. */
export function Screen({ title, eyebrow, back, action, children }: ScreenProps) {
  const navigate = useNavigate()
  return (
    <div className="animate-screen-in mx-auto min-h-dvh max-w-2xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-[calc(0.5rem+env(safe-area-inset-top))]">
      <div className="flex min-h-11 items-center justify-between">
        {back ? (
          <button
            onClick={() => navigate(back.to)}
            className="-ml-2 flex min-h-11 items-center gap-0.5 rounded-lg pr-3 text-[17px] text-brand active:opacity-50"
          >
            <BackIcon size={26} strokeWidth={2.4} />
            {back.label}
          </button>
        ) : (
          <span />
        )}
        {action}
      </div>
      {eyebrow && <p className="mt-1 text-[13px] font-semibold uppercase tracking-wide text-muted">{eyebrow}</p>}
      <h1 className="mb-5 text-[34px] font-bold leading-tight tracking-tight">{title}</h1>
      {children}
    </div>
  )
}
