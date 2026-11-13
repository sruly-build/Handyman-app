import { NavLink, useLocation } from 'react-router-dom'
import { useRequests } from '../data/queries'
import { CalendarIcon, HomeIcon, InboxIcon, JobsIcon, LeadIcon, MoreIcon } from './Icons'

const tabs = [
  { to: '/', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/requests', label: 'Requests', Icon: InboxIcon, end: false },
  { to: '/sales', label: 'Sales', Icon: LeadIcon, end: false },
  { to: '/jobs', label: 'Jobs', Icon: JobsIcon, end: false },
  { to: '/schedule', label: 'Schedule', Icon: CalendarIcon, end: false },
  { to: '/more', label: 'Me', Icon: MoreIcon, end: false },
]

/** Bottom tab bar with big tap targets (easy with gloves on) */
export function TabBar() {
  const { pathname } = useLocation()
  // Turnovers (/leads) live inside Sales
  const salesOpen = pathname.startsWith('/sales') || pathname.startsWith('/leads')
  const requestsOpen = pathname.startsWith('/houses')
  // New requests waiting (a red dot with the number; emergencies make it pulse)
  const { data: requests } = useRequests()
  const fresh = (requests ?? []).filter((r) => r.status === 'new')
  const emergency = fresh.some((r) => r.urgency === 'emergency')
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-white/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl print:hidden">
      <ul className="mx-auto flex max-w-2xl">
        {tabs.map(({ to, label, Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors active:opacity-60 ${
                  isActive || (to === '/sales' && salesOpen) || (to === '/requests' && requestsOpen) ? 'text-brand' : 'text-muted'
                }`
              }
            >
              <span className="relative">
                <Icon size={27} />
                {to === '/requests' && fresh.length > 0 && (
                  <span
                    className={`absolute -right-2.5 -top-1 min-w-5 rounded-full bg-problem px-1 text-center text-[11px] leading-5 text-white ${emergency ? 'animate-pulse' : ''}`}
                    aria-label={`${fresh.length} new`}
                  >
                    {fresh.length}
                  </span>
                )}
              </span>
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
