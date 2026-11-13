import type { Db } from './db'
import { addressKey, defaultServiceSettings } from './requests'
import type {
  Approval,
  GuideStep,
  Localized,
  Membership,
  PlanTier,
  Property,
  RequestIssue,
  RequestPhoto,
  ServiceRequest,
  ServiceSettings,
  Unit,
  Urgency,
} from './types'

/**
 * What the public pages (request page, status link, approval link) can do.
 * Nobody is logged in there, so everything goes through the database's
 * public functions, which return only what that page needs.
 */

export interface PublicGuide {
  issue_key: string
  title: Localized
  steps: GuideStep[]
}

export interface RequestPageInfo {
  name: string
  phone: string
  emergency_phone: string
  whatsapp: string
  emergency_fee: number
  plan: PlanTier | null
  guides: PublicGuide[]
}

export interface AddressCheck {
  known: boolean
  member: boolean
  units: string[]
}

export interface RequestPayload {
  /** Spam protection: a hidden field people never fill, and how long the form was open */
  hp: string
  elapsed_ms: number
  address: string
  unit: string
  lat: number | null
  lng: number | null
  name: string
  phone: string
  email: string
  kind: 'tenant' | 'landlord' | 'other'
  issues: RequestIssue[]
  description: string
  language: string
  urgency: Urgency
  best_days: string[]
  best_hours: string
  punch_list: string
  upload_key: string
  photos: { path: string; kind: 'issue' | 'sticker' | 'list'; issue: number | null }[]
}

export interface SubmitResult {
  token: string
  member: boolean
  emergency?: boolean
}

export interface RequestStatusInfo {
  status: ServiceRequest['status']
  scheduled_at: string | null
  done_at: string | null
  created_at: string
  urgency: Urgency
  issues: string[]
  company: string
  phone: string
  feedback: 'up' | 'down' | null
  review_url: string
}

export interface ApprovalInfo {
  kind: Approval['kind']
  title: string
  details: string
  estimate_hours: number | null
  estimate_amount: number | null
  parts: Approval['parts']
  status: Approval['status']
  expired: boolean
  decided_at: string | null
  address: string
  unit: string
  issues: string[]
  description: string
  photo_count: number
  company: string
  phone: string
}

export interface PublicApi {
  page(slug: string): Promise<RequestPageInfo | null>
  checkAddress(slug: string, address: string): Promise<AddressCheck>
  /** Upload one photo into this form's own folder; returns where it went */
  uploadPhoto(uploadKey: string, photo: Blob): Promise<string>
  submit(slug: string, payload: RequestPayload): Promise<SubmitResult>
  status(token: string): Promise<RequestStatusInfo | null>
  feedback(token: string, happy: boolean, note?: string): Promise<{ review_url: string }>
  approval(token: string): Promise<ApprovalInfo | null>
  decide(token: string, approve: boolean, note?: string): Promise<string>
  /** Photos for the approval page (needs our server; empty without it) */
  approvalPhotos(token: string): Promise<string[]>
  /** Tell our server a request came in (sends the emergency alert) */
  notify(token: string): Promise<void>
}

/** A random 32-letter folder name for one form's photos */
export const newUploadKey = () => crypto.randomUUID().replace(/-/g, '')

const apiBase = () => (typeof window === 'undefined' ? '' : window.location.origin)

