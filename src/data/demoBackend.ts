import type { Auth, Db, Table, Where } from './db'
import type { AppUser } from './types'

/**
 * Demo mode: everything is saved in this browser only, so the app can be
 * tried before Supabase is set up. Rows go in localStorage; photos go in
 * IndexedDB because they are too big for localStorage.
 */

const KEY = 'handyman-demo-v2'
const USER_KEY = 'handyman-demo-user'

type Row = { id: string } & Record<string, unknown>
type Tables = Partial<Record<Table, Row[]>>

function load(): Tables {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Tables
  } catch {
    // fall through to an empty store
  }
  return {}
}

function save(data: Tables) {
  localStorage.setItem(KEY, JSON.stringify(data))
}

const matches = (row: Row, where: Where) => Object.entries(where).every(([k, v]) => row[k] === v)

function openFileDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('handyman-demo-files', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('files')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function fileStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const idb = await openFileDb()
  return new Promise((resolve, reject) => {
    const req = run(idb.transaction('files', mode).objectStore('files'))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// Object URLs are reused so photos don't flicker on every refresh
const urlCache = new Map<string, string>()

export function createDemo(): { db: Db; auth: Auth } {
  const db: Db = {
    mode: 'demo',
    async select<T>(table: Table, where: Where = {}, options: { isNull?: string } = {}) {
      const rows = (load()[table] ?? []).filter(
        (r) => matches(r, where) && (!options.isNull || r[options.isNull] == null),
      )
      return rows as T[]
    },
    async insert(table, row) {
      const data = load()
      data[table] = [...(data[table] ?? []), row as unknown as Row]
      save(data)
      return row
    },
    async update<T>(table: Table, id: string, patch: Partial<T>) {
      const data = load()
      const row = (data[table] ?? []).find((r) => r.id === id)
      if (!row) throw new Error('Not found. It may have been deleted.')
      Object.assign(row, patch)
      save(data)
      return row as T
    },
    async upsert(table, row) {
      const data = load()
      const rows = data[table] ?? []
      const existing = rows.find((r) => r.id === row.id)
      if (existing) Object.assign(existing, row)
      else rows.push(row as unknown as Row)
      data[table] = rows
      save(data)
      return (existing ?? row) as typeof row
    },
    async remove(table, where) {
      const data = load()
      data[table] = (data[table] ?? []).filter((r) => !matches(r, where))
      save(data)
    },

    async upload(path, file) {
      await fileStore('readwrite', (s) => s.put(file, path))
    },
    async fileUrls(paths) {
      return Promise.all(
        paths.map(async (path) => {
          const cached = urlCache.get(path)
          if (cached) return cached
          const blob = await fileStore<Blob | undefined>('readonly', (s) => s.get(path))
          const url = blob ? URL.createObjectURL(blob) : ''
          urlCache.set(path, url)
          return url
        }),
      )
    },
    async removeFiles(paths) {
      for (const path of paths) await fileStore('readwrite', (s) => s.delete(path))
    },
  }

  const listeners = new Set<(user: AppUser | null) => void>()

  async function currentUser(): Promise<AppUser | null> {
    const email = localStorage.getItem(USER_KEY)
    if (!email) return null
    const [profile] = await db.select<{ full_name: string }>('profiles', { id: 'demo-user' })
    const fallback = email.split('@')[0] || 'there'
    return {
      id: 'demo-user',
      email,
      name: profile?.full_name || fallback.charAt(0).toUpperCase() + fallback.slice(1),
    }
  }

  const auth: Auth = {
    getUser: currentUser,
    onAuthChange(callback) {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    async refresh() {
      const user = await currentUser()
      listeners.forEach((l) => l(user))
    },
    async signIn(email) {
      localStorage.setItem(USER_KEY, email)
      await auth.refresh()
    },
    async signOut() {
      localStorage.removeItem(USER_KEY)
      await auth.refresh()
    },
  }

  return { db, auth }
}
