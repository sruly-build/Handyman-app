import type { Auth, Db, SignUpInput } from './db'
import { summarize } from './summary'
import type {
  AppUser,
  BringCheck,
  Company,
  Invite,
  Invoice,
  InvoiceLine,
  ItemPatch,
  Job,
  JobInput,
  JobShare,
  Part,
  PartInput,
  PartStatus,
  Photo,
  PhotoKind,
  PhotoRow,
  Profile,
  PunchItem,
  Settings,
  SignupStatus,
  TimeEntry,
} from './types'

export const defaultSettings: Settings = {
  id: '',
  markup_percent: 20,
  first_hour_rate: null,
  hourly_rate: 75,
  markup_parts: true,
  markup_labour: true,
  labour_mode: 'task',
}

const now = () => new Date().toISOString()

// The database may send decimals back as text ("50.00"), so turn them into numbers
const num = (v: unknown) => (v == null || v === '' ? null : Number(v))
const fixItem = (i: PunchItem): PunchItem => ({ ...i, tools: i.tools ?? [], estimated_hours: num(i.estimated_hours) })
const fixPart = (p: Part): Part => ({ ...p, quantity: num(p.quantity) ?? 1, cost: num(p.cost) })
const fixInvoice = (i: Invoice): Invoice => ({
  ...i,
  parts_total: Number(i.parts_total),
  labour_total: Number(i.labour_total),
  total: Number(i.total),
  markup_percent: Number(i.markup_percent),
})
const newId = () => crypto.randomUUID()
const byPosition = (a: PunchItem, b: PunchItem) => a.position - b.position || a.created_at.localeCompare(b.created_at)

/** Is this job another company's, shared with us? (Old Demo jobs have no company: they're ours.) */
export const isPartnerJob = (job: Pick<Job, 'company_id'>, user: Pick<AppUser, 'companyId'>) =>
  job.company_id != null && job.company_id !== user.companyId

