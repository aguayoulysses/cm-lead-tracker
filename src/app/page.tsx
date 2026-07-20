'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, statusChip, fmtMoney, type Buckets, type BucketLead } from '@/components/api';
import { Avatar } from '@/components/avatar';
import { LeadCard } from '@/components/lead-card';
import { CalendarMonth } from '@/components/calendar-month';
import { EodPanel } from '@/components/eod-panel';

type Tab = 'list' | 'directory' | 'calendar' | 'eod';

interface LeaderRow {
  closer: string;
  won: number;
  contractValue: number;
  cashCollected: number;
  dials: number;
  callsTaken: number;
}

interface DirectoryLead {
  id: number;
  name: string;
  phone: string;
  email: string;
  status: string;
  contactedBy: string;
  dateSubmitted: string | null;
  followUpDate: string | null;
  followUpNeeded: boolean;
  oneTimeValue: number;
  mrrValue: number;
  cashCollected: number;
  dateClosed: string | null;
  adSetName: string;
}

export default function WorkPage() {
  const [closers, setClosers] = useState<string[]>([]);
  const [closer, setCloser] = useState('All');
  const [tab, setTab] = useState<Tab>('list');
  const [buckets, setBuckets] = useState<Buckets | null>(null);
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [openLead, setOpenLead] = useState<number | null>(null);
  const [queue, setQueue] = useState<number[]>([]);
  const [showNewLead, setShowNewLead] = useState(false);

  useEffect(() => {
    api<{ id: number; name: string }[]>('/api/closers').then((rows) => {
      setClosers(['All', ...rows.map((r) => r.name)]);
      const saved = localStorage.getItem('cmCloser');
      if (saved) setCloser(saved);
    });
  }, []);

  const loadBuckets = useCallback(() => {
    api<Buckets>(`/api/leads?view=buckets&closer=${encodeURIComponent(closer)}`).then((b) => {
      setBuckets(b);
      const monthStart = `${b.today.slice(0, 7)}-01`;
      api<LeaderRow[]>(`/api/stats/by-closer?from=${monthStart}&to=${b.today}`).then(setLeaders);
    });
  }, [closer]);

  useEffect(loadBuckets, [loadBuckets]);

  function pickCloser(c: string) {
    setCloser(c);
    localStorage.setItem('cmCloser', c);
  }

  /** Open a lead as part of the work queue (overdue first, then due today). */
  function openFromBuckets(id: number) {
    if (!buckets) return;
    const q = [...buckets.overdue, ...buckets.dueToday].map((l) => l.id);
    setQueue(q.includes(id) ? q : []);
    setOpenLead(id);
  }

  function advanceQueue(saved: boolean) {
    loadBuckets();
    if (queue.length && openLead != null) {
      const i = queue.indexOf(openLead);
      if (i >= 0 && i + 1 < queue.length) {
        setOpenLead(queue[i + 1]);
        return;
      }
    }
    setOpenLead(null);
    if (saved && queue.length) setQueue([]);
  }

  const queueIndex = openLead != null ? queue.indexOf(openLead) : -1;
  const todayLabel = buckets
    ? new Date(`${buckets.today}T12:00:00`).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    : '';

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex overflow-hidden rounded-lg border border-line bg-card">
          {closers.map((c) => (
            <button
              key={c}
              onClick={() => pickCloser(c)}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors ${
                closer === c ? 'bg-navy text-white' : 'text-muted hover:bg-canvas hover:text-ink'
              }`}
            >
              {c !== 'All' && <Avatar name={c} size={22} />}
              {c}
            </button>
          ))}
        </div>
        <span className="text-sm text-muted">{todayLabel}</span>
        <div className="ml-auto flex items-center gap-4">
          <nav className="flex gap-1 rounded-lg border border-line bg-card p-0.5">
            {(
              [
                ['list', 'Follow-Ups'],
                ['directory', 'All Leads'],
                ['calendar', 'Calendar'],
                ['eod', 'End of Day'],
              ] as [Tab, string][]
            ).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  tab === t ? 'bg-bluesoft text-blueink' : 'text-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          <button
            onClick={() => setShowNewLead(true)}
            className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navydeep"
          >
            + New lead
          </button>
        </div>
      </div>

      {leaders.length > 0 && tab !== 'eod' && <Leaderboard rows={leaders} />}

      {tab === 'list' && buckets && (
        <>
          {(buckets.overdue.length > 0 || buckets.dueToday.length > 0) && (
            <button
              onClick={() => openFromBuckets([...buckets.overdue, ...buckets.dueToday][0].id)}
              className="mb-4 w-full rounded-xl bg-navy py-3 text-sm font-bold text-white shadow-sm hover:bg-navydeep"
            >
              ▶ Work the queue — {buckets.overdue.length + buckets.dueToday.length} leads due
              {closer !== 'All' ? ` for ${closer}` : ''}
            </button>
          )}
          <div className="grid items-start gap-5 md:grid-cols-3">
            <Bucket tone="red" label="Overdue" leads={buckets.overdue} onOpen={openFromBuckets} />
            <Bucket tone="amber" label="Due today" leads={buckets.dueToday} onOpen={openFromBuckets} />
            <Bucket tone="blue" label="Next 7 days" leads={buckets.next7} onOpen={(id) => { setQueue([]); setOpenLead(id); }} />
          </div>
        </>
      )}

      {tab === 'directory' && <Directory closers={closers} onOpen={(id) => { setQueue([]); setOpenLead(id); }} />}
      {tab === 'calendar' && <CalendarMonth closer={closer} onOpenLead={(id) => { setQueue([]); setOpenLead(id); }} />}
      {tab === 'eod' && <EodPanel />}

      {openLead != null && buckets && (
        <LeadCard
          leadId={openLead}
          actingCloser={closer}
          today={buckets.today}
          queuePos={queueIndex >= 0 ? { index: queueIndex, total: queue.length } : undefined}
          onClose={() => { setOpenLead(null); setQueue([]); loadBuckets(); }}
          onSaved={() => advanceQueue(true)}
          onNext={queueIndex >= 0 ? () => advanceQueue(false) : undefined}
        />
      )}

      {showNewLead && (
        <NewLeadModal
          onClose={() => setShowNewLead(false)}
          onCreated={() => {
            setShowNewLead(false);
            loadBuckets();
          }}
        />
      )}
    </div>
  );
}

function Leaderboard({ rows }: { rows: LeaderRow[] }) {
  const top = Math.max(...rows.map((r) => r.contractValue), 1);
  const medals = ['bg-amber text-white', 'bg-faint text-white', 'bg-[#b08d57] text-white'];
  return (
    <div className="card mb-5 overflow-hidden">
      <p className="eyebrow border-b border-line px-4 py-2.5 text-muted">This month&rsquo;s board</p>
      <div className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {rows.slice(0, 3).map((r, i) => (
          <div key={r.closer} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="relative shrink-0">
                <Avatar name={r.closer} size={34} />
                <span
                  className={`absolute -right-1 -bottom-1 flex h-4.5 w-4.5 items-center justify-center rounded-full text-[10px] font-bold ${medals[i] ?? 'bg-canvas text-muted'}`}
                >
                  {i + 1}
                </span>
              </span>
              <span className="text-sm font-bold">{r.closer}</span>
              <span className="ml-auto text-lg font-bold text-navydeep">{fmtMoney(r.contractValue)}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas">
              <div className="h-full rounded-full bg-blue" style={{ width: `${Math.max((r.contractValue / top) * 100, 3)}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {r.won} won &middot; {r.callsTaken} calls &middot; {r.dials} dials &middot; {fmtMoney(r.cashCollected)} cash
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

const TONES: Record<string, { rail: string; dot: string; count: string }> = {
  red: { rail: 'bg-red', dot: 'bg-red', count: 'bg-redsoft text-redink' },
  amber: { rail: 'bg-amber', dot: 'bg-amber', count: 'bg-ambersoft text-amberink' },
  blue: { rail: 'bg-blue', dot: 'bg-blue', count: 'bg-bluesoft text-blueink' },
};

function Bucket({
  tone,
  label,
  leads,
  onOpen,
}: {
  tone: keyof typeof TONES;
  label: string;
  leads: BucketLead[];
  onOpen: (id: number) => void;
}) {
  const t = TONES[tone];
  return (
    <div className="card overflow-hidden">
      <div className={`h-1 ${t.rail}`} />
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span className={`h-2 w-2 rounded-full ${t.dot}`} />
        <span className="eyebrow text-muted">{label}</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${t.count}`}>{leads.length}</span>
      </div>
      {leads.length === 0 && <p className="px-4 pb-4 text-sm text-faint">Nothing here — clear.</p>}
      <div className="max-h-[60vh] overflow-y-auto">
        {leads.map((l) => (
          <button
            key={l.id}
            onClick={() => onOpen(l.id)}
            className="block w-full border-t border-line px-4 py-2.5 text-left transition-colors hover:bg-bluesoft/50"
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold">{l.name}</span>
              <span className="shrink-0 text-xs text-faint">{l.date?.slice(5).replace('-', '/')}</span>
            </span>
            <span className="mt-1 flex items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${statusChip(l.status)}`}>{l.status}</span>
              {l.by && <span className="text-[11px] text-faint">{l.by}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Directory({ closers, onOpen }: { closers: string[]; onOpen: (id: number) => void }) {
  const [all, setAll] = useState<DirectoryLead[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('All');
  const [who, setWho] = useState('All');

  useEffect(() => {
    api<{ leads: DirectoryLead[] }>('/api/leads?view=all').then((d) => setAll(d.leads));
  }, []);

  const statuses = ['All', ...new Set(all.map((l) => l.status))];
  const filtered = all.filter((l) => {
    if (status !== 'All' && l.status !== status) return false;
    if (who !== 'All' && l.contactedBy !== who) return false;
    if (q) {
      const s = q.toLowerCase();
      if (!l.name.toLowerCase().includes(s) && !l.phone.includes(q) && !l.email.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <input
          placeholder="Search name, phone, email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="field max-w-64"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="field max-w-44">
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={who} onChange={(e) => setWho(e.target.value)} className="field max-w-36">
          {closers.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <span className="ml-auto text-xs text-faint">
          {filtered.length} of {all.length} leads
        </span>
      </div>
      <div className="max-h-[65vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b border-line text-left text-xs font-semibold text-muted">
              <th className="px-4 py-2">Lead</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Closer</th>
              <th className="px-4 py-2">Submitted</th>
              <th className="px-4 py-2 text-right">One-time</th>
              <th className="px-4 py-2 text-right">MRR</th>
              <th className="px-4 py-2 text-right">Cash</th>
              <th className="px-4 py-2">Next follow-up</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr
                key={l.id}
                onClick={() => onOpen(l.id)}
                className="cursor-pointer border-b border-line last:border-b-0 hover:bg-bluesoft/40"
              >
                <td className="px-4 py-2">
                  <span className="font-semibold">{l.name}</span>
                  <span className="block text-xs text-faint">{l.phone}</span>
                </td>
                <td className="px-4 py-2">
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${statusChip(l.status)}`}>{l.status}</span>
                </td>
                <td className="px-4 py-2 text-muted">{l.contactedBy || '—'}</td>
                <td className="px-4 py-2 text-muted">{l.dateSubmitted ?? '—'}</td>
                <td className="px-4 py-2 text-right">{l.oneTimeValue ? fmtMoney(l.oneTimeValue) : '—'}</td>
                <td className="px-4 py-2 text-right">{l.mrrValue ? fmtMoney(l.mrrValue) : '—'}</td>
                <td className="px-4 py-2 text-right">{l.cashCollected ? fmtMoney(l.cashCollected) : '—'}</td>
                <td className="px-4 py-2 text-muted">{l.followUpNeeded ? (l.followUpDate ?? '—') : '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-4 text-faint">
                  No leads match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NewLeadModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', leadSource: '', notes: '' });
  const [error, setError] = useState('');
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function create() {
    setError('');
    try {
      await api('/api/leads', { method: 'POST', body: JSON.stringify(form) });
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navydeep/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-base font-bold">New lead</h3>
        <p className="mb-3 text-xs text-muted">Added with status New, due for follow-up today.</p>
        {error && <p className="mb-2 rounded-lg bg-redsoft px-3 py-2 text-sm text-redink">{error}</p>}
        {(
          [
            ['firstName', 'First name (required)'],
            ['lastName', 'Last name'],
            ['phone', 'Phone'],
            ['email', 'Email'],
            ['leadSource', 'Lead source — e.g. Referral'],
          ] as [keyof typeof form, string][]
        ).map(([k, label]) => (
          <input key={k} placeholder={label} value={form[k]} onChange={set(k)} className="field mb-2" />
        ))}
        <textarea placeholder="Notes" value={form.notes} onChange={set('notes')} rows={2} className="field mb-3" />
        <button
          onClick={create}
          className="w-full rounded-lg bg-navy py-2 text-sm font-semibold text-white hover:bg-navydeep"
        >
          Add lead
        </button>
      </div>
    </div>
  );
}
