import { and, eq, gte, isNotNull, lte, ne, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db/client';
import { adSpend, kpiLog, leads, settings } from '@/db/schema';
import { speedToLeadMinutes } from './dates';

/**
 * Scorecard math ported from buildScorecard_ (Code.gs 1141-1224).
 * closer = '' | 'All' means the whole team; otherwise filters by Contacted By
 * (leads) / Closer (kpi log). Date range is inclusive on both ends.
 */

export interface StatsFilter {
  closer?: string;
  from: string; // YYYY-MM-DD
  to: string;
}

function isAll(closer?: string) {
  return !closer || closer === 'All';
}

async function getCommissionRates() {
  const rows = await db.query.settings.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    oneTimeRate: Number(map['commission.oneTimeRate'] ?? 0),
    mrrRate: Number(map['commission.mrrRate'] ?? 0),
    mrrFactor: Number(map['commission.mrrFactor'] ?? 0),
  };
}

export async function scorecard(f: StatsFilter) {
  const all = isAll(f.closer);

  // KPI Log sums in range.
  const kpiWhere = and(
    gte(kpiLog.date, f.from),
    lte(kpiLog.date, f.to),
    ...(all ? [] : [eq(kpiLog.closer, f.closer!)]),
  );
  const kpiSums = await db
    .select({
      dials: sql<number>`coalesce(sum(${kpiLog.dials}), 0)`,
      pickups: sql<number>`coalesce(sum(${kpiLog.pickups}), 0)`,
      callsTaken: sql<number>`coalesce(sum(${kpiLog.salesCallsTaken}), 0)`,
      noShows: sql<number>`coalesce(sum(${kpiLog.noShows}), 0)`,
      reschedules: sql<number>`coalesce(sum(${kpiLog.reschedules}), 0)`,
    })
    .from(kpiLog)
    .where(kpiWhere);
  const k = kpiSums[0];

  const closerCond = all ? [] : [eq(leads.contactedBy, f.closer!)];

  const countLeads = async (
    dateCol: typeof leads.dateSubmitted | typeof leads.apptDate | typeof leads.dateClosed,
    extra: SQL[] = [],
  ) => {
    const rows = await db
      .select({ n: sql<number>`count(*)` })
      .from(leads)
      .where(and(isNotNull(dateCol), gte(dateCol, f.from), lte(dateCol, f.to), ...closerCond, ...extra));
    return rows[0].n;
  };

  const totalLeads = await countLeads(leads.dateSubmitted);
  const callsOnCalendar = await countLeads(leads.apptDate);
  const closedDeals = await countLeads(leads.dateClosed, [eq(leads.status, 'Closed Won')]);

  // Money: sums over Closed Won by Date Closed in range.
  const moneyWhere = and(
    eq(leads.status, 'Closed Won'),
    isNotNull(leads.dateClosed),
    gte(leads.dateClosed, f.from),
    lte(leads.dateClosed, f.to),
    ...closerCond,
  );
  const moneyRows = await db
    .select({
      oneTime: sql<number>`coalesce(sum(${leads.oneTimeValue}), 0)`,
      mrr: sql<number>`coalesce(sum(${leads.mrrValue}), 0)`,
      cash: sql<number>`coalesce(sum(${leads.cashCollected}), 0)`,
      mrrClients: sql<number>`sum(case when ${leads.mrrValue} > 0 then 1 else 0 end)`,
    })
    .from(leads)
    .where(moneyWhere);
  const m = moneyRows[0];
  const rates = await getCommissionRates();
  const contractValue = m.oneTime + 12 * m.mrr;
  const commission = m.oneTime * rates.oneTimeRate + m.mrr * rates.mrrRate * rates.mrrFactor;

  // Speed to lead: average over leads submitted in range with attempt1.
  const spdLeads = await db
    .select({
      dateSubmitted: leads.dateSubmitted,
      timeSubmitted: leads.timeSubmitted,
      attempt1At: leads.attempt1At,
    })
    .from(leads)
    .where(and(isNotNull(leads.dateSubmitted), gte(leads.dateSubmitted, f.from), lte(leads.dateSubmitted, f.to), ...closerCond));
  const speeds = spdLeads
    .map((l) => speedToLeadMinutes(l.dateSubmitted, l.timeSubmitted, l.attempt1At))
    .filter((x): x is number => x != null && x >= 0);
  const avgSpeedToLeadMin = speeds.length
    ? Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10
    : null;

  const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

  return {
    funnel: {
      totalLeads,
      dials: k.dials,
      pickups: k.pickups,
      callsOnCalendar,
      callsTaken: k.callsTaken,
      noShows: k.noShows,
      reschedules: k.reschedules,
      closedDeals,
    },
    money: {
      newMrrClients: m.mrrClients ?? 0,
      oneTime: m.oneTime,
      mrr: m.mrr,
      contractValue,
      cashCollected: m.cash,
      commission,
      avgSpeedToLeadMin,
    },
    rates: {
      connect: ratio(k.pickups, k.dials),
      showUp: ratio(k.callsTaken, callsOnCalendar),
      close: ratio(closedDeals, k.callsTaken),
    },
  };
}

