# Lead Intake Webhook — Setup SOP (plug-and-play)

This document is self-contained. Whoever connects the ad platform / GoHighLevel to this
app (a teammate, or Claude in a fresh session) needs nothing beyond this file and access
to the machine running the app.

## What this webhook does

`POST /api/webhook/lead` creates a lead in the tracker's database. The follow-up engine
immediately takes over: the lead gets `status = New`, `Follow-Up Needed = Yes`, and a
follow-up date of **today**, so it appears in the closers' **DUE TODAY** bucket on the
Work screen within one refresh. No other wiring is needed downstream — touches, cadence,
calendar, and stats all key off the lead row this endpoint creates.

The endpoint ships **disabled** so nothing can post garbage before ads are live.

## 1. Enable it

In the project root (`~/Projects/cm-lead-tracker`), edit `.env.local`:

```
WEBHOOK_ENABLED=1
WEBHOOK_TOKEN=<generate a long random string and put it here>
```

Generate a token: `openssl rand -hex 24`

Then restart the server (`pnpm dev` for local, or however it's hosted then).
Env vars are read at boot — a restart is required after any change.

## 2. The contract

- **Method/URL**: `POST http://<host>:3010/api/webhook/lead`
- **Headers**:
  - `Content-Type: application/json`
  - `Authorization: Bearer <WEBHOOK_TOKEN>`
- **Body** (JSON). Only `firstName` is required; send everything you have:

| Field | Type | Maps to (old sheet column) | Notes |
|---|---|---|---|
| `externalId` | string | — | The sender's unique id (GHL contact id). **Send it** — it's the dedupe key. |
| `firstName` | string | First Name | **Required.** |
| `lastName` | string | Last Name | |
| `phone` | string | Phone Number | Any format; stored as-is, used for dedupe. |
| `email` | string | Email Address | Used for dedupe. |
| `dateSubmitted` | string | Date Submitted | `YYYY-MM-DD` or `M/D/YYYY`. Defaults to today (America/Chicago). |
| `timeSubmitted` | string | Time Submitted | e.g. `"2:44 PM"`. Feeds speed-to-lead. |
| `leadSource` | string | Lead Source | e.g. `Facebook Ads` (see Lists values below). |
| `leadType` | string | Lead Type | e.g. `Form Fill`. |
| `serviceInterest` | string | Service Interest | e.g. `General Inquiry`. |
| `campaignName` | string | Campaign Name | Ad attribution level 1. |
| `adSetName` | string | Ad Set Name | Attribution level 2 — **ROAS is computed per ad set**, keep it exact. |
| `adName` | string | Ad Name | Attribution level 3. |
| `notes` | string | Lead Notes | The lead's goal / form answers. |

- **Responses**:
  - `201 {"leadId": N}` — created.
  - `200 {"deduped": true, "leadId": N}` — duplicate; nothing created. Dedupe = same
    `externalId`, or same phone/email on the same `dateSubmitted`.
  - `401 {"error":"unauthorized"}` — missing/wrong Bearer token.
  - `422 {"error": "..."}` — payload failed validation (message says which field).
  - `503 {"error":"webhook disabled"}` — `WEBHOOK_ENABLED` is not `1`.

Valid dropdown values (imported from the sheet's Lists tab) live in the `lists` DB table:
`sqlite3 data/cm.db "select kind, value from lists order by kind, sort_order;"`
Unknown values are accepted and stored verbatim — they just won't match existing filters.

## 3. GHL side (typical setup)

In the GHL workflow that fires on a new form submission / lead:
1. Add a **Webhook** action, method POST, URL above.
2. Custom header: `Authorization: Bearer <token>`.
3. Map fields: `externalId` = `{{contact.id}}`, `firstName` = `{{contact.first_name}}`,
   `phone` = `{{contact.phone}}`, etc. Ad attribution comes from
   `{{contact.attributionSource...}}` / the FB ad params GHL captures — match the three
   attribution fields to campaign / ad set / ad names exactly as Meta reports them.

Note: `localhost:3010` is only reachable from this Mac. Once the app moves to its
permanent host (Command Center / Mac mini / tunnel), use that URL — the route is
identical.

## 4. Test it (copy-paste)

`scripts/test-webhook.sh` sends a fake lead, a duplicate, and an unauthorized request,
and tells you what to expect. Or manually:

```bash
TOKEN=$(grep WEBHOOK_TOKEN .env.local | cut -d= -f2)
curl -s -X POST localhost:3010/api/webhook/lead \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"externalId":"test-001","firstName":"Webhook","lastName":"Test","phone":"+15550001234","leadSource":"Facebook Ads","campaignName":"Test Campaign","adSetName":"Test Ad Set","adName":"Test Ad"}'
```

## 5. Verify the full loop (checklist)

- [ ] `curl` above returns `201 {"leadId": ...}`.
- [ ] Re-running the exact same curl returns `{"deduped": true, ...}`.
- [ ] Open `http://<host>:3010` → the lead is in **DUE TODAY** with status **New**.
- [ ] Open the lead card → attribution line shows `campaign > ad set > ad`.
- [ ] Log an outcome on it → it reschedules per cadence and a touch appears.
- [ ] `http://<host>:3010/stats` → Total Leads incremented; the ad set appears in BY AD SET.
- [ ] Delete the test lead when done:
      `sqlite3 data/cm.db "delete from touches where lead_id in (select id from leads where external_id like 'test-%'); delete from leads where external_id like 'test-%';"`

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `503 webhook disabled` | `WEBHOOK_ENABLED` not `1`, or server not restarted after editing `.env.local`. |
| `401 unauthorized` | Header must be exactly `Authorization: Bearer <token>` — check for trailing spaces/newlines in GHL's header field. |
| `422` firstName required | GHL sent an empty first name — map a fallback (e.g. "Unknown"). |
| Lead created but no ad attribution | The three attribution fields arrived empty — check GHL's field mapping, not this app. |
| Nothing arrives at all | GHL can't reach the host (localhost isn't public). The app must be on a reachable URL — tunnel (cloudflared) or hosted. |
| Wrong "today" on leads | Timezone is `APP_TZ` in `.env.local` (America/Chicago). Don't change it casually — follow-up dates key off it. |

## 7. Where the code lives

- Route + validation + dedupe: `src/app/api/webhook/lead/route.ts`
- Lead creation + follow-up default: `createLead()` in `src/lib/leadService.ts`
- Cadence/engine rules: `src/lib/engine.ts` (mirrors the old Google Sheet's Apps Script 1:1)
