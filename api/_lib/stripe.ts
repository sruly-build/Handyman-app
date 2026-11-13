import Stripe from 'stripe'
import { admin, caller, env, HttpError, jsonBody, origin, rawBody, send, type Req, type Res } from './server.js'

/**
 * Landlord Maintenance Plan payments with Stripe. Each house is its own
 * monthly subscription. Nothing here runs until STRIPE_SECRET_KEY and
 * STRIPE_WEBHOOK_SECRET are set in Vercel's settings.
 */
function stripe(): Stripe {
  const key = env('STRIPE_SECRET_KEY')
  if (!key) throw new HttpError(503, 'Card payments are not set up yet (STRIPE_SECRET_KEY).')
  return new Stripe(key)
}

interface Tier {
  id: string
  name: string
  price: number | null
  active: boolean
}

/** Who may pay for / manage this house: its landlord, or someone in the company */
async function houseFor(req: Req, propertyId: string) {
  const me = await caller(req)
  const db = admin()
  const { data: house } = await db.from('properties').select('id, company_id, address, landlord_id').eq('id', propertyId).maybeSingle()
  if (!house) throw new HttpError(404, 'House not found.')
  const { data: landlords } = await db.from('landlords').select('*').eq('user_id', me.id)
  const mine = (landlords ?? []).find((l) => l.company_id === house.company_id)
  const isCompany = me.companyId === house.company_id
  // A landlord can pay for an approved house, or for one they're asking to add (paying approves it)
  const { data: claim } = mine
    ? await db.from('property_claims').select('id').eq('landlord_id', mine.id).eq('property_id', house.id).maybeSingle()
    : { data: null }
  if (!isCompany && !(mine && (house.landlord_id === mine.id || claim))) throw new HttpError(403, 'Not allowed.')
  const landlordId = mine?.id ?? house.landlord_id
  if (!landlordId) throw new HttpError(400, 'Link a landlord to this house first.')
  const { data: landlord } = await db.from('landlords').select('*').eq('id', landlordId).single()
  return { db, me, house, landlord }
}

async function customerFor(s: Stripe, db: ReturnType<typeof admin>, landlord: Record<string, string | null>) {
  if (landlord.stripe_customer_id) return landlord.stripe_customer_id
  const customer = await s.customers.create({
    email: landlord.email || undefined,
    name: landlord.name || undefined,
    phone: landlord.phone || undefined,
    metadata: { landlord_id: String(landlord.id) },
  })
  await db.from('landlords').update({ stripe_customer_id: customer.id }).eq('id', landlord.id)
  return customer.id
}

/** POST /api/plan-checkout {propertyId, tier?} → {url}: Stripe's payment page for one house */
export async function planCheckout(req: Req, res: Res) {
  const { propertyId, tier: tierId } = await jsonBody<{ propertyId?: string; tier?: string }>(req)
  if (!propertyId) throw new HttpError(400, 'Which house?')
  const s = stripe()
  const { db, house, landlord } = await houseFor(req, propertyId)
  const { data: settings } = await db.from('service_settings').select('plan_tiers').eq('company_id', house.company_id).single()
  const tiers = (settings?.plan_tiers ?? []) as Tier[]
  const tier = tiers.find((t) => t.id === tierId && t.active) ?? tiers.find((t) => t.active)
  if (!tier || tier.price == null || tier.price <= 0) throw new HttpError(400, 'The plan has no price set yet.')

  // One plan per house: reuse the unpaid one, refuse if already paying
  const { data: open } = await db.from('memberships').select('*').eq('property_id', house.id).neq('status', 'cancelled').maybeSingle()
  if (open && open.status !== 'pending') throw new HttpError(400, 'This house is already on the plan.')
  const membership =
    open ??
    (await db
      .from('memberships')
      .insert({ company_id: house.company_id, property_id: house.id, landlord_id: landlord.id, tier: tier.id, price: tier.price })
      .select()
      .single()).data
  if (!membership) throw new HttpError(500, 'Could not start the plan.')
  if (open) await db.from('memberships').update({ tier: tier.id, price: tier.price, landlord_id: landlord.id }).eq('id', open.id)

  const customer = await customerFor(s, db, landlord)
  const base = origin(req)
  const session = await s.checkout.sessions.create({
    mode: 'subscription',
    customer,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(tier.price * 100),
          recurring: { interval: 'month' },
          product_data: { name: `${tier.name} Maintenance Plan – ${String(house.address).split(',')[0]}` },
        },
      },
    ],
    subscription_data: { metadata: { membership_id: membership.id, landlord_id: landlord.id, property_id: house.id } },
    metadata: { membership_id: membership.id },
    success_url: `${base}/landlord?paid=1`,
    cancel_url: `${base}/landlord?paid=0`,
  })
  send(res, 200, { url: session.url })
}