/**
 * Leaderboard: per closer, lead outcomes plus activity (dials/pickups/calls
 * taken from the KPI log). Optional date range; contract value ranks it.
 */
export async function byCloser(range?: { from: string; to: string }) {
  const dateCond = range
    ? [isNotNull(leads.dateSubmitted), gte(leads.dateSubmitted, range.from), lte(leads.dateSubmitted, range.to)]
    : [];
  const rows = await db
    .select({
      closer: leads.contactedBy,
      worked: sql<number>`count(*)`,
      appts: sql<number>`sum(case when ${leads.apptSet} then 1 else 0 end)`,
      won: sql<number>`sum(case when ${leads.status} = 'Closed Won' then 1 else 0 end)`,
      oneTime: sql<number>`coalesce(sum(case when ${leads.status} = 'Closed Won' then ${leads.oneTimeValue} else 0 end), 0)`,
      mrr: sql<number>`coalesce(sum(case when ${leads.status} = 'Closed Won' then ${leads.mrrValue} else 0 end), 0)`,
      cash: sql<number>`coalesce(sum(${leads.cashCollected}), 0)`,
    })
    .from(leads)
    .where(and(ne(leads.contactedBy, ''), ...dateCond))
    .groupBy(leads.contactedBy);

  const kpiCond = range ? [gte(kpiLog.date, range.from), lte(kpiLog.date, range.to)] : [];
  const activity = await db
    .select({
      closer: kpiLog.closer,
      dials: sql<number>`coalesce(sum(${kpiLog.dials}), 0)`,
      pickups: sql<number>`coalesce(sum(${kpiLog.pickups}), 0)`,
      callsTaken: sql<number>`coalesce(sum(${kpiLog.salesCallsTaken}), 0)`,
    })
    .from(kpiLog)
    .where(and(ne(kpiLog.closer, ''), ...kpiCond))
    .groupBy(kpiLog.closer);
  const actMap = new Map(activity.map((a) => [a.closer, a]));

  const names = new Set([...rows.map((r) => r.closer), ...activity.map((a) => a.closer)]);
  return [...names]
    .map((name) => {
      const r = rows.find((x) => x.closer === name);
      const a = actMap.get(name);
      const oneTime = r?.oneTime ?? 0;
      const mrr = r?.mrr ?? 0;
      return {
        closer: name,
        worked: r?.worked ?? 0,
        appts: r?.appts ?? 0,
        won: r?.won ?? 0,
        revenue: oneTime + mrr,
        contractValue: oneTime + 12 * mrr,
        cashCollected: r?.cash ?? 0,
        dials: a?.dials ?? 0,
        pickups: a?.pickups ?? 0,
        callsTaken: a?.callsTaken ?? 0,
      };
    })
    .sort((a, b) => b.contractValue - a.contractValue || b.won - a.won || b.dials - a.dials);
}

/** Performance BY AD SET ROAS: annualized ROAS = (1x + 12*MRR) / spend. */
export async function roasByAdSet() {
  const rows = await db
    .select({
      adSetName: leads.adSetName,
      campaignName: sql<string>`max(${leads.campaignName})`,
      leadCount: sql<number>`count(*)`,
      won: sql<number>`sum(case when ${leads.status} = 'Closed Won' then 1 else 0 end)`,
      oneTimeRev: sql<number>`coalesce(sum(case when ${leads.status} = 'Closed Won' then ${leads.oneTimeValue} else 0 end), 0)`,
      mrr: sql<number>`coalesce(sum(case when ${leads.status} = 'Closed Won' then ${leads.mrrValue} else 0 end), 0)`,
    })
    .from(leads)
    .where(ne(leads.adSetName, ''))
    .groupBy(leads.adSetName);

  const spendRows = await db.query.adSpend.findMany();
  const spendMap = new Map(spendRows.map((s) => [s.adSetName, s.spend]));

  return rows
    .map((r) => {
      const spend = spendMap.get(r.adSetName) ?? 0;
      const annualized = r.oneTimeRev + 12 * r.mrr;
      return {
        ...r,
        spend,
        annualizedRoas: spend > 0 ? Math.round((annualized / spend) * 100) / 100 : null,
      };
    })
    .sort((a, b) => b.leadCount - a.leadCount);
}

/** Per-ad breakdown inside an ad set (for the expandable rows). */
export async function adsForAdSet(adSetName: string) {
  return db
    .select({
      adName: leads.adName,
      leadCount: sql<number>`count(*)`,
      won: sql<number>`sum(case when ${leads.status} = 'Closed Won' then 1 else 0 end)`,
      appts: sql<number>`sum(case when ${leads.apptSet} then 1 else 0 end)`,
    })
    .from(leads)
    .where(eq(leads.adSetName, adSetName))
    .groupBy(leads.adName);
}

export async function setAdSpend(adSetName: string, spend: number) {
  const now = new Date().toISOString();
  await db
    .insert(adSpend)
    .values({ adSetName, spend, updatedAt: now })
    .onConflictDoUpdate({ target: adSpend.adSetName, set: { spend, updatedAt: now } });
}
