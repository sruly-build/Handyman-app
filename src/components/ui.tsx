import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import type { ItemStatus } from '../data/types'
import { CheckIcon } from './Icons'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`}>{children}</div>
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-7 flex items-end justify-between px-1">
      <h2 className="text-[22px] font-bold tracking-tight">{children}</h2>
      {action}
    </div>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }

export function Button({ variant = 'primary', className = '', children, ...rest }: ButtonProps) {
  const styles = {
    primary: 'bg-brand text-white active:bg-brand-dark',
    secondary: 'bg-brand-soft text-brand-dark active:opacity-70',
    danger: 'bg-problem-soft text-problem active:opacity-70',
  }[variant]
  return (
    <button
      className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-[17px] font-semibold transition disabled:opacity-40 ${styles} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
}

export function Field({ label, className = '', ...rest }: FieldProps) {
  return (
    <label className={`block px-4 py-2.5 ${className}`}>
      <span className="block text-[13px] font-medium text-muted">{label}</span>
      <input className="w-full bg-transparent py-1 outline-none placeholder:text-[#c7c7cc]" {...rest} />
    </label>
  )
}

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

export function TextArea({ label, className = '', ...rest }: TextAreaProps) {
  return (
    <label className={`block px-4 py-2.5 ${className}`}>
      {label && <span className="block text-[13px] font-medium text-muted">{label}</span>}
      <textarea
        rows={4}
        className="w-full resize-none bg-transparent py-1 leading-snug outline-none placeholder:text-[#c7c7cc]"
        {...rest}
      />
    </label>
  )
}

/** Grey line between rows inside a card */
export function Divider() {
  return <div className="ml-4 h-px bg-hairline" />
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-hairline"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  )
}

export const statusLabels: Record<ItemStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
}

/** Round status marker: empty circle, orange half, or green check */
export function StatusDot({ status, size = 28 }: { status: ItemStatus; size?: number }) {
  if (status === 'done') {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full bg-brand text-white"
        style={{ width: size, height: size }}
      >
        <CheckIcon size={size * 0.62} strokeWidth={3} />
      </span>
    )
  }
  if (status === 'in_progress') {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full border-[2.5px] border-progress"
        style={{ width: size, height: size }}
      >
        <span className="rounded-full bg-progress" style={{ width: size * 0.42, height: size * 0.42 }} />
      </span>
    )
  }
  return <span className="shrink-0 rounded-full border-[2.5px] border-[#c7c7cc]" style={{ width: size, height: size }} />
}

export function StatusBadge({ status }: { status: ItemStatus }) {
  const styles = {
    todo: 'bg-hairline text-[#636366]',
    in_progress: 'bg-progress-soft text-[#c26a00]',
    done: 'bg-brand-soft text-brand-dark',
  }[status]
  return <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${styles}`}>{statusLabels[status]}</span>
}

/** Three big buttons: To do / In progress / Done */
export function StatusPicker({ value, onChange }: { value: ItemStatus; onChange: (s: ItemStatus) => void }) {
  const options: ItemStatus[] = ['todo', 'in_progress', 'done']
  const active = {
    todo: 'bg-white text-ink shadow',
    in_progress: 'bg-progress text-white shadow',
    done: 'bg-brand text-white shadow',
  }
  return (
    <div className="grid grid-cols-3 gap-1 rounded-2xl bg-hairline p-1" role="radiogroup" aria-label="Status">
      {options.map((s) => (
        <button
          key={s}
          role="radio"
          aria-checked={value === s}
          onClick={() => onChange(s)}
          className={`flex min-h-12 items-center justify-center gap-1.5 rounded-xl text-[15px] font-semibold transition ${
            value === s ? active[s] : 'text-[#636366] active:opacity-60'
          }`}
        >
          {s === 'done' && value === s && <CheckIcon size={18} strokeWidth={3} />}
          {statusLabels[s]}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card className="px-6 py-10 text-center">
      <p className="text-[17px] font-semibold">{title}</p>
      {children && <div className="mt-1 text-[15px] text-muted">{children}</div>}
    </Card>
  )
}

export function Loading() {
  return (
    <div className="flex justify-center py-16" aria-label="Loading">
      <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-hairline border-t-brand" />
    </div>
  )
}

export function ErrorNote({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <div className="rounded-2xl bg-problem-soft px-4 py-3 text-[15px] text-problem" role="alert">
      {message}
    </div>
  )
}
