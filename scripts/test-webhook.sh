#!/bin/bash
# Webhook smoke test — see docs/WEBHOOK-SETUP.md for the full SOP.
# Usage: ./scripts/test-webhook.sh [host]   (default http://localhost:3010)
set -euo pipefail
HOST="${1:-http://localhost:3010}"
TOKEN=$(grep '^WEBHOOK_TOKEN=' .env.local | cut -d= -f2-)

echo "1) Unauthorized (expect 401):"
curl -s -X POST "$HOST/api/webhook/lead" -H 'Content-Type: application/json' -d '{"firstName":"X"}'
echo; echo
echo "2) Create (expect 201 + leadId):"
curl -s -X POST "$HOST/api/webhook/lead" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"externalId":"test-webhook-001","firstName":"Webhook","lastName":"Test","phone":"+15550001234","email":"webhook@test.com","leadSource":"Facebook Ads","campaignName":"Test Campaign","adSetName":"Test Ad Set","adName":"Test Ad","notes":"created by scripts/test-webhook.sh"}'
echo; echo
echo "3) Duplicate (expect deduped:true):"
curl -s -X POST "$HOST/api/webhook/lead" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"externalId":"test-webhook-001","firstName":"Webhook"}'
echo; echo
echo "Now check $HOST — the lead should be in DUE TODAY. Clean up with:"
echo "  sqlite3 data/cm.db \"delete from touches where lead_id in (select id from leads where external_id like 'test-%'); delete from leads where external_id like 'test-%';\""
