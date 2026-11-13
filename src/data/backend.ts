import { createApi } from './api'
import { createPublicApi } from './publicApi'
import { createDemo } from './demoBackend'
import { createSupabase } from './supabaseBackend'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Uses Supabase when its keys are set up, otherwise falls back to Demo mode. */
const { db, auth } = url && key ? createSupabase(url, key) : createDemo()

export const backend = createApi(db, auth)

/** For the public pages (request page, status and approval links): no login */
export const publicApi = createPublicApi(db)
