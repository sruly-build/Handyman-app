import { createDemoBackend } from './demoBackend'
import { createSupabaseBackend } from './supabaseBackend'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Uses Supabase when its keys are set up, otherwise falls back to Demo mode. */
export const backend = url && key ? createSupabaseBackend(url, key) : createDemoBackend()
