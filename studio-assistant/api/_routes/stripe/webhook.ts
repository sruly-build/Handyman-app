import type Stripe from 'stripe'
import { env, json } from '../../_lib/http.js'
import { getDoc, putDoc } from '../../_lib/db.js'
import { stripe } from '../../_lib/stripe.js'

// Stripe calls this when a card payment goes through; it records the payment on the invoice.
// Stripe emails the client a receipt itself (receipt_email is set at checkout).
export async function POST(req: Request): Promise<Response> {
  const raw = await req.text()
  let event: Stripe.Event
  try {
    event = await stripe().webhooks.constructEventAsync(raw, req.headers.get('stripe-signature') ?? '', env('STRIPE_WEBHOOK_SECRET'))
  } catch {
    return json({ error: 'Bad signature' }, 400)
  }
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object as Stripe.Checkout.Session
    const { invoiceId, owner, amount, fee } = s.metadata ?? {}
    if (invoiceId && owner && s.payment_status === 'paid' && !(await getDoc(owner, 'payment', s.id))) {
      await putDoc(owner, 'payment', s.id, {
        id: s.id,
        invoiceId,
        amount: Number(amount),
        date: new Date(event.created * 1000).toISOString().slice(0, 10),
        method: 'card',
        note: Number(fee) > 0 ? `Stripe, plus $${Number(fee).toFixed(2)} card fee` : 'Stripe',
      })
    }
  }
  return json({ received: true })
}
