import { summarize } from './summary'
import type { AppUser, Backend, Job, Photo, PhotoKind, PunchItem } from './types'

/**
 * Demo mode: everything is saved in this browser only, so the app can be
 * tried before Supabase is set up. Jobs and items go in localStorage;
 * photos go in IndexedDB because they are too big for localStorage.
 */

const KEY = 'handyman-demo-v1'

interface DemoData {
  user: AppUser | null
  jobs: Job[]
  items: PunchItem[]
  photos: { id: string; item_id: string; kind: PhotoKind; created_at: string }[]
}

function load(): DemoData {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as DemoData
  } catch {
    // fall through to an empty store
  }
  return { user: null, jobs: [], items: [], photos: [] }
}

function save(data: DemoData) {
  localStorage.setItem(KEY, JSON.stringify(data))
}

function openPhotoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('handyman-demo-photos', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('photos')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function photoStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openPhotoDb()
  return new Promise((resolve, reject) => {
    const req = run(db.transaction('photos', mode).objectStore('photos'))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// Object URLs are reused so photos don't flicker on every refresh
const urlCache = new Map<string, string>()
async function photoUrl(id: string): Promise<string> {
  const cached = urlCache.get(id)
  if (cached) return cached
  const blob = await photoStore<Blob | undefined>('readonly', (s) => s.get(id))
  const url = blob ? URL.createObjectURL(blob) : ''
  urlCache.set(id, url)
  return url
}

function find<T extends { id: string }>(list: T[], id: string): T {
  const found = list.find((x) => x.id === id)
  if (!found) throw new Error('Not found — it may have been deleted.')
  return found
}

export function createDemoBackend(): Backend {
  const listeners = new Set<(user: AppUser | null) => void>()
  const notify = (user: AppUser | null) => listeners.forEach((l) => l(user))
  const now = () => new Date().toISOString()

  async function removeItemPhotos(data: DemoData, itemIds: string[]) {
    const doomed = data.photos.filter((p) => itemIds.includes(p.item_id))
    data.photos = data.photos.filter((p) => !itemIds.includes(p.item_id))
    for (const p of doomed) await photoStore('readwrite', (s) => s.delete(p.id))
  }

  return {
    mode: 'demo',

    async getUser() {
      return load().user
    },
    onAuthChange(callback) {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    async signIn(email) {
      const data = load()
      const name = email.split('@')[0] || 'there'
      data.user = { id: 'demo-user', email, name: name.charAt(0).toUpperCase() + name.slice(1) }
      save(data)
      notify(data.user)
    },
    async signOut() {
      const data = load()
      data.user = null
      save(data)
      notify(null)
    },
    async updateMyName(name) {
      const data = load()
      if (data.user) data.user.name = name
      save(data)
      notify(data.user)
    },

    async listJobs() {
      const data = load()
      return data.jobs.map((job) => summarize(job, data.items.filter((i) => i.job_id === job.id).map((i) => i.status)))
    },
    async getJob(id) {
      return find(load().jobs, id)
    },
    async createJob(input) {
      const data = load()
      const job: Job = { ...input, id: crypto.randomUUID(), created_at: now() }
      data.jobs.push(job)
      save(data)
      return job
    },
    async updateJob(id, input) {
      const data = load()
      const job = Object.assign(find(data.jobs, id), input)
      save(data)
      return job
    },
    async deleteJob(id) {
      const data = load()
      const itemIds = data.items.filter((i) => i.job_id === id).map((i) => i.id)
      await removeItemPhotos(data, itemIds)
      data.items = data.items.filter((i) => i.job_id !== id)
      data.jobs = data.jobs.filter((j) => j.id !== id)
      save(data)
    },

    async listItems(jobId) {
      return load()
        .items.filter((i) => i.job_id === jobId)
        .sort((a, b) => a.position - b.position)
    },
    async getItem(id) {
      return find(load().items, id)
    },
    async createItem(jobId, title, location) {
      const data = load()
      const siblings = data.items.filter((i) => i.job_id === jobId)
      const item: PunchItem = {
        id: crypto.randomUUID(),
        job_id: jobId,
        title,
        location,
        notes: '',
        status: 'todo',
        measurements: [],
        position: siblings.reduce((max, i) => Math.max(max, i.position), -1) + 1,
        created_at: now(),
      }
      data.items.push(item)
      save(data)
      return item
    },
    async updateItem(id, patch) {
      const data = load()
      const item = Object.assign(find(data.items, id), patch)
      save(data)
      return item
    },
    async deleteItem(id) {
      const data = load()
      await removeItemPhotos(data, [id])
      data.items = data.items.filter((i) => i.id !== id)
      save(data)
    },

    async listPhotos(itemId) {
      const rows = load().photos.filter((p) => p.item_id === itemId)
      return Promise.all(rows.map(async (p): Promise<Photo> => ({ ...p, url: await photoUrl(p.id) })))
    },
    async addPhoto(itemId, kind, image) {
      const data = load()
      const row = { id: crypto.randomUUID(), item_id: itemId, kind, created_at: now() }
      await photoStore('readwrite', (s) => s.put(image, row.id))
      data.photos.push(row)
      save(data)
      return { ...row, url: await photoUrl(row.id) }
    },
    async deletePhoto(photo) {
      const data = load()
      data.photos = data.photos.filter((p) => p.id !== photo.id)
      save(data)
      await photoStore('readwrite', (s) => s.delete(photo.id))
    },
  }
}
