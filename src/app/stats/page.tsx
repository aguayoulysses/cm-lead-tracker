'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { api, fmtMoney, fmtPct } from '@/components/api';
import { Avatar } from '@/components/avatar';

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
  contractValue: number;
  cashCollected: number;
  dials: number;
  pickups: number;
  callsTaken: number;
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
    const cq = from && to ? `?from=${from}&to=${to}` : '';
    api<CloserRow[]>(`/api/stats/by-closer${cq}`).then(setByCloser);
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
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-medium text-muted">Closer</label>
          <select value={closer} onChange={(e) => setCloser(e.target.value)} className="field mt-1 max-w-36">
            {closers.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="field mt-1" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="field mt-1" />
        </div>
        <span className="pb-2 text-xs text-faint">Defaults to month-to-date</span>
      </div>

      {byCloser.length > 0 && (
        <div className="card mb-5 overflow-hidden">
          <p className="eyebrow border-b border-line px-4 py-3 text-muted">
            Leaderboard &middot; ranked by contract value (1x + 12&times;MRR) in range
          </p>
          {byCloser.map((r, i) => {
            const top = Math.max(...byCloser.map((x) => x.contractValue), 1);
            const medal =
              i === 0 ? 'bg-amber text-white' : i === 1 ? 'bg-faint text-white' : i === 2 ? 'bg-[#b08d57] text-white' : 'bg-canvas text-muted';
            return (
              <div key={r.closer} className="flex items-center gap-4 border-b border-line px-4 py-3 last:border-b-0">
                <span className="relative shrink-0">
                  <Avatar name={r.closer} size={44} />
                  <span
                    className={`absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${medal}`}
                  >
                    {i + 1}
                  </span>
                </span>
                <div className="w-24 shrink-0">
                  <p className="text-sm font-bold">{r.closer}</p>
                  <p className="text-[11px] text-faint">{r.worked} leads</p>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="h-2 overflow-hidden rounded-full bg-canvas">
                    <div className="h-full rounded-full bg-blue" style={{ width: `${Math.max((r.contractValue / top) * 100, 2)}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {r.dials} dials &middot; {r.pickups} pickups &middot; {r.callsTaken} calls taken &middot; {r.appts} appts &middot;{' '}
                    {r.won} won
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xl font-bold text-navydeep">{fmtMoney(r.contractValue)}</p>
                  <p className="text-[11px] text-muted">{fmtMoney(r.cashCollected)} cash collected</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {card && F && M && R && (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <RateTile label="Connect rate" sub="pickups / dials" value={fmtPct(R.connect)} />
            <RateTile label="Show-up rate" sub="taken / on calendar" value={fmtPct(R.showUp)} />
            <RateTile label="Close rate" sub="closed / taken" value={fmtPct(R.close)} />
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-2">
            <Section title="Funnel">
              <Row label="Total leads" value={F.totalLeads} />
              <Row label="Dials" value={F.dials} />
              <Row label="Pickups" value={F.pickups} />
              <Row label="Sales calls on calendar" value={F.callsOnCalendar} />
              <Row label="Sales calls taken" value={F.callsTaken} />
              <Row label="No-shows" value={F.noShows} />
              <Row label="Reschedules" value={F.reschedules} />
              <Row label="Closed deals" value={F.closedDeals} />
            </Section>
            <Section title="Money">
              <Row label="New MRR clients" value={M.newMrrClients} />
              <Row label="One-time booked" value={fmtMoney(M.oneTime)} />
              <Row label="New MRR ($/mo)" value={fmtMoney(M.mrr)} />
              <Row label="Contract value (1x + 12mo MRR)" value={fmtMoney(M.contractValue)} strong />
              <Row label="Cash collected" value={fmtMoney(M.cashCollected)} />
              <Row label="Commission (est.)" value={fmtMoney(M.commission)} />
              <Row label="Avg speed to lead" value={M.avgSpeedToLeadMin != null ? `${M.avgSpeedToLeadMin} min` : 'n/a'} />
            </Section>
          </div>
        </>
      )}

      <div className="card mt-6 overflow-hidden">
        <p className="eyebrow border-b border-line px-4 py-3 text-muted">
          By ad set &middot; type spend, press Enter to save &middot; ROAS = (1x + 12&times;MRR) / spend
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold text-muted">
                <th className="px-4 py-2">Ad set</th>
                <th className="px-4 py-2">Campaign</th>
                <th className="px-4 py-2 text-right">Ad spend</th>
                <th className="px-4 py-2 text-right">Leads</th>
                <th className="px-4 py-2 text-right">Won</th>
                <th className="px-4 py-2 text-right">One-time rev</th>
                <th className="px-4 py-2 text-right">New MRR</th>
                <th className="px-4 py-2 text-right">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {roas.map((r) => (
                <Fragment key={r.adSetName}>
                  <tr className="border-b border-line">
                    <td className="px-4 py-2.5">
                      <button onClick={() => toggleAds(r.adSetName)} className="text-left font-semibold hover:text-navy">
                        <span className="mr-1 inline-block w-3 text-faint">{ads[r.adSetName] ? '▾' : '▸'}</span>
                        {r.adSetName}
                      </button>
                    </td>
                    <td className="max-w-48 truncate px-4 py-2.5 text-xs text-faint">{r.campaignName}</td>
                    <td className="px-4 py-2.5 text-right">
                      <input
                        className="field max-w-24 border-amber/50 bg-ambersoft/60 text-right"
                        value={spendDrafts[r.adSetName] ?? (r.spend ? String(r.spend) : '')}
                        placeholder="$0"
                        onChange={(e) => setSpendDrafts((p) => ({ ...p, [r.adSetName]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && saveSpend(r.adSetName)}
                        onBlur={() => spendDrafts[r.adSetName] != null && saveSpend(r.adSetName)}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right">{r.leadCount}</td>
                    <td className="px-4 py-2.5 text-right">{r.won}</td>
                    <td className="px-4 py-2.5 text-right">{fmtMoney(r.oneTimeRev)}</td>
                    <td className="px-4 py-2.5 text-right">{fmtMoney(r.mrr)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-navy">
                      {r.annualizedRoas != null ? `${r.annualizedRoas.toFixed(2)}x` : '—'}
                    </td>
                  </tr>
                  {ads[r.adSetName]?.map((a) => (
                    <tr key={`${r.adSetName}:${a.adName}`} className="border-b border-line bg-canvas/60 text-xs text-muted">
                      <td className="py-2 pr-4 pl-11">{a.adName || '(no ad name)'}</td>
                      <td></td>
                      <td></td>
                      <td className="px-4 py-2 text-right">{a.leadCount}</td>
                      <td className="px-4 py-2 text-right">{a.won}</td>
                      <td className="px-4 py-2 text-right" colSpan={3}>
                        {a.appts} appts
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {roas.length === 0 && (
                <tr>
                  <td className="px-4 py-3 text-faint" colSpan={8}>
                    No ad-attributed leads yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RateTile({ label, sub, value }: { label: string; sub: string; value: string }) {
  return (
    <div className="card px-5 py-4">
      <p className="eyebrow text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold text-navydeep">{value}</p>
      <p className="text-xs text-faint">{sub}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <p className="eyebrow border-b border-line px-4 py-3 text-muted">{title}</p>
      <div className="divide-y divide-line">{children}</div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between px-4 py-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className={`tabular-nums ${strong ? 'font-bold text-navy' : 'font-semibold'}`}>{value}</span>
    </div>
  );
}
