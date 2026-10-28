# Handyman app

A phone-first app for a small handyman business: jobs, punch lists, photos and measurements, and later parts, time tracking and billing. It's a web app that can be added to an iPhone home screen and works like a downloaded app. It also works in a desktop browser.

The full plan is in [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md).

## What the app does

All five stages from the build plan are built:

- **Jobs and punch lists.** Create a job with the customer's details (the address box suggests real addresses as you type). **Call** and **Directions** are one tap away. Add each thing that needs fixing as a punch list item.
- **Sign-up by approval only.** Nobody can create an account unless their email has been approved. The app's admin (the first person who signed up) approves new companies in **Me → Approve sign-ups**; company owners approve their own workers in **Me → Team**. Approved people tap **Sign up**, enter their email, then choose their own name and password. The database itself turns away everyone else.
- **Companies.** Each approved new sign-up gets their own company with its business profile (name, email, phone, address). A company sees only its own jobs, prices, parts, time, estimates and invoices. The database itself enforces this.
- **Your team.** The company owner approves workers' emails from **Me → Team**. When a worker signs up with that email, they join the owner's company and see all its jobs, clock in, run timers and so on. Only the owner changes the business profile and prices.
- **Sharing a job with another company.** On a job, tap **Share with another company** and enter an email someone at that company logs in with. They then see that job's **punch list and photos only**, and can update them. They never see your prices, parts, time, estimates or invoices.
- **Forgot password.** The login screen sends a reset link by email, which opens the app to choose a new password.
- **Each punch list item** has:
  - status: to do, in progress (orange) or done (green check)
  - a task timer
  - before photos, after photos and finger sketches (you can also draw on top of a photo and add text like "30 in")
  - measurements
  - parts to order
  - tools and materials
  - expected time
  - notes

  **Everything saves by itself as you type.**
- **Parts and orders.** Each part moves from needed to ordered to received. The **Orders** tab lists every part across all jobs, and each job shows what was paid.
- **Bring list.** One checklist per job, built from the tools and materials on every item with no duplicates, plus parts ordered for the job. Tick things off while loading the van. **Remind me the night before** adds a calendar alert at 7pm. The Home screen also shows "Load the van for tomorrow" in the evening.
- **Time.**
  - **Arrived** and **Finished** buttons per person.
  - A start/stop timer on every task. Starting a task timer clocks you in automatically if you forgot.
  - Totals per task, per person and per job, plus expected vs actual hours.
- **Billing.**
  - Estimates come from the expected hours and parts, with the 20% markup.
  - **Create invoice** uses the tracked time.
  - Mark invoices as paid, and print or save them as a PDF, with before and after photos if you like.
- **Before and after report** to show the client what was fixed.
- **Settings** (on the Me tab): a first-hour price (for example a $150 service call for the first hour, then $90 an hour; every job is charged at least the service call), the markup %, switches for adding the markup to materials and to labour, how labour is charged (per task timer, or arrival to finish), and the business details printed on estimates and invoices. Each job's Billing screen also has its own switch for the markup on materials.

---

## Try it right now (Demo mode)

If Supabase isn't connected yet, the app runs in **Demo mode**: type any email to log in, and everything saves on that one device only. Use it to get a feel for the screens. Nothing is shared between phones in Demo mode.

---

## One-time setup (about 30 minutes)

You need three free accounts: **GitHub** (you already have it), **Supabase** (database, logins and photo storage) and **Vercel** (puts the app on the web).

### Step 1: Create the database in Supabase

1. Go to <https://supabase.com>, sign up, and click **New project**. Pick any name (for example "handyman"), choose a strong database password (save it somewhere), and pick the region closest to you.
2. Wait a minute or two for the project to finish setting up.
3. On the left, open **SQL Editor** and click **New query**.
4. Open the file [`supabase/schema.sql`](supabase/schema.sql) in this repository, copy all of it, paste it into the editor, and click **Run**. You may get a warning about "destructive operations"; that's expected, so click **Run this query**. You should see "Success". This creates the tables and the private photo storage.

> **After an app update** that changes `supabase/schema.sql`, run it again the same way. It's safe to run any number of times and never deletes your data.

### Step 2: Turn on sign-up and password emails

Approved people create their own accounts (and passwords) from the app's **Sign up** button. Nobody else can: the database turns away any email that hasn't been approved. So:

1. In Supabase, go to **Authentication → Sign In / Providers** and make sure **Allow new users to sign up** is **on**. (This is safe: the approval check happens in the database, so only approved emails get through.)
2. On the same page, leave **Confirm email** **on**. New people get an email with a link to confirm their address before they can log in.
3. Once your app is on the web (Step 4), go to **Authentication → URL Configuration**:
   - Set **Site URL** to your app's link, e.g. `https://handyman-app.vercel.app`
   - Under **Redirect URLs**, add the same link followed by `/**`, e.g. `https://handyman-app.vercel.app/**`

   This is where the confirm-email and reset-password links send people back to.

