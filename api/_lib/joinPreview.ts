import { createClient } from '@supabase/supabase-js'
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from './publicConfig.js'
import { env, origin, query, type Req, type Res } from './server.js'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function publicDb() {
  return createClient(
    env('SUPABASE_URL') || env('VITE_SUPABASE_URL') || PUBLIC_SUPABASE_URL,
    env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY') || PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

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
    const { data } = await publicDb().rpc('request_page', { slug })
    const page = data as { name?: string; plan?: { price: number | null } | null } | null
    company = page?.name ?? ''
    price = page?.plan?.price ?? null
  } catch {
    // still serve the page, with general wording
  }
  const free = !price
  const title = company ? `${company} · Maintenance plan for landlords` : 'Maintenance plan for landlords'
  const description = `Free sign-up. We handle the hassle with your tenants; you approve the work, your way and on your budget.${free ? '' : ` Plan: $${price}/month per house.`}`
  await servePage(req, res, { title, description, image: `${base}/og-join.jpg`, url: `${base}/l/${encodeURIComponent(slug)}` })
}

/** GET /b/<token>: the customer's live estimate or invoice, with a preview for WhatsApp, texts and email */
export async function billPreview(req: Req, res: Res) {
  const token = query(req, 'token').slice(0, 80)
  const base = origin(req)
  let title = 'Your bill'
  let description = 'See every line, discount and payment.'
  try {
    // peek: a preview robot reading the link doesn't count as the customer opening it
    const { data } = await publicDb().rpc('public_bill', { tok: token, peek: true })
    const b = data as { company?: { name?: string }; kind?: string; number?: number; total?: number; paid?: number } | null
    if (b) {
      const money = (n: number) => `$${Number(n).toFixed(2)}`
      const total = Number(b.total ?? 0)
      const due = Math.max(0, total - Number(b.paid ?? 0))
      title = `${b.kind === 'invoice' ? `Invoice #${b.number}` : 'Estimate'} from ${b.company?.name || 'your handyman'}`
      description =
        b.kind === 'invoice'
          ? due > 0
            ? `${money(due)} due. See every line, discount and payment.`
            : `Paid in full (${money(total)}). Thank you!`
          : `Estimated total ${money(total)}. See every line and discount.`
    }
  } catch {
    // general wording
  }
  await servePage(req, res, { title, description, image: `${base}/og-bill.jpg`, url: `${base}/b/${encodeURIComponent(token)}` })
}

/** The app's own page, with preview tags (title, text, picture) added for link previews */
async function servePage(req: Req, res: Res, o: { title: string; description: string; image: string; url: string }) {
  const base = origin(req)
  const tags = [
    `<meta name="description" content="${esc(o.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${esc(o.title)}" />`,
    `<meta property="og:description" content="${esc(o.description)}" />`,
    `<meta property="og:url" content="${esc(o.url)}" />`,
    `<meta property="og:image" content="${esc(o.image)}" />`,
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
    // The app page could not be read: a tiny page that still previews well and reloads the app
    html = `<!doctype html><html><head><meta charset="utf-8"><title></title></head><body><script>setTimeout(function(){location.reload()},1500)</script></body></html>`
  }
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(o.title)}</title>`).replace('</head>', `    ${tags}\n  </head>`)
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300')
  res.end(html)
}
