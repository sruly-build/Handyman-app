import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react'

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ')
}

export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={cx('mx-auto w-full px-4 pt-safe pb-28 lg:px-10 lg:pt-8 lg:pb-16', wide ? 'max-w-6xl' : 'max-w-3xl')}>
      {children}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  back,
  right,
  large = true,
}: {
  title: ReactNode
  subtitle?: ReactNode
  back?: string | true
  right?: ReactNode
  large?: boolean
}) {
  const nav = useNavigate()
  return (
    <header className="pt-3 pb-4 lg:pt-0">
      {(back || right) && (
        <div className="mb-1 flex h-10 items-center justify-between">
          {back ? (
            <button
              onClick={() => (back === true ? nav(-1) : nav(back))}
              className="-ml-2 flex items-center gap-0.5 rounded-lg px-1 py-1 text-[17px] text-accent active:opacity-50"
            >
              <ChevronLeft size={22} strokeWidth={2.2} />
              Back
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">{right}</div>
        </div>
      )}
      <h1 className={cx('font-bold tracking-tight', large ? 'text-[30px] leading-tight lg:text-[34px]' : 'text-[22px]')}>{title}</h1>
      {subtitle && <div className="mt-1 text-[15px] text-ink-2">{subtitle}</div>}
    </header>
  )
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cx('rounded-2xl bg-card shadow-card', onClick && 'cursor-pointer transition active:scale-[0.99]', className)}
    >
      {children}
    </div>
  )
}

export function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('mt-7', className)}>
      <div className="mb-2 flex items-end justify-between px-1">
        <h2 className="text-[20px] font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

type BtnVariant = 'primary' | 'secondary' | 'plain' | 'danger' | 'tinted'

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  icon,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode }) {
  const v = {
    primary: 'bg-accent text-white active:bg-accent/85',
    secondary: 'bg-fill text-ink active:bg-line',
    tinted: 'bg-accent-soft text-accent active:bg-accent/15',
    plain: 'text-accent active:opacity-50',
    danger: 'bg-red-soft text-red active:bg-red/15',
  }[variant]
  const s = {
    sm: 'h-8 px-3 text-[13px] gap-1 rounded-full',
    md: 'h-10 px-4 text-[15px] gap-1.5 rounded-full',
    lg: 'h-12 px-5 text-[17px] gap-2 rounded-2xl w-full',
  }[size]
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition select-none disabled:opacity-40',
        v,
        variant === 'plain' ? 'px-1' : s,
        variant === 'plain' && size === 'sm' && 'text-[13px]',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  )
}

export type Tone = 'gray' | 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'gold'
const TONES: Record<Tone, string> = {
  gray: 'bg-fill text-ink-2',
  blue: 'bg-accent-soft text-accent',
  green: 'bg-green-soft text-green',
  orange: 'bg-orange-soft text-orange',
  red: 'bg-red-soft text-red',
  purple: 'bg-purple-soft text-purple',
  gold: 'bg-gold-soft text-gold',
}

export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex h-[22px] items-center rounded-full px-2 text-[12px] font-semibold whitespace-nowrap', TONES[tone], className)}>
      {children}
    </span>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={cx('flex rounded-[10px] bg-fill p-[3px]', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-8 flex-1 rounded-[8px] px-3 text-[13px] font-medium whitespace-nowrap transition',
            value === o.value ? 'bg-card text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'text-ink-2',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cx('relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors', on ? 'bg-green' : 'bg-line')}
    >
      <span
        className={cx(
          'absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.2)] transition-transform',
          on && 'translate-x-5',
        )}
      />
    </button>
  )
}

export function Checkbox({ checked, onChange, size = 24 }: { checked: boolean; onChange: () => void; size?: number }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onChange()
      }}
      aria-checked={checked}
      role="checkbox"
      style={{ width: size, height: size }}
      className={cx(
        'flex shrink-0 items-center justify-center rounded-full border-[1.5px] transition',
        checked ? 'border-accent bg-accent text-white' : 'border-ink-3 bg-white',
      )}
    >
      {checked && <Check size={size * 0.6} strokeWidth={3} />}
    </button>
  )
}

/** A grouped list like iOS Settings. */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('overflow-hidden rounded-2xl bg-card shadow-card', className)}>{children}</div>
}

export function Row({
  children,
  to,
  onClick,
  chevron,
  className,
}: {
  children: ReactNode
  to?: string
  onClick?: () => void
  chevron?: boolean
  className?: string
}) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">{children}</div>
      {(chevron ?? (to || onClick)) && <ChevronRight size={18} className="shrink-0 text-ink-3" />}
    </>
  )
  const cls = cx(
    'flex w-full items-center gap-3 px-4 py-3 text-left [&+&]:border-t [&+&]:border-line',
    (to || onClick) && 'active:bg-fill',
    className,
  )
  if (to)
    return (
      <Link to={to} className={cls}>
        {inner}
      </Link>
    )
  if (onClick)
    return (
      <button onClick={onClick} className={cls}>
        {inner}
      </button>
    )
  return <div className={cls}>{inner}</div>
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block px-1 text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block px-1 text-[12px] text-ink-3">{hint}</span>}
    </label>
  )
}

export const inputCls =
  'w-full rounded-xl border border-line bg-white px-3.5 py-2.5 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10'

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
      <div className="anim-fade absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className={cx(
          'anim-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-[22px] bg-bg shadow-float lg:rounded-[22px]',
          wide ? 'lg:max-w-2xl' : 'lg:max-w-lg',
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-ink-3/40 lg:hidden" />
        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-2 lg:pt-5">
          <h3 className="text-[19px] font-semibold tracking-tight">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full bg-fill text-ink-2">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-line bg-bg px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:pb-5">{footer}</div>}
      </div>
    </div>
  )
}

export function Confirm({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div className="anim-fade absolute inset-0 bg-black/30" onClick={onCancel} />
      <div className="anim-pop relative w-full max-w-[300px] overflow-hidden rounded-[18px] bg-white/95 text-center shadow-float backdrop-blur">
        <div className="px-5 pt-5 pb-4">
          <div className="text-[17px] font-semibold">{title}</div>
          <div className="mt-1 text-[14px] text-ink-2">{message}</div>
        </div>
        <div className="grid grid-cols-2 border-t border-line">
          <button onClick={onCancel} className="h-12 text-[17px] text-accent active:bg-fill">
            Cancel
          </button>
          <button onClick={onConfirm} className="h-12 border-l border-line text-[17px] font-semibold text-accent active:bg-fill">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Avatar({ name, size = 40, color }: { name: string; size?: number; color?: string }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const hues = ['#c7d7f5', '#f5d7c7', '#d3ecd9', '#ecd3e8', '#f3e6bf', '#d6d3f0']
  const bg = color ?? hues[name.length % hues.length]
  return (
    <div
      style={{ width: size, height: size, background: bg, fontSize: size * 0.38 }}
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-ink/70"
    >
      {initials}
    </div>
  )
}

export function Empty({ icon, title, text }: { icon?: ReactNode; title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-3 text-ink-3">{icon}</div>}
      <div className="text-[17px] font-semibold">{title}</div>
      {text && <div className="mt-1 max-w-xs text-[14px] text-ink-2">{text}</div>}
    </div>
  )
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="text-[13px] text-ink-2">{label}</div>
      <div className="mt-0.5 text-[22px] font-semibold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="text-[12px] text-ink-3">{sub}</div>}
    </div>
  )
}