/** POST /api/billing-portal → {url}: change card or cancel, on Stripe's own page */
export async function billingPortal(req: Req, res: Res) {
  const me = await caller(req)
  const db = admin()
  const { data: landlord } = await db.from('landlords').select('stripe_customer_id').eq('user_id', me.id).not('stripe_customer_id', 'is', null).limit(1).maybeSingle()
  if (!landlord?.stripe_customer_id) throw new HttpError(400, 'No card on file yet.')
  const session = await stripe().billingPortal.sessions.create({ customer: landlord.stripe_customer_id, return_url: `${origin(req)}/landlord` })
  send(res, 200, { url: session.url })
}

const statusFrom = (s: Stripe.Subscription.Status) =>
  s === 'active' || s === 'trialing' ? 'active' : s === 'past_due' || s === 'unpaid' || s === 'incomplete' ? 'past_due' : s === 'canceled' || s === 'incomplete_expired' ? 'cancelled' : null

async function setStatus(db: ReturnType<typeof admin>, membershipId: string, status: string) {
  const { error } = await db.rpc('set_membership_status', { m: membershipId, new_status: status })
  if (error) throw new Error(error.message)
}

/** The subscription id on an invoice (older and newer Stripe API shapes) */
function invoiceSubscription(inv: Stripe.Invoice): string | null {
  const any = inv as unknown as { subscription?: string | { id: string }; parent?: { subscription_details?: { subscription?: string | { id: string } } } }
  const sub = any.parent?.subscription_details?.subscription ?? any.subscription
  return typeof sub === 'string' ? sub : (sub?.id ?? null)
}

/** POST /api/stripe-webhook — Stripe tells us about payments; keeps each plan's status right */
export async function stripeWebhook(req: Req, res: Res) {
  const s = stripe()
  const secret = env('STRIPE_WEBHOOK_SECRET')
  if (!secret) throw new HttpError(503, 'STRIPE_WEBHOOK_SECRET is not set.')
  const body = await rawBody(req)
  let event: Stripe.Event
  try {
    event = await s.webhooks.constructEventAsync(body, String(req.headers['stripe-signature'] ?? ''), secret)
  } catch {
    throw new HttpError(400, 'Bad signature.')
  }
  const db = admin()
  const byStripeId = async (subId: string) =>
    (await db.from('memberships').select('id, landlord_id, status').eq('stripe_subscription_id', subId).maybeSingle()).data

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const membershipId = session.metadata?.membership_id
      const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
      if (!membershipId || !subId) break
      await db.from('memberships').update({ stripe_subscription_id: subId }).eq('id', membershipId)
      // Keep the card for approved parts
      const sub = await s.subscriptions.retrieve(subId)
      const pm = typeof sub.default_payment_method === 'string' ? sub.default_payment_method : sub.default_payment_method?.id
      if (pm && typeof session.customer === 'string') {
        await s.customers.update(session.customer, { invoice_settings: { default_payment_method: pm } })
      }
      if (session.payment_status === 'paid') {
        await setStatus(db, membershipId, 'active')
        const { data: m } = await db.from('memberships').select('landlord_id').eq('id', membershipId).single()
        if (m?.landlord_id) await db.rpc('reward_referral', { new_landlord: m.landlord_id })
      }
      break
    }
    case 'invoice.paid': {
      const inv = event.data.object as Stripe.Invoice
      const subId = invoiceSubscription(inv)
      const m = subId ? await byStripeId(subId) : null
      if (m && m.status !== 'active') await setStatus(db, m.id, 'active')
      if (m?.landlord_id) await db.rpc('reward_referral', { new_landlord: m.landlord_id })
      break
    }
    case 'invoice.payment_failed': {
      const subId = invoiceSubscription(event.data.object as Stripe.Invoice)
      const m = subId ? await byStripeId(subId) : null
      if (m && m.status === 'active') await setStatus(db, m.id, 'past_due')
      break
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const m = await byStripeId(sub.id)
      const status = event.type === 'customer.subscription.deleted' ? 'cancelled' : statusFrom(sub.status)
      if (m && status && status !== m.status) await setStatus(db, m.id, status)
      const end = sub.items?.data?.[0]?.current_period_end
      if (m && end) await db.from('memberships').update({ current_period_end: new Date(end * 1000).toISOString() }).eq('id', m.id)
      break
    }
  }
  send(res, 200, { received: true })
}

