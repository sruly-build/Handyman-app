import { NavLink, useLocation } from 'react-router-dom'
import { useRequests } from '../data/queries'
import { CalendarIcon, HomeIcon, InboxIcon, JobsIcon, LeadIcon, MoreIcon } from './Icons'

const tabs = [
  { to: '/', label: 'Home', Icon: HomeIcon, end: true, on: 'text-[#6ee7b7]' },
  { to: '/requests', label: 'Requests', Icon: InboxIcon, end: false, on: 'text-[#fdba74]' },
  { to: '/sales', label: 'Sales', Icon: LeadIcon, end: false, on: 'text-[#c4b5fd]' },
  { to: '/jobs', label: 'Jobs', Icon: JobsIcon, end: false, on: 'text-[#93c5fd]' },
  { to: '/schedule', label: 'Schedule', Icon: CalendarIcon, end: false, on: 'text-[#f9a8d4]' },
  { to: '/more', label: 'Me', Icon: MoreIcon, end: false, on: 'text-[#a5b4fc]' },
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
    <nav className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+8px)] print:hidden">
      <ul className="mx-auto flex max-w-2xl rounded-[24px] bg-night/95 shadow-[0_12px_30px_-6px_rgba(15,23,42,0.55)] ring-1 ring-white/10 backdrop-blur-xl">
        {tabs.map(({ to, label, Icon, end, on }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors active:opacity-60 ${
                  isActive || (to === '/sales' && salesOpen) || (to === '/requests' && requestsOpen) ? on : 'text-white/60'
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
