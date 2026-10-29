import { useStore } from '../data/store'

export function StudioLogo({ size = 32 }: { size?: number }) {
  const { state } = useStore()
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="16" fill={state.settings.logoColor} />
      <path d="M18 22 l7 22 l7 -16 l7 16 l7 -22" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="48" cy="18" r="4" fill="#f5c26b" />
    </svg>
  )
}
