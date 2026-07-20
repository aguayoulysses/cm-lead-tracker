'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, statusChip, fmtMoney, type AttemptedLead, type Buckets, type FreshLead } from '@/components/api';
import { Avatar } from '@/components/avatar';
import { LeadCard } from '@/components/lead-card';
import { CalendarMonth } from '@/components/calendar-month';
import { AppointmentsToday } from '@/components/appointments-today';

type Tab = 'list' | 'directory' | 'calendar';

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
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'directory' || t === 'calendar') setTab(t);
  }, []);

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
    setReloadTick((t) => t + 1);
  }, [closer]);

  useEffect(loadBuckets, [loadBuckets]);

  function pickCloser(c: string) {
    setCloser(c);
    localStorage.setItem('cmCloser', c);
  }

  /** Open a fresh lead, cycling through the new-lead pool. */
  function openFromFresh(id: number) {
    if (!buckets) return;
    const q = buckets.fresh.map((l) => l.id);
    setQueue(q.includes(id) ? q : []);
    setOpenLead(id);
  }

  /** Open an attempted-but-unreached lead, cycling through that pool. */
  function openFromAttempted(id: number) {
    if (!buckets) return;
    const q = buckets.attempted.map((l) => l.id);
    setQueue(q.includes(id) ? q : []);
    setOpenLead(id);
  }

  /** Start the follow-up queue (overdue first, then due today) — lives on the Calendar. */
  function startFollowUpQueue() {
    if (!buckets) return;
    const q = [...buckets.overdue, ...buckets.dueToday].map((l) => l.id);
    if (!q.length) return;
    setQueue(q);
    setOpenLead(q[0]);
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
                ['directory', 'All Leads'],
                ['calendar', 'Calendar'],
              ] as [Tab, string][]
            ).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(tab === t ? 'list' : t)}
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

      {leaders.length > 0 && <Leaderboard rows={leaders} />}

      {tab === 'list' && buckets && (
        <div className="grid items-start gap-5 md:grid-cols-2">
          <FreshBucket leads={buckets.fresh} onOpen={openFromFresh} />
          <AttemptedBucket leads={buckets.attempted} onOpen={openFromAttempted} />
        </div>
      )}

      {tab === 'directory' && <Directory closers={closers} onOpen={(id) => { setQueue([]); setOpenLead(id); }} />}
      {tab === 'calendar' && buckets && (
        <>
          <AppointmentsToday
            closer={closer}
            tick={reloadTick}
            onOpenLead={(id) => { setQueue([]); setOpenLead(id); }}
            onChanged={loadBuckets}
          />
          {buckets.overdue.length + buckets.dueToday.length > 0 && (
            <button
              onClick={startFollowUpQueue}
              className="mb-4 w-full rounded-xl bg-navy py-3 text-sm font-bold text-white shadow-sm hover:bg-navydeep"
            >
              ▶ Work the follow-up queue — {buckets.overdue.length + buckets.dueToday.length} due
              {buckets.overdue.length > 0 && ` (${buckets.overdue.length} overdue)`}
              {closer !== 'All' ? ` · working as ${closer}` : ''}
            </button>
          )}
          <CalendarMonth closer={closer} onOpenLead={(id) => { setQueue([]); setOpenLead(id); }} />
        </>
      )}

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

/** Minutes a fresh lead has been waiting, from its Chicago-time submission. */
function waitingMinutes(dateSubmitted: string | null, timeSubmitted: string): number | null {
  if (!dateSubmitted) return null;
  const m = timeSubmitted.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)?/);
  let mins = 0;
  if (m) {
    let h = Number(m[1]);
    const ap = m[3]?.toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    mins = h * 60 + Number(m[2]);
  }
  const [y, mo, d] = dateSubmitted.split('-').map(Number);
  const submitted = Date.UTC(y, mo - 1, d) / 60000 + mins;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const now = Date.UTC(get('year'), get('month') - 1, get('day')) / 60000 + get('hour') * 60 + get('minute');
  return Math.max(0, Math.round(now - submitted));
}

