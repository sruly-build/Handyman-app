import { Link } from 'react-router-dom'
import { Card } from '../components/ui'
import type { LandlordHouse, LandlordSummary } from '../data/landlordApi'
import { money } from '../data/requests'
import { pickLabel } from '../lib/i18n'

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '')

export const planText = (h: LandlordHouse) =>
  !h.plan
    ? 'Not on the plan'
    : h.plan.status === 'active'
      ? `On the plan · ${money(h.plan.price)}/month`
      : h.plan.status === 'past_due'
        ? 'Payment failed: please update your card'
        : 'Waiting for payment'

/**
 * The landlord's status area: totals, then each house. The owner sees the
 * same thing for any landlord (houseLink decides where a house opens).
 */
export function LandlordStatus({ summary, houseLink }: { summary: LandlordSummary; houseLink: (id: string) => string }) {
  const totals = summary.houses.reduce(
    (t, h) => ({
      jobs: t.jobs + h.jobs_done,
      items: t.items + h.items_fixed,
      used: t.used + h.hours_used_year,
      left: t.left + h.hours_left,
      open: t.open + h.open_requests,
      repeats: t.repeats + h.repeats.length,
    }),
    { jobs: 0, items: 0, used: 0, left: 0, open: 0, repeats: 0 },
  )
  const stat = (label: string, value: number) => (
    <div className="rounded-2xl bg-card p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <p className="text-[24px] font-bold leading-tight">{value}</p>
      <p className="text-[13px] font-semibold text-muted">{label}</p>
    </div>
  )
  return (
    <>
      {summary.houses.length > 1 && (
        <div className="mb-5 grid grid-cols-3 gap-2">
          {stat('Jobs done', totals.jobs)}
          {stat('Items fixed', totals.items)}
          {stat('Open requests', totals.open)}
          {stat('Hours used (12 mo)', totals.used)}
          {stat('Hours left', totals.left)}
          {stat('Repeat issues', totals.repeats)}
        </div>
      )}
      <div className="space-y-3">
        {summary.houses.map((h) => (
          <Link key={h.id} to={houseLink(h.id)} className="block active:opacity-70">
            <Card className="px-4 py-4">
              <p className="text-[19px] font-bold leading-tight">{h.address.split(',')[0]}</p>
              <p className={`text-[15px] font-semibold ${h.plan?.status === 'active' ? 'text-brand-dark' : h.plan?.status === 'past_due' ? 'text-problem' : 'text-muted'}`}>
                {planText(h)}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Mini label="Hours left" value={h.hours_left} />
                <Mini label="Used (12 mo)" value={h.hours_used_year} />
                <Mini label="Open requests" value={h.open_requests} />
                <Mini label="Jobs done" value={h.jobs_done} />
                <Mini label="Items fixed" value={h.items_fixed} />
                <Mini label="Repeat issues" value={h.repeats.length} />
              </div>
              {h.next_expiry && <p className="mt-2 text-[13px] text-muted">Next hour expires {day(h.next_expiry)}</p>}
              {h.repeats.length > 0 && (
                <p className="mt-2 rounded-xl bg-[#efe7fb] px-3 py-2 text-[14px] text-[#5b2bb5]">
                  Keeps coming back: {h.repeats.map((r) => `${r.label || pickLabel(r.key)} (${r.count}×)`).join(', ')}
                </p>
              )}
              {h.worn.length > 0 && (
                <p className="mt-2 rounded-xl bg-progress-soft px-3 py-2 text-[14px] text-[#8a4b00]">
                  Worn, replace soon: {h.worn.map((w) => `${w.name}${w.room ? ` (${w.room})` : ''}`).join(', ')}
                </p>
              )}
              {h.filter_due && Date.parse(h.filter_due) < Date.now() + 14 * 86400000 && (
                <p className="mt-2 text-[14px] text-[#8a4b00]">HVAC filter due {day(h.filter_due)}</p>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </>
  )
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-canvas px-1 py-2">
      <p className="text-[19px] font-bold leading-tight">{value}</p>
      <p className="text-[11px] font-semibold text-muted">{label}</p>
    </div>
  )
}
