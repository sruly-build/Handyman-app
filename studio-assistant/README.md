# Studio Assistant (design preview)

A clickable design preview of a photography studio app: home, projects, clients and leads, calendar with Jewish holidays, invoices, client galleries and settings.

It's a visual prototype only. There is no database, no login, and nothing connects to Gmail, Dropbox or Stripe. All clients, shoots, emails, invoices and photos are sample data, and every date is relative to the day you open it, so "today" always has a shoot. Changes you make are kept in your browser for the day; **Settings → Reset sample data** starts over.

## Run it

```
cd studio-assistant
npm install
npm run dev
```

## Deploy to Vercel

1. In Vercel, **Add New → Project** and import this repository.
2. Set **Root Directory** to `studio-assistant`. Vercel detects Vite; the defaults (`npm run build`, output `dist`) are right.
3. Deploy, then open the URL on your phone. In Safari, **Share → Add to Home Screen** makes it open full screen like an app.

## Where things are

- `src/data/sample.ts`: all the fake data
- `src/data/store.tsx`: in-memory state, timers, closed-day and holiday heads-ups
- `src/lib/jewish.ts`: holidays, Chol Hamoed, fast days and Hebrew dates (from `@hebcal/core`)
- `src/screens/`: one file per screen; `/g/:id` is the client's gallery view
- `src/components/ProductPhoto.tsx`: the stand-in plate, bowl and salad bowl "photos", drawn in SVG
