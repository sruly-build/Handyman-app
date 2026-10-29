# Studio Assistant

An app for running a product photography studio: shoots and shot lists with timers, clients and leads, a calendar with Jewish holidays, estimates and invoices, client galleries, and your Gmail inbox, all in one place. It works on a phone (add it to your home screen) and on a computer.

It runs in two modes:

- **Sample-data preview.** With no setup, it opens with made-up clients, shoots and invoices so you can tap around. Changes stay in that browser only. This is what you get until the Supabase keys below are added.
- **Live.** Once Supabase is connected, you log in and everything is saved to your own database, starting empty. Gmail, Dropbox, Stripe and the AI drafts each switch on when their keys are added. Anything not set up yet shows a "Connect" or "Needs server setup" note in Settings instead of breaking.

## What works when it's live

- **Saving and login.** Everything you add or change is saved within a second and shows on all your devices. Only your account can see your data.
- **Gmail.** Home shows new important emails from the last week. The AI writes a one-line summary of each and flags new inquiries as leads; newsletters and notifications are left out. **Reply** writes a draft for you to edit, and **Send** sends it from your Gmail in the same thread. Invoices, reminders, receipts and project emails also go out from your Gmail.
- **Reach out today.** Once a day it picks someone you emailed 6 months to 2 years ago and haven't written to since, explains why, and drafts a check-in. Skip and Never suggest are remembered.
- **WhatsApp and text.** Sending an invoice by WhatsApp or text opens WhatsApp or Messages on your phone with the message and pay link filled in, so you tap send there.
- **Client links.**
  - Each invoice has a private link (**Link** button on the invoice). The client sees the invoice and how to pay: Zelle, check, or card through Stripe. Opening it marks the invoice "viewed".
  - Each gallery has a private link (**Copy link**). The client can heart favourites and comment. Downloads stay locked until the invoice is paid if you switch that on.
  - Neither link needs a login.
- **Stripe card payments.** The client pays the balance, plus your card fee if the invoice adds one. The payment records itself on the invoice, Stripe emails the receipt, and the gallery unlocks.
- **Dropbox galleries.** On a project's Gallery tab, choose a Dropbox folder and its photos become the gallery. **Sync** picks up photos you add later. Clients can download single photos or the whole folder as a zip once it's unlocked.
- **Overdue reminders.** Once a day the server emails a reminder for each overdue invoice, no more often than your "days between reminders" setting. They go from your Gmail.
- **Receipts.** When you record a Zelle or check payment, a receipt is emailed automatically (Settings → Invoices → Automatic receipts).
- **Files.** Upload briefs and mood boards to a project's Files tab. They're stored privately with your account.
- **Logo.** Upload your logo in Settings. It shows on invoices and galleries.

## Setting it up

Each step gives you a few values to paste into Vercel: **Project → Settings → Environment Variables**. After adding or changing variables, redeploy (Deployments → ⋯ → Redeploy). Below, `YOUR-SITE` means your Vercel address, for example `studio-assistant.vercel.app`.

### 1. Database and login (Supabase): required for live mode

