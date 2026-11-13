# Request Inbox & Landlord Maintenance Plan: setup and tests

Everything below is built. Each part switches on when its key is added; the
rest of the app keeps working without it.

## 1. Database (Supabase) — do this first

Run the five update files **in order**, one at a time: Supabase → SQL Editor →
New query → paste the whole file → Run. Each is safe to run twice.

1. `supabase/updates/10-requests-part1.sql` (settings, landlords, houses, tenants, plans, hour bank)
2. `supabase/updates/11-requests-part2.sql` (requests, approvals, house profiles, guides, privacy rules)
3. `supabase/updates/12-requests-part3.sql` (public request page, status and approval links)
4. `supabase/updates/13-requests-part4.sql` (hour bank and landlord accounts)
5. `supabase/updates/14-requests-part5.sql` (landlord sign-up and photo storage)

New database? Run `supabase/schema.sql` instead (it already has all of this).

## 2. Email codes (free)

Supabase → Authentication → Emails (Email Templates):

- **Magic Link** template: add the line `Your login code: {{ .Token }}`
- **Confirm signup** template: add the same line

## 3. The app's server on Vercel (free)

Vercel → your project → Settings → Environment Variables. Add (for
Production), then Deployments → ⋯ → Redeploy:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key (secret: only here) |
| `APP_URL` | Your app's address, e.g. `https://handyman-app.vercel.app` |
| `VAPID_PRIVATE_KEY` | The emergency-alert key (given to you privately; not in the code) |
| `VAPID_SUBJECT` | `mailto:` + your email |
| `CRON_SECRET` | Any long random text (Vercel uses it for the daily job) |
| `INBOUND_SECRET` | Any long random text (protects the texts address) |

Costs money (only when you decide):

| Name | For |
| --- | --- |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Plan payments and parts charges (Stripe takes a fee per payment) |
| `ANTHROPIC_API_KEY` | AI: sorting texts, translating, reading model stickers and lists (pay per use) |

## 4. Stripe (plan payments)

1. stripe.com → create an account (start in **Test mode**).
2. Developers → API keys → copy the **Secret key** → Vercel `STRIPE_SECRET_KEY`.
3. Developers → Webhooks → Add endpoint: `https://<your app>/api/stripe-webhook`.
   Events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
4. Copy its **Signing secret** → Vercel `STRIPE_WEBHOOK_SECRET`. Redeploy.
5. Settings → Billing → Customer portal → turn it on (lets landlords change card / cancel).
6. Test with card `4242 4242 4242 4242`. When happy, repeat steps 2–4 in Live mode.

## 5. Texts from Google Voice

1. Google Voice → Settings → Messages → **Forward messages to email**: on.
2. Make an inbound email address (e.g. CloudMailin or Postmark inbound). Set it to
   POST **JSON** to: `https://<your app>/api/inbound-email?key=<INBOUND_SECRET>&company=<your request page address>`
3. Gmail → Settings → Forwarding → add that inbound address and confirm it.
4. Gmail → search `from:txt.voice.google.com` → Create filter → **Forward it to** the inbound address.
5. Text your Google Voice number from another phone; it shows in Requests → Texts.

## 6. Emergency alerts (Android)

1. Open the app in Chrome → ⋮ → **Add to Home screen / Install app**.
2. Open it from the home screen → Me → Alerts → turn on → Allow.
3. Tap **Send a test alert**.

## 7. Google review link and WhatsApp

- Google Business Profile → **Ask for reviews** → copy the link → Me → Request page → Google review link.
- Me → Request page → WhatsApp number (used for the Video call button).

## Test checklist

See the list in the setup page Claude shared, or follow the headings:
request page (English and Hebrew, photos, emergency, spam protection), inbox
(flags, scheduling, ready texts, convert to job or lead, nearby, repeat),
guides, approval link, status link and feedback, plans and hour bank, parts
approval and auto-approve, landlord login and what they can and can't see,
house profile and inspections, move-out, referrals, reminders, texts, alerts.
