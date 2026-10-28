import { createClient, type User } from '@supabase/supabase-js'
import type { Auth, Db } from './db'
import type { AppUser } from './types'

const BUCKET = 'photos'

export function createSupabase(url: string, anonKey: string): { db: Db; auth: Auth } {
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

  const db: Db = {
    mode: 'supabase',
    async select(table, where = {}, options = {}) {
      let query = sb.from(table).select('*').match(where)
      if (options.isNull) query = query.is(options.isNull, null)
      return check(await query)
    },
    async insert(table, row) {
      return check(await sb.from(table).insert(row).select().single())
    },
    async update(table, id, patch) {
      return check(await sb.from(table).update(patch as never).eq('id', id).select().single())
    },
    async upsert(table, row) {
      return check(await sb.from(table).upsert(row).select().single())
    },
    async remove(table, where) {
      const { error } = await sb.from(table).delete().match(where)
      if (error) throw new Error(error.message)
    },

    async upload(path, file) {
      check(await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg' }))
    },
    async fileUrls(paths) {
      if (paths.length === 0) return []
      // Links stay valid for 6 hours; screens fetch fresh ones each time they open
      const signed = check(await sb.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 6))
      return paths.map((_, i) => signed[i]?.signedUrl ?? '')
    },
    async removeFiles(paths) {
      if (paths.length) await sb.storage.from(BUCKET).remove(paths)
    },
  }

  const auth: Auth = {
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
    async refresh() {
      const user = await auth.getUser()
      listeners.forEach((l) => l(user))
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message)
    },
    async signOut() {
      await sb.auth.signOut()
    },
  }

  return { db, auth }
}
