import QRCode from 'qrcode'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { LinkIcon, MessageIcon, PhotosIcon } from '../components/Icons'
import { Screen } from '../components/Screen'
import { Card, ErrorNote, Loading, TextArea } from '../components/ui'
import { useCompany, useServiceSettings } from '../data/queries'
import { money } from '../data/requests'
import { useUser } from '../lib/auth'
import { defaultPerks } from '../public/LandlordJoinPage'

const W = 1080
const H = 1920

/** Draw the WhatsApp status ad (1080 × 1920) */
async function drawStatus(canvas: HTMLCanvasElement, o: { company: string; link: string; badge: string; perks: string[] }) {
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  await document.fonts?.ready
  const font = (weight: number, size: number) => `${weight} ${size}px 'Inter Variable', Inter, system-ui, sans-serif`
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#064e3b')
  g.addColorStop(0.6, '#047857')
  g.addColorStop(1, '#0f766e')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W - 120, 260, 0, W - 120, 260, 620)
  glow.addColorStop(0, 'rgba(167,243,208,0.28)')
  glow.addColorStop(1, 'rgba(167,243,208,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  const x = 96
  ctx.fillStyle = '#a7f3d0'
  ctx.font = font(700, 40)
  ctx.fillText(o.company.toUpperCase(), x, 250, W - 2 * x)

  // Badge
  ctx.font = font(800, 40)
  const bw = ctx.measureText(o.badge.toUpperCase()).width + 64
  ctx.fillStyle = '#fbbf24'
  ctx.beginPath()
  ctx.roundRect(x, 300, bw, 76, 38)
  ctx.fill()
  ctx.fillStyle = '#3b2a00'
  ctx.fillText(o.badge.toUpperCase(), x + 32, 352)

  // Headline
  ctx.fillStyle = '#ffffff'
  ctx.font = font(800, 112)
  ;['Maintenance', 'plan for', 'landlords'].forEach((line, i) => ctx.fillText(line, x, 540 + i * 122))
  ctx.fillStyle = '#d1fae5'
  ctx.font = font(500, 46)
  ;['We handle the hassle with', 'your tenants. You approve the', 'work, your way, on your budget.'].forEach((line, i) => ctx.fillText(line, x, 870 + i * 62))

  // Perks
  ctx.font = font(600, 42)
  o.perks.slice(0, 4).forEach((p, i) => {
    const y = 1110 + i * 84
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    ctx.beginPath()
    ctx.arc(x + 26, y - 14, 26, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#6ee7b7'
    ctx.lineWidth = 7
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(x + 14, y - 14)
    ctx.lineTo(x + 23, y - 5)
    ctx.lineTo(x + 39, y - 24)
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.fillText(p, x + 76, y, W - 2 * x - 76)
  })

  // QR code card
  const card = { x, y: 1460, w: W - 2 * x, h: 330 }
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.roundRect(card.x, card.y, card.w, card.h, 40)
  ctx.fill()
  const qr = new Image()
  qr.src = await QRCode.toDataURL(o.link, { width: 260, margin: 0, errorCorrectionLevel: 'M', color: { dark: '#064e3b' } })
  await new Promise((r) => (qr.onload = r))
  ctx.drawImage(qr, card.x + 36, card.y + 35, 260, 260)
  ctx.fillStyle = '#064e3b'
  ctx.font = font(800, 54)
  ctx.fillText('Scan to sign up', card.x + 330, card.y + 140)
  ctx.fillStyle = '#475569'
  ctx.font = font(500, 34)
  ctx.fillText('or tap the link in', card.x + 330, card.y + 200)
  ctx.fillText('this status', card.x + 330, card.y + 244)
}

/** Me → Landlords → Share: the sign-up link, a ready WhatsApp message and a status image */
export function JoinShareScreen() {
  const user = useUser()
  const { data: settings, isLoading, error: settingsError } = useServiceSettings()
  const { data: company } = useCompany(user.companyId)
  const name = company?.name || 'Our team'
  const link = settings?.public_slug ? `${window.location.origin}/l/${settings.public_slug}` : ''
  const plan = settings?.plan_tiers?.find((t) => t.active) ?? null
  const free = !plan?.price
  const badge = 'Free sign-up'
  const perks = defaultPerks

  const defaultMessage = useMemo(
    () =>
      `🏠 Landlords: let ${name} take care of your rentals. Free sign-up!\n\n` +
      `🤝 We handle the hassle with your tenants\n✅ You approve the work, your way and on your budget\n🔧 Repairs, turnovers and inspections, with photos\n\nSign up here 👉 ${link}`,
    [name, link],
  )
  const [message, setMessage] = useState<string | null>(null)
  const text = message ?? defaultMessage
  const [copied, setCopied] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [imageError, setImageError] = useState<unknown>(null)

  useEffect(() => {
    if (!link || !canvasRef.current) return
    let live = true
    drawStatus(canvasRef.current, { company: name, link, badge, perks })
      .then(() => live && setImageUrl(canvasRef.current!.toDataURL('image/png')))
      .catch((e) => live && setImageError(e))
    return () => {
      live = false
    }
  }, [link, name, badge, perks])

  async function copy(what: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(what)
      setTimeout(() => setCopied(''), 2000)
    } catch {
      setCopied('')
    }
  }
  async function shareImage() {
    const blob = await (await fetch(imageUrl)).blob()
    const file = new File([blob], 'maintenance-plan.png', { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text }).catch(() => {})
    } else {
      const a = document.createElement('a')
      a.href = imageUrl
      a.download = 'maintenance-plan.png'
      a.click()
    }
  }

  const back = { to: '/landlords', label: 'Landlords' }
  if (isLoading) {
    return (
      <Screen title="Share sign-up page" back={back}>
        <Loading />
      </Screen>
    )
  }
  if (settingsError) {
    return (
      <Screen title="Share sign-up page" back={back}>
        <ErrorNote error={settingsError} />
        <p className="mt-2 px-1 text-[14px] text-muted">
          The database is missing the Request Inbox updates (parts 1 to 5 on the setup page). Run them in Supabase, then come back.
        </p>
      </Screen>
    )
  }
  if (!link) {
    return (
      <Screen title="Share sign-up page" back={back}>
        <Card className="px-4 py-4">
          <p className="text-[16px]">First give your business a web address for its pages.</p>
          <Link to="/request-page" className="mt-2 inline-block text-[16px] font-semibold text-brand">
            Set up the request page →
          </Link>
        </Card>
      </Screen>
    )
  }

  const btn = 'flex min-h-12 items-center justify-center gap-2 rounded-2xl text-[16px] font-semibold active:scale-[0.98]'
  return (
    <Screen title="Share sign-up page" back={back}>
      <h2 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wide text-[color:var(--accent)]">How it looks in WhatsApp</h2>
      <div className="rounded-2xl bg-[#e7f6e4] p-2.5">
        <div className="overflow-hidden rounded-xl bg-[#d9fdd3] shadow-sm">
          <img src="/og-join.jpg" alt="Link preview" className="w-full" />
          <div className="bg-[#cfe9c9] px-3 py-2">
            <p className="text-[14px] font-semibold leading-snug text-[#111b21]">{name} · Maintenance plan for landlords</p>
            <p className="line-clamp-2 text-[12px] text-[#54656f]">
              Free sign-up. We handle the hassle with your tenants; you approve the work, your way and on your budget.
            </p>
          </div>
          <p className="whitespace-pre-wrap px-3 py-2 text-[14px] text-[#111b21]">{text}</p>
        </div>
      </div>

      <h2 className="mb-2 mt-6 px-1 text-[13px] font-bold uppercase tracking-wide text-[color:var(--accent)]">Message</h2>
      <Card>
        <TextArea value={text} onChange={(e) => setMessage(e.target.value)} rows={8} aria-label="Message" />
      </Card>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className={`${btn} col-span-2 bg-[#25d366] text-white`}>
          <MessageIcon size={20} /> Send on WhatsApp
        </a>
        <button type="button" onClick={() => void copy('message', text)} className={`${btn} bg-card ring-1 ring-black/[0.06]`}>
          {copied === 'message' ? 'Copied ✓' : 'Copy message'}
        </button>
        <button type="button" onClick={() => void copy('link', link)} className={`${btn} bg-card ring-1 ring-black/[0.06]`}>
          <LinkIcon size={18} /> {copied === 'link' ? 'Copied ✓' : 'Copy link'}
        </button>
      </div>
      {message != null && (
        <button type="button" onClick={() => setMessage(null)} className="mt-1 min-h-10 w-full text-[14px] text-muted">
          Reset to the standard message
        </button>
      )}

      <h2 className="mb-2 mt-6 px-1 text-[13px] font-bold uppercase tracking-wide text-[color:var(--accent)]">Image for your WhatsApp status</h2>
      <canvas ref={canvasRef} className="hidden" />
      {imageError ? <ErrorNote error={imageError} /> : null}
      {imageUrl ? (
        <img src={imageUrl} alt="Status image" className="mx-auto w-2/3 rounded-2xl shadow-[0_12px_30px_-12px_rgba(6,78,59,0.6)]" />
      ) : (
        !imageError && <Loading />
      )}
      <button type="button" disabled={!imageUrl} onClick={() => void shareImage()} className={`${btn} mt-3 w-full bg-[#064e3b] text-white disabled:opacity-40`}>
        <PhotosIcon size={20} /> Share or save the image
      </button>
      <p className="mt-2 px-1 text-[13px] leading-snug text-muted">
        For your status: share the image to WhatsApp → My status, and paste the link as the caption ({copied === 'link' ? 'copied' : 'tap Copy link first'}).
        People can also scan the code on the image.
      </p>
      <p className="mt-3 px-1 text-[13px] text-muted">
        Signing up is free. {free ? 'The plan has no price yet; add one in the request page settings when you\u2019re ready.' : `The plan price (${money(plan!.price!)}/month per house) shows in the small print.`}
      </p>
    </Screen>
  )
}
