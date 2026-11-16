import type { ApprovalPrefs } from '../data/types'
import { Card, Segmented, TextArea } from './ui'

const modes: { value: ApprovalPrefs['mode']; title: string; sub: string }[] = [
  { value: 'always', title: 'Every time', sub: 'We send you each job to approve before we start.' },
  { value: 'over', title: 'Only for bigger jobs', sub: 'Small jobs get done right away; bigger ones wait for your OK.' },
  { value: 'never', title: 'Just fix it', sub: "No need to ask. You get photos and the bill after." },
]

const dollars = (v: string) => {
  const n = parseFloat(v.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : null
}

function MoneyBox({ label, value, onChange, placeholder }: { label: string; value: number | null; onChange: (n: number | null) => void; placeholder?: string }) {
  return (
    <label className="flex min-h-11 items-center gap-1 rounded-xl bg-canvas px-3">
      <span className="text-[16px] font-semibold text-muted">$</span>
      <input
        inputMode="decimal"
        aria-label={label}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(dollars(e.target.value))}
        className="w-full min-w-0 bg-transparent text-[17px] font-semibold outline-none placeholder:font-normal placeholder:text-[#a1a1aa]"
      />
    </label>
  )
}

/** A landlord's approval rules: when to ask, budget, emergencies, turnovers, how to reach them */
export function ApprovalPrefsEditor({ value, onChange }: { value: ApprovalPrefs; onChange: (p: ApprovalPrefs) => void }) {
  const set = (patch: Partial<ApprovalPrefs>) => onChange({ ...value, ...patch })
  return (
    <div className="space-y-3">
      <Card className="p-2">
        <p className="px-2 pb-1.5 pt-1 text-[15px] font-semibold">When should we ask you before fixing something?</p>
        <div role="radiogroup" aria-label="When to ask" className="space-y-1.5">
          {modes.map((m) => {
            const on = value.mode === m.value
            return (
              <div
                key={m.value}
                role="radio"
                aria-checked={on}
                tabIndex={0}
                onClick={() => set({ mode: m.value })}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && set({ mode: m.value })}
                className={`cursor-pointer rounded-xl px-3 py-2.5 ring-1 transition ${on ? 'bg-brand-soft/60 ring-brand' : 'ring-hairline active:bg-canvas'}`}
              >
                <div className="flex items-center gap-2.5">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-brand' : 'border-[#c7c7cc]'}`}>
                    {on && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
                  </span>
                  <span className="text-[16px] font-semibold">{m.title}</span>
                </div>
                <p className="mt-0.5 pl-[30px] text-[13px] leading-snug text-muted">{m.sub}</p>
                {m.value === 'over' && on && (
                  <div className="mt-2 flex items-center gap-2 pl-[30px]" onClick={(e) => e.stopPropagation()}>
                    <span className="shrink-0 text-[14px]">Ask me when a job is over</span>
                    <div className="w-28">
                      <MoneyBox label="Ask when a job is over" value={value.limit} onChange={(n) => set({ limit: n ?? 0 })} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      <Card className="space-y-3 px-3 py-3">
        <div>
          <p className="text-[15px] font-semibold">Emergencies</p>
          <p className="mb-1.5 text-[13px] text-muted">Leaks, no heat, lockouts: go ahead right away up to</p>
          <MoneyBox label="Emergency limit" value={value.emergency_limit} onChange={(n) => set({ emergency_limit: n })} placeholder="Same rules as above" />
        </div>
        <div className="border-t border-hairline pt-3">
          <p className="text-[15px] font-semibold">Monthly budget (optional)</p>
          <p className="mb-1.5 text-[13px] text-muted">If a month's work would go over this, we check with you first.</p>
          <MoneyBox label="Monthly budget" value={value.monthly_budget} onChange={(n) => set({ monthly_budget: n })} placeholder="No limit" />
        </div>
        <label className="flex cursor-pointer items-start gap-3 border-t border-hairline pt-3">
          <input
            type="checkbox"
            checked={value.turnover_estimate}
            onChange={(e) => set({ turnover_estimate: e.target.checked })}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#059669]"
          />
          <span>
            <span className="block text-[15px] font-semibold">Turnovers: send me one estimate first</span>
            <span className="block text-[13px] text-muted">Between tenants, you approve the whole list at once.</span>
          </span>
        </label>
      </Card>

      <div>
        <p className="mb-1.5 px-1 text-[15px] font-semibold">Send me approvals by</p>
        <Segmented
          label="Send approvals by"
          value={value.contact}
          onChange={(contact) => set({ contact })}
          options={[
            { value: 'text', label: 'Text' },
            { value: 'whatsapp', label: 'WhatsApp' },
            { value: 'email', label: 'Email' },
          ]}
        />
      </div>
      <Card>
        <TextArea
          label="Anything else? (optional)"
          rows={2}
          value={value.note}
          onChange={(e) => set({ note: e.target.value })}
          placeholder="e.g. Always call the tenant before going in"
        />
      </Card>
    </div>
  )
}
