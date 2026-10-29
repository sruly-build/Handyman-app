import Stripe from 'stripe'
import { env } from './http.js'

let client: Stripe | null = null
export function stripe(): Stripe {
  if (!client) client = new Stripe(env('STRIPE_SECRET_KEY'))
  return client
}
