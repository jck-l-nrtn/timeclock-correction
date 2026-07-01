# Timesheet Program — Jibble missed-timeclock corrections

A webapp for employees to report missed clock-ins/outs and request time
adjustments, for admins to review/approve them, and to push approved
corrections into [Jibble](https://www.jibble.io) via its API.

## Stack

- **Backend:** Node + Express + TypeScript (`apps/api`)
- **Frontend:** React + Vite + TypeScript (`apps/web`)
- **DB:** SQLite via Prisma (swap to Postgres by changing the datasource)
- **Shared:** typed DTOs + zod schemas (`packages/shared`)
- npm workspaces monorepo

## Quick start

```bash
npm install
cp apps/api/.env.example apps/api/.env

# set up the database
npm run db:migrate      # creates SQLite db + tables
npm run db:seed         # seeds a dev admin

# run both apps (api :4000, web :5173)
npm run dev
```

Health check: `curl http://localhost:4000/api/health`

## Jibble API (integration boundary)

All Jibble calls go through `apps/api/src/services/jibbleClient.ts`.

| Purpose | Endpoint |
| --- | --- |
| Token (client_credentials) | `POST {identity}/connect/token` |
| Find person by email | `GET {workspace}/v1/People` |
| Read time entries | `GET {timeTracking}/v1/TimeEntries` |
| Create / edit entry | `POST` / `PATCH {timeTracking}/v1/TimeEntries` |

> **Open question:** whether the org API key has **write** scope on
> `TimeEntries`. Until confirmed, the client runs as a stub and approvals emit a
> manual instruction instead of writing. See the adapter for details.

## Build phases

1. ✅ **Skeleton** — workspaces, both apps boot, DB + health check.
2. ✅ Employee submission form + `POST /api/requests` (zod-validated).
3. ✅ Employee status lookup via magic-link.
4. ✅ Admin dashboard (session auth) + approve/deny wired to the Jibble adapter.
5. ✅ Real Jibble client — token cache, People lookup, verified `TimeEntries` write.
6. ✅ **Timesheet view** — employees see their live Jibble timesheet, pick an
   entry to request a correction (edit = delete-old + create-new), or add a
   missing entry. `GET /api/timesheet` (magic-link gated).
7. ✅ Notifications (webhook), digital record on decision, employee signature/acknowledgement.
8. ⬜ Admin SSO via Jibble (replaces dev-login; seam already in place).
9. ⬜ Optional: real SMTP email, in-place `PATCH` edits, auto-apply of adjustments.

### Jibble write recipe (verified)

`POST {timeTracking}/v1/TimeEntries` with `personId, type (In/Out),
status:"Active", time (UTC, not future), offset (ISO-8601 duration),
belongsToDate, platform:{isQrKiosk:false}` and the `is*` booleans. **Do not send
`localTime`** — the server derives it (sending it triggers `nullableType`).
Delete via `DELETE {timeTracking}/v1/TimeEntries(<unquoted-guid>)`.
