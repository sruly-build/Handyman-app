import type { Auth, Db } from './db'
import { addressKey, cleanSlug, defaultServiceSettings, splitList } from './requests'
import type {
  AppUser,
  Approval,
  Guide,
  HourCredit,
  Job,
  JobInput,
  Landlord,
  Membership,
  PropertyClaim,
  PhotoKind,
  Property,
  PunchItem,
  RequestPhoto,
  ServiceRequest,
  ServiceSettings,
  Tenant,
  Unit,
} from './types'

const now = () => new Date().toISOString()
const newId = () => crypto.randomUUID()

/** What the request inbox needs from the main api (jobs, items, photos) */
export interface BaseApi {
  createJob(input: JobInput): Promise<Job>
  createLead(input: { customer_name: string; customer_phone: string; address: string; notes: string; client_id?: string | null }): Promise<Job>
  updateJob(id: string, patch: Partial<JobInput>): Promise<Job>
  createItem(jobId: string, title: string, location: string): Promise<PunchItem>
  updateItem(id: string, patch: Partial<PunchItem>): Promise<PunchItem>
  addPhoto(itemId: string, kind: PhotoKind, image: Blob): Promise<unknown>
}

export interface RequestPhotoView extends RequestPhoto {
  url: string
}

export interface HouseView extends Property {
  units: Unit[]
  tenants: Tenant[]
  landlord: Landlord | null
  plan: Membership | null
  hours_left: number
  next_expiry: string | null
}

/**
 * Request Inbox & Landlord Maintenance Plan: what the owner's screens can do.
 * (Merged into the main api in api.ts.)
 */
