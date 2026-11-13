import type { Db } from './db'
import { cleanSlug, defaultServiceSettings } from './requests'
import type { AppUser, ServiceSettings } from './types'

const now = () => new Date().toISOString()

/**
 * Request Inbox & Landlord Maintenance Plan: what the owner's screens can do.
 * (Merged into the main api in api.ts.)
 */
export function createRequestsApi(db: Db, me: () => Promise<AppUser>) {
  return {
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
  }
}

export type RequestsApi = ReturnType<typeof createRequestsApi>
