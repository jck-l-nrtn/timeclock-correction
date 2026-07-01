# Deploying (Render + Neon, free)

One Web Service that builds the React app and serves it from the Express API
(same origin), backed by a free Neon Postgres. ~$0/month.

## 1. Database — Neon (free)
1. Sign up at https://neon.tech → create a project.
2. Copy the **connection string** (looks like `postgresql://user:pass@…neon.tech/db?sslmode=require`).

## 2. App — Render (free)
1. Sign up at https://render.com → connect your GitHub.
2. **New → Blueprint** → pick the `timeclock-correction` repo. Render reads
   `render.yaml` and creates the Web Service.
3. Set the secret env vars (Render will prompt for the ones marked "sync: false"):
   - `DATABASE_URL` = your Neon connection string
   - `JIBBLE_CLIENT_ID` = your Jibble API key id
   - `JIBBLE_CLIENT_SECRET` = your Jibble API secret
   - `SESSION_SECRET` is auto-generated; `NODE_ENV`, timezone, etc. come from the blueprint.
4. **Create** → Render runs the build, syncs the DB schema, and starts the app.
5. Open the `https://montane-timeclock.onrender.com` URL it gives you — that's
   your QR-code link.

## Settings (if you create the service manually instead of the blueprint)
It's a **Web Service** (not a Static Site — there is no "publish directory").
- **Build Command:** `npm install --include=dev && npm run build`
- **Start Command:** `npm run db:push --workspace apps/api -- --skip-generate && npm start`
- **Health Check Path:** `/api/health`

## Notes
- **Free tier sleeps** after ~15 min idle (~30–60s cold start on the next visit).
  Upgrade to Starter (~$7/mo) for always-on.
- **First admin:** sign in at `/admin` with a Jibble Admin/Owner email + kiosk PIN.
- **Try it without real writes first:** add env var `JIBBLE_DRY_RUN=true`, then
  remove it to go live.
- **Local dev now uses Postgres** (provider switched). Point `apps/api/.env`
  `DATABASE_URL` at a Neon branch (or a local Postgres) and run `npm run db:push`.