function waitingLabel(mins: number | null): string {
  if (mins == null) return '';
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${Math.floor(mins / 1440)}d`;
}

function FreshBucket({ leads, onOpen }: { leads: FreshLead[]; onOpen: (id: number) => void }) {
  return (
    <div className="card overflow-hidden">
      <div className="h-1 bg-green" />
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-green" />
        <span className="eyebrow text-muted">New leads</span>
        <span className="ml-auto rounded-full bg-greensoft px-2 py-0.5 text-xs font-semibold text-greenink">{leads.length}</span>
      </div>
      <p className="px-4 pb-2 text-[11px] text-faint">Open pool — first contact claims the lead. Follow-ups live on the Calendar.</p>
      {leads.length === 0 && (
        <p className="px-4 pb-4 text-sm text-faint">No new leads waiting — check the Calendar for follow-ups.</p>
      )}
      <div className="max-h-[60vh] overflow-y-auto">
        {leads.map((l) => {
          const mins = waitingMinutes(l.dateSubmitted, l.timeSubmitted);
          // Speed-to-lead SLA: under 30m is good, under an hour is a warning,
          // past an hour the lead has waited too long.
          const timerTone =
            mins == null
              ? ''
              : mins <= 30
                ? 'bg-greensoft text-greenink'
                : mins <= 60
                  ? 'bg-ambersoft text-amberink'
                  : 'bg-redsoft text-redink';
          return (
            <button
              key={l.id}
              onClick={() => onOpen(l.id)}
              className="block w-full border-t border-line px-4 py-2.5 text-left transition-colors hover:bg-greensoft/50"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold">{l.name}</span>
                {mins != null && (
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${timerTone}`}>
                    ⏱ {waitingLabel(mins)}
                  </span>
                )}
              </span>
              <span className="mt-1 flex items-center gap-2 text-[11px] text-faint">
                {l.phone}
                {l.attempted && <span className="text-amberink">· attempted, no contact yet</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AttemptedBucket({ leads, onOpen }: { leads: AttemptedLead[]; onOpen: (id: number) => void }) {
  return (
    <div className="card overflow-hidden">
      <div className="h-1 bg-amber" />
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span className="h-2 w-2 rounded-full bg-amber" />
        <span className="eyebrow text-muted">No contact yet</span>
        <span className="ml-auto rounded-full bg-ambersoft px-2 py-0.5 text-xs font-semibold text-amberink">{leads.length}</span>
      </div>
      <p className="px-4 pb-2 text-[11px] text-faint">
        Attempted but never reached — still up for grabs. First contact claims the lead.
      </p>
      {leads.length === 0 && <p className="px-4 pb-4 text-sm text-faint">Nothing waiting — every attempted lead has been reached.</p>}
      <div className="max-h-[65vh] overflow-y-auto">
        {leads.map((l) => (
          <button
            key={l.id}
            onClick={() => onOpen(l.id)}
            className="block w-full border-t border-line px-4 py-2.5 text-left transition-colors hover:bg-ambersoft/40"
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold">{l.name}</span>
              <span className="shrink-0 text-xs text-faint">due {l.date?.slice(5).replace('-', '/') ?? '—'}</span>
            </span>
            <span className="mt-1 flex items-center gap-2 text-[11px]">
              <span className={`rounded px-1.5 py-0.5 font-medium ${statusChip(l.status)}`}>{l.status}</span>
              <span className="text-faint">
                {l.attempts} attempt{l.attempts === 1 ? '' : 's'}
                {l.lastAttemptAt && ` · last ${l.lastAttemptAt.slice(5, 16).replace('T', ' ').replace('-', '/')}`}
              </span>
              <span className="ml-auto text-faint">{l.phone}</span>
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
