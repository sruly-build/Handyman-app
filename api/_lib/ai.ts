import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { env, HttpError } from './server.js'

/**
 * AI helpers (Claude). Nothing here runs until ANTHROPIC_API_KEY is set in
 * Vercel's settings; without it the app falls back to simple rules.
 */
export const aiReady = () => Boolean(env('ANTHROPIC_API_KEY'))
const MODEL = 'claude-opus-5-5'

function client() {
  if (!aiReady()) throw new HttpError(503, 'AI is not set up yet (ANTHROPIC_API_KEY).')
  return new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') })
}

const QUICK_PICKS = 'unclog (clogged sink/tub/shower), igniter (stove/oven won\'t light), filter (HVAC filter), door (door knob or lock), cabinet (cabinet or drawer), faucet (leaking faucet or small plumbing), small (other small repair), other (anything else)'

const TextVerdict = z.object({
  is_request: z.boolean(),
  reason: z.string(),
  language: z.string(),
  english: z.string(),
  issues: z.array(z.object({ key: z.string(), label: z.string(), text: z.string() })),
  address: z.string().nullable(),
  unit: z.string().nullable(),
  urgency: z.enum(['emergency', 'soon', 'whenever']),
  name: z.string().nullable(),
})
export type TextVerdict = z.infer<typeof TextVerdict>

async function ask<T extends z.ZodType>(schema: T, system: string, content: Anthropic.ContentBlockParam[]): Promise<z.infer<T> | null> {
  const response = await client().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system,
    messages: [{ role: 'user', content }],
    output_config: { format: zodOutputFormat(schema), effort: 'low' },
  })
  // A declined or unreadable answer: the caller falls back to simple rules
  if (response.stop_reason === 'refusal') return null
  return (response.parsed_output as z.infer<T> | null) ?? null
}

/** Is this text message a repair request? If so: the issues, address, unit and urgency, in English */
export async function sortText(body: string, photoCount: number): Promise<TextVerdict | null> {
  return ask(
    TextVerdict,
    `You sort text messages sent to a small handyman business in New Jersey that maintains rental houses.
Decide if the message is a new repair request. Not requests: thanks, "running late", "ok", scheduling replies, payments, spam, questions with no repair.
For requests, write "english" as a faithful English translation of the whole message (or the message itself if already English).
Split the problem into issues; give each a key from: ${QUICK_PICKS}. "label" is a short English name; "text" is the detail in English.
"address" only if the message states a street address (keep it as written); "unit" if it names an apartment/unit (e.g. "Apartment B", "basement").
"urgency": emergency only for active water leaks, no heat in cold weather, no power, gas smell or anything unsafe; "soon" for normal problems; "whenever" if they say it can wait.
"language" is the ISO code of the message language (e.g. "en", "he"). "name" if they sign their name. "reason" is one short sentence.`,
    [{ type: 'text', text: `Message (${photoCount} photo${photoCount === 1 ? '' : 's'} attached):\n\n${body}` }],
  )
}

/** A tenant's words, translated to English (the original is kept separately) */
export async function toEnglish(texts: string[]): Promise<string[] | null> {
  const out = await ask(
    z.object({ english: z.array(z.string()) }),
    'Translate each text into natural English for a handyman. Keep the same number of items, in the same order. Keep numbers, names and addresses as written.',
    [{ type: 'text', text: JSON.stringify(texts) }],
  )
  return out && out.english.length === texts.length ? out.english : null
}

/** Brand, model and serial from a photo of an appliance's rating sticker */
export async function readSticker(image: string, mediaType: string) {
  return ask(
    z.object({ brand: z.string(), model: z.string(), serial: z.string(), kind: z.string() }),
    'Read the appliance rating/model sticker in the photo. Return the brand, the model number and the serial number exactly as printed (empty string if not readable), and "kind": what the appliance is in 1-3 words (e.g. "Gas range"). Never guess characters you cannot read.',
    [
      { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg', data: image } },
      { type: 'text', text: 'Read this sticker.' },
    ],
  )
}

/** A punch list (pasted text and/or a screenshot of one) as separate items */
export async function readList(text: string, images: { data: string; mediaType: string }[]) {
  const out = await ask(
    z.object({ items: z.array(z.object({ title: z.string(), location: z.string() })) }),
    'Turn this punch list into separate repair items for a handyman, in English. "title" is the task (short, starts with a verb when natural), "location" is the room or unit if stated, else empty. Skip headings, prices and anything that is not a task.',
    [
      ...images.map((i) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.mediaType as 'image/jpeg', data: i.data } })),
      { type: 'text', text: text || '(see the screenshot)' },
    ],
  )
  return out?.items ?? null
}
