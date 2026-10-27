# Handyman app

A phone-first app for a small handyman business: jobs, punch lists, photos and measurements, and later parts, time tracking and billing. It's a web app that can be added to an iPhone home screen and works like a downloaded app. It also works in a desktop browser.

The full plan is in [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md).

## What's built so far: Stage 1

- **Log in.** Each person has their own email and password.
- **Home.** A greeting, today's jobs, jobs coming up, a big green **New job** button, and quick links to Orders and the Bring list.
- **Jobs list.** Each job is a card with the customer, address, date and a progress bar.
- **Job detail.** Customer info with big **Call** and **Directions** buttons, notes, and the punch list. Tap the circle next to an item to move it from *to do* to *in progress* (orange) to *done* (green check).
- **Punch list item.** Status, before photos (one big camera button), measurements (width, height, depth and a unit), and notes. **Everything saves by itself as you type.** There's no Save button to forget.
- **Me.** Change your display name and log out.

Orders and the Bring list show a "Coming in Stage 2" page for now.

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
4. Open the file [`supabase/schema.sql`](supabase/schema.sql) in this repository, copy all of it, paste it into the editor, and click **Run**. You should see "Success". This creates the tables and the private photo storage.

### Step 2: Create the two logins

1. In Supabase, open **Authentication → Users** and click **Add user → Create new user**.
2. Enter your email and a password, and tick **Auto Confirm User**. Do the same for your worker.
3. Turn off public sign-ups so nobody else can make an account: go to **Authentication → Sign In / Providers** and switch off **Allow new users to sign up**.

### Step 3: Copy the two keys

In Supabase, open **Project Settings → API** (on some versions it's **Data API** and **API Keys**). Copy:

- the **Project URL** (it looks like `https://abcd1234.supabase.co`)
- the **anon public** key (a long string starting with `eyJ...`, or a "publishable" key starting with `sb_publishable_`)

The anon key is safe to put in the app because the database only lets logged-in users in. **Never** copy the `service_role` or secret key anywhere.

### Step 4: Put the app on the web with Vercel

1. Go to <https://vercel.com> and sign up with your GitHub account.
2. Click **Add New → Project** and import the **handyman-app** repository.
3. Before clicking Deploy, open **Environment Variables** and add these two:
   - `VITE_SUPABASE_URL`: the Project URL from Step 3
   - `VITE_SUPABASE_ANON_KEY`: the anon key from Step 3
4. Click **Deploy**. After a minute you'll get a link like `https://handyman-app.vercel.app`.

From now on, every change pushed to GitHub updates the app automatically.

### Step 5: Add it to your iPhone home screen

1. Open the Vercel link in **Safari** on the iPhone.
2. Tap the **Share** button (the square with an arrow), then **Add to Home Screen**, then **Add**.
3. Open it from the green house icon. It opens full screen like a normal app.

Do the same on your worker's phone.

---

## Stage 1 test checklist (do this on a phone)

- [ ] Log in with your email and password
- [ ] Tap **New job**, fill in a customer with a real phone number and address, and tap **Create job**
- [ ] Tap **Call**. The phone should offer to call the number.
- [ ] Tap **Directions**. Maps should open with directions to the address.
- [ ] Add 2–3 punch list items, for example "Fix leaky faucet" in "Upstairs bathroom"
- [ ] On an item, tap **Take before photo**. The camera should open and the photo should appear.
- [ ] Add a measurement and some notes, wait for "Saved" at the top right, then go back and reopen the item. Everything should still be there.
- [ ] Change the status, and tap the circles on the job screen. The progress bar should move.
- [ ] Log in on the second phone with the worker's login. The same job and photos should be there.
- [ ] Edit the job, then try deleting a test job

When all of this works, Stage 1 is done and we move to Stage 2 (parts, orders and the bring list).

---

## For developers

```bash
npm install
cp .env.example .env.local   # optional: add Supabase keys; leave empty for Demo mode
npm run dev                  # http://localhost:5173 (also reachable from a phone on the same Wi-Fi)
npm test                     # unit tests
npm run build                # type-check and production build
```

Stack: React + TypeScript + Vite, Tailwind CSS, Supabase (auth, Postgres, storage), TanStack Query, `vite-plugin-pwa`.

- `src/data/types.ts`: the data shapes and the `Backend` interface
- `src/data/supabaseBackend.ts` / `demoBackend.ts`: the two storage versions. `backend.ts` picks one based on the env vars.
- `src/screens/`: one file per screen
- `src/components/`: shared pieces (tab bar, cards, photo section, measurements)
- `supabase/schema.sql`: database tables, security rules and the storage bucket
- `scripts/render-icons.mjs`: regenerates the PNG app icons from `public/icon.svg`
