/**
 * The app's public Supabase address and public (anon) key, the same ones in
 * .env.production. Public by design: they only let logged-in people see their
 * own data. Used so simple server features work without extra Vercel settings.
 * If the Supabase project ever changes, update these too (or set
 * SUPABASE_URL and SUPABASE_ANON_KEY in Vercel, which win).
 */
export const PUBLIC_SUPABASE_URL = 'https://sgtcaufzwtmeclgvqncc.supabase.co'
export const PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_Royx9tUZ4k0BxJIUrgkzsw_ZilbGD5P'
