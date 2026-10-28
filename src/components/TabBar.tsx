import { NavLink } from 'react-router-dom'
import { HomeIcon, JobsIcon, MoreIcon, OrdersIcon } from './Icons'

const tabs = [
  { to: '/', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/jobs', label: 'Jobs', Icon: JobsIcon, end: false },
  { to: '/orders', label: 'Orders', Icon: OrdersIcon, end: false },
  { to: '/more', label: 'Me', Icon: MoreIcon, end: false },
]

/** Bottom tab bar with big tap targets (easy with gloves on) */
export function TabBar() {
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
                  isActive ? 'text-brand' : 'text-muted'
                }`
              }
            >
              <Icon size={27} />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
