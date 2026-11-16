import { createClient } from '@supabase/supabase-js'
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from './publicConfig.js'
import { env, origin, query, type Req, type Res } from './server.js'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * GET /l/<company> (landlord sign-up page). WhatsApp, texts and email read a
 * page's preview tags without running the app, so this serves the app's page
 * with a title, description and picture filled in for that business.
 */
export async function joinPreview(req: Req, res: Res) {
  const slug = query(req, 'slug').slice(0, 80)
  const base = origin(req)
  let company = ''
  let price: number | null = null
  try {
    const db = createClient(
      env('SUPABASE_URL') || env('VITE_SUPABASE_URL') || PUBLIC_SUPABASE_URL,
      env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY') || PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const { data } = await db.rpc('request_page', { slug })
    const page = data as { name?: string; plan?: { price: number | null } | null } | null
    company = page?.name ?? ''
    price = page?.plan?.price ?? null
  } catch {
    // still serve the page, with general wording
  }
  const free = !price
  const title = company ? `${company} · Maintenance plan for landlords` : 'Maintenance plan for landlords'
  const description = `${free ? 'Free to join. ' : `$${price}/month per house. `}One text and it's handled: repairs, turnovers and inspections for your rentals. Sign up in a minute.`
  const url = `${base}/l/${encodeURIComponent(slug)}`
  const tags = [
    `<meta name="description" content="${esc(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(company || 'Maintenance plan')}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${base}/og-join.jpg" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:type" content="image/jpeg" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].join('\n    ')
  let html = ''
  try {
    const r = await fetch(`${base}/index.html`, { signal: AbortSignal.timeout(5000) })
    html = await r.text()
  } catch {
    html = ''
  }
  if (!html.includes('</head>')) {
    // The app page could not be read: a tiny page that still previews well and opens the app
    html = `<!doctype html><html><head><meta charset="utf-8"><title></title></head><body><script>location.replace(${JSON.stringify(`${base}/?join=${encodeURIComponent(slug)}`)})</script></body></html>`
  }
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`).replace('</head>', `    ${tags}\n  </head>`)
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600')
  res.end(html)
}