/** Charge approved parts to the landlord's card on file (once) */
export async function chargeApproval(approvalId: string): Promise<'charged' | 'failed' | 'skipped'> {
  const db = admin()
  const { data: a } = await db.from('approvals').select('*').eq('id', approvalId).maybeSingle()
  if (!a || a.kind !== 'parts' || a.status !== 'approved' || a.charge_status === 'charged' || !(a.estimate_amount > 0)) return 'skipped'
  const { data: claimed } = await db.from('approvals').update({ charge_status: 'pending' }).eq('id', a.id).in('charge_status', ['none', 'pending', 'failed']).select('id')
  if (!claimed?.length) return 'skipped'
  const { data: landlord } = a.landlord_id ? await db.from('landlords').select('stripe_customer_id').eq('id', a.landlord_id).single() : { data: null }
  if (!landlord?.stripe_customer_id) {
    await db.from('approvals').update({ charge_status: 'failed' }).eq('id', a.id)
    return 'failed'
  }
  const s = stripe()
  try {
    const customer = (await s.customers.retrieve(landlord.stripe_customer_id)) as Stripe.Customer
    const pm = customer.invoice_settings?.default_payment_method
    const intent = await s.paymentIntents.create(
      {
        amount: Math.round(Number(a.estimate_amount) * 100),
        currency: 'usd',
        customer: landlord.stripe_customer_id,
        payment_method: typeof pm === 'string' ? pm : pm?.id,
        off_session: true,
        confirm: true,
        description: `Parts: ${a.title}`,
        metadata: { approval_id: a.id },
      },
      { idempotencyKey: `approval-${a.id}` },
    )
    const ok = intent.status === 'succeeded'
    await db.from('approvals').update({ charge_status: ok ? 'charged' : 'failed', stripe_payment_intent: intent.id, charged_at: ok ? new Date().toISOString() : null }).eq('id', a.id)
    return ok ? 'charged' : 'failed'
  } catch {
    await db.from('approvals').update({ charge_status: 'failed' }).eq('id', a.id)
    return 'failed'
  }
}

/** POST /api/charge-parts {approvalId} — the owner charges approved parts now */
export async function chargeParts(req: Req, res: Res) {
  const me = await caller(req)
  const { approvalId } = await jsonBody<{ approvalId?: string }>(req)
  const { data: a } = await admin().from('approvals').select('company_id').eq('id', approvalId ?? '').maybeSingle()
  if (!a || a.company_id !== me.companyId) throw new HttpError(403, 'Not allowed.')
  send(res, 200, { result: await chargeApproval(approvalId!) })
}

/** POST /api/approval-decided {token} — after the landlord approves parts by link, charge them */
export async function approvalDecided(req: Req, res: Res) {
  const { token } = await jsonBody<{ token?: string }>(req)
  if (!token || !/^[0-9a-f]{64}$/.test(token)) throw new HttpError(400, 'Bad link.')
  const { data: a } = await admin().from('approvals').select('id').eq('token', token).maybeSingle()
  if (!a || !env('STRIPE_SECRET_KEY')) return send(res, 200, { result: 'skipped' })
  send(res, 200, { result: await chargeApproval(a.id) })
}