> ⚠️ **Email limit:** Supabase's built-in email service only sends a few emails per hour, and is meant for testing. Before you approve other companies, connect a real email service under **Project Settings → Authentication → SMTP Settings** (for example Resend, which has a free plan).

**Existing logins** (made before this version) keep working. Each one became its own company, with its business details and prices kept. The first person who ever signed up is the app's admin.

**Adding a login from the Supabase dashboard** (Authentication → Users → Add user) also needs the email approved in the app first.

### Step 3: Connect the app to Supabase ✅ done

Your project's URL and publishable key are already built into the app (in `.env.production`). Both are safe to include, because the database only lets each company see its own data. **Never** put the `service_role` or secret key anywhere.

### Step 4: Put the app on the web with Vercel

1. Go to <https://vercel.com> and sign up with your GitHub account.
2. Click **Add New → Project** and import the **handyman-app** repository.
3. Leave all the settings as they are and click **Deploy**. There's nothing to fill in, because the Supabase keys are already in the app.
4. Wait for it to finish. After a minute you'll get a link like `https://handyman-app.vercel.app`.

From now on, every change pushed to GitHub updates the app automatically.

### Step 5: Add it to your iPhone home screen

1. Open the Vercel link in **Safari** on the iPhone.
2. Tap the **Share** button (the square with an arrow), then **Add to Home Screen**, then **Add**.
3. Open it from the green house icon. It opens full screen like a normal app.

On your worker's phone: approve their email from **Me → Team** first, then have them open the link and tap **Sign up** with that email.

---

## Test checklist (do this on a phone)

**Jobs and items**
- [ ] Log in with your email and password
- [ ] Open **Me → Business profile** and check your business name, email, phone and address
- [ ] Open **Me → Prices** and set your service call, hourly rate and markup
- [ ] Create a job with a real phone number and address. Check that **Call** and **Directions** work.
- [ ] Add an item, take a **before photo**, add a measurement, tools and notes, and add the expected hours. Go back and reopen it: everything should still be there.
- [ ] Tap a photo, then **Draw on it**. Draw a line, add text, and save.

**Parts and bring list**
- [ ] On the item, tap **Add part** and enter a cost. It should show the price with markup.
- [ ] On the **Orders** tab, tap the coloured label to move the part from needed to ordered to received
- [ ] Open the job's **Bring list**, tick things off, and tap **Remind me the night before**. Calendar should offer to add the event.

**Time**
- [ ] Tap **Arrived**, start and stop a task timer, then tap **Finished**
- [ ] Approve your worker's email in **Me → Team**, have them **Sign up** with that email on their phone, then tap **Arrived** on the same job. Your phone should show they're on site.
- [ ] Open the job's **Time** screen and check the totals per person

**Billing**
- [ ] Open **Estimate**, then **Invoice → Create invoice**. Try **Print or save as PDF**.
- [ ] Take an **after photo** and open the **Before and after report**

**Accounts and sharing**
- [ ] Log out, tap **Forgot password?**, and check the reset email brings you back to choose a new password
- [ ] Try signing up with an email nobody approved: it should be turned away
- [ ] Approve another company in **Me → Approve sign-ups**, have them sign up, then **Share with another company** on a job. Log in as them: they should see that job's punch list and photos, but no prices, parts, time or bill.

---

## For developers

```bash
npm install
npm run dev                  # Demo mode at http://localhost:5173 (data on this device only)
npm run build && npm run preview  # uses the real Supabase project from .env.production
npm test                     # unit tests
npm run build                # type-check and production build
```

Stack: React + TypeScript + Vite, Tailwind CSS, Supabase (auth, Postgres, storage), TanStack Query, `vite-plugin-pwa`.

- `src/data/types.ts`: the data shapes
- `src/data/api.ts`: everything the app does (jobs, items, parts, time, invoices), built on the small storage interface in `db.ts`
- `src/data/supabaseBackend.ts` / `demoBackend.ts`: the two storage versions. `backend.ts` picks one based on the env vars.
- `src/data/billing.ts`, `bring.ts`, `time.ts`: pricing, bring-list and time maths (with unit tests)
- `src/screens/`: one file per screen
- `src/components/`: shared pieces (tab bar, cards, photo section, measurements)
- `supabase/schema.sql`: database tables, security rules and the storage bucket
- `scripts/render-icons.mjs`: regenerates the PNG app icons from `public/icon.svg`
