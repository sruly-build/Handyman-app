import type { Auth, Db } from './db'
import { summarize } from './summary'
import type {
  BringCheck,
  Invoice,
  InvoiceLine,
  ItemPatch,
  Job,
  JobInput,
  Part,
  PartInput,
  PartStatus,
  Photo,
  PhotoKind,
  PhotoRow,
  Profile,
  PunchItem,
  Settings,
  TimeEntry,
} from './types'

export const defaultSettings: Settings = {
  id: 'main',
  business_name: '',
  business_phone: '',
  business_email: '',
  business_address: '',
  markup_percent: 20,
  hourly_rate: 75,
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

/** Everything the screens can do, built on the basic storage operations in db.ts */
export function createApi(db: Db, auth: Auth) {
  async function me(): Promise<string> {
    const user = await auth.getUser()
    if (!user) throw new Error('Please log in again.')
    return user.id
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
    signIn: auth.signIn,
    signOut: auth.signOut,
    async updateMyName(name: string) {
      await db.upsert<Profile>('profiles', { id: await me(), full_name: name })
      await auth.refresh()
    },
    async listPeople(): Promise<Profile[]> {
      const people = await db.select<Profile>('profiles')
      const user = await auth.getUser()
      // Demo mode has no profile row until the name is changed
      if (user && !people.some((p) => p.id === user.id)) people.push({ id: user.id, full_name: user.name })
      return people.sort((a, b) => a.full_name.localeCompare(b.full_name))
    },

    // ---- Settings ----
    async getSettings(): Promise<Settings> {
      const [row] = await db.select<Settings>('settings', { id: 'main' })
      const s = { ...defaultSettings, ...row }
      return { ...s, markup_percent: Number(s.markup_percent), hourly_rate: Number(s.hourly_rate) }
    },
    async saveSettings(settings: Settings) {
      return db.upsert<Settings>('settings', settings)
    },

    // ---- Jobs ----
    async listJobs() {
      const [jobs, items, visits] = await Promise.all([
        db.select<Job>('jobs'),
        db.select<PunchItem>('punch_items'),
        db.select<TimeEntry>('time_entries', { kind: 'visit' }, { isNull: 'ended_at' }),
      ])
      return jobs.map((job) =>
        summarize(
          job,
          items.filter((i) => i.job_id === job.id).map((i) => i.status),
          visits.filter((v) => v.job_id === job.id).map((v) => v.user_id),
        ),
      )
    },
    async getJob(id: string) {
      const [job] = await db.select<Job>('jobs', { id })
      if (!job) throw new Error('This job was not found. It may have been deleted.')
      return job
    },
    async createJob(input: JobInput) {
      return db.insert<Job>('jobs', { ...input, id: newId(), created_at: now() })
    },
    async updateJob(id: string, patch: Partial<JobInput>) {
      return db.update<Job>('jobs', id, patch)
    },
    async deleteJob(id: string) {
      const items = await db.select<PunchItem>('punch_items', { job_id: id })
      await removeItemsData(items.map((i) => i.id))
      for (const table of ['parts', 'bring_checks', 'time_entries', 'invoices', 'punch_items'] as const) {
        await db.remove(table, { job_id: id })
      }
      await db.remove('jobs', { id })
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
      return db.select<TimeEntry>('time_entries', { user_id: await me() })
    },
    /** My timers that are still running (any job) */
    async myRunning() {
      return db.select<TimeEntry>('time_entries', { user_id: await me() }, { isNull: 'ended_at' })
    },
    /** "Arrived" */
    async clockIn(jobId: string) {
      const user_id = await me()
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
      const running = await db.select<TimeEntry>('time_entries', { user_id: await me(), job_id: jobId }, { isNull: 'ended_at' })
      await endEntries(running)
    },
    async startTask(jobId: string, itemId: string) {
      const user_id = await me()
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
      const running = await db.select<TimeEntry>('time_entries', { user_id: await me(), item_id: itemId }, { isNull: 'ended_at' })
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
