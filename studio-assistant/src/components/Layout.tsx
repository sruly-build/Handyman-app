import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, FolderOpen, Home, Pause, Receipt, Settings, Users } from 'lucide-react'
import { stopTimer, itemSeconds, useNow, useStore } from '../data/store'
import { fmtClock } from '../lib/dates'
import { cx } from './ui'
import { StudioLogo } from './StudioLogo'

const TABS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/projects', label: 'Projects', icon: FolderOpen },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/invoices', label: 'Invoices', icon: Receipt },
]

export function Layout() {
  const { state } = useStore()
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-line bg-white/70 px-3 py-6 backdrop-blur lg:flex">
        <div className="mb-6 flex items-center gap-2.5 px-3">
          <StudioLogo size={30} />
          <div className="leading-tight">
            <div className="text-[15px] font-semibold">Studio Assistant</div>
            <div className="text-[12px] text-ink-2">{state.settings.businessName}</div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cx(
                  'flex h-10 items-center gap-3 rounded-[10px] px-3 text-[15px] transition',
                  isActive ? 'bg-accent-soft font-semibold text-accent' : 'text-ink hover:bg-fill',
                )
              }
            >
              <t.icon size={19} strokeWidth={1.9} />
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cx(
                'flex h-10 items-center gap-3 rounded-[10px] px-3 text-[15px] transition',
                isActive ? 'bg-accent-soft font-semibold text-accent' : 'text-ink hover:bg-fill',
              )
            }
          >
            <Settings size={19} strokeWidth={1.9} />
            Settings
          </NavLink>
          <div className="mt-3 rounded-xl bg-fill px-3 py-2.5 text-[12px] leading-snug text-ink-2">
            Design preview. All data is sample data and nothing is sent.
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>

      <TimerPill />

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-white/85 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-lg">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cx('flex h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium', isActive ? 'text-accent' : 'text-ink-3')
              }
            >
              <t.icon size={23} strokeWidth={1.8} />
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <Toasts />
    </div>
  )
}

function TimerPill() {
  const { state, update } = useStore()
  const nav = useNavigate()
  const now = useNow(!!state.timer)
  const { pathname } = useLocation()
  const t = state.timer
  // The invoice editor has its own bar at the bottom
  if (!t || pathname.endsWith('/edit')) return null
  const p = state.projects.find((x) => x.id === t.projectId)
  const it = p?.shotList.find((x) => x.id === t.itemId)
  if (!p || !it) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:right-6 lg:bottom-6 lg:left-auto">
      <div className="anim-pop pointer-events-auto flex max-w-full items-center gap-3 rounded-full bg-ink py-1.5 pr-1.5 pl-4 text-white shadow-float">
        <button onClick={() => nav(`/projects/${p.id}`)} className="min-w-0 text-left">
          <div className="truncate text-[12px] text-white/60">{p.title}</div>
          <div className="truncate text-[14px] font-medium">{it.title}</div>
        </button>
        <span className="text-[17px] font-semibold tabular-nums">{fmtClock(itemSeconds(state, p.id, it, now))}</span>
        <button
          onClick={() => update(stopTimer)}
          aria-label="Pause timer"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 active:bg-white/25"
        >
          <Pause size={16} fill="currentColor" />
        </button>
      </div>
    </div>
  )
}

function Toasts() {
  const { toasts } = useStore()
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(12px,env(safe-area-inset-top))] z-[70] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div key={t.id} className="anim-pop rounded-full bg-ink/90 px-4 py-2.5 text-[14px] font-medium text-white shadow-float backdrop-blur">
          {t.text}
        </div>
      ))}
    </div>
  )
}
