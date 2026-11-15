import type { ReactNode } from 'react'
import type { CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BackIcon } from './Icons'

interface ScreenProps {
  title: string
  /** Small grey line above the big title (e.g. today's date) */
  eyebrow?: string
  /** Where the back button goes if there's no previous screen. Leave out for top-level tab screens. */
  back?: { to: string; label: string }
  /** Button shown at the top right, e.g. "Edit" */
  action?: ReactNode
  /** Wider on big screens (sales tables and pipeline); phones look the same */
  wide?: boolean
  /** Shown in place of the big title (Home's dark green greeting) */
  hero?: ReactNode
  children: ReactNode
}

/** Each part of the app has its own colour (matching its tab) */
const sections: { match: RegExp; gradient: string; accent: string }[] = [
  { match: /^\/(requests|houses|landlords|request-page)/, gradient: 'from-[#f97316] via-[#fb923c] to-[#fbbf24]', accent: '#ea580c' },
  { match: /^\/(sales|leads)/, gradient: 'from-[#7c3aed] via-[#8b5cf6] to-[#c084fc]', accent: '#7c3aed' },
  { match: /^\/schedule/, gradient: 'from-[#e11d48] via-[#ec4899] to-[#f472b6]', accent: '#db2777' },
  { match: /^\/directory/, gradient: 'from-[#0891b2] via-[#06b6d4] to-[#22d3ee]', accent: '#0891b2' },
  { match: /^\/(more|business|settings|team|approvals|price-list)/, gradient: 'from-[#4338ca] via-[#6366f1] to-[#38bdf8]', accent: '#4f46e5' },
  { match: /^\/(jobs|orders|bring|parts)/, gradient: 'from-[#2563eb] via-[#3b82f6] to-[#06b6d4]', accent: '#2563eb' },
]
const fallback = { gradient: 'from-[#059669] via-[#10b981] to-[#2dd4bf]', accent: '#059669' }

/** Standard page: a coloured title card, then content. */
export function Screen({ title, eyebrow, back, action, wide, hero, children }: ScreenProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const theme = sections.find((s) => s.match.test(pathname)) ?? fallback
  return (
    <div
      style={{ '--accent': theme.accent } as CSSProperties}
      className={`animate-screen-in mx-auto min-h-dvh max-w-2xl ${wide ? 'lg:max-w-6xl' : ''} px-4 pb-[calc(10.5rem+env(safe-area-inset-bottom))] print:max-w-none print:p-0 pt-[calc(0.5rem+env(safe-area-inset-top))]`}>
      <div className="flex min-h-11 items-center justify-between print:hidden">
        {back ? (
          <button
            onClick={() => (canGoBack() ? navigate(-1) : navigate(back.to, { replace: true }))}
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
      {hero ?? (
        <div
          className={`shine mb-5 mt-1 rounded-[28px] bg-gradient-to-br ${theme.gradient} px-5 py-5 text-white shadow-[0_12px_32px_-8px_rgba(15,23,42,0.35)] print:bg-none print:p-0 print:text-ink print:shadow-none`}
        >
          {eyebrow && <p className="text-[13px] font-semibold uppercase tracking-wide text-white/85">{eyebrow}</p>}
          <h1 className="text-[30px] font-bold leading-tight tracking-tight">{title}</h1>
        </div>
      )}
      {children}
    </div>
  )
}

/** True when the back button can return to the screen the user came from */
function canGoBack(): boolean {
  return ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0
}