export function createPublicApi(db: Db): PublicApi {
  if (db.mode === 'demo') return createDemoPublicApi(db)
  return {
    page: (slug) => db.rpc<RequestPageInfo | null>('request_page', { slug }),
    checkAddress: (slug, address) => db.rpc<AddressCheck>('check_address', { slug, addr: address }),
    async uploadPhoto(uploadKey, photo) {
      const path = `incoming/${uploadKey}/${crypto.randomUUID()}.jpg`
      await db.upload(path, photo, 'requests')
      return path
    },
    submit: (slug, payload) => db.rpc<SubmitResult>('submit_request', { slug, payload }),
    status: (token) => db.rpc<RequestStatusInfo | null>('request_status', { token }),
    feedback: (token, happy, note = '') => db.rpc('leave_feedback', { token, happy, note }),
    approval: (token) => db.rpc<ApprovalInfo | null>('approval_view', { token }),
    decide: (token, approve, note = '') => db.rpc<string>('decide_approval', { token, approve, note }),
    async approvalPhotos(token) {
      try {
        const res = await fetch(`${apiBase()}/api/approval-photos?token=${encodeURIComponent(token)}`)
        if (!res.ok) return []
        return ((await res.json()) as { urls?: string[] }).urls ?? []
      } catch {
        return []
      }
    },
    async notify(token) {
      try {
        await fetch(`${apiBase()}/api/request-received`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
      } catch {
        // The request is saved either way; the alert is a bonus
      }
    },
  }
}

// ---------------------------------------------------------------
// Demo mode: the same pages, working on this device's demo data
// ---------------------------------------------------------------
const DEMO_COMPANY = 'demo-company'
const token = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')

function createDemoPublicApi(db: Db): PublicApi {
  async function settings(): Promise<ServiceSettings> {
    const [row] = await db.select<ServiceSettings>('service_settings', { company_id: DEMO_COMPANY })
    return row ?? defaultServiceSettings(DEMO_COMPANY)
  }
  async function company(slug: string) {
    const s = await settings()
    return s.public_slug === slug.toLowerCase() ? s : null
  }
  async function house(address: string) {
    const key = addressKey(address)
    const all = await db.select<Property>('properties', { company_id: DEMO_COMPANY })
    return all.find((p) => p.address_key === key || addressKey(p.address) === key) ?? null
  }
  async function isMember(propertyId: string) {
    const plans = await db.select<Membership>('memberships', { property_id: propertyId })
    return plans.some((m) => m.status === 'active' || m.status === 'past_due')
  }
  async function companyInfo() {
    const [c] = await db.select<{ name: string; phone: string }>('companies', { id: DEMO_COMPANY })
    return { name: c?.name || 'Demo Handyman', phone: c?.phone || '' }
  }
  return {
    async page(slug) {
      const s = await company(slug)
      if (!s) return null
      const c = await companyInfo()
      const guides = (await db.select<PublicGuide & { published: boolean }>('guides', { company_id: DEMO_COMPANY }))
        .filter((g) => g.published)
        .map(({ issue_key, title, steps }) => ({ issue_key, title, steps }))
      return {
        name: c.name, phone: c.phone, emergency_phone: s.emergency_phone || c.phone, whatsapp: s.whatsapp,
        emergency_fee: s.emergency_fee, plan: s.plan_tiers.find((t) => t.active) ?? null, guides,
      }
    },
    async checkAddress(slug, address) {
      if (!(await company(slug))) throw new Error("This request page doesn't exist.")
      const p = await house(address)
      if (!p) return { known: false, member: false, units: [] }
      const units = await db.select<Unit>('units', { property_id: p.id })
      return { known: true, member: await isMember(p.id), units: units.map((u) => u.label).sort() }
    },
    async uploadPhoto(uploadKey, photo) {
      const path = `incoming/${uploadKey}/${crypto.randomUUID()}.jpg`
      await db.upload(path, photo, 'requests')
      return path
    },
    async submit(slug, payload) {
      if (!(await company(slug))) throw new Error("This request page doesn't exist.")
      if (payload.hp || payload.elapsed_ms < 3000) return { token: '', member: false }
      let p = await house(payload.address)
      const now = new Date().toISOString()
      if (!p) {
        p = await db.insert<Property>('properties', {
          id: crypto.randomUUID(), company_id: DEMO_COMPANY, org_id: null, prospect_id: null, client_id: null,
          address: payload.address, address_key: addressKey(payload.address), notes: '', source: 'request',
          lat: payload.lat, lng: payload.lng, landlord_id: null, created_at: now,
        })
      }
      const member = await isMember(p.id)
      const units = await db.select<Unit>('units', { property_id: p.id })
      const unit = units.find((u) => u.label.toLowerCase() === payload.unit.trim().toLowerCase())
      const digits = (s: string) => s.replace(/\D/g, '').slice(-10)
      const tenants = await db.select<{ id: string; phone: string; unit_id: string | null }>('tenants', { property_id: p.id })
      const tenant = tenants.find((t) => digits(t.phone) === digits(payload.phone))
      const id = crypto.randomUUID()
      const photoIssues = new Set(payload.photos.filter((ph) => ph.kind === 'issue').map((ph) => ph.issue))
      const req = await db.insert<ServiceRequest>('service_requests', {
        id, company_id: DEMO_COMPANY, property_id: p.id, unit_id: unit?.id ?? tenant?.unit_id ?? null,
        address: payload.address, unit_label: payload.unit, lat: payload.lat ?? p.lat ?? null, lng: payload.lng ?? p.lng ?? null,
        source: 'web', is_member: member, requester_name: payload.name, requester_phone: payload.phone,
        requester_email: payload.email, requester_kind: payload.kind, tenant_id: tenant?.id ?? null, verified: Boolean(tenant),
        issues: payload.issues, description: payload.description, original_text: '', language: payload.language,
        urgency: payload.urgency, tenant_urgency: payload.urgency, best_days: payload.best_days, best_hours: payload.best_hours,
        punch_list: payload.punch_list, status: 'new', scheduled_at: null, done_at: null, job_id: null,
        needs_approval: member && payload.kind !== 'landlord' && payload.issues.some((i) => i.key === 'other'),
        photo_needed: payload.urgency !== 'emergency' && payload.issues.some((_, i) => !photoIssues.has(i)),
        address_needed: false, over_hour: false, status_token: token(), notified_at: null,
        feedback: null, feedback_note: '', feedback_at: null, created_at: now, updated_at: now,
      })
      for (const ph of payload.photos) {
        await db.insert<RequestPhoto>('request_photos', {
          id: crypto.randomUUID(), company_id: DEMO_COMPANY, request_id: id, path: ph.path, kind: ph.kind,
          issue_index: ph.issue, created_at: now,
        })
      }
      return { token: req.status_token, member, emergency: payload.urgency === 'emergency' }
    },
    async status(tok) {
      const [r] = await db.select<ServiceRequest>('service_requests', { status_token: tok })
      if (!r) return null
      const c = await companyInfo()
      const s = await settings()
      return {
        status: r.status, scheduled_at: r.scheduled_at, done_at: r.done_at, created_at: r.created_at, urgency: r.urgency,
        issues: r.issues.map((i) => i.label || i.text), company: c.name, phone: c.phone, feedback: r.feedback,
        review_url: r.feedback === 'up' ? s.review_url : '',
      }
    },
    async feedback(tok, happy, note = '') {
      const [r] = await db.select<ServiceRequest>('service_requests', { status_token: tok })
      if (!r) throw new Error("This link doesn't work any more.")
      if (!r.feedback) {
        await db.update<ServiceRequest>('service_requests', r.id, {
          feedback: happy ? 'up' : 'down', feedback_note: note, feedback_at: new Date().toISOString(),
        })
      } else if (!happy && note) {
        await db.update<ServiceRequest>('service_requests', r.id, { feedback_note: note })
      }
      return { review_url: happy ? (await settings()).review_url : '' }
    },
    async approval(tok) {
      const [a] = await db.select<Approval>('approvals', { token: tok })
      if (!a) return null
      const [r] = a.request_id ? await db.select<ServiceRequest>('service_requests', { id: a.request_id }) : []
      const photos = a.request_id ? await db.select<RequestPhoto>('request_photos', { request_id: a.request_id }) : []
      const c = await companyInfo()
      return {
        kind: a.kind, title: a.title, details: a.details, estimate_hours: a.estimate_hours, estimate_amount: a.estimate_amount,
        parts: a.parts, status: a.status, expired: Date.parse(a.expires_at) < Date.now(), decided_at: a.decided_at,
        address: (r?.address ?? '').split(',')[0], unit: r?.unit_label ?? '', issues: r ? r.issues.map((i) => i.label || i.text) : [],
        description: r?.description ?? '', photo_count: photos.length, company: c.name, phone: c.phone,
      }
    },
    async decide(tok, approve, note = '') {
      const [a] = await db.select<Approval>('approvals', { token: tok })
      if (!a) throw new Error("This link doesn't work any more.")
      if (a.status !== 'pending') return a.status
      await db.update<Approval>('approvals', a.id, {
        status: approve ? 'approved' : 'declined', decided_at: new Date().toISOString(), decision_note: note,
        charge_status: approve && a.kind === 'parts' && (a.estimate_amount ?? 0) > 0 ? 'pending' : a.charge_status,
      })
      if (approve && a.request_id) await db.update<ServiceRequest>('service_requests', a.request_id, { needs_approval: false })
      return approve ? 'approved' : 'declined'
    },
    async approvalPhotos(tok) {
      const [a] = await db.select<Approval>('approvals', { token: tok })
      if (!a?.request_id) return []
      const photos = await db.select<RequestPhoto>('request_photos', { request_id: a.request_id })
      return db.fileUrls(photos.map((p) => p.path), 'requests')
    },
    async notify() {},
  }
}
