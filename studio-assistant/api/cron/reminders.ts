import { HttpError, json, route } from '../_lib/http.js'
import { getDoc, listDocs, ownersWith, putDoc } from '../_lib/db.js'
import { sendEmail } from '../_lib/google.js'
import { balanceOf, invoiceWithPayments, projectAndClient, settingsOf, type Invoice } from '../_lib/studio.js'
import { money } from '../_lib/billing.js'

// Runs once a day (see vercel.json). Emails a reminder for each overdue invoice,
// at most once every "days between reminders", from the owner's Gmail.
export const GET = route(async (req) => {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}` || !process.env.CRON_SECRET) throw new HttpError(401, 'Not allowed')
  const today = new Date().toISOString().slice(0, 10)
  const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, '')
  let sent = 0
  for (const owner of await ownersWith('google')) {
    const settings = await settingsOf(owner)
    if (!settings?.autoReminders) continue
    for (const { data } of await listDocs<Invoice>(owner, 'invoices')) {
      if (data.kind !== 'invoice' || data.status === 'draft' || data.due >= today) continue
      const inv = await invoiceWithPayments(owner, data)
      const { balance } = balanceOf(inv, settings)
      if (balance <= 0) continue
      const last = (await getDoc<{ at: string }>(owner, 'ireminder', inv.id))?.at ?? inv.lastReminder
      if (last && (Date.parse(today) - Date.parse(last)) / 86400000 < settings.reminderDays) continue
      const { client } = await projectAndClient(owner, inv.projectId)
      if (!client?.email) continue
      await sendEmail(owner, {
        to: client.email,
        subject: `Reminder: ${inv.number} from ${settings.businessName}`,
        text:
          `Hi ${client.name.split(' ')[0]},\n\nA friendly reminder that invoice ${inv.number} for ${money(balance)} was due on ${inv.due}. ` +
          `You can view it and pay by Zelle, check or card here:\n${base}/pay/${inv.id}\n\nThank you!\n${settings.owner}`,
      })
      await putDoc(owner, 'ireminder', inv.id, { invoiceId: inv.id, at: today })
      sent++
    }
  }
  return json({ sent })
})
