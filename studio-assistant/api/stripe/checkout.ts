import { route, json, body, origin, HttpError } from '../_lib/http.js'
import { findDoc } from '../_lib/db.js'
import { stripe } from '../_lib/stripe.js'
import { balanceOf, invoiceWithPayments, projectAndClient, settingsOf, type Invoice } from '../_lib/studio.js'
import { round2 } from '../_lib/billing.js'

// Starts a Stripe card payment for an invoice's balance (plus the card fee, if the invoice adds one).
export const POST = route(async (req) => {
  const { id } = await body<{ id: string }>(req)
  const row = await findDoc<Invoice>('invoices', id)
  if (!row || row.data.kind !== 'invoice') throw new HttpError(404, 'This invoice is not available.')
  const { owner } = row
  const [settings, inv, pc] = await Promise.all([settingsOf(owner), invoiceWithPayments(owner, row.data), projectAndClient(owner, row.data.projectId)])
  if (!settings) throw new HttpError(404, 'This invoice is not available.')
  const { balance } = balanceOf(inv, settings)
  if (balance <= 0) throw new HttpError(400, 'This invoice is already paid.')
  const fee = inv.cardFee ? round2((balance * settings.cardFeePct) / 100) : 0
  const base = origin(req)

  const items = [
    { price_data: { currency: 'usd', unit_amount: Math.round(balance * 100), product_data: { name: `Invoice ${inv.number}` } }, quantity: 1 },
  ]
  if (fee > 0) {
    items.push({
      price_data: { currency: 'usd', unit_amount: Math.round(fee * 100), product_data: { name: `Card processing fee (${settings.cardFeePct}%)` } },
      quantity: 1,
    })
  }
  const metadata = { invoiceId: inv.id, owner, amount: String(balance), fee: String(fee) }
  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    line_items: items,
    customer_email: pc.client?.email || undefined,
    metadata,
    payment_intent_data: { metadata, receipt_email: pc.client?.email || undefined, description: `${settings.businessName} · ${inv.number}` },
    success_url: `${base}/pay/${inv.id}?paid=1`,
    cancel_url: `${base}/pay/${inv.id}`,
  })
  return json({ url: session.url })
})
