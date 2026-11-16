import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { HttpError, jsonBody, send, signedIn, type Req, type Res } from './server.js'

/**
 * A store link pasted on a part: read the page's name, price, store and
 * picture so the part fills itself in. Only for logged-in people, only public
 * web addresses (never the server's own network), small and quick.
 */

const MAX_PAGE = 1_500_000
const MAX_IMAGE = 4_000_000
const BROWSER =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase()
    if (v === '::1' || v === '::') return true
    if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    return mapped ? privateAddress(mapped[1]) : false
  }
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
  )
}

export async function checkUrl(raw: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new HttpError(400, 'That does not look like a web link.')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new HttpError(400, 'Only web links (https://…) work here.')
  if (url.username || url.password || (url.port && url.port !== '80' && url.port !== '443'))
    throw new HttpError(400, 'That link cannot be read.')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => [])
  if (!addresses.length) throw new HttpError(400, 'That website could not be found.')
  if (addresses.some((a) => privateAddress(a.address))) throw new HttpError(400, 'That link cannot be read.')
  return url
}

/** Fetch a public address (following a few redirects, each checked), reading at most `max` bytes */
async function fetchPublic(raw: string, max: number, accept: string) {
  let url = await checkUrl(raw)
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': BROWSER, Accept: accept, 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = await checkUrl(new URL(res.headers.get('location')!, url).toString())
      continue
    }
    if ([401, 403, 405, 429, 503].includes(res.status))
      throw new HttpError(423, 'This store blocks apps from reading its pages. The link is still saved; add a photo or screenshot yourself.')
    if (!res.ok || !res.body) throw new HttpError(422, `The store's page did not open (${res.status}). The link is still saved.`)
    const chunks: Uint8Array[] = []
    let size = 0
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      size += value.length
      if (size > max) {
        await reader.cancel()
        break
      }
    }
    return { url, type: res.headers.get('content-type') ?? '', body: Buffer.concat(chunks).subarray(0, max) }
  }
  throw new HttpError(422, 'That link redirects too many times.')
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()

/** Pull the useful bits out of a product page's HTML (exported for tests) */
export function readPage(html: string) {
  const metas = new Map<string, string>()
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase()
    const content = tag.match(/\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i)
    if (key && content && !metas.has(key)) metas.set(key, decode(content[1] ?? content[2] ?? ''))
  }
  const meta = (...keys: string[]) => keys.map((k) => metas.get(k)).find(Boolean) ?? ''
  // Product data many stores put in the page for search engines
  let ldName = ''
  let ldImage = ''
  let ldPrice = ''
  for (const block of html.match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) ?? []) {
    try {
      const json = JSON.parse(block.replace(/^<script[^>]*>|<\/script>$/gi, ''))
      const all: unknown[] = Array.isArray(json) ? json : json['@graph'] ?? [json]
      for (const node of all as Record<string, unknown>[]) {
        const type = node?.['@type']
        if (!(type === 'Product' || (Array.isArray(type) && type.includes('Product')))) continue
        ldName ||= String(node.name ?? '')
        const img = node.image as unknown
        ldImage ||= String((Array.isArray(img) ? img[0] : img && typeof img === 'object' ? (img as { url?: string }).url : img) ?? '')
        const offers = node.offers as Record<string, unknown> | Record<string, unknown>[] | undefined
        const offer = Array.isArray(offers) ? offers[0] : offers
        ldPrice ||= String(offer?.price ?? offer?.lowPrice ?? '')
      }
    } catch {
      // not valid JSON: skip
    }
  }
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
  const priceText = meta('product:price:amount', 'og:price:amount', 'price') || ldPrice
  const price = parseFloat(priceText.replace(/[^0-9.]/g, ''))
  return {
    title: decode(ldName) || meta('og:title', 'twitter:title') || title,
    image: ldImage || meta('og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src', 'image'),
    price: Number.isFinite(price) && price > 0 ? price : null,
    site: meta('og:site_name', 'application-name'),
  }
}

/** POST /api/link-preview { url } → { title, price, site, image (a data: picture or null) } */
export async function linkPreview(req: Req, res: Res) {
  await signedIn(req)
  const { url } = await jsonBody<{ url?: string }>(req)
  if (!url || url.length > 2000) throw new HttpError(400, 'Paste a link first.')
  let page: Awaited<ReturnType<typeof fetchPublic>>
  try {
    page = await fetchPublic(url.trim(), MAX_PAGE, 'text/html,application/xhtml+xml')
  } catch (e) {
    // The store blocked us: ask a link-preview service the store already lets in
    if (!(e instanceof HttpError && e.status === 423)) throw e
    const viaService = await previewService(url.trim())
    if (!viaService) throw new HttpError(422, e.message)
    return send(res, 200, viaService)
  }
  if (!/html/i.test(page.type)) throw new HttpError(422, 'That link is not a web page.')
  const info = readPage(page.body.toString('utf8'))
  let image: string | null = null
  if (info.image) {
    try {
      const pic = await fetchPublic(new URL(info.image, page.url).toString(), MAX_IMAGE, 'image/*')
      const type = pic.type.split(';')[0].trim()
      if (/^image\/(jpeg|png|webp|gif|avif)$/i.test(type) && pic.body.length < MAX_IMAGE)
        image = `data:${type};base64,${pic.body.toString('base64')}`
    } catch {
      // no picture: the rest still helps
    }
  }
  const site = info.site || page.url.hostname.replace(/^www\./, '')
  send(res, 200, { title: info.title.slice(0, 200), price: info.price, site: site.slice(0, 80), image })
}

/**
 * Microlink (microlink.io): a link-preview service, like the ones WhatsApp and
 * email use, that stores such as Amazon let read their pages. Its free plan
 * needs no account (about 50 links a day; over that it just says no, it never
 * charges). It only sees the link being read.
 */
async function previewService(link: string) {
  try {
    const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(link)}`, {
      signal: AbortSignal.timeout(12000),
      headers: { Accept: 'application/json' },
    })
    const body = (await res.json()) as {
      status?: string
      data?: { title?: string; publisher?: string; image?: { url?: string } | null; logo?: { url?: string } | null }
    }
    if (body.status !== 'success' || !body.data) return null
    const d = body.data
    const imageUrl = d.image?.url ?? null
    let image: string | null = null
    if (imageUrl) {
      try {
        const pic = await fetchPublic(imageUrl, MAX_IMAGE, 'image/*')
        const type = pic.type.split(';')[0].trim()
        if (/^image\/(jpeg|png|webp|gif|avif)$/i.test(type) && pic.body.length < MAX_IMAGE)
          image = `data:${type};base64,${pic.body.toString('base64')}`
      } catch {
        // show it from its own address instead
      }
    }
    const title = (d.title ?? '').replace(/^Amazon\.com\s*:\s*/i, '').trim()
    if (!title && !imageUrl) return null
    return { title: title.slice(0, 200), price: null, site: (d.publisher ?? '').slice(0, 80), image, imageUrl: image ? null : imageUrl }
  } catch {
    return null
  }
}
