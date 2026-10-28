import { createClient, type User } from '@supabase/supabase-js'
import type { Auth, Db } from './db'
import type { AppUser, Role } from './types'

const BUCKET = 'photos'

/** Turn Supabase's English error messages into plainer ones */
function friendly(message: string): string {
  if (message === 'Invalid login credentials') return 'Wrong email or password.'
  if (message === 'Email not confirmed') return 'Please confirm your email first: open the link we emailed you.'
  if (/already registered/i.test(message)) return 'That email already has an account. Try logging in, or reset your password.'
  if (/rate limit/i.test(message)) return 'Too many emails were sent just now. Please wait a few minutes and try again.'
  if (/signups not allowed/i.test(message)) return 'Sign-up is switched off in Supabase. Ask the app\'s admin to turn on "Allow new users to sign up".'
  // The database turned the sign-up away (see check_signup_allowed in supabase/schema.sql)
  if (/database error saving new user|not been approved/i.test(message))
    return "This email hasn't been approved to sign up. Ask the app's admin, or your boss, to approve it first."
  if (/at least 6 characters/i.test(message)) return 'The password needs at least 6 characters.'
  return message
}

export function createSupabase(url: string, anonKey: string): { db: Db; auth: Auth } {
  // Read before Supabase tidies up the address: a reset-password link ends in "type=recovery"
  let openedFromResetLink = typeof window !== 'undefined' && window.location.hash.includes('type=recovery')
  const sb = createClient(url, anonKey)
  const listeners = new Set<(user: AppUser | null) => void>()
  const recoveryListeners = new Set<() => void>()

  async function toAppUser(user: User | null): Promise<AppUser | null> {
    if (!user) return null
    const [{ data }, { data: admin }] = await Promise.all([
      sb.from('profiles').select('full_name, company_id, role').eq('id', user.id).maybeSingle(),
      sb.from('app_admins').select('user_id').eq('user_id', user.id).maybeSingle(),
    ])
    const email = user.email ?? ''
    return {
      id: user.id,
      email,
      name: data?.full_name || email.split('@')[0],
      companyId: data?.company_id ?? user.id,
      role: (data?.role as Role) ?? 'owner',
      isAdmin: Boolean(admin),
    }
  }

  function check<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
    if (result.error) throw new Error(friendly(result.error.message))
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
      if (error) throw new Error(friendly(error.message))
    },
    async rpc<T>(fn: string, args: Record<string, unknown>) {
      const { data, error } = await sb.rpc(fn, args)
      if (error) throw new Error(friendly(error.message))
      return data as T
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
      const { data } = sb.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') recoveryListeners.forEach((l) => l())
        // Run outside the auth callback, as Supabase recommends
        setTimeout(() => void toAppUser(session?.user ?? null).then(callback), 0)
      })
      listeners.add(callback)
      return () => {
        listeners.delete(callback)
        data.subscription.unsubscribe()
      }
    },
    onPasswordRecovery(callback) {
      recoveryListeners.add(callback)
      // Supabase may have handled the link before anyone was listening
      if (openedFromResetLink) {
        openedFromResetLink = false
        setTimeout(callback, 0)
      }
      return () => recoveryListeners.delete(callback)
    },
    async refresh() {
      const user = await auth.getUser()
      listeners.forEach((l) => l(user))
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      if (error) throw new Error(friendly(error.message))
    },
    async signUp({ email, password, fullName, companyName }) {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          // The database uses these to set up the new company (see supabase/schema.sql)
          data: { full_name: fullName, company_name: companyName },
          emailRedirectTo: window.location.origin,
        },
      })
      if (error) throw new Error(friendly(error.message))
      // With email confirmation on, Supabase hides whether the email was already
      // registered: it returns a user with no identities and sends no email
      if (data.user && data.user.identities?.length === 0) {
        throw new Error('That email already has an account. Try logging in, or reset your password.')
      }
      return { needsConfirmation: !data.session }
    },
    async sendPasswordReset(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      if (error) throw new Error(friendly(error.message))
    },
    async updatePassword(password) {
      const { error } = await sb.auth.updateUser({ password })
      if (error) throw new Error(friendly(error.message))
    },
    async signOut() {
      await sb.auth.signOut()
    },
  }

  return { db, auth }
}
