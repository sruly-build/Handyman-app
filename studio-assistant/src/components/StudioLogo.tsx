import { useStore } from '../data/store'

/** The studio's uploaded logo, or a simple mark in the chosen colour. */
export function BrandMark({ size = 32, color, url }: { size?: number; color: string; url?: string }) {
  if (url) return <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-[22%] object-cover" style={{ width: size, height: size }} />
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0">
      <rect width="64" height="64" rx="16" fill={color} />
      <path d="M18 22 l7 22 l7 -16 l7 16 l7 -22" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="48" cy="18" r="4" fill="#f5c26b" />
    </svg>
  )
}

export function StudioLogo({ size = 32 }: { size?: number }) {
  const { state } = useStore()
  return <BrandMark size={size} color={state.settings.logoColor} url={state.settings.logoUrl} />
}
