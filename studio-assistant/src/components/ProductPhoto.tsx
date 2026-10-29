import { useId } from 'react'
import type { Photo } from '../data/types'

// Stand-in "product shots" drawn in SVG, so the preview has real-looking tableware images without any files.

function rng(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

export function ProductPhoto({ photo, className }: { photo: Pick<Photo, 'id' | 'kind' | 'bg' | 'ware' | 'accent'>; className?: string }) {
  const uid = useId().replace(/:/g, '')
  const r = rng(photo.id)
  const { bg, ware, accent } = photo
  const g = (n: string) => `${uid}${n}`
  const tilt = (r() - 0.5) * 30

  return (
    <svg viewBox="0 0 400 400" className={className} preserveAspectRatio="xMidYMid slice" role="img" aria-label={photo.kind}>
      <defs>
        <radialGradient id={g('bg')} cx="35%" cy="25%" r="90%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#fff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.08" />
        </radialGradient>
        <radialGradient id={g('ware')} cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.1" />
        </radialGradient>
        <linearGradient id={g('side')} x1="0" x2="1">
          <stop offset="0%" stopColor="#000" stopOpacity="0.12" />
          <stop offset="35%" stopColor="#fff" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.18" />
        </linearGradient>
        <filter id={g('blur')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <filter id={g('soft')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <rect width="400" height="400" fill={bg} />
      <rect width="400" height="400" fill={`url(#${g('bg')})`} />

      {photo.kind === 'plate' && (
        <g transform={`rotate(${tilt} 200 200)`}>
          <rect x="-20" y="250" width="200" height="190" rx="6" fill={accent} opacity="0.35" transform="rotate(-8 80 340)" />
          <circle cx="212" cy="214" r="128" fill="#000" opacity="0.18" filter={`url(#${g('blur')})`} />
          <circle cx="200" cy="200" r="128" fill={ware} />
          <circle cx="200" cy="200" r="128" fill={`url(#${g('ware')})`} />
          <circle cx="200" cy="200" r="88" fill="#000" opacity="0.04" />
          <circle cx="200" cy="200" r="86" fill={ware} />
          <circle cx="200" cy="200" r="127" fill="none" stroke={accent} strokeOpacity="0.5" strokeWidth="3" />
          <rect x="345" y="110" width="8" height="190" rx="4" fill="#9a9a9a" opacity="0.7" />
        </g>
      )}

      {photo.kind === 'salad' && (
        <g>
          <circle cx="214" cy="216" r="140" fill="#000" opacity="0.2" filter={`url(#${g('blur')})`} />
          <circle cx="200" cy="200" r="140" fill={ware} />
          <circle cx="200" cy="200" r="140" fill={`url(#${g('ware')})`} />
          <circle cx="200" cy="200" r="118" fill="#000" opacity="0.15" />
          {Array.from({ length: 34 }, (_, i) => {
            const a = r() * Math.PI * 2
            const d = r() * 92
            const greens = ['#5f8f3e', '#7aab4c', '#4a7a31', '#93bf5f', '#3f6b2a']
            return (
              <ellipse
                key={i}
                cx={200 + Math.cos(a) * d}
                cy={200 + Math.sin(a) * d}
                rx={18 + r() * 14}
                ry={9 + r() * 7}
                fill={greens[i % greens.length]}
                transform={`rotate(${r() * 180} ${200 + Math.cos(a) * d} ${200 + Math.sin(a) * d})`}
              />
            )
          })}
          {Array.from({ length: 7 }, (_, i) => {
            const a = r() * Math.PI * 2
            const d = r() * 80
            return <circle key={i} cx={200 + Math.cos(a) * d} cy={200 + Math.sin(a) * d} r={9 + r() * 4} fill={i % 3 ? '#d9473a' : '#f2e6c9'} />
          })}
          <rect x="300" y="290" width="12" height="120" rx="6" fill={accent} transform="rotate(-35 306 350)" />
          <rect x="325" y="275" width="12" height="120" rx="6" fill={accent} transform="rotate(-28 331 335)" />
        </g>
      )}

      {photo.kind === 'pasta' && (
        <g transform={`rotate(${tilt} 200 200)`}>
          <circle cx="212" cy="214" r="136" fill="#000" opacity="0.18" filter={`url(#${g('blur')})`} />
          <circle cx="200" cy="200" r="136" fill={ware} />
          <circle cx="200" cy="200" r="136" fill={`url(#${g('ware')})`} />
          <circle cx="200" cy="200" r="80" fill="#000" opacity="0.1" />
          {Array.from({ length: 16 }, (_, i) => {
            const a = r() * Math.PI * 2
            const d = r() * 40
            const x = 200 + Math.cos(a) * d
            const y = 200 + Math.sin(a) * d
            return (
              <path
                key={i}
                d={`M${x - 40} ${y} q20 ${-25 + r() * 50} 40 0 t40 0`}
                fill="none"
                stroke={i % 2 ? '#e8c46a' : '#d9ad48'}
                strokeWidth="6"
                strokeLinecap="round"
                transform={`rotate(${r() * 180} ${x} ${y})`}
              />
            )
          })}
          <ellipse cx="225" cy="180" rx="14" ry="7" fill="#3f7a2b" transform="rotate(30 225 180)" />
          <ellipse cx="236" cy="192" rx="12" ry="6" fill="#4f8f36" transform="rotate(-20 236 192)" />
          <circle cx="182" cy="215" r="6" fill="#c8402f" />
        </g>
      )}

      {photo.kind === 'bowl' && (
        <g>
          <ellipse cx="205" cy="300" rx="150" ry="30" fill="#000" opacity="0.22" filter={`url(#${g('blur')})`} />
          <path d="M70 190 C 80 290, 140 315, 200 315 C 260 315, 320 290, 330 190 Z" fill={ware} />
          <path d="M70 190 C 80 290, 140 315, 200 315 C 260 315, 320 290, 330 190 Z" fill={`url(#${g('side')})`} />
          <ellipse cx="200" cy="190" rx="130" ry="36" fill={ware} />
          <ellipse cx="200" cy="193" rx="120" ry="30" fill="#000" opacity="0.14" />
          <ellipse cx="200" cy="190" rx="130" ry="36" fill="none" stroke={accent} strokeOpacity="0.6" strokeWidth="3" />
          {Array.from({ length: 22 }, (_, i) => (
            <circle key={i} cx={95 + r() * 210} cy={220 + r() * 70} r={1.6} fill={accent} opacity="0.55" />
          ))}
        </g>
      )}

      {photo.kind === 'stack' && (
        <g>
          <ellipse cx="205" cy="318" rx="160" ry="22" fill="#000" opacity="0.22" filter={`url(#${g('blur')})`} />
          {Array.from({ length: 5 }, (_, i) => {
            const y = 290 - i * 26
            const dx = (r() - 0.5) * 10
            return (
              <g key={i}>
                <path d={`M${60 + dx} ${y} Q 200 ${y + 22} ${340 + dx} ${y} L ${325 + dx} ${y + 14} Q 200 ${y + 32} ${75 + dx} ${y + 14} Z`} fill={ware} />
                <path d={`M${60 + dx} ${y} Q 200 ${y + 22} ${340 + dx} ${y} L ${325 + dx} ${y + 14} Q 200 ${y + 32} ${75 + dx} ${y + 14} Z`} fill={`url(#${g('side')})`} />
                <path d={`M${60 + dx} ${y} Q 200 ${y + 22} ${340 + dx} ${y}`} fill="none" stroke={accent} strokeOpacity="0.55" strokeWidth="2.5" />
                {i === 2 && <rect x={70 + dx} y={y + 8} width="260" height="9" rx="3" fill="#b4532e" opacity="0.8" />}
              </g>
            )
          })}
          <ellipse cx="200" cy="186" rx="140" ry="20" fill={ware} />
          <ellipse cx="200" cy="188" rx="100" ry="12" fill="#000" opacity="0.06" />
        </g>
      )}

      {photo.kind === 'mug' && (
        <g>
          <ellipse cx="205" cy="318" rx="110" ry="18" fill="#000" opacity="0.25" filter={`url(#${g('blur')})`} />
          <path d="M270 170 c 70 0, 70 110, 0 105" fill="none" stroke={ware} strokeWidth="20" strokeLinecap="round" />
          <path d="M270 170 c 70 0, 70 110, 0 105" fill="none" stroke="#000" strokeOpacity="0.1" strokeWidth="20" strokeLinecap="round" />
          <rect x="120" y="130" width="160" height="185" rx="22" fill={ware} />
          <rect x="120" y="130" width="160" height="185" rx="22" fill={`url(#${g('side')})`} />
          <ellipse cx="200" cy="134" rx="80" ry="16" fill={ware} />
          <ellipse cx="200" cy="136" rx="70" ry="11" fill="#5a3a24" />
          <path d="M120 250 h160 v43 a22 22 0 0 1 -22 22 h-116 a22 22 0 0 1 -22 -22 Z" fill={accent} opacity="0.55" />
          <path d="M175 110 q -10 -20 0 -40 q 10 -20 0 -40" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="5" strokeLinecap="round" filter={`url(#${g('soft')})`} />
        </g>
      )}
    </svg>
  )
}
