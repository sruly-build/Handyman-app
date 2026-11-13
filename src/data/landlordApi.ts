import type { Db } from './db'
import { addressKey } from './requests'
import type {
  AppUser,
  HourCredit,
  Inspection,
  Job,
  Landlord,
  Membership,
  PhotoKind,
  Property,
  PropertyClaim,
  PropertyItem,
  PropertyPhoto,
  PunchItem,
  RequestIssue,
  ServiceRequest,
  ServiceSettings,
  Tenant,
  Unit,
} from './types'

/** One house on the landlord's status screen */
export interface LandlordHouse {
  id: string
  address: string
  units: { id: string; label: string }[]
  plan: { id: string; tier: string; status: Membership['status']; price: number; started_at: string | null } | null
  hours_left: number
  hours_used_year: number
  next_expiry: string | null
  open_requests: number
  jobs_done: number
  items_fixed: number
  repeats: { key: string; label: string; count: number }[]
  worn: { id: string; name: string; room: string; note: string }[]
  filter_due: string | null
}

export interface LandlordSummary {
  landlord: Pick<Landlord, 'id' | 'name' | 'email' | 'phone' | 'notify_new_request' | 'notify_done' | 'referral_code'> & {
    auto_approve_limit: number
  }
  company: { name: string; phone: string; slug: string | null }
  claims: { id: string; property_id: string; address: string; status: PropertyClaim['status'] }[]
  houses: LandlordHouse[]
}

export interface HouseHistory {
  visits: {
    id: string
    date: string
    items: { id: string; title: string; location: string; status: PunchItem['status'] }[]
    photos: { path: string; kind: PhotoKind; item_id: string }[]
    hours_used: number
  }[]
  requests: {
    id: string
    created_at: string
    status: ServiceRequest['status']
    urgency: ServiceRequest['urgency']
    unit: string
    scheduled_at: string | null
    issues: RequestIssue[]
    needs_approval: boolean
  }[]
}

const now = () => new Date().toISOString()
const newId = () => crypto.randomUUID()
const live = (h: HourCredit) => !h.used_at && Date.parse(h.expires_at) > Date.now()
const yearAgo = () => Date.now() - 365 * 86400000

/**
 * What a landlord can see and do (their own approved houses only). The
 * owner can open the same summary for any of their landlords.
 */
