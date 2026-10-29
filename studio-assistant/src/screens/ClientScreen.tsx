import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { useStore } from '../data/store'
import { isArchived, totals } from '../data/billing'
import { fmtRelative, fmtShort, fmtStamp } from '../lib/dates'
import { money } from '../lib/money'
import { InvoiceBadge, StageBadge } from '../components/bits'
import { PhotoImg } from '../components/PhotoImg'
import { Avatar, Card, Empty, Page, PageHeader, Segmented } from '../components/ui'

type Tab = 'projects' | 'emails' | 'invoices' | 'galleries'

export function ClientScreen() {
  const { id } = useParams()
  const { state, update } = useStore()
  const nav = useNavigate()
  const [tab, setTab] = useState<Tab>('projects')
  const c = state.clients.find((x) => x.id === id)
  if (!c)
    return (
      <Page>
        <PageHeader title="Client" back="/clients" />
        <Empty title="Client not found" />
      </Page>
    )
  const projects = state.projects.filter((p) => p.clientId === c.id)
  const emails = state.emails.filter((e) => e.clientId === c.id || e.fromEmail === c.email).sort((a, b) => b.receivedAt - a.receivedAt)
  const invoices = state.invoices.filter((i) => i.clientId === c.id)
  const galleries = state.galleries.filter((g) => projects.some((p) => p.id === g.projectId))
  const lifetime = invoices.flatMap((i) => i.payments).reduce((n, p) => n + p.amount, 0)
  const whatsapp = `https://wa.me/1${c.phone.replace(/\D/g, '')}`

  return (
    <Page>
      <PageHeader back="/clients" title="" large={false} />
      <div className="-mt-6 flex flex-col items-center text-center">
        <Avatar name={c.company} size={76} />
        <h1 className="mt-3 text-[26px] font-bold tracking-tight">{c.company}</h1>
        <div className="text-[15px] text-ink-2">
          {c.name} · client since {fmtShort(c.since)}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <ContactBtn href={`mailto:${c.email}`} icon={<Mail size={20} />} label="Email" color="bg-accent" />
        <ContactBtn href={`tel:${c.phone}`} icon={<Phone size={20} />} label="Call" color="bg-green" />
        <ContactBtn href={whatsapp} icon={<MessageCircle size={20} />} label="WhatsApp" color="bg-[#1f9d55]" />
      </div>

      <Card className="mt-4 overflow-hidden text-[15px]">
        <InfoRow label="Email" value={c.email} />
        <InfoRow label="Phone" value={c.phone} />
        <InfoRow
          label="Address"
          value={
            <span className="flex items-start gap-1">
              <MapPin size={14} className="mt-1 shrink-0 text-ink-3" />
              {c.address || '—'}
            </span>
          }
        />
        <InfoRow label="Paid to date" value={money(lifetime)} />
        <div className="border-t border-line px-4 py-3">
          <div className="text-[12px] text-ink-3">Notes</div>
          <textarea
            value={c.notes}
            onChange={(e) => update((s) => void (s.clients.find((x) => x.id === c.id)!.notes = e.target.value))}
            rows={2}
            className="mt-0.5 w-full resize-none bg-transparent outline-none"
          />
        </div>
      </Card>

      <Segmented
        value={tab}
        onChange={setTab}
        className="mt-6 mb-3"
        options={[
          { value: 'projects', label: `Projects` },
          { value: 'emails', label: `Emails` },
          { value: 'invoices', label: `Invoices` },
          { value: 'galleries', label: `Galleries` },
        ]}
      />

      {tab === 'projects' && (
        <Card className="overflow-hidden">
          {projects.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-fill [&+&]:border-t [&+&]:border-line">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium">{p.title}</div>
                <div className="text-[12px] text-ink-2">Shoot {fmtRelative(p.shootDate)}</div>
              </div>
              <StageBadge stage={p.stage} archived={isArchived(state, p)} />
            </Link>
          ))}
          {!projects.length && <Empty title="No projects yet" />}
        </Card>
      )}

      {tab === 'emails' && (
        <Card className="overflow-hidden">
          {emails.map((e) => (
            <div key={e.id} className="px-4 py-3 [&+&]:border-t [&+&]:border-line">
              <div className="flex justify-between gap-2">
                <span className="truncate text-[15px] font-medium">{e.subject}</span>
                <span className="shrink-0 text-[12px] text-ink-3">{fmtStamp(e.receivedAt)}</span>
              </div>
              <div className="line-clamp-2 text-[13px] text-ink-2">{e.summary}</div>
            </div>
          ))}
          {!emails.length && <Empty title="No emails" />}
        </Card>
      )}

      {tab === 'invoices' && (
        <Card className="overflow-hidden">
          {invoices.map((inv) => (
            <button key={inv.id} onClick={() => nav(`/invoices/${inv.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-fill [&+&]:border-t [&+&]:border-line">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium">{inv.number}</div>
                <div className="text-[12px] text-ink-2">{fmtShort(inv.issued)}</div>
              </div>
              <span className="text-[15px] font-semibold tabular-nums">{money(totals(inv, state.settings).total)}</span>
              <InvoiceBadge inv={inv} />
            </button>
          ))}
          {!invoices.length && <Empty title="No invoices" />}
        </Card>
      )}

      {tab === 'galleries' && (
        <div className="grid grid-cols-2 gap-3">
          {galleries.map((g) => {
            const cover = g.photos.find((p) => p.id === g.coverId) ?? g.photos[0]
            return (
              <Link key={g.id} to={`/projects/${g.projectId}/gallery`}>
                <Card className="overflow-hidden">
                  {cover ? <PhotoImg galleryId={g.id} photo={cover} className="aspect-[4/3] w-full" /> : <div className="aspect-[4/3] w-full bg-fill" />}
                  <div className="px-3 py-2.5">
                    <div className="truncate text-[15px] font-medium">{g.title}</div>
                    <div className="text-[12px] text-ink-2">
                      {g.photos.length} photos · {g.photos.filter((p) => p.favourite).length} ♥
                    </div>
                  </div>
                </Card>
              </Link>
            )
          })}
          {!galleries.length && (
            <Card className="col-span-2">
              <Empty title="No galleries" />
            </Card>
          )}
        </div>
      )}
    </Page>
  )
}

function ContactBtn({ href, icon, label, color }: { href: string; icon: React.ReactNode; label: string; color: string }) {
  return (
    <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="flex flex-col items-center gap-1.5 rounded-2xl bg-card py-3 text-ink shadow-card active:opacity-60">
      <span className={`flex h-9 w-9 items-center justify-center rounded-full text-white ${color}`}>{icon}</span>
      <span className="text-[12px] font-medium">{label}</span>
    </a>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="px-4 py-3 [&+&]:border-t [&+&]:border-line">
      <div className="text-[12px] text-ink-3">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  )
}
