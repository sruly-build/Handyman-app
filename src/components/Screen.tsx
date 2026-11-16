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

/** Each tab has its own deep colour (matching its tab), kept muted so it looks professional */
const sections: { match: RegExp; card: string; accent: string }[] = [
  { match: /^\/(requests|houses|landlords|request-page)/, card: 'from-[#9a3412] to-[#c2410c]', accent: '#c2410c' },
  { match: /^\/(sales|leads)/, card: 'from-[#312e81] to-[#4338ca]', accent: '#4338ca' },
  { match: /^\/schedule/, card: 'from-[#134e4a] to-[#0f766e]', accent: '#0f766e' },
  { match: /^\/directory/, card: 'from-[#164e63] to-[#0e7490]', accent: '#0e7490' },
  { match: /^\/(more|business|settings|team|approvals|price-list)/, card: 'from-[#1e293b] to-[#334155]', accent: '#475569' },
  { match: /^\/(jobs|orders|bring|parts)/, card: 'from-[#1e3a8a] to-[#1d4ed8]', accent: '#1d4ed8' },
]
const fallback = { card: 'from-[#064e3b] to-[#047857]', accent: '#047857' }

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
          className={`mb-4 mt-1 rounded-2xl bg-gradient-to-br ${theme.card} px-4 py-3.5 text-white shadow-[0_8px_20px_-10px_rgba(15,23,42,0.45)] print:bg-none print:p-0 print:text-ink print:shadow-none`}
        >
          {eyebrow && <p className="text-[12px] font-semibold uppercase tracking-wide text-white/70">{eyebrow}</p>}
          <h1 className="text-[26px] font-bold leading-tight tracking-tight">{title}</h1>
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