export function createLandlordApi(db: Db, me: () => Promise<AppUser>) {
  // ---- Demo mode works it out from this device's data ----
  async function demoSummary(l: Landlord): Promise<LandlordSummary> {
    const [settings] = await db.select<ServiceSettings>('service_settings', { company_id: l.company_id })
    const [company] = await db.select<{ name: string; phone: string }>('companies', { id: l.company_id })
    const houses = (await db.select<Property>('properties', { company_id: l.company_id })).filter((p) => p.landlord_id === l.id)
    const claims = (await db.select<PropertyClaim>('property_claims', { landlord_id: l.id })).filter((c) => c.status !== 'approved')
    const threshold = settings?.repeat_threshold ?? 3
    return {
      landlord: {
        id: l.id, name: l.name, email: l.email, phone: l.phone, notify_new_request: l.notify_new_request, notify_done: l.notify_done,
        referral_code: l.referral_code, auto_approve_limit: l.auto_approve_limit ?? settings?.parts_auto_approve ?? 25,
      },
      company: { name: company?.name ?? '', phone: company?.phone ?? '', slug: settings?.public_slug ?? 'demo' },
      claims: await Promise.all(
        claims.map(async (c) => ({ id: c.id, property_id: c.property_id, status: c.status, address: (await db.select<Property>('properties', { id: c.property_id }))[0]?.address ?? '' })),
      ),
      houses: await Promise.all(
        houses.map(async (p): Promise<LandlordHouse> => {
          const [units, plans, hours, requests, jobs, items] = await Promise.all([
            db.select<Unit>('units', { property_id: p.id }),
            db.select<Membership>('memberships', { property_id: p.id }),
            db.select<HourCredit>('hour_credits', { property_id: p.id }),
            db.select<ServiceRequest>('service_requests', { property_id: p.id }),
            db.select<Job>('jobs', { property_id: p.id }),
            db.select<PropertyItem>('property_items', { property_id: p.id }),
          ])
          const realJobs = jobs.filter((j) => (j.stage ?? 'job') === 'job')
          const punch = (await Promise.all(realJobs.map((j) => db.select<PunchItem>('punch_items', { job_id: j.id })))).map((list) => list)
          const counts = new Map<string, { label: string; count: number }>()
          for (const r of requests.filter((x) => Date.parse(x.created_at) > yearAgo())) {
            for (const i of r.issues) {
              if (i.key === 'other') continue
              const c = counts.get(i.key) ?? { label: i.label, count: 0 }
              c.count++
              counts.set(i.key, c)
            }
          }
          const plan = plans.find((m) => m.status !== 'cancelled')
          const liveHours = hours.filter(live)
          const filterMonths = p.filter_months ?? settings?.filter_months ?? 4
          let filterDue: string | null = null
          if (p.last_filter_at) {
            const d = new Date(p.last_filter_at)
            d.setMonth(d.getMonth() + filterMonths)
            filterDue = d.toISOString().slice(0, 10)
          }
          return {
            id: p.id, address: p.address,
            units: units.map((u) => ({ id: u.id, label: u.label })).sort((a, b) => a.label.localeCompare(b.label)),
            plan: plan ? { id: plan.id, tier: plan.tier, status: plan.status, price: plan.price, started_at: plan.started_at } : null,
            hours_left: liveHours.length,
            hours_used_year: hours.filter((h) => h.used_at && Date.parse(h.used_at) > yearAgo()).length,
            next_expiry: liveHours.map((h) => h.expires_at).sort()[0] ?? null,
            open_requests: requests.filter((r) => r.status === 'new' || r.status === 'scheduled').length,
            jobs_done: punch.filter((list) => list.length && list.every((i) => i.status === 'done')).length,
            items_fixed: punch.flat().filter((i) => i.status === 'done').length,
            repeats: [...counts].filter(([, c]) => c.count >= threshold).map(([key, c]) => ({ key, ...c })),
            worn: items.filter((i) => i.replace_soon).map((i) => ({ id: i.id, name: i.name, room: i.room, note: i.worn_note })),
            filter_due: filterDue,
          }
        }),
      ),
    }
  }

  async function demoHistory(houseId: string): Promise<HouseHistory> {
    const jobs = (await db.select<Job>('jobs', { property_id: houseId })).filter((j) => (j.stage ?? 'job') === 'job')
    const hours = await db.select<HourCredit>('hour_credits', { property_id: houseId })
    const visits = await Promise.all(
      jobs.map(async (j) => {
        const items = (await db.select<PunchItem>('punch_items', { job_id: j.id })).sort((a, b) => a.position - b.position)
        const photos = (await Promise.all(items.map((i) => db.select<{ storage_path: string; kind: PhotoKind; item_id: string }>('photos', { item_id: i.id }))))
          .flat()
          .filter((ph) => ph.kind === 'before' || ph.kind === 'after')
        return {
          id: j.id, date: j.job_date ?? j.created_at.slice(0, 10),
          items: items.map((i) => ({ id: i.id, title: i.title, location: i.location, status: i.status })),
          photos: photos.map((ph) => ({ path: ph.storage_path, kind: ph.kind, item_id: ph.item_id })),
          hours_used: hours.filter((h) => h.job_id === j.id).length,
        }
      }),
    )
    const requests = await db.select<ServiceRequest>('service_requests', { property_id: houseId })
    return {
      visits: visits.sort((a, b) => b.date.localeCompare(a.date)),
      requests: requests
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((r) => ({ id: r.id, created_at: r.created_at, status: r.status, urgency: r.urgency, unit: r.unit_label, scheduled_at: r.scheduled_at, issues: r.issues, needs_approval: r.needs_approval })),
    }
  }

  const api = {
    /** The landlord accounts of the person logged in (one per company) */
    async myLandlordAccounts(): Promise<Landlord[]> {
      const user = await me()
      return db.select<Landlord>('landlords', { user_id: user.id })
    },
    async landlordSummary(landlordId: string): Promise<LandlordSummary> {
      if (db.mode === 'supabase') return db.rpc<LandlordSummary>('landlord_summary', { landlord: landlordId })
      const [l] = await db.select<Landlord>('landlords', { id: landlordId })
      if (!l) throw new Error('Not found.')
      return demoSummary(l)
    },
    async houseHistory(houseId: string): Promise<HouseHistory> {
      if (db.mode === 'supabase') return db.rpc<HouseHistory>('house_history', { house: houseId })
      return demoHistory(houseId)
    },
    /** Photos for the history screen (before / after of each visit) */
    async jobPhotoUrls(paths: string[]) {
      return db.fileUrls(paths)
    },
    async claimHouse(landlordId: string, address: string, units: string[]) {
      if (db.mode === 'supabase') return db.rpc<string>('claim_house', { landlord: landlordId, addr: address, unit_labels: units })
      const [l] = await db.select<Landlord>('landlords', { id: landlordId })
      const key = addressKey(address)
      let house = (await db.select<Property>('properties', { company_id: l.company_id })).find((p) => (p.address_key ?? addressKey(p.address)) === key)
      if (!house) {
        house = await db.insert<Property>('properties', {
          id: newId(), company_id: l.company_id, org_id: null, prospect_id: null, client_id: null, address: address.trim(),
          address_key: key, notes: '', source: 'landlord', landlord_id: null, created_at: now(),
        })
        for (const label of units.filter((u) => u.trim())) {
          await db.insert<Unit>('units', { id: newId(), company_id: l.company_id, property_id: house.id, label: label.trim(), created_at: now() })
        }
      }
      return (await db.insert<PropertyClaim>('property_claims', {
        id: newId(), company_id: l.company_id, landlord_id: l.id, property_id: house.id, status: 'pending', decided_at: null, created_at: now(),
      })).id
    },
    async setMyNotifications(newRequest: boolean, repairDone: boolean) {
      if (db.mode === 'supabase') return db.rpc('set_my_notifications', { new_request: newRequest, repair_done: repairDone })
      for (const l of await api.myLandlordAccounts()) {
        await db.update<Landlord>('landlords', l.id, { notify_new_request: newRequest, notify_done: repairDone })
      }
    },
    /** Move-out: book a turnover walkthrough (it becomes a lead for the handyman) */
    async requestMoveOut(houseId: string, unitId: string | null, moveOut: string, note: string) {
      if (db.mode === 'supabase') return db.rpc<string>('request_move_out', { house: houseId, unit: unitId, move_out: moveOut, note })
      const [p] = await db.select<Property>('properties', { id: houseId })
      const [l] = p.landlord_id ? await db.select<Landlord>('landlords', { id: p.landlord_id }) : []
      const unit = unitId ? (await db.select<Unit>('units', { id: unitId }))[0] : undefined
      const job = await db.insert<Job>('jobs', {
        id: newId(), company_id: p.company_id, customer_name: l?.name || l?.email || 'Landlord', customer_phone: l?.phone ?? '',
        customer_email: l?.email ?? '', address: unit ? `${p.address}, ${unit.label}` : p.address,
        notes: `Move-out turnover requested by the landlord. ${note}`.trim(), job_date: null, bring_extras: [], stage: 'lead',
        lead_status: 'new', property_id: houseId, unit_id: unitId, move_out_date: moveOut, client_id: l?.client_id ?? null,
        created_by: null, created_at: now(),
      } as Job)
      return job.id
    },
    async houseTenants(houseId: string) {
      return (await db.select<Tenant>('tenants', { property_id: houseId })).sort((a, b) => a.name.localeCompare(b.name))
    },
    /** A landlord adds or changes a tenant on their own house */
    async saveMyTenant(t: Partial<Tenant> & { property_id: string }) {
      const row = { name: (t.name ?? '').trim(), phone: (t.phone ?? '').trim(), unit_id: t.unit_id ?? null, email: '', active: true }
      if (t.id) return db.update<Tenant>('tenants', t.id, row)
      const [p] = await db.select<Property>('properties', { id: t.property_id })
      return db.insert<Tenant>('tenants', {
        ...row, id: newId(), property_id: t.property_id, created_at: now(),
        // The database fills in the company; Demo mode does it here
        ...(db.mode === 'demo' ? { company_id: p?.company_id, phone_key: row.phone.replace(/\D/g, '').slice(-10) } : {}),
      } as Tenant)
    },
    async houseProfile(houseId: string) {
      const [house] = await db.select<Property>('properties', { id: houseId })
      const [items, inspections, photos] = await Promise.all([
        db.select<PropertyItem>('property_items', { property_id: houseId }),
        db.select<Inspection>('inspections', { property_id: houseId }),
        db.select<PropertyPhoto>('property_photos', { property_id: houseId }),
      ])
      const urls = await db.fileUrls(photos.map((p) => p.path), 'house')
      return {
        house,
        items: items.sort((a, b) => a.room.localeCompare(b.room) || a.name.localeCompare(b.name)),
        inspections: inspections.filter((i) => i.done_at).sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? '')),
        photos: photos.map((p, i) => ({ ...p, url: urls[i] })),
      }
    },
  }
  return api
}

export type LandlordApi = ReturnType<typeof createLandlordApi>
