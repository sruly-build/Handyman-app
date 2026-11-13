import type { Auth, Db, LandlordSignUp, Table, Where } from './db'
import type { AppUser } from './types'

/**
 * Demo mode: everything is saved in this browser only, so the app can be
 * tried before Supabase is set up. Rows go in localStorage; photos go in
 * IndexedDB because they are too big for localStorage.
 */

const KEY = 'handyman-demo-v2'
const USER_KEY = 'handyman-demo-user'
const KIND_KEY = 'handyman-demo-kind'
const PENDING_KEY = 'handyman-demo-code'

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
    async updateWhere(table, where, patch) {
      const data = load()
      const row = (data[table] ?? []).find((r) => matches(r, where))
      if (!row) throw new Error('Not found.')
      Object.assign(row, patch)
      save(data)
      return row as never
    },
    async remove(table, where) {
      const data = load()
      data[table] = (data[table] ?? []).filter((r) => !matches(r, where))
      save(data)
    },

    async rpc() {
      throw new Error('Sharing and team invites need the real app with Supabase. They don\'t work in Demo mode.')
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
  const DEMO_USER = 'demo-user'
  const DEMO_COMPANY = 'demo-company'
  // Each demo landlord login gets its own id (from the email)
  const demoLandlordId = (email: string) => `demo-landlord-${email.trim().toLowerCase()}`

  async function currentUser(): Promise<AppUser | null> {
    const email = localStorage.getItem(USER_KEY)
    if (!email) return null
    if (localStorage.getItem(KIND_KEY) === 'landlord') {
      return { id: demoLandlordId(email), email, name: email.split('@')[0], companyId: '', role: 'landlord', isAdmin: false }
    }
    const [profile] = await db.select<{ full_name: string }>('profiles', { id: DEMO_USER })
    const fallback = email.split('@')[0] || 'there'
    return {
      id: DEMO_USER,
      email,
      name: profile?.full_name || fallback.charAt(0).toUpperCase() + fallback.slice(1),
      companyId: DEMO_COMPANY,
      role: 'owner',
      isAdmin: true,
    }
  }

  /** Demo mode has one person in one company; make sure both exist */
  async function ensureCompany(email: string, fullName?: string, companyName?: string) {
    const [company] = await db.select('companies', { id: DEMO_COMPANY })
    if (!company || companyName) {
      await db.upsert('companies', {
        id: DEMO_COMPANY,
        name: companyName || (company as { name?: string } | undefined)?.name || 'My company',
        email,
        phone: '',
        address: '',
      })
    }
    const [profile] = await db.select('profiles', { id: DEMO_USER })
    if (!profile || fullName) {
      await db.upsert('profiles', {
        id: DEMO_USER,
        full_name: fullName || (profile as { full_name?: string } | undefined)?.full_name || '',
        company_id: DEMO_COMPANY,
        role: 'owner',
      })
    }
  }

  const auth: Auth = {
    getUser: currentUser,
    onAuthChange(callback) {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    onPasswordRecovery() {
      // Demo mode has no emails, so there are no reset links
      return () => {}
    },
    async refresh() {
      const user = await currentUser()
      listeners.forEach((l) => l(user))
    },
    async signIn(email) {
      localStorage.removeItem(KIND_KEY)
      await ensureCompany(email)
      localStorage.setItem(USER_KEY, email)
      await auth.refresh()
    },
    async signUp({ email, fullName, companyName }) {
      await ensureCompany(email, fullName, companyName)
      localStorage.setItem(USER_KEY, email)
      await auth.refresh()
      return { needsConfirmation: false }
    },
    async sendPasswordReset() {
      throw new Error('Demo mode has no passwords: type any email and tap Log in.')
    },
    async updatePassword() {},
    async sendCode(email, landlord) {
      // Demo mode sends no emails: any 6-digit code works
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ email: email.trim().toLowerCase(), landlord: landlord ?? null }))
    },
    async verifyCode(email, code) {
      if (!/^\d{6}$/.test(code.replace(/\D/g, ''))) throw new Error('Type the 6-digit code (any 6 digits in Demo mode).')
      const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null') as { email: string; landlord: LandlordSignUp | null } | null
      const clean = email.trim().toLowerCase()
      const landlords = await db.select<{ id: string; email: string; user_id: string | null }>('landlords', { company_id: DEMO_COMPANY })
      const known = landlords.find((l) => l.email.toLowerCase() === clean)
      if (pending?.landlord || known) {
        if (known) await db.update('landlords', known.id, { user_id: demoLandlordId(clean) })
        else {
          await db.insert('landlords', {
            id: crypto.randomUUID(), company_id: DEMO_COMPANY, user_id: demoLandlordId(clean), client_id: null,
            name: pending!.landlord!.fullName, email: clean, phone: pending!.landlord!.phone, auto_approve_limit: null,
            notify_new_request: false, notify_done: false, stripe_customer_id: null,
            referral_code: crypto.randomUUID().replace(/-/g, '').slice(0, 8),
            referred_by: landlords.find((l) => (l as { referral_code?: string }).referral_code === pending!.landlord!.referral)?.id ?? null,
            referral_rewarded_at: null, created_at: new Date().toISOString(),
          })
        }
        localStorage.setItem(KIND_KEY, 'landlord')
      } else {
        await ensureCompany(clean)
        localStorage.removeItem(KIND_KEY)
      }
      sessionStorage.removeItem(PENDING_KEY)
      localStorage.setItem(USER_KEY, clean)
      await auth.refresh()
    },
    async accessToken() {
      return ''
    },
    async signOut() {
      localStorage.removeItem(USER_KEY)
      localStorage.removeItem(KIND_KEY)
      await auth.refresh()
    },
  }

  return { db, auth }
}