export function createRequestsApi(db: Db, me: () => Promise<AppUser>, base: BaseApi, auth: Auth) {
  /** Call the app's own server (Vercel functions) as the logged-in person */
  async function server<T>(route: string, body: unknown = {}): Promise<T> {
    if (db.mode === 'demo') throw new Error('This needs the real app (with Supabase and the server set up). It does not work in Demo mode.')
    const res = await fetch(`/api/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.accessToken()}` },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as T & { error?: string }
    if (!res.ok) throw new Error(data.error || `The server said no (${res.status}).`)
    return data
  }

  async function houseView(p: Property): Promise<HouseView> {
    const [units, tenants, plans, credits, landlords] = await Promise.all([
      db.select<Unit>('units', { property_id: p.id }),
      db.select<Tenant>('tenants', { property_id: p.id }),
      db.select<Membership>('memberships', { property_id: p.id }),
      db.select<HourCredit>('hour_credits', { property_id: p.id }),
      p.landlord_id ? db.select<Landlord>('landlords', { id: p.landlord_id }) : Promise.resolve([]),
    ])
    const live = credits.filter((c) => !c.used_at && Date.parse(c.expires_at) > Date.now())
    return {
      ...p,
      units: units.sort((a, b) => a.label.localeCompare(b.label)),
      tenants: tenants.sort((a, b) => a.name.localeCompare(b.name)),
      landlord: landlords[0] ?? null,
      plan: plans.find((m) => m.status !== 'cancelled') ?? null,
      hours_left: live.length,
      next_expiry: live.map((c) => c.expires_at).sort()[0] ?? null,
    }
  }

  const api = {
    /** The request page and plan settings (made with defaults the first time) */
    async getServiceSettings(): Promise<ServiceSettings> {
      const user = await me()
      const [row] = await db.select<ServiceSettings>('service_settings', { company_id: user.companyId })
      if (row) return { ...defaultServiceSettings(user.companyId), ...row }
      if (db.mode === 'demo') return db.insert('service_settings', { ...defaultServiceSettings(user.companyId), id: user.companyId })
      return defaultServiceSettings(user.companyId, '')
    },

    async saveServiceSettings(patch: Partial<ServiceSettings>): Promise<ServiceSettings> {
      const user = await me()
      const clean = { ...patch, updated_at: now() }
      if (clean.public_slug != null) {
        clean.public_slug = cleanSlug(clean.public_slug)
        if (clean.public_slug.length < 3) throw new Error('The page address needs at least 3 letters or numbers.')
      }
      const [row] = await db.select<ServiceSettings>('service_settings', { company_id: user.companyId })
      if (db.mode === 'demo') {
        return db.upsert('service_settings', { ...defaultServiceSettings(user.companyId), ...row, ...clean, id: user.companyId })
      }
      if (!row) throw new Error('The request page needs the database update first (supabase/updates 10 to 14).')
      try {
        return await db.updateWhere<ServiceSettings>('service_settings', { company_id: user.companyId }, clean)
      } catch (e) {
        if (e instanceof Error && /duplicate|unique/i.test(e.message)) {
          throw new Error('Another business already uses that page address. Try a different one.')
        }
        throw e
      }
    },

    // ---- Requests inbox ----
    async listRequests(): Promise<ServiceRequest[]> {
      const user = await me()
      const rows = await db.select<ServiceRequest>('service_requests', { company_id: user.companyId })
      return rows.sort((a, b) => b.created_at.localeCompare(a.created_at))
    },
    async getRequest(id: string): Promise<ServiceRequest> {
      const [r] = await db.select<ServiceRequest>('service_requests', { id })
      if (!r) throw new Error('This request was not found. It may have been deleted.')
      return r
    },
    async requestPhotos(requestId: string): Promise<RequestPhotoView[]> {
      const rows = (await db.select<RequestPhoto>('request_photos', { request_id: requestId })).sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      )
      const urls = await db.fileUrls(rows.map((r) => r.path), 'requests')
      return rows.map((r, i) => ({ ...r, url: urls[i] }))
    },
    async updateRequest(id: string, patch: Partial<ServiceRequest>) {
      return db.update<ServiceRequest>('service_requests', id, { ...patch, updated_at: now() })
    },
    /** Set (or clear) the visit time. The job, if there is one, moves with it. */
    async scheduleRequest(r: ServiceRequest, at: string | null) {
      const saved = await api.updateRequest(r.id, {
        scheduled_at: at,
        status: at ? 'scheduled' : r.status === 'scheduled' ? 'new' : r.status,
      })
      if (r.job_id && at) {
        const d = new Date(at)
        const pad = (n: number) => String(n).padStart(2, '0')
        await base.updateJob(r.job_id, {
          job_date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
          job_time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
        } as Partial<JobInput>)
      }
      return saved
    },
    async setRequestDone(r: ServiceRequest, done: boolean) {
      return api.updateRequest(r.id, { status: done ? 'done' : r.scheduled_at ? 'scheduled' : 'new', done_at: done ? now() : null })
    },
    async closeRequest(r: ServiceRequest, closed: boolean) {
      return api.updateRequest(r.id, { status: closed ? 'closed' : 'new' })
    },
    async deleteRequest(r: ServiceRequest) {
      const photos = await db.select<RequestPhoto>('request_photos', { request_id: r.id })
      await db.removeFiles(photos.map((p) => p.path), 'requests')
      await db.remove('request_photos', { request_id: r.id })
      await db.remove('service_requests', { id: r.id })
    },
    /** A request we typed in ourselves (e.g. from a phone call) */
    async addRequest(input: Pick<ServiceRequest, 'address' | 'unit_label' | 'requester_name' | 'requester_phone' | 'description' | 'urgency'> & { issues: ServiceRequest['issues'] }) {
      const user = await me()
      const house = await api.findOrAddHouse(input.address)
      const plans = house ? await db.select<Membership>('memberships', { property_id: house.id }) : []
      const id = newId()
      return db.insert<ServiceRequest>('service_requests', {
        id, company_id: user.companyId, property_id: house?.id ?? null, unit_id: null, address: input.address.trim(),
        unit_label: input.unit_label.trim(), lat: house?.lat ?? null, lng: house?.lng ?? null, source: 'owner',
        is_member: plans.some((m) => m.status === 'active' || m.status === 'past_due'), requester_name: input.requester_name.trim(),
        requester_phone: input.requester_phone.trim(), requester_email: '', requester_kind: 'other', tenant_id: null, verified: true,
        issues: input.issues, description: input.description.trim(), original_text: '', language: 'en', urgency: input.urgency,
        tenant_urgency: input.urgency, best_days: [], best_hours: '', punch_list: '', status: 'new', scheduled_at: null, done_at: null,
        job_id: null, needs_approval: false, photo_needed: false, address_needed: !input.address.trim(), over_hour: false,
        status_token: (newId() + newId()).replace(/-/g, ''), notified_at: null, feedback: null, feedback_note: '', feedback_at: null,
        created_at: now(), updated_at: now(),
      })
    },

    /**
     * Turn a request into a job (plan members) or a lead (everyone else, so it
     * goes through the lead-to-job flow). Address, issues (as punch list items)
     * and photos come along.
     */
    async convertRequest(r: ServiceRequest): Promise<Job> {
      if (r.job_id) throw new Error('This request already has a job.')
      const house = r.property_id ? (await db.select<Property>('properties', { id: r.property_id }))[0] : undefined
      const landlord = house?.landlord_id ? (await db.select<Landlord>('landlords', { id: house.landlord_id }))[0] : undefined
      // Plan houses are billed to the landlord; others to whoever asked
      const customer = r.is_member && landlord
        ? { name: landlord.name || landlord.email, phone: landlord.phone, client_id: landlord.client_id }
        : { name: r.requester_name || 'Repair request', phone: r.requester_phone, client_id: null }
      const address = r.unit_label ? `${r.address}, ${r.unit_label}` : r.address
      const notes = [
        `From a repair request (${r.source === 'text' ? 'text' : r.source === 'owner' ? 'typed in' : 'request page'}) by ${r.requester_name || 'unknown'}${r.requester_phone ? `, ${r.requester_phone}` : ''}.`,
        r.description,
        r.original_text && r.original_text !== r.description ? `Original: ${r.original_text}` : '',
        r.best_days.length || r.best_hours ? `Best: ${[r.best_days.join(', '), r.best_hours].filter(Boolean).join(' · ')}` : '',
      ].filter(Boolean).join('\n')
      let job: Job
      if (r.is_member) {
        const d = r.scheduled_at ? new Date(r.scheduled_at) : null
        const pad = (n: number) => String(n).padStart(2, '0')
        job = await base.createJob({
          customer_name: customer.name, customer_phone: customer.phone, customer_email: '', address, notes,
          job_date: d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : null,
          job_time: d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : null,
          bring_extras: [], client_id: customer.client_id,
        } as JobInput)
      } else {
        job = await base.createLead({ customer_name: customer.name, customer_phone: customer.phone, address, notes })
      }
      job = await base.updateJob(job.id, { property_id: r.property_id, unit_id: r.unit_id } as Partial<JobInput>)

      // Issues → punch list items, with their photos
      const photos = await api.requestPhotos(r.id)
      const items: PunchItem[] = []
      for (const [i, issue] of r.issues.entries()) {
        const title = issue.key === 'other' ? issue.text || 'Other repair' : issue.label || issue.text
        const item = await base.createItem(job.id, title, r.unit_label)
        const extra = [issue.key !== 'other' && issue.text ? issue.text : '', issue.tried.length ? `Tenant already tried: ${issue.tried.join('; ')}` : '']
          .filter(Boolean).join('\n')
        if (extra) await base.updateItem(item.id, { notes: extra })
        items.push(item)
        for (const ph of photos.filter((p) => p.issue_index === i && p.kind !== 'list')) {
          try {
            const blob = await (await fetch(ph.url)).blob()
            await base.addPhoto(item.id, 'before', blob)
          } catch {
            // a photo that can't be copied stays on the request
          }
        }
      }
      // A pasted list (non-members) becomes items too
      for (const line of splitList(r.punch_list)) items.push(await base.createItem(job.id, line, ''))
      if (items.length === 0) await base.createItem(job.id, r.description.split('\n')[0] || 'Repair', r.unit_label)
      await api.updateRequest(r.id, { job_id: job.id })
      return job
    },

    // ---- Houses ----
    async listHouses(): Promise<HouseView[]> {
      const user = await me()
      const houses = await db.select<Property>('properties', { company_id: user.companyId })
      return Promise.all(houses.sort((a, b) => a.address.localeCompare(b.address)).map(houseView))
    },
    async getHouse(id: string): Promise<HouseView> {
      const [p] = await db.select<Property>('properties', { id })
      if (!p) throw new Error('This house was not found.')
      // Add any hours the plan has earned since we last looked
      const plan = (await db.select<Membership>('memberships', { property_id: id })).find((m) => m.status === 'active')
      if (plan) await api.refreshHours(plan).catch(() => {})
      return houseView(p)
    },
    /** The company's house at this address, or a new one */
    async findOrAddHouse(address: string): Promise<Property | null> {
      if (!address.trim()) return null
      const user = await me()
      const key = addressKey(address)
      const houses = await db.select<Property>('properties', { company_id: user.companyId })
      const found = houses.find((h) => (h.address_key ?? addressKey(h.address)) === key)
      if (found) return found
      return db.insert<Property>('properties', {
        id: newId(), company_id: user.companyId, org_id: null, prospect_id: null, client_id: null, address: address.trim(),
        address_key: key, notes: '', source: 'owner', created_at: now(),
      })
    },
    async updateHouse(id: string, patch: Partial<Property>) {
      const clean = { ...patch }
      if (clean.address !== undefined && db.mode === 'demo') clean.address_key = addressKey(clean.address)
      return db.update<Property>('properties', id, clean)
    },
    async addUnit(propertyId: string, label: string) {
      const user = await me()
      return db.insert<Unit>('units', { id: newId(), company_id: user.companyId, property_id: propertyId, label: label.trim(), created_at: now() })
    },
    async renameUnit(id: string, label: string) {
      return db.update<Unit>('units', id, { label: label.trim() })
    },
    async deleteUnit(id: string) {
      await db.remove('units', { id })
    },
    async saveTenant(t: Partial<Tenant> & { property_id: string }) {
      const user = await me()
      const row = {
        name: (t.name ?? '').trim(), phone: (t.phone ?? '').trim(), email: (t.email ?? '').trim(),
        unit_id: t.unit_id ?? null, active: t.active ?? true,
      }
      if (t.id) return db.update<Tenant>('tenants', t.id, row)
      return db.insert<Tenant>('tenants', {
        ...row, id: newId(), company_id: user.companyId, property_id: t.property_id, created_at: now(),
        // Demo mode has no database to work this out
        ...(db.mode === 'demo' ? { phone_key: row.phone.replace(/\D/g, '').slice(-10) } : {}),
      } as Tenant)
    },
    async deleteTenant(id: string) {
      await db.remove('tenants', { id })
    },

    // ---- Landlord approvals (secure link, no login) ----
    async listRequestApprovals(requestId: string): Promise<Approval[]> {
      return (await db.select<Approval>('approvals', { request_id: requestId })).sort((a, b) => b.created_at.localeCompare(a.created_at))
    },
    async listJobApprovals(jobId: string): Promise<Approval[]> {
      return (await db.select<Approval>('approvals', { job_id: jobId })).sort((a, b) => b.created_at.localeCompare(a.created_at))
    },
    async createApproval(input: Pick<Approval, 'kind' | 'title' | 'details' | 'estimate_hours' | 'estimate_amount' | 'parts'> & {
      request?: ServiceRequest | null
      jobId?: string | null
      propertyId?: string | null
    }): Promise<Approval> {
      const user = await me()
      const propertyId = input.request?.property_id ?? input.propertyId ?? null
      const house = propertyId ? (await db.select<Property>('properties', { id: propertyId }))[0] : undefined
      const created = now()
      return db.insert<Approval>('approvals', {
        id: newId(), company_id: user.companyId, request_id: input.request?.id ?? null, job_id: input.jobId ?? input.request?.job_id ?? null,
        property_id: propertyId, landlord_id: house?.landlord_id ?? null, kind: input.kind, title: input.title.trim(),
        details: input.details.trim(), estimate_hours: input.estimate_hours, estimate_amount: input.estimate_amount, parts: input.parts,
        token: (newId() + newId()).replace(/-/g, ''), status: 'pending', auto: false, decided_at: null, decision_note: '',
        charge_status: 'none', stripe_payment_intent: null, charged_at: null,
        expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(), created_by: user.id, created_at: created,
      })
    },
    async cancelApproval(id: string) {
      return db.update<Approval>('approvals', id, { status: 'cancelled' })
    },
    /** The landlord of a house (for their phone number) */
    async houseLandlord(propertyId: string | null): Promise<Landlord | null> {
      if (!propertyId) return null
      const [house] = await db.select<Property>('properties', { id: propertyId })
      if (!house?.landlord_id) return null
      return (await db.select<Landlord>('landlords', { id: house.landlord_id }))[0] ?? null
    },

    // ---- Landlords ----
    async listLandlords(): Promise<Landlord[]> {
      const user = await me()
      return (await db.select<Landlord>('landlords', { company_id: user.companyId })).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))
    },
    async saveLandlord(l: Partial<Landlord>): Promise<Landlord> {
      const user = await me()
      const row = {
        name: (l.name ?? '').trim(), email: (l.email ?? '').trim().toLowerCase(), phone: (l.phone ?? '').trim(),
        auto_approve_limit: l.auto_approve_limit ?? null,
      }
      if (l.id) return db.update<Landlord>('landlords', l.id, row)
      return db.insert<Landlord>('landlords', {
        ...row, id: newId(), company_id: user.companyId, user_id: null, client_id: null, notify_new_request: false, notify_done: false,
        stripe_customer_id: null, referral_code: newId().replace(/-/g, '').slice(0, 8), referred_by: null, referral_rewarded_at: null,
        created_at: now(),
      })
    },
    /** Link a house to a landlord (the owner's say-so is the approval) */
    async linkLandlord(propertyId: string, landlordId: string | null) {
      return db.update<Property>('properties', propertyId, { landlord_id: landlordId })
    },
    async listClaims(): Promise<(PropertyClaim & { address: string; landlord: string })[]> {
      const user = await me()
      const claims = (await db.select<PropertyClaim>('property_claims', { company_id: user.companyId })).filter((c) => c.status === 'pending')
      return Promise.all(
        claims.map(async (c) => {
          const [house] = await db.select<Property>('properties', { id: c.property_id })
          const [l] = await db.select<Landlord>('landlords', { id: c.landlord_id })
          return { ...c, address: house?.address ?? '', landlord: l ? l.name || l.email : '' }
        }),
      )
    },
    async decideClaim(claimId: string, approve: boolean) {
      if (db.mode === 'supabase') return db.rpc('decide_claim', { claim: claimId, approve })
      const [c] = await db.select<PropertyClaim>('property_claims', { id: claimId })
      await db.update<PropertyClaim>('property_claims', claimId, { status: approve ? 'approved' : 'declined', decided_at: now() })
      if (approve) await db.update<Property>('properties', c.property_id, { landlord_id: c.landlord_id })
    },

    // ---- The plan and its hour bank ----
    async listHours(propertyId: string): Promise<HourCredit[]> {
      return (await db.select<HourCredit>('hour_credits', { property_id: propertyId })).sort((a, b) => a.expires_at.localeCompare(b.expires_at))
    },
    /** Bring a plan's hours up to date (each period adds hours; the bank has a cap) */
    async refreshHours(m: Membership) {
      if (db.mode === 'supabase') return db.rpc('accrue_hours', { m: m.id })
      if (m.status !== 'active' || !m.next_hour_at) return
      const credits = await db.select<HourCredit>('hour_credits', { membership_id: m.id })
      let next = new Date(m.next_hour_at)
      while (next.getTime() <= Date.now()) {
        for (let k = 0; k < m.hours_each; k++) {
          const banked = credits.filter((c) => !c.used_at && Date.parse(c.expires_at) > next.getTime()).length
          if (banked < m.hour_cap) {
            const expires = new Date(next)
            expires.setMonth(expires.getMonth() + m.expire_months)
            credits.push(await db.insert<HourCredit>('hour_credits', {
              id: newId(), company_id: m.company_id, membership_id: m.id, property_id: m.property_id, kind: 'plan',
              added_at: next.toISOString(), expires_at: expires.toISOString(), used_at: null, job_id: null, request_id: null, note: '',
            }))
          }
        }
        next = new Date(next)
        next.setMonth(next.getMonth() + Math.max(1, m.every_months))
      }
      await db.update<Membership>('memberships', m.id, { next_hour_at: next.toISOString() })
    },
    /** Start a house's plan without Stripe (paid by cash or check), or after Stripe is set up by hand */
    async startPlanManually(propertyId: string): Promise<Membership> {
      const user = await me()
      const settings = await api.getServiceSettings()
      const tier = settings.plan_tiers.find((t) => t.active) ?? settings.plan_tiers[0]
      const [house] = await db.select<Property>('properties', { id: propertyId })
      const existing = (await db.select<Membership>('memberships', { property_id: propertyId })).find((m) => m.status !== 'cancelled')
      const m = existing ?? (await db.insert<Membership>('memberships', {
        id: newId(), company_id: user.companyId, property_id: propertyId, landlord_id: house?.landlord_id ?? null, tier: tier.id,
        price: tier.price ?? 0, hours_each: tier.hours, every_months: tier.every_months, hour_cap: tier.cap,
        expire_months: tier.expire_months, status: 'pending', stripe_subscription_id: null, started_at: null, next_hour_at: null,
        current_period_end: null, cancelled_at: null, created_at: now(),
      }))
      await api.setPlanStatus(m, 'active')
      return (await db.select<Membership>('memberships', { id: m.id }))[0]
    },
    /** Active, payment failed (no new hours), or cancelled. The owner decides what happens. */
    async setPlanStatus(m: Membership, status: Membership['status']) {
      if (db.mode === 'supabase') return db.rpc('set_membership_status', { m: m.id, new_status: status })
      if (status === 'active' && m.status !== 'active') {
        const first = !m.started_at
        await db.update<Membership>('memberships', m.id, {
          status: 'active', cancelled_at: null,
          ...(first ? { started_at: now(), next_hour_at: now() } : { next_hour_at: m.next_hour_at && Date.parse(m.next_hour_at) < Date.now() ? now() : m.next_hour_at }),
        })
        const [fresh] = await db.select<Membership>('memberships', { id: m.id })
        await api.refreshHours(fresh)
        if (m.landlord_id) await db.update<Property>('properties', m.property_id, { landlord_id: m.landlord_id })
      } else {
        await db.update<Membership>('memberships', m.id, { status, cancelled_at: status === 'cancelled' ? now() : m.cancelled_at })
      }
    },
    /** Each visit uses one full hour (the oldest first). Returns the hours left. */
    async useHour(propertyId: string, jobId: string | null = null, requestId: string | null = null): Promise<number> {
      if (db.mode === 'supabase') return db.rpc<number>('use_hour', { house: propertyId, job: jobId, request: requestId })
      const live = (await api.listHours(propertyId)).filter((c) => !c.used_at && Date.parse(c.expires_at) > Date.now())
      if (!live.length) throw new Error('This house has no hours left in its bank.')
      await db.update<HourCredit>('hour_credits', live[0].id, { used_at: now(), job_id: jobId, request_id: requestId })
      return live.length - 1
    },
    /** Give an hour back, or add a free one (e.g. goodwill). Expires in 12 months. */
    async addHour(propertyId: string, note: string) {
      const user = await me()
      const expires = new Date()
      expires.setMonth(expires.getMonth() + 12)
      return db.insert<HourCredit>('hour_credits', {
        id: newId(), company_id: user.companyId, membership_id: null, property_id: propertyId, kind: 'manual', added_at: now(),
        expires_at: expires.toISOString(), used_at: null, job_id: null, request_id: null, note: note.trim(),
      })
    },
    async undoHour(credit: HourCredit) {
      return db.update<HourCredit>('hour_credits', credit.id, { used_at: null, job_id: null, request_id: null })
    },
    /** Stripe's payment page for this house's plan (for the landlord to pay) */
    async planCheckoutLink(propertyId: string) {
      return server<{ url: string }>('plan-checkout', { propertyId })
    },
    async billingPortal() {
      return server<{ url: string }>('billing-portal')
    },
    async chargeParts(approvalId: string) {
      return server<{ result: string }>('charge-parts', { approvalId })
    },
    /**
     * Ask the landlord to approve parts (price includes the markup). Under
     * their auto-approve limit it's approved right away.
     */
    async createPartsApproval(jobId: string, propertyId: string | null, title: string, parts: Approval['parts']) {
      const total = Math.round(parts.reduce((sum, p) => sum + p.price * p.qty, 0) * 100) / 100
      const landlord = await api.houseLandlord(propertyId)
      const settings = await api.getServiceSettings()
      const limit = landlord?.auto_approve_limit ?? settings.parts_auto_approve
      const approval = await api.createApproval({
        kind: 'parts', title, details: '', estimate_hours: null, estimate_amount: total, parts, jobId, propertyId,
      })
      if (landlord && total <= limit) {
        return db.update<Approval>('approvals', approval.id, { status: 'approved', auto: true, decided_at: now(), charge_status: 'pending' })
      }
      return approval
    },

    // ---- Troubleshooting guides ----
    async listGuides(): Promise<Guide[]> {
      const user = await me()
      return db.select<Guide>('guides', { company_id: user.companyId })
    },
    async saveGuide(g: Pick<Guide, 'issue_key' | 'title' | 'steps' | 'published'> & { id?: string }) {
      const user = await me()
      const row = { title: g.title, steps: g.steps, published: g.published, updated_at: now() }
      if (g.id) return db.update<Guide>('guides', g.id, row)
      return db.insert<Guide>('guides', { ...row, id: newId(), company_id: user.companyId, issue_key: g.issue_key })
    },
    async deleteGuide(id: string) {
      await db.remove('guides', { id })
    },

    // ---- Emergency alerts (web push) ----
    async savePushSubscription(sub: { endpoint: string; p256dh: string; auth: string }) {
      const user = await me()
      const existing = await db.select<{ id: string }>('push_subscriptions', { endpoint: sub.endpoint })
      if (existing[0]) return
      await db.insert('push_subscriptions', { id: newId(), user_id: user.id, company_id: user.companyId, ...sub, created_at: now() })
    },
    async removePushSubscription(endpoint: string) {
      await db.remove('push_subscriptions', { endpoint })
    },
    async sendTestAlert() {
      return server<{ sent: number }>('test-alert')
    },
    server,
  }
  return api
}

export type RequestsApi = ReturnType<typeof createRequestsApi>
