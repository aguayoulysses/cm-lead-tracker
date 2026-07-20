/**
 * Prints scorecard / by-closer / ROAS numbers straight from the DB so they can
 * be cross-checked against the old sheet's KPI Scorecard, Dashboard, and
 * Performance tabs before the sheet is retired. Run: pnpm verify
 */
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { leads } from '../src/db/schema';
import { todayInTz } from '../src/lib/dates';
import { byCloser, roasByAdSet, scorecard } from '../src/lib/metrics';

async function main() {
  const today = todayInTz();
  const monthStart = `${today.slice(0, 7)}-01`;

  const totals = await db
    .select({
      leads: sql<number>`count(*)`,
      open: sql<number>`sum(case when ${leads.followUpNeeded} then 1 else 0 end)`,
      oneTime: sql<number>`coalesce(sum(${leads.oneTimeValue}), 0)`,
      mrr: sql<number>`coalesce(sum(${leads.mrrValue}), 0)`,
      cash: sql<number>`coalesce(sum(${leads.cashCollected}), 0)`,
      won: sql<number>`sum(case when ${leads.status} = 'Closed Won' then 1 else 0 end)`,
    })
    .from(leads);
  const t = totals[0];

  console.log('=== ALL-TIME TOTALS (cross-check vs Commission tab TOTALS) ===');
  console.log(`Leads: ${t.leads}  |  open w/ follow-up: ${t.open}  |  Closed Won: ${t.won}`);
  console.log(`One-Time Revenue: $${t.oneTime}  |  New MRR: $${t.mrr}  |  Cash Collected: $${t.cash}`);

  console.log(`\n=== KPI SCORECARD  All | ${monthStart} .. ${today}  (cross-check vs KPI Scorecard tab) ===`);
  const sc = await scorecard({ closer: 'All', from: monthStart, to: today });
  console.log('Funnel:', JSON.stringify(sc.funnel));
  console.log('Money :', JSON.stringify(sc.money));
  console.log('Rates :', JSON.stringify(sc.rates));

  console.log('\n=== BY CLOSER (cross-check vs Dashboard BY CLOSER) ===');
  for (const r of await byCloser()) {
    console.log(`${r.closer.padEnd(10)} worked=${r.worked}  appts=${r.appts}  won=${r.won}  rev=$${r.revenue}`);
  }

  console.log('\n=== BY AD SET (cross-check vs Performance BY AD SET ROAS) ===');
  for (const r of await roasByAdSet()) {
    console.log(
      `${r.adSetName.slice(0, 40).padEnd(40)} leads=${r.leadCount}  won=${r.won}  1x=$${r.oneTimeRev}  mrr=$${r.mrr}  spend=$${r.spend}  roas=${r.annualizedRoas ?? '-'}`,
    );
  }
}

main().then(() => process.exit(0));
