import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../data/store'
import { isLive } from './cloud'
import { totals } from '../data/billing'
import type { Client, Comment, Invoice, Photo } from '../data/types'

// Client pages (gallery and pay page) read from the server in live mode, and from the
// sample data in the preview. These hooks give both the same shape.

export interface PublicStudio {
  businessName: string
  email: string
  phone: string
  website: string
  logoUrl?: string
  logoColor: string
}

export interface GalleryView {
  studio: PublicStudio
  title: string
  company: string
  clientName: string
  coverId: string
  locked: boolean
  balance: number
  invoiceId?: string
  invoiceNumber?: string
  photos: (Pick<Photo, 'id' | 'name' | 'kind' | 'bg' | 'ware' | 'accent'> & { favourite: boolean; comments: Comment[] })[]
}

export interface GalleryActions {
  toggleFav: (photoId: string) => void
  comment: (photoId: string, text: string) => Promise<void>
}

type Load<T> = { data: T | null; error: string }

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? 'This page is not available.')
  return data
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong.')
  return data
}

export const useGallery: (id: string) => Load<GalleryView> & GalleryActions = isLive ? useLiveGallery : usePreviewGallery

function useLiveGallery(id: string): Load<GalleryView> & GalleryActions {
  const [view, setView] = useState<Load<GalleryView>>({ data: null, error: '' })
  useEffect(() => {
    get<GalleryView>(`/api/public/gallery?id=${encodeURIComponent(id)}`)
      .then((data) => setView({ data, error: '' }))
      .catch((e: Error) => setView({ data: null, error: e.message }))
  }, [id])

  const toggleFav = useCallback(
    (photoId: string) => {
      setView((v) => {
        if (!v.data) return v
        const photos = v.data.photos.map((p) => (p.id === photoId ? { ...p, favourite: !p.favourite } : p))
        const fav = photos.find((p) => p.id === photoId)!.favourite
        void post('/api/public/gallery', { id, photoId, action: 'fav', favourite: fav }).catch(() => undefined)
        return { ...v, data: { ...v.data, photos } }
      })
    },
    [id],
  )

  const comment = useCallback(
    async (photoId: string, text: string) => {
      const who = view.data?.clientName || 'Client'
      const res = await post<{ comment: Comment }>('/api/public/gallery', { id, photoId, action: 'comment', text, who })
      setView((v) =>
        v.data ? { ...v, data: { ...v.data, photos: v.data.photos.map((p) => (p.id === photoId ? { ...p, comments: [...p.comments, res.comment] } : p)) } } : v,
      )
    },
    [id, view.data?.clientName],
  )

  return { ...view, toggleFav, comment }
}

function usePreviewGallery(id: string): Load<GalleryView> & GalleryActions {
  const { state, update } = useStore()
  const g = state.galleries.find((x) => x.id === id)
  const project = state.projects.find((p) => p.id === g?.projectId)
  const client: Client | undefined = state.clients.find((c) => c.id === project?.clientId)
  const unpaid = state.invoices
    .filter((i) => i.projectId === g?.projectId && i.kind === 'invoice')
    .map((i) => ({ i, b: totals(i, state.settings).balance }))
    .filter((x) => x.b > 0)
  const balance = unpaid.reduce((n, x) => n + x.b, 0)
  const s = state.settings
  const data: GalleryView | null = g
    ? {
        studio: { businessName: s.businessName, email: s.email, phone: s.phone, website: s.website, logoUrl: s.logoUrl, logoColor: s.logoColor },
        title: g.title,
        company: client?.company ?? '',
        clientName: client?.name ?? '',
        coverId: g.coverId,
        locked: g.lockDownloads && balance > 0,
        balance,
        invoiceId: unpaid[0]?.i.id,
        invoiceNumber: unpaid[0]?.i.number,
        photos: g.photos,
      }
    : null
  return {
    data,
    error: g ? '' : 'Gallery not found',
    toggleFav: (photoId) =>
      update((st) => {
        const p = st.galleries.find((x) => x.id === id)!.photos.find((x) => x.id === photoId)!
        p.favourite = !p.favourite
      }),
    comment: async (photoId, text) =>
      update((st) => {
        st.galleries
          .find((x) => x.id === id)!
          .photos.find((x) => x.id === photoId)!
          .comments.push({ id: crypto.randomUUID(), who: client?.name ?? 'Client', text, at: Date.now(), fromClient: true })
      }),
  }
}

export interface PayView {
  studio: PublicStudio
  pay: { zelleName: string; zelleContact: string; checkPayee: string; checkAddress: string; cardFeePct: number; cardEnabled: boolean }
  settings: { cardFeePct: number }
  invoice: Invoice
  client: { name: string; company: string; email: string; address: string } | null
  projectTitle: string
}

export const usePayView: (id: string) => Load<PayView> = isLive ? useLivePay : usePreviewPay

function useLivePay(id: string): Load<PayView> {
  const [view, setView] = useState<Load<PayView>>({ data: null, error: '' })
  useEffect(() => {
    get<PayView>(`/api/public/invoice?id=${encodeURIComponent(id)}`)
      .then((data) => setView({ data, error: '' }))
      .catch((e: Error) => setView({ data: null, error: e.message }))
  }, [id])
  return view
}

function usePreviewPay(id: string): Load<PayView> {
  const { state } = useStore()
  const inv = state.invoices.find((i) => i.id === id)
  if (!inv) return { data: null, error: 'Invoice not found' }
  const s = state.settings
  const project = state.projects.find((p) => p.id === inv.projectId)
  const client = state.clients.find((c) => c.id === inv.clientId)
  return {
    error: '',
    data: {
      studio: { businessName: s.businessName, email: s.email, phone: s.phone, website: s.website, logoUrl: s.logoUrl, logoColor: s.logoColor },
      pay: { zelleName: s.zelleName, zelleContact: s.zelleContact, checkPayee: s.checkPayee, checkAddress: s.checkAddress, cardFeePct: s.cardFeePct, cardEnabled: false },
      settings: { cardFeePct: s.cardFeePct },
      invoice: { ...inv, payByCard: false },
      client: client ? { name: client.name, company: client.company, email: client.email, address: client.address } : null,
      projectTitle: project?.title ?? '',
    },
  }
}

export async function startCardPayment(invoiceId: string): Promise<string> {
  const { url } = await post<{ url: string }>('/api/stripe/checkout', { id: invoiceId })
  return url
}
