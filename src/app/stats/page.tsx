'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, fmtMoney, fmtPct } from '@/components/api';

interface Scorecard {
  closer: string;
  from: string;
  to: string;
  funnel: {
    totalLeads: number;
    dials: number;
    pickups: number;
    callsOnCalendar: number;
    callsTaken: number;
    noShows: number;
    reschedules: number;
    closedDeals: number;
  };
  money: {
    newMrrClients: number;
    oneTime: number;
    mrr: number;
    contractValue: number;
    cashCollected: number;
    commission: number;
    avgSpeedToLeadMin: number | null;
  };
  rates: { connect: number | null; showUp: number | null; close: number | null };
}

interface CloserRow {
  closer: string;
  worked: number;
  appts: number;
  won: number;
  revenue: number;
}

interface RoasRow {
  adSetName: string;
  campaignName: string;
  leadCount: number;
  won: number;
  oneTimeRev: number;
  mrr: number;
  spend: number;
  annualizedRoas: number | null;
}

interface AdRow {
  adName: string;
  leadCount: number;
  won: number;
  appts: number;
}

export default function StatsPage() {
  const [closers, setClosers] = useState<string[]>(['All']);
  const [closer, setCloser] = useState('All');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [card, setCard] = useState<Scorecard | null>(null);
  const [byCloser, setByCloser] = useState<CloserRow[]>([]);
  const [roas, setRoas] = useState<RoasRow[]>([]);
  const [ads, setAds] = useState<Record<string, AdRow[]>>({});
  const [spendDrafts, setSpendDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    api<{ id: number; name: string }[]>('/api/closers').then((rows) => setClosers(['All', ...rows.map((r) => r.name)]));
  }, []);

  const load = useCallback(() => {
    const q = new URLSearchParams();
    if (closer) q.set('closer', closer);
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    api<Scorecard>(`/api/stats/scorecard?${q}`).then((d) => {
      setCard(d);
      if (!from) setFrom(d.from);
      if (!to) setTo(d.to);
    });
    api<CloserRow[]>('/api/stats/by-closer').then(setByCloser);
    api<RoasRow[]>('/api/stats/roas').then(setRoas);
  }, [closer, from, to]);

  useEffect(load, [load]);

  async function toggleAds(adSet: string) {
    if (ads[adSet]) {
      setAds((p) => {
        const n = { ...p };
        delete n[adSet];
        return n;
      });
      return;
    }
    const rows = await api<AdRow[]>(`/api/stats/roas?adSet=${encodeURIComponent(adSet)}`);
    setAds((p) => ({ ...p, [adSet]: rows }));
  }

  async function saveSpend(adSet: string) {
    const v = Number(spendDrafts[adSet]);
    if (Number.isNaN(v) || v < 0) return;
    await api('/api/ad-spend', { method: 'PUT', body: JSON.stringify({ adSetName: adSet, spend: v }) });
    load();
  }

  const F = card?.funnel;
  const M = card?.money;
  const R = card?.rates;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-zinc-500">Closer</label>
          <select value={closer} onChange={(e) => setCloser(e.target.value)} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm">
            {closers.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-500">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-zinc-500">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm" />
        </div>
        <span className="pb-1 text-xs text-zinc-500">Defaults to month-to-date</span>
      </div>

      {card && F && M && R && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Section title="FUNNEL" color="bg-violet-900">
            <Row label="Total Leads" value={F.totalLeads} />
            <Row label="Dials" value={F.dials} />
            <Row label="Pickups" value={F.pickups} />
            <Row label="Sales Calls on Calendar" value={F.callsOnCalendar} />
            <Row label="Sales Calls Taken" value={F.callsTaken} />
            <Row label="No-Shows" value={F.noShows} />
            <Row label="Reschedules" value={F.reschedules} />
            <Row label="Closed Deals" value={F.closedDeals} />
          </Section>
          <Section title="MONEY" color="bg-emerald-900">
            <Row label="New MRR Clients" value={M.newMrrClients} />
            <Row label="One-Time Booked" value={fmtMoney(M.oneTime)} />
            <Row label="New MRR ($/mo)" value={fmtMoney(M.mrr)} />
            <Row label="Contract Value (1x + 12mo MRR)" value={fmtMoney(M.contractValue)} />
            <Row label="Cash Collected" value={fmtMoney(M.cashCollected)} />
            <Row label="Commission (est.)" value={fmtMoney(M.commission)} />
            <Row label="Avg Speed to Lead" value={M.avgSpeedToLeadMin != null ? `${M.avgSpeedToLeadMin} min` : 'n/a'} />
          </Section>
          <Section title="RATES" color="bg-sky-900">
            <Row label="Connect Rate (pickups / dials)" value={fmtPct(R.connect)} />
            <Row label="Show-up Rate (taken / on calendar)" value={fmtPct(R.showUp)} />
            <Row label="Close Rate (closed / taken)" value={fmtPct(R.close)} />
          </Section>
        </div>
      )}

      <h2 className="mt-8 mb-2 text-sm font-bold text-zinc-300">BY CLOSER (who controls the leads — all time)</h2>
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-xs text-zinc-400">
            <tr>
              <th className="px-3 py-2">Closer</th>
              <th className="px-3 py-2 text-right">Worked</th>
              <th className="px-3 py-2 text-right">Appts</th>
              <th className="px-3 py-2 text-right">Won</th>
              <th className="px-3 py-2 text-right">Rev (1x + MRR)</th>
            </tr>
          </thead>
          <tbody>
            {byCloser.map((r) => (
              <tr key={r.closer} className="border-t border-zinc-800">
                <td className="px-3 py-2 font-semibold">{r.closer}</td>
                <td className="px-3 py-2 text-right">{r.worked}</td>
                <td className="px-3 py-2 text-right">{r.appts}</td>
                <td className="px-3 py-2 text-right">{r.won}</td>
                <td className="px-3 py-2 text-right">{fmtMoney(r.revenue)}</td>
              </tr>
            ))}
            {byCloser.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-zinc-500" colSpan={5}>
                  No owned leads yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 mb-2 text-sm font-bold text-zinc-300">
        BY AD SET (attribution / ROAS — type spend into the yellow cells, Enter to save)
      </h2>
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-xs text-zinc-400">
            <tr>
              <th className="px-3 py-2">Ad Set</th>
              <th className="px-3 py-2">Campaign</th>
              <th className="px-3 py-2 text-right">Ad Spend</th>
              <th className="px-3 py-2 text-right">Leads</th>
              <th className="px-3 py-2 text-right">Won</th>
              <th className="px-3 py-2 text-right">One-Time Rev</th>
              <th className="px-3 py-2 text-right">New MRR</th>
              <th className="px-3 py-2 text-right">Annualized ROAS</th>
            </tr>
          </thead>
          <tbody>
            {roas.map((r) => (
              <>
                <tr key={r.adSetName} className="border-t border-zinc-800">
                  <td className="px-3 py-2">
                    <button onClick={() => toggleAds(r.adSetName)} className="text-left font-semibold hover:text-emerald-400">
                      {ads[r.adSetName] ? '▾' : '▸'} {r.adSetName}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">{r.campaignName}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      className="w-24 rounded border border-amber-700/60 bg-amber-950/40 px-1 py-0.5 text-right text-amber-200"
                      value={spendDrafts[r.adSetName] ?? (r.spend ? String(r.spend) : '')}
                      placeholder="$0"
                      onChange={(e) => setSpendDrafts((p) => ({ ...p, [r.adSetName]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && saveSpend(r.adSetName)}
                      onBlur={() => spendDrafts[r.adSetName] != null && saveSpend(r.adSetName)}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">{r.leadCount}</td>
                  <td className="px-3 py-2 text-right">{r.won}</td>
                  <td className="px-3 py-2 text-right">{fmtMoney(r.oneTimeRev)}</td>
                  <td className="px-3 py-2 text-right">{fmtMoney(r.mrr)}</td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {r.annualizedRoas != null ? `${r.annualizedRoas.toFixed(2)}x` : '—'}
                  </td>
                </tr>
                {ads[r.adSetName]?.map((a) => (
                  <tr key={`${r.adSetName}:${a.adName}`} className="border-t border-zinc-900 bg-zinc-950/60 text-xs text-zinc-400">
                    <td className="py-1.5 pr-3 pl-8">{a.adName || '(no ad name)'}</td>
                    <td></td>
                    <td></td>
                    <td className="px-3 py-1.5 text-right">{a.leadCount}</td>
                    <td className="px-3 py-1.5 text-right">{a.won}</td>
                    <td className="px-3 py-1.5 text-right" colSpan={3}>
                      {a.appts} appts
                    </td>
                  </tr>
                ))}
              </>
            ))}
            {roas.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-zinc-500" colSpan={8}>
                  No ad-attributed leads yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <div className={`${color} px-3 py-2 text-sm font-bold`}>{title}</div>
      <div className="divide-y divide-zinc-900">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between px-3 py-1.5 text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
