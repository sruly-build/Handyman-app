import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { statusFor } from '../data/billing'
import { emptyState } from '../data/sample'
import type { Comment, Invoice, Payment, State } from '../data/types'

// Live mode: when the Supabase keys are set, everything is saved to the database.
// Without them the app runs as the sample-data preview, saved only in this browser.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null
export const isLive = !!supabase

interface Doc {
  kind: string
  id: string
  data: unknown
}

const COLLECTIONS = ['clients', 'leads', 'projects', 'tasks', 'emails', 'reachOuts', 'galleries', 'invoices'] as const

/**
 * Splits the app's state into database rows. Favourites, comments and payments are rows of their own,
 * because clients and Stripe add them through the server while the app is open.
 */
export function toDocs(s: State): Map<string, Doc> {
  const out = new Map<string, Doc>()
  const add = (kind: string, id: string, data: unknown) => out.set(`${kind}/${id}`, { kind, id, data })
  add('settings', 'main', s.settings)
  add('meta', 'timer', { timer: s.timer })
  for (const c of COLLECTIONS) {
    for (const item of s[c] as { id: string }[]) {
      if (c === 'galleries') {
        const g = item as State['galleries'][number]
        add('galleries', g.id, { ...g, photos: g.photos.map(({ favourite: _f, comments: _c, ...p }) => p) })
        for (const p of g.photos) {
          if (p.favourite) add('gfav', `${g.id}:${p.id}`, { galleryId: g.id, photoId: p.id, favourite: true })
          for (const cm of p.comments) add('gcomment', cm.id, { ...cm, galleryId: g.id, photoId: p.id })
        }
      } else if (c === 'invoices') {
        const inv = item as Invoice
        const { payments, ...rest } = inv
        add('invoices', inv.id, rest)
        for (const p of payments) add('payment', p.id, { ...p, invoiceId: inv.id })
      } else {
        add(c, item.id, item)
      }
    }
  }
  return out
}

/** Puts the rows back together into the app's state. */
export function fromDocs(rows: Doc[]): State {
  const s = emptyState()
  const by = (kind: string) => rows.filter((r) => r.kind === kind).map((r) => r.data)
  const settings = by('settings')[0] as State['settings'] | undefined
  if (settings) s.settings = { ...s.settings, ...settings }
  s.timer = (by('meta')[0] as { timer: State['timer'] } | undefined)?.timer ?? null
  for (const c of COLLECTIONS) (s[c] as unknown[]) = by(c)

  const favs = by('gfav') as { galleryId: string; photoId: string; favourite: boolean }[]
  const comments = by('gcomment') as (Comment & { galleryId: string; photoId: string })[]
  s.galleries = s.galleries.map((g) => ({
    ...g,
    photos: g.photos.map((p) => ({
      ...p,
      favourite: favs.some((f) => f.galleryId === g.id && f.photoId === p.id && f.favourite),
      comments: comments
        .filter((c) => c.galleryId === g.id && c.photoId === p.id)
        .map(({ galleryId: _g, photoId: _p, ...c }) => c)
        .sort((a, b) => a.at - b.at),
    })),
  }))

  const payments = by('payment') as (Payment & { invoiceId: string })[]
  const viewed = new Set((by('iview') as { invoiceId: string }[]).map((v) => v.invoiceId))
  const reminders = by('ireminder') as { invoiceId: string; at: string }[]
  s.invoices = s.invoices.map((raw) => {
    const inv: Invoice = {
      ...raw,
      payments: payments
        .filter((p) => p.invoiceId === raw.id)
        .map(({ invoiceId: _i, ...p }) => p)
        .sort((a, b) => a.date.localeCompare(b.date)),
    }
    const r = reminders.find((x) => x.invoiceId === inv.id)?.at
    if (r && (!inv.lastReminder || r > inv.lastReminder)) inv.lastReminder = r
    if (inv.status === 'sent' && viewed.has(inv.id)) inv.status = 'viewed'
    inv.status = statusFor(inv, s.settings)
    return inv
  })
  return s
}

export async function loadAll(): Promise<State> {
  const rows: Doc[] = []
  // Supabase returns at most 1000 rows per request
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase!.from('docs').select('kind, id, data').range(from, from + 999)
    if (error) throw error
    rows.push(...(data as Doc[]))
    if (!data || data.length < 1000) break
  }
  return fromDocs(rows)
}

/** Writes only what changed since the last save. Rows added by the server are never deleted here. */
export async function saveChanges(prev: Map<string, string>, next: Map<string, Doc>): Promise<Map<string, string>> {
  const saved = new Map<string, string>()
  const upserts: (Doc & { updated_at: string })[] = []
  const now = new Date().toISOString()
  for (const [k, d] of next) {
    const j = JSON.stringify(d.data)
    saved.set(k, j)
    if (prev.get(k) !== j) upserts.push({ ...d, updated_at: now })
  }
  const deletes = [...prev.keys()].filter((k) => !next.has(k))
  if (upserts.length) {
    const { error } = await supabase!.from('docs').upsert(upserts, { onConflict: 'owner,kind,id' })
    if (error) throw error
  }
  for (const k of deletes) {
    const [kind, ...rest] = k.split('/')
    const { error } = await supabase!.from('docs').delete().eq('kind', kind).eq('id', rest.join('/'))
    if (error) throw error
  }
  return saved
}

export function snapshot(s: State): Map<string, string> {
  return new Map([...toDocs(s)].map(([k, d]) => [k, JSON.stringify(d.data)]))
}