/** Everything the screens can do, built on the basic storage operations in db.ts */
export function createApi(db: Db, auth: Auth) {
  async function me(): Promise<AppUser> {
    const user = await auth.getUser()
    if (!user) throw new Error('Please log in again.')
    return user
  }

  async function companyNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)]
    const rows = await Promise.all(unique.map((id) => db.select<Company>('companies', { id })))
    return new Map(rows.flat().map((c) => [c.id, c.name]))
  }

  async function withUrls(rows: PhotoRow[]): Promise<Photo[]> {
    const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))
    const urls = await db.fileUrls(sorted.map((r) => r.storage_path))
    return sorted.map((r, i) => ({ ...r, url: urls[i] }))
  }

  async function removeItemsData(itemIds: string[]) {
    for (const item_id of itemIds) {
      const photos = await db.select<PhotoRow>('photos', { item_id })
      await db.removeFiles(photos.map((p) => p.storage_path))
      await db.remove('photos', { item_id })
      await db.remove('time_entries', { item_id })
    }
  }

  async function endEntries(entries: TimeEntry[]) {
    const ended_at = now()
    for (const e of entries) await db.update<TimeEntry>('time_entries', e.id, { ended_at })
  }

  const api = {
    mode: db.mode,

    // ---- Login and people ----
    getUser: auth.getUser,
    onAuthChange: auth.onAuthChange,
    onPasswordRecovery: auth.onPasswordRecovery,
    signIn: auth.signIn,
    signUp: (input: SignUpInput) => auth.signUp(input),
    sendPasswordReset: auth.sendPasswordReset,
    updatePassword: auth.updatePassword,
    signOut: auth.signOut,
    async updateMyName(name: string) {
      await db.update<Profile>('profiles', (await me()).id, { full_name: name })
      await auth.refresh()
    },
    /** The people in my company */
    async listPeople(): Promise<Profile[]> {
      const user = await me()
      const people = await db.select<Profile>('profiles', { company_id: user.companyId })
      return people.sort((a, b) => a.full_name.localeCompare(b.full_name))
    },

    // ---- Company (business profile) and team ----
    /** A company's business profile: mine if no id is given */
    async getCompany(id?: string | null): Promise<Company> {
      const companyId = id || (await me()).companyId
      const [company] = await db.select<Company>('companies', { id: companyId })
      return company ?? { id: companyId, name: '', email: '', phone: '', address: '' }
    },
    async saveCompany(patch: Omit<Company, 'id'>) {
      return db.update<Company>('companies', (await me()).companyId, patch)
    },
    async listInvites(): Promise<Invite[]> {
      return db.select<Invite>('company_invites', { company_id: (await me()).companyId })
    },
    /** Admin: emails approved to start a new company */
    async listApprovals(): Promise<Invite[]> {
      return db.select<Invite>('company_invites', {}, { isNull: 'company_id' })
    },
    async approveSignup(email: string) {
      await db.rpc('approve_signup', { approve_email: email.trim() })
    },
    /** Before signing up: may this email sign up, and how? */
    async signupStatus(email: string): Promise<SignupStatus> {
      if (db.mode === 'demo') return 'company'
      return db.rpc<SignupStatus>('signup_status', { check_email: email.trim() })
    },
    async inviteMember(email: string) {
      await db.rpc('invite_member', { invite_email: email.trim() })
    },
    async cancelInvite(email: string) {
      await db.remove('company_invites', { email })
    },

    // ---- Prices ----
    async getSettings(): Promise<Settings> {
      const id = (await me()).companyId
      const [row] = await db.select<Settings>('settings', { id })
      const s = { ...defaultSettings, ...row, id }
      return {
        ...s,
        markup_percent: Number(s.markup_percent),
        hourly_rate: Number(s.hourly_rate),
        first_hour_rate: num(s.first_hour_rate),
        markup_parts: s.markup_parts ?? true,
      }
    },
    async saveSettings(settings: Settings) {
      return db.upsert<Settings>('settings', { ...settings, id: (await me()).companyId })
    },

    // ---- Jobs ----
    async listJobs() {
      const user = await me()
      const [jobs, items, visits, shares] = await Promise.all([
        db.select<Job>('jobs'),
        db.select<PunchItem>('punch_items'),
        db.select<TimeEntry>('time_entries', { kind: 'visit' }, { isNull: 'ended_at' }),
        db.select<JobShare>('job_shares'),
      ])
      const partnerIds = [
        ...jobs.filter((j) => isPartnerJob(j, user)).map((j) => j.company_id!),
        ...shares.map((s) => s.company_id),
      ]
      const names = await companyNames(partnerIds)
      return jobs.map((job) => ({
        ...summarize(
          job,
          items.filter((i) => i.job_id === job.id).map((i) => i.status),
          visits.filter((v) => v.job_id === job.id).map((v) => v.user_id),
        ),
        from_company: isPartnerJob(job, user) ? (names.get(job.company_id!) ?? 'Another company') : null,
        shared_with: isPartnerJob(job, user)
          ? []
          : shares.filter((s) => s.job_id === job.id).map((s) => names.get(s.company_id) ?? 'Another company'),
      }))
    },
    async getJob(id: string) {
      const [job] = await db.select<Job>('jobs', { id })
      if (!job) throw new Error('This job was not found. It may have been deleted, or it is no longer shared with you.')
      return job
    },
    async createJob(input: JobInput) {
      const user = await me()
      return db.insert<Job>('jobs', {
        ...input,
        id: newId(),
        company_id: user.companyId,
        created_by: user.id,
        created_at: now(),
      })
    },
    async updateJob(id: string, patch: Partial<JobInput>) {
      return db.update<Job>('jobs', id, patch)
    },
    async deleteJob(id: string) {
      const items = await db.select<PunchItem>('punch_items', { job_id: id })
      await removeItemsData(items.map((i) => i.id))
      for (const table of ['parts', 'bring_checks', 'time_entries', 'invoices', 'job_shares', 'punch_items'] as const) {
        await db.remove(table, { job_id: id })
      }
      await db.remove('jobs', { id })
    },

    // ---- Sharing a job with another company (punch list and photos only) ----
    async listShares(jobId: string): Promise<JobShare[]> {
      const shares = await db.select<JobShare>('job_shares', { job_id: jobId })
      const names = await companyNames(shares.map((s) => s.company_id))
      return shares.map((s) => ({ ...s, company_name: names.get(s.company_id) ?? 'Another company' }))
    },
    /** Returns the other company's name */
    async shareJob(jobId: string, email: string): Promise<string> {
      return db.rpc<string>('share_job', { job: jobId, with_email: email.trim() })
    },
    /** Stop sharing (the job's company), or remove a shared job from my list (the other company) */
    async unshareJob(jobId: string, companyId: string) {
      await db.remove('job_shares', { job_id: jobId, company_id: companyId })
    },

    // ---- Punch list items ----
    async listItems(jobId: string) {
      return (await db.select<PunchItem>('punch_items', { job_id: jobId })).map(fixItem).sort(byPosition)
    },
    async listAllItems() {
      return (await db.select<PunchItem>('punch_items')).map(fixItem)
    },
    async getItem(id: string) {
      const [item] = await db.select<PunchItem>('punch_items', { id })
      if (!item) throw new Error('This item was not found. It may have been deleted.')
      return fixItem(item)
    },
    async createItem(jobId: string, title: string, location: string) {
      const siblings = await db.select<PunchItem>('punch_items', { job_id: jobId })
      return db.insert<PunchItem>('punch_items', {
        id: newId(),
        job_id: jobId,
        title,
        location,
        notes: '',
        status: 'todo',
        measurements: [],
        tools: [],
        estimated_hours: null,
        position: siblings.reduce((max, i) => Math.max(max, i.position), -1) + 1,
        created_at: now(),
      })
    },
    async updateItem(id: string, patch: ItemPatch) {
      return fixItem(await db.update<PunchItem>('punch_items', id, patch))
    },
    async deleteItem(id: string) {
      await removeItemsData([id])
      // Parts stay on the job as "other parts" so money paid isn't lost
      for (const part of await db.select<Part>('parts', { item_id: id })) {
        await db.update<Part>('parts', part.id, { item_id: null })
      }
      await db.remove('punch_items', { id })
    },

    // ---- Photos and sketches ----
    async listPhotos(itemId: string) {
      return withUrls(await db.select<PhotoRow>('photos', { item_id: itemId }))
    },
    async listJobPhotos(jobId: string) {
      const items = await db.select<PunchItem>('punch_items', { job_id: jobId })
      const rows = (await Promise.all(items.map((i) => db.select<PhotoRow>('photos', { item_id: i.id })))).flat()
      return withUrls(rows)
    },
    async addPhoto(itemId: string, kind: PhotoKind, image: Blob) {
      const ext = image.type === 'image/png' ? 'png' : 'jpg'
      const row: PhotoRow = {
        id: newId(),
        item_id: itemId,
        kind,
        storage_path: `${itemId}/${newId()}.${ext}`,
        created_at: now(),
      }
      await db.upload(row.storage_path, image)
      await db.insert<PhotoRow>('photos', row)
      return (await withUrls([row]))[0]
    },
    async deletePhoto(photo: Photo) {
      await db.removeFiles([photo.storage_path])
      await db.remove('photos', { id: photo.id })
    },

    // ---- Parts and orders ----
    async listParts(jobId?: string) {
      const parts = await db.select<Part>('parts', jobId ? { job_id: jobId } : {})
      return parts.map(fixPart).sort((a, b) => a.created_at.localeCompare(b.created_at))
    },
    async getPart(id: string) {
      const [part] = await db.select<Part>('parts', { id })
      if (!part) throw new Error('This part was not found. It may have been deleted.')
      return fixPart(part)
    },
    async createPart(input: PartInput) {
      const stamp = now()
      return db.insert<Part>('parts', {
        ...input,
        id: newId(),
        created_at: stamp,
        ordered_at: input.status === 'needed' ? null : stamp,
        received_at: input.status === 'received' ? stamp : null,
      })
    },
    async updatePart(part: Part, patch: Partial<PartInput>) {
      const status: PartStatus = patch.status ?? part.status
      const stamp = now()
      return db.update<Part>('parts', part.id, {
        ...patch,
        ordered_at: status === 'needed' ? null : (part.ordered_at ?? stamp),
        received_at: status === 'received' ? (part.received_at ?? stamp) : null,
      })
    },
    async deletePart(id: string) {
      await db.remove('parts', { id })
    },

    // ---- Bring list ----
    async listAllBringChecks() {
      return db.select<BringCheck>('bring_checks')
    },
    async listBringChecks(jobId: string) {
      return db.select<BringCheck>('bring_checks', { job_id: jobId })
    },
    async setBringCheck(jobId: string, key: string, checked: boolean) {
      const id = `${jobId}:${key}`
      if (checked) await db.upsert<BringCheck>('bring_checks', { id, job_id: jobId, key })
      else await db.remove('bring_checks', { id })
    },

    // ---- Time tracking ----
    async listTime(jobId: string) {
      const entries = await db.select<TimeEntry>('time_entries', { job_id: jobId })
      return entries.sort((a, b) => a.started_at.localeCompare(b.started_at))
    },
    async listMyTime() {
      return db.select<TimeEntry>('time_entries', { user_id: (await me()).id })
    },
    /** My timers that are still running (any job) */
    async myRunning() {
      return db.select<TimeEntry>('time_entries', { user_id: (await me()).id }, { isNull: 'ended_at' })
    },
    /** "Arrived" */
    async clockIn(jobId: string) {
      const user_id = (await me()).id
      const running = await db.select<TimeEntry>('time_entries', { user_id, kind: 'visit' }, { isNull: 'ended_at' })
      // You can only be at one job at a time
      await endEntries(running)
      return db.insert<TimeEntry>('time_entries', {
        id: newId(),
        job_id: jobId,
        item_id: null,
        user_id,
        kind: 'visit',
        started_at: now(),
        ended_at: null,
      })
    },
    /** "Finished": also stops any task timer still running */
    async clockOut(jobId: string) {
      const running = await db.select<TimeEntry>('time_entries', { user_id: (await me()).id, job_id: jobId }, { isNull: 'ended_at' })
      await endEntries(running)
    },
    async startTask(jobId: string, itemId: string) {
      const user_id = (await me()).id
      const running = await db.select<TimeEntry>('time_entries', { user_id }, { isNull: 'ended_at' })
      // One task at a time: starting this one stops any other
      await endEntries(running.filter((e) => e.kind === 'task'))
      // Starting a task means you've arrived, if you forgot to tap Arrived
      if (!running.some((e) => e.kind === 'visit' && e.job_id === jobId)) await api.clockIn(jobId)
      return db.insert<TimeEntry>('time_entries', {
        id: newId(),
        job_id: jobId,
        item_id: itemId,
        user_id,
        kind: 'task',
        started_at: now(),
        ended_at: null,
      })
    },
    async stopTask(itemId: string) {
      const running = await db.select<TimeEntry>('time_entries', { user_id: (await me()).id, item_id: itemId }, { isNull: 'ended_at' })
      await endEntries(running)
    },
    async deleteTimeEntry(id: string) {
      await db.remove('time_entries', { id })
    },

    // ---- Invoices ----
    async getInvoice(jobId: string): Promise<Invoice | null> {
      const [invoice] = await db.select<Invoice>('invoices', { job_id: jobId })
      return invoice ? fixInvoice(invoice) : null
    },
    async createInvoice(
      jobId: string,
      totals: { lines: InvoiceLine[]; parts_total: number; labour_total: number; total: number; markup_percent: number },
    ) {
      const all = await db.select<Invoice>('invoices')
      const number = all.reduce((max, i) => Math.max(max, Number(i.number)), 1000) + 1
      return db.insert<Invoice>('invoices', {
        ...totals,
        id: newId(),
        job_id: jobId,
        number,
        status: 'unpaid',
        created_at: now(),
        paid_at: null,
      })
    },
    async setInvoicePaid(id: string, paid: boolean) {
      return db.update<Invoice>('invoices', id, { status: paid ? 'paid' : 'unpaid', paid_at: paid ? now() : null })
    },
    async deleteInvoice(id: string) {
      await db.remove('invoices', { id })
    },
  }
  return api
}

export type Api = ReturnType<typeof createApi>
