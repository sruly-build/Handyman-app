import { invoiceTotals } from './billing.js'
import type { Client, Gallery, Invoice, Payment, Project, Settings } from '../../src/data/types'
import { getDoc, listDocsWhere } from './db.js'

// Rebuilds the bits of studio data that public pages need, the same way the app does.

export async function settingsOf(owner: string): Promise<Settings | null> {
  return getDoc<Settings>(owner, 'settings', 'main')
}

export async function invoiceWithPayments(owner: string, inv: Invoice): Promise<Invoice> {
  const payments = await listDocsWhere<Payment & { invoiceId: string }>(owner, 'payment', 'invoiceId', inv.id)
  return { ...inv, payments: payments.map((p) => p.data).sort((a, b) => a.date.localeCompare(b.date)) }
}

export function balanceOf(inv: Invoice, _settings: Settings): { total: number; paid: number; balance: number } {
  return invoiceTotals(inv)
}

export interface PublicStudio {
  businessName: string
  email: string
  phone: string
  website: string
  logoUrl?: string
  logoColor: string
}

export function publicStudio(s: Settings): PublicStudio {
  return { businessName: s.businessName, email: s.email, phone: s.phone, website: s.website, logoUrl: s.logoUrl, logoColor: s.logoColor }
}

export async function projectAndClient(owner: string, projectId: string): Promise<{ project: Project | null; client: Client | null }> {
  const project = await getDoc<Project>(owner, 'projects', projectId)
  const client = project ? await getDoc<Client>(owner, 'clients', project.clientId) : null
  return { project, client }
}

export type { Gallery, Invoice, Settings }
