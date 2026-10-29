import { route, json, param, HttpError, hasEnv } from '../../_lib/http.js'
import { findDoc, getDoc, putDoc } from '../../_lib/db.js'
import { invoiceWithPayments, projectAndClient, publicStudio, settingsOf, type Invoice } from '../../_lib/studio.js'

// The pay page for one invoice or estimate. Opening it marks it as viewed.
export const GET = route(async (req) => {
  const row = await findDoc<Invoice>('invoices', param(req, 'id'))
  if (!row) throw new HttpError(404, 'This invoice is not available.')
  const { owner } = row
  const [settings, inv, pc] = await Promise.all([settingsOf(owner), invoiceWithPayments(owner, row.data), projectAndClient(owner, row.data.projectId)])
  if (!settings) throw new HttpError(404, 'This invoice is not available.')
  if (inv.status !== 'draft' && !(await getDoc(owner, 'iview', inv.id))) {
    await putDoc(owner, 'iview', inv.id, { invoiceId: inv.id, at: Date.now() })
  }
  return json({
    studio: publicStudio(settings),
    pay: {
      zelleName: settings.zelleName,
      zelleContact: settings.zelleContact,
      checkPayee: settings.checkPayee,
      checkAddress: settings.checkAddress,
      cardFeePct: settings.cardFeePct,
      cardEnabled: hasEnv('STRIPE_SECRET_KEY'),
    },
    settings: { cardFeePct: settings.cardFeePct },
    invoice: { ...inv, payByCard: false },
    client: pc.client ? { name: pc.client.name, company: pc.client.company, email: pc.client.email, address: pc.client.address } : null,
    projectTitle: pc.project?.title ?? '',
  })
})