1. Go to [supabase.com](https://supabase.com) and create a **new project** just for the studio (separate from the Handyman app).
2. Open **SQL Editor → New query**, paste everything from [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Open **Authentication → URL Configuration**. Set **Site URL** to `https://YOUR-SITE`, and add `https://YOUR-SITE/**` under Redirect URLs.
4. From **Project Settings → API**, add these to Vercel:
   - `VITE_SUPABASE_URL`: the Project URL
   - `VITE_SUPABASE_ANON_KEY`: the `anon` `public` key
   - `SUPABASE_SERVICE_ROLE_KEY`: the `service_role` key. This one is secret: never share it.
5. Also add `APP_URL` = `https://YOUR-SITE`, and `CRON_SECRET` = any long random password (it protects the daily reminder job).
6. Redeploy and open the app. Tap **Create your account**, confirm the email Supabase sends you, and log in.
7. Back in Supabase, **Authentication → Sign In / Providers**, turn **off** "Allow new users to sign up" so nobody else can create an account.

### 2. Gmail

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project (any name).
2. **APIs & Services → Library**: search for **Gmail API** and click **Enable**.
3. **APIs & Services → OAuth consent screen**: choose **External** and fill in the app name and your email. Under Scopes, add `gmail.readonly` and `gmail.send`.
4. On the same screen, click **Publish app** so it is "In production". If you leave it in Testing, Google disconnects you every 7 days. You don't need Google's verification for your own use.
5. **APIs & Services → Credentials → Create credentials → OAuth client ID**. Choose **Web application**, and under Authorized redirect URIs add `https://YOUR-SITE/api/google/callback`.
6. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to Vercel and redeploy.
7. In the app: **Settings → Connections → Gmail → Connect**. Google will warn that the app isn't verified. That's expected for your own app: tap **Advanced → Go to …** and allow access.

### 3. Dropbox

1. Go to [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps): **Create app → Scoped access → Full Dropbox**, and give it a name.
2. On the **Permissions** tab, tick `account_info.read`, `files.metadata.read`, `files.content.read`, `sharing.read` and `sharing.write`, then click **Submit**.
3. On the **Settings** tab, add the redirect URI `https://YOUR-SITE/api/dropbox/callback`.
4. Add `DROPBOX_APP_KEY` and `DROPBOX_APP_SECRET` (both on the Settings tab) to Vercel and redeploy.
5. In the app: **Settings → Connections → Dropbox → Connect**.

### 4. Stripe card payments

1. In [Stripe](https://dashboard.stripe.com), go to **Developers → API keys** and copy the **Secret key** into `STRIPE_SECRET_KEY`.
2. **Developers → Webhooks → Add endpoint**:
   - URL: `https://YOUR-SITE/api/stripe/webhook`
   - Event: `checkout.session.completed`
   - Copy the endpoint's **Signing secret** into `STRIPE_WEBHOOK_SECRET`.
3. **Settings → Customer emails**: turn on **Successful payments**, so Stripe emails card receipts.
4. Redeploy. Test with Stripe's test keys first if you like (card number 4242 4242 4242 4242), then switch to the live keys.

### 5. AI drafts and summaries

1. Create an API key at [console.anthropic.com](https://console.anthropic.com) (**Settings → API keys**).
2. Add it as `ANTHROPIC_API_KEY` and redeploy.

Without this key, Gmail still works: emails show Gmail's preview text instead of a summary, nothing is flagged as a lead, and you write replies yourself.

### Deploying on Vercel

Create a Vercel project from this repository with **Root Directory** set to `studio-assistant`. The defaults Vercel detects are correct. `vercel.json` sends page addresses to the app, and runs the reminder job daily at 14:00 UTC (10am New York).

## Running it on a computer (developers)

```
cd studio-assistant
npm install
npm run dev          # the app only; API routes need `npx vercel dev` instead
npm run build        # typechecks the app and the API, then builds
```

## How it's built

- React + TypeScript + Vite + Tailwind.
- The app's data lives in `src/data/store.tsx`. In live mode `src/lib/cloud.ts` turns it into one database row per item and saves only what changed.
- Hearts, comments and payments are rows of their own, so a client using their link and you using the app never overwrite each other. The app picks up their changes when you come back to it.
- Server routes live in `api/_routes/`, one file per route, with shared code (database, Gmail, Dropbox, Stripe, AI) in `api/_lib/`:
  - All of them run inside one Vercel function, `api/router.ts`, because Vercel's free plan allows only 12 functions per deployment. `vercel.json` sends every `/api/...` address to it.
  - `api/_routes/public/` holds the no-login routes behind client links.
  - `api/cron/reminders.ts`, the daily reminder job, is the only other function.
- `supabase/schema.sql` creates the tables, security rules and file storage.
- Gmail and Dropbox tokens are kept in a table that only the server can read.
- Jewish holidays and Hebrew dates come from `@hebcal/core`.
- AI uses Claude (`claude-opus-5-5`) through `@anthropic-ai/sdk`. If a request is declined, it automatically falls back to another model.
