# Scan Dashboard

A tiny website that receives barcode scans from the Scan phone app and shows
them per account. No Firebase, no complex setup - just Node.js and a JSON
file for storage.

## How it works

1. You register an account on the website (name, email, password).
2. On your phone: **Menu → Settings → Website Sync**, tap the copy icon to
   copy your token.
3. On the website: go to **Settings**, paste that token, and save.
4. On your phone, in that same Website Sync section, set the **Website URL**
   to `https://your-domain.com/api/scan` (whatever address this site ends up
   running at) and turn the toggle on.
5. Every barcode you scan in the app now shows up on the **Scans** page
   within a few seconds.

## Running it locally

```bash
npm install
npm start
```

Then open http://localhost:3000 in your browser.

## Deploying it so your phone can reach it

The phone needs a real internet address, not `localhost`. Any of these work
and all have free tiers:

- **Railway** (railway.app) - connect this folder as a GitHub repo, it
  auto-detects Node.js and deploys.
- **Render** (render.com) - "New Web Service", point it at this repo,
  build command `npm install`, start command `npm start`.
- A cheap VPS (e.g. a $5/month droplet) with `pm2` to keep it running.

Whichever you pick, once it's live you'll get a URL like
`https://your-app-name.onrender.com` - use `https://your-app-name.onrender.com/api/scan`
as the Website URL in the phone app's Settings.

**Important:** set a real `JWT_SECRET` environment variable on whatever host
you deploy to (a long random string) - the fallback baked into the code is
only for local testing.

## Data storage

Everything (accounts + scans) lives in `data/db.json`, created automatically
on first run. This is fine for a single shop's worth of data; if this ever
needs to support many accounts at real scale, swap `db.js` for a real
database (Postgres, SQLite, etc.) without touching the routes - they all go
through `readDb()` / `writeDb()`.

## API

### `POST /api/scan`

Called by the phone app on every scan.

Headers: `Authorization: Bearer <token>` (or pass `token` in the body)

Body:
```json
{
  "token": "the-phone's-token",
  "barcode": "6111234567890",
  "productName": "Coca Cola 1L",
  "price": 120.5,
  "scannedAt": "2026-09-06T13:44:06.764Z"
}
```

Responses: `201` on success, `401` if the token doesn't match any account,
`400` if `barcode` is missing.
