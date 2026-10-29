import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { HttpError, env } from './http.js'

const MODEL = 'claude-opus-5-5'

let client: Anthropic | null = null
function ai(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') })
  return client
}

// If a safety classifier declines a request, the API retries it on the recommended fallback model.
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }

async function structured<T extends z.ZodType>(
  schema: T,
  system: string,
  prompt: string,
  effort: 'low' | 'medium',
): Promise<z.infer<T>> {
  try {
    const res = await ai().beta.messages.parse({
      ...FALLBACK,
      model: MODEL,
      max_tokens: 16000,
      system,
      output_config: { effort, format: betaZodOutputFormat(schema) },
      messages: [{ role: 'user', content: prompt }],
    })
    if (res.stop_reason === 'refusal' || !res.parsed_output) throw new HttpError(422, 'The AI could not write this one. Try writing it yourself.')
    return res.parsed_output as z.infer<T>
  } catch (e) {
    if (e instanceof HttpError) throw e
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, 'The AI is busy. Try again in a minute.')
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(503, 'The AI key on the server is not valid.')
    if (e instanceof Anthropic.APIError) throw new HttpError(502, 'The AI is not available right now.')
    throw e
  }
}

export interface Studio {
  owner: string
  business: string
  signature?: string
}

const STUDIO_CONTEXT = (s: Studio) =>
  `You work for ${s.business || 'a product photography studio'}, run by ${s.owner || 'the owner'}. ` +
  'The studio photographs products like tableware (plates, bowls, salad bowls) for brands: product on white, styled lifestyle shots, hero images.'

export interface IncomingEmail {
  id: string
  from: string
  fromEmail: string
  subject: string
  body: string
}

const Triage = z.object({
  emails: z.array(
    z.object({
      id: z.string(),
      important: z.boolean().describe('False for newsletters, promotions, receipts, automated notifications and spam'),
      isLead: z.boolean().describe('True if a new potential client is asking about a shoot, pricing or availability'),
      summary: z.string().describe('One short line, under 110 characters, saying what the sender wants'),
    }),
  ),
})

/** Decides which emails matter, which are new leads, and writes a one-line summary of each. */
export async function triage(studio: Studio, emails: IncomingEmail[], knownClients: string[]): Promise<z.infer<typeof Triage>['emails']> {
  if (!emails.length) return []
  const list = emails
    .map((e) => `<email id="${e.id}">\nFrom: ${e.from} <${e.fromEmail}>\nSubject: ${e.subject}\n\n${e.body.slice(0, 2500)}\n</email>`)
    .join('\n\n')
  const out = await structured(
    Triage,
    `${STUDIO_CONTEXT(studio)} You sort the studio's inbox. Existing clients' addresses: ${knownClients.join(', ') || 'none yet'}. ` +
      'An email from an existing client is never a lead. Return one entry for every email, using its id.',
    list,
    'low',
  )
  return out.emails
}

const Draft = z.object({ draft: z.string() })

export async function replyDraft(studio: Studio, email: IncomingEmail, style: number): Promise<string> {
  const tone = ['warm and friendly', 'short and to the point', 'professional'][style % 3]
  const out = await structured(
    Draft,
    `${STUDIO_CONTEXT(studio)} Write email replies in the owner's voice: plain text, ${tone}, no subject line, ` +
      `signed "${studio.signature || studio.owner}". Where a fact you don't know is needed (a price, a date), write a placeholder like [DATE] instead of inventing it.`,
    `Write a reply to this email.\n\nFrom: ${email.from} <${email.fromEmail}>\nSubject: ${email.subject}\n\n${email.body.slice(0, 5000)}`,
    'medium',
  )
  return out.draft
}

const ReachOut = z.object({
  note: z.string().describe('One sentence for the owner: who this is and why reach out now'),
  draft: z.string().describe('A short, warm check-in email, plain text, signed by the owner'),
})

export async function reachOutDraft(
  studio: Studio,
  contact: { name: string; email: string; lastContact: string; lastSubject: string },
): Promise<z.infer<typeof ReachOut>> {
  return structured(
    ReachOut,
    `${STUDIO_CONTEXT(studio)} Help the owner reconnect with past contacts. Never invent past projects beyond what you are told. ` +
      `Sign as "${studio.signature || studio.owner}".`,
    `Contact: ${contact.name} <${contact.email}>\nLast emailed: ${contact.lastContact}\nLast subject: ${contact.lastSubject || '(unknown)'}`,
    'medium',
  )
}
