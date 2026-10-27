import { createClient, type User } from '@supabase/supabase-js'
import { summarize } from './summary'
import type { AppUser, Backend, Job, JobInput, Photo, PunchItem } from './types'

const BUCKET = 'photos'

type PhotoRow = Omit<Photo, 'url'> & { storage_path: string }

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const sb = createClient(url, anonKey)
  const listeners = new Set<(user: AppUser | null) => void>()

  async function toAppUser(user: User | null): Promise<AppUser | null> {
    if (!user) return null
    const { data } = await sb.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    const email = user.email ?? ''
    return { id: user.id, email, name: data?.full_name || email.split('@')[0] }
  }

  function check<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
    if (result.error) throw new Error(result.error.message)
    if (result.data == null) throw new Error('Nothing came back from the server.')
    return result.data
  }

  /** For writes that don't send anything back (updates without select, deletes) */
  function ok(result: { error: { message: string } | null }) {
    if (result.error) throw new Error(result.error.message)
  }

  async function withUrls(rows: PhotoRow[]): Promise<Photo[]> {
    if (rows.length === 0) return []
    // Links stay valid for 6 hours; the app fetches fresh ones each time a screen opens
    const signed = check(await sb.storage.from(BUCKET).createSignedUrls(rows.map((r) => r.storage_path), 60 * 60 * 6))
    return rows.map(({ storage_path: _path, ...r }, i) => ({ ...r, url: signed[i]?.signedUrl ?? '' }))
  }

  return {
    mode: 'supabase',

    async getUser() {
      const { data } = await sb.auth.getSession()
      return toAppUser(data.session?.user ?? null)
    },
    onAuthChange(callback) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => {
        // Run outside the auth callback, as Supabase recommends
        setTimeout(() => void toAppUser(session?.user ?? null).then(callback), 0)
      })
      listeners.add(callback)
      return () => {
        listeners.delete(callback)
        data.subscription.unsubscribe()
      }
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message)
    },
    async signOut() {
      await sb.auth.signOut()
    },
    async updateMyName(name) {
      const { data } = await sb.auth.getUser()
      if (!data.user) throw new Error('Not logged in')
      ok(await sb.from('profiles').upsert({ id: data.user.id, full_name: name }))
      const updated = await toAppUser(data.user)
      listeners.forEach((l) => l(updated))
    },

    async listJobs() {
      const rows = check(await sb.from('jobs').select('*, punch_items(status)'))
      return rows.map(({ punch_items, ...job }) => summarize(job as Job, (punch_items ?? []).map((p: PunchItem) => p.status)))
    },
    async getJob(id) {
      return check(await sb.from('jobs').select('*').eq('id', id).single()) as Job
    },
    async createJob(input: JobInput) {
      return check(await sb.from('jobs').insert(input).select().single()) as Job
    },
    async updateJob(id, input) {
      return check(await sb.from('jobs').update(input).eq('id', id).select().single()) as Job
    },
    async deleteJob(id) {
      const items = check(await sb.from('punch_items').select('id').eq('job_id', id))
      const itemIds = items.map((i) => i.id)
      if (itemIds.length) {
        const photos = check(await sb.from('photos').select('storage_path').in('item_id', itemIds))
        if (photos.length) await sb.storage.from(BUCKET).remove(photos.map((p) => p.storage_path))
      }
      ok(await sb.from('jobs').delete().eq('id', id))
    },

    async listItems(jobId) {
      return check(
        await sb.from('punch_items').select('*').eq('job_id', jobId).order('position').order('created_at'),
      ) as PunchItem[]
    },
    async getItem(id) {
      return check(await sb.from('punch_items').select('*').eq('id', id).single()) as PunchItem
    },
    async createItem(jobId, title, location) {
      const last = check(
        await sb.from('punch_items').select('position').eq('job_id', jobId).order('position', { ascending: false }).limit(1),
      )
      const position = (last[0]?.position ?? -1) + 1
      return check(
        await sb.from('punch_items').insert({ job_id: jobId, title, location, position }).select().single(),
      ) as PunchItem
    },
    async updateItem(id, patch) {
      return check(await sb.from('punch_items').update(patch).eq('id', id).select().single()) as PunchItem
    },
    async deleteItem(id) {
      const photos = check(await sb.from('photos').select('storage_path').eq('item_id', id))
      if (photos.length) await sb.storage.from(BUCKET).remove(photos.map((p) => p.storage_path))
      ok(await sb.from('punch_items').delete().eq('id', id))
    },

    async listPhotos(itemId) {
      const rows = check(await sb.from('photos').select('*').eq('item_id', itemId).order('created_at'))
      return withUrls(rows as PhotoRow[])
    },
    async addPhoto(itemId, kind, image) {
      const path = `${itemId}/${crypto.randomUUID()}.jpg`
      check(await sb.storage.from(BUCKET).upload(path, image, { contentType: 'image/jpeg' }))
      const row = check(await sb.from('photos').insert({ item_id: itemId, kind, storage_path: path }).select().single())
      return (await withUrls([row as PhotoRow]))[0]
    },
    async deletePhoto(photo) {
      const row = check(await sb.from('photos').select('storage_path').eq('id', photo.id).single())
      await sb.storage.from(BUCKET).remove([row.storage_path])
      ok(await sb.from('photos').delete().eq('id', photo.id))
    },
  }
}
