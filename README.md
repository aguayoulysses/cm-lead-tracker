# CM Lead Tracker

Standalone replacement for the "C.M Lead Tracking V2" Google Sheet. Two screens:

- **Work** (`/`) — follow-up buckets (OVERDUE / DUE TODAY / NEXT 7 DAYS), month calendar
  (☎ follow-ups, ★ appointments, click a day → day list → lead card), end-of-day report,
  manual lead entry. Closers pick their name (no password yet — real logins come when this
  joins the Command Center dashboard).
- **Stats** (`/stats`) — KPI scorecard (funnel / money / rates, closer + date filter),
  BY CLOSER table, BY AD SET attribution with inline ad-spend entry and annualized ROAS.

The follow-up engine is a 1:1 port of the sheet's Apps Script: statuses, cadence
(No Answer +1, Voicemail +2, Contacted +3, Nurture +14, default +3, Booked = appt day,
closed statuses stop follow-ups), touch logging, and KPI rows. Engine rules live in
`src/lib/engine.ts` with unit tests.

## Run

```bash
pnpm install
pnpm dev          # http://localhost:3010
pnpm test         # engine unit tests
```

## Data

SQLite at `data/cm.db` (gitignored). Historical data was imported once from the sheet
(Leads, Touch Log, KPI Log, Lists) — see `scripts/import.ts`; TSV dumps go in
`data/import/`. `pnpm import:sheet` wipes and reloads (do NOT run it after live data
exists unless you mean to). `pnpm verify` prints scorecard/by-closer/ROAS for
cross-checking. `pnpm db:seed` seeds roster/statuses/settings on a fresh DB.

Commission rates for the scorecard estimate are in the `settings` table
(`commission.oneTimeRate` = 0.10, `commission.mrrRate` = 0.20, `commission.mrrFactor` = 1,
copied from the sheet's Commission tab).

Timezone: `APP_TZ=America/Chicago` in `.env.local`. All date-only values are stored as
`YYYY-MM-DD` text and "today" is computed in that zone — never parse date strings with
`new Date(str)`.

## Lead intake (webhook, currently dormant)

`POST /api/webhook/lead` is built and tested but disabled (`WEBHOOK_ENABLED=0`).
**The full plug-and-play SOP for connecting GHL/ads is `docs/WEBHOOK-SETUP.md`.**
`scripts/test-webhook.sh` verifies the loop end-to-end.

## Future: Command Center integration

Everything flows through JSON routes under `src/app/api/*` and the service layer
(`src/lib/leadService.ts`, `src/lib/metrics.ts`). Closer identity is a per-request
`actingCloser` string — swap in a real session there when logins arrive. The app can be
linked, iframed, or its API proxied from the dashboard.
