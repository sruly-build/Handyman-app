import { useState } from 'react'
import { Link, matchPath, useLocation, useNavigate } from 'react-router-dom'
import { PlusIcon } from './Icons'
import { Sheet } from './Sales'

interface Target {
  to: string
  label: string
}

/** What the + adds on each page (null = no + on that page, e.g. forms) */
export function fabTarget(pathname: string, search: string): Target | 'menu' | null {
  const m = (pattern: string) => matchPath(pattern, pathname)
  if (pathname === '/') return 'menu'
  if (pathname === '/jobs' || pathname === '/schedule') return { to: '/jobs/new', label: 'New job' }
  const job = m('/jobs/:jobId')
  if (job && job.params.jobId !== 'new') return { to: `/jobs/${job.params.jobId}/items/new`, label: 'Add to the punch list' }
  const parts = m('/jobs/:jobId/parts')
  if (parts) return { to: `/jobs/${parts.params.jobId}/parts/new`, label: 'Add a part' }
  const time = m('/jobs/:jobId/time')
  if (time) return { to: `/jobs/${time.params.jobId}/time/new`, label: 'Add time' }
  if (pathname === '/requests') return { to: '/requests/new', label: 'New request' }
  if (pathname === '/houses') return { to: '/houses?add=1', label: 'Add a house' }
  if (pathname === '/sales' || pathname === '/sales/leads' || pathname === '/sales/calls' || pathname === '/sales/follow-ups' || pathname === '/sales/pipeline') {
    return { to: '/sales/leads/new', label: 'New sales lead' }
  }
  if (pathname === '/leads') return { to: '/leads/new', label: 'New turnover lead' }
  if (pathname === '/directory') {
    return new URLSearchParams(search).get('show') === 'clients'
      ? { to: '/directory/new?kind=client', label: 'New client' }
      : { to: '/directory/new', label: 'New vendor' }
  }
  return null
}

const homeChoices: Target[] = [
  { to: '/jobs/new', label: 'New job' },
  { to: '/requests/new', label: 'New repair request' },
  { to: '/leads/new', label: 'New turnover lead' },
  { to: '/sales/leads/new', label: 'New sales lead' },
  { to: '/directory/new?kind=client', label: 'New client' },
]

/** The floating + on every page: adds whatever belongs on that page */
export function Fab() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const [menu, setMenu] = useState(false)
  const target = fabTarget(pathname, search)
  if (!target) return null
  const label = target === 'menu' ? 'Add something' : target.label
  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => (target === 'menu' ? setMenu(true) : navigate(target.to))}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+88px)] right-[max(16px,env(safe-area-inset-right))] z-30 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#10b981] to-[#047857] text-white shadow-[0_12px_28px_-6px_rgba(4,120,87,0.6)] ring-4 ring-white transition active:scale-95 active:bg-brand-dark print:hidden lg:right-[calc(50%-21rem)]"
      >
        <PlusIcon size={32} strokeWidth={2.6} />
      </button>
      {menu && (
        <Sheet title="Add" onClose={() => setMenu(false)}>
          <div className="grid gap-2">
            {homeChoices.map((c) => (
              <Link
                key={c.to}
                to={c.to}
                onClick={() => setMenu(false)}
                className="flex min-h-14 items-center gap-3 rounded-2xl bg-canvas px-4 text-[17px] font-semibold active:bg-brand-soft"
              >
                <PlusIcon size={20} className="text-brand" strokeWidth={2.6} />
                {c.label}
              </Link>
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}
