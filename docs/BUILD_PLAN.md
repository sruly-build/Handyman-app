# Handyman App: Build Plan

A phone-first app for a small handyman business. The app name is still to be decided.

## Progress

| Stage | What | Status |
| --- | --- | --- |
| 1 | Login, jobs list, job detail, punch list items with photos, measurements, notes and status | ✅ Built, needs testing on a phone |
| 2 | Parts and the order tracker, plus the bring list | Next |
| 3 | Clock in and out, task timers, and the second user | |
| 4 | Sketch pad and before and after photos | |
| 5 | Estimates, invoices and the 20% markup | |
| Later | Booking, scheduling, and sending reports to clients | |

## Approach

A mobile-first Progressive Web App that can be installed on an iPhone home screen and also used in a desktop browser. It's built in stages, and each stage is tested on a phone before moving on.

Stack: React with TypeScript and Vite, Tailwind CSS, and Supabase for login, database and photo storage. Photos come from the phone camera through the browser. It's deployed to Vercel (Netlify also works).

## Look and feel

- Apple-style design: clean, bright, polished, and feels like a real downloaded app
- White and very light grey backgrounds, large bold titles, rounded cards, generous spacing
- Brand colour: a rich green leaning slightly teal, `#0F9D7A`, used for main buttons, headers and highlights
- Orange for items in progress, a checkmark for completed items, red only for problems
- A bottom tab bar like Apple apps, with large tap targets that are easy to use with work gloves or dirty hands
- System font (San Francisco on iPhone), smooth transitions, and dark mode later

## Users and roles

- Two users to start: the owner and one other worker, each with their own login
- Both can be assigned to the same job and clock in separately
- Time and work done are tracked per person

## Main screens

1. **Home:** greeting, today's jobs, a big green New job button, quick links to Orders and the Bring list
2. **Jobs list:** every job as a card with customer name, address, job date and a progress bar
3. **Job detail:** customer info with Call and Directions buttons, clock-in status, the punch list, the bring list, orders, and the estimate or bill
4. **Punch list item:** before photos, after photos, measurements, sketch, notes, parts needed, tools needed, status and task timer
5. **Orders:** one combined list of parts across all jobs
6. **Billing:** estimates and invoices per job

## Job walkthrough

When visiting a house to assess the work, the user creates a job and adds punch list items, such as "Fix leaky faucet in the upstairs bathroom". Each item holds:

- Before photos taken with one big camera button
- Measurements, such as width, height and depth, with notes
- A sketch pad for drawing with a finger, including drawing on top of a photo and marking measurements
- Notes
- Parts that need to be ordered
- Tools and materials needed to do the task
- Status: to do, in progress, or done

## Parts and orders

- Each part moves through three stages: needed, ordered, received
- Each part records its name, quantity, cost paid, supplier (optional), and the job and item it belongs to
- Every job shows exactly what was ordered for it and what was paid
- One combined order list across all jobs so nothing is missed
- The cost of each part flows into the bill with the 20% markup

## Bring list (before going to the job)

- Each job has a full list of everything needed to do the job: tools, screws, anchors, drill bits, materials and every small detail
- The list is built from the tools and materials on each punch list item and combined into one checklist for the job, with no duplicates
- Parts that were ordered for the job also appear so they aren't left behind
- The list is checked off while loading the van
- It's tied to the job date, with a reminder the night before

## Time tracking

- An Arrived button clocks in on arrival at the job, and a Finished button clocks out
- Each punch list item has its own start and stop timer, so the app shows exactly how long every task and fix took
- Time is tracked separately for each worker
- Totals per task, per worker and per job

## Before and after photos

- Every item has before photos from the walkthrough and after photos once the fix is done
- They're shown side by side so the client can see what was fixed
- They can be included in a job report or the invoice
- How these are sent to clients, by text or email, will be decided later

## Billing and estimates

- Estimates are built from the punch list: parts plus expected time for each task
- A 20% markup is applied to everything, and it can be changed in settings
- Example: a part that cost $50 shows as $60 on the estimate or bill
- Actual time is tracked during the job and compared against the estimate to improve future pricing
- The exact way labour time is charged, from arrival to finish versus per task, is still to be decided
- The estimate converts into an invoice when the job is done

## Still to decide

- App name (shown as "Handyman" for now; it's easy to change in `vite.config.ts` and `index.html`)
- How labour time is charged
- How reports and invoices are sent to clients
