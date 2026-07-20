'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, statusChip } from './api';
import { Avatar } from './avatar';

interface Appt {
  id: number;
  name: string;
  phone: string;
  status: string;
  by: string;
  time: string;
  updated: boolean;
}

type OutcomeKind = 'no_show' | 'reschedule' | 'dq';

function tomorrowYmd(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [y, m, d] = parts.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * Today's appointments with mandatory-update tracking. The outcome toggler
 * expands per appointment: No-show (note + next follow-up), Reschedule
 * (new date/time), DQ (required reason), or the full lead card. Every save
 * goes through the engine, so the lead's history, status, follow-ups, and
 * all stats update together.
 */
export function AppointmentsToday({
  closer,
  tick,
  onOpenLead,
  onChanged,
}: {
  closer: string;
  tick: number;
  onOpenLead: (id: number) => void;
  onChanged: () => void;
}) {
  const [date, setDate] = useState('');
  const [appts, setAppts] = useState<Appt[]>([]);
  const [open, setOpen] = useState<{ id: number; kind: OutcomeKind } | null>(null);
  const [note, setNote] = useState('');
  const [fuDate, setFuDate] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [dqReason, setDqReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ date: string; appointments: Appt[] }>(`/api/appointments?closer=${encodeURIComponent(closer)}`).then((d) => {
      setDate(d.date);
      setAppts(d.appointments);
    });
  }, [closer]);

  useEffect(load, [load, tick]);

  function toggle(id: number, kind: OutcomeKind) {
    setError('');
    if (open && open.id === id && open.kind === kind) {
      setOpen(null);
      return;
    }
    setOpen({ id, kind });
    setNote('');
    setDqReason('');
    setFuDate(tomorrowYmd());
    setNewDate('');
    setNewTime('');
  }

  async function saveNoShow(id: number) {
    setBusy(true);
    setError('');
    try {
      await api(`/api/leads/${id}/appointment-outcome`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'no_show', actor: closer, note, followUpDate: fuDate || null }),
      });
      setOpen(null);
      load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function saveReschedule(id: number) {
    if (!newDate || !newTime.trim()) {
      setError('Reschedule needs a new date and time.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(`/api/leads/${id}/appointment-outcome`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'rescheduled', newDate, newTime: newTime.trim(), actor: closer }),
      });
      setOpen(null);
      load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function saveDq(id: number) {
    if (!dqReason.trim()) {
      setError('DQ needs a reason — why is this lead disqualified?');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(`/api/leads/${id}/outcome`, {
        method: 'POST',
        body: JSON.stringify({ status: 'Disqualified', note: dqReason.trim(), channel: '', actingCloser: closer }),
      });
      setOpen(null);
      load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  const pending = appts.filter((a) => !a.updated).length;
  if (appts.length === 0) return null;

  const toggleBtn = (active: boolean, tone: string) =>
    `rounded-lg border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${active ? tone : 'border-line bg-white text-muted hover:text-ink'}`;

  return (
    <div className="card mb-4 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className={`h-2 w-2 rounded-full ${pending ? 'animate-pulse bg-amber' : 'bg-green'}`} />
        <span className="eyebrow text-muted">Appointments today &middot; {date}</span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${
            pending ? 'bg-ambersoft text-amberink' : 'bg-greensoft text-greenink'
          }`}
        >
          {pending ? `${pending} need${pending === 1 ? 's' : ''} an update` : 'All updated'}
        </span>
      </div>
      <p className="border-b border-line px-4 py-1.5 text-[11px] text-faint">
        Every appointment gets an outcome logged today. Every save writes to the lead&rsquo;s history and updates the stats.
      </p>
      {error && <p className="mx-4 mt-2 rounded-lg bg-redsoft px-3 py-2 text-sm text-redink">{error}</p>}
      {appts.map((a) => (
        <div key={a.id} className={`border-b border-line last:border-b-0 ${a.updated ? 'bg-greensoft/30' : ''}`}>
          <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <span className="text-green">★</span>
            <button onClick={() => onOpenLead(a.id)} className="text-left font-semibold hover:text-navy">
              {a.name}
            </button>
            <span className="text-sm text-muted">{a.time || 'no time'}</span>
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${statusChip(a.status)}`}>{a.status}</span>
            {a.by && (
              <span className="flex items-center gap-1 text-xs text-muted">
                <Avatar name={a.by} size={18} /> {a.by}
              </span>
            )}
            <span className="ml-auto flex items-center gap-2">
              {a.updated ? (
                <span className="rounded-full bg-greensoft px-2.5 py-1 text-xs font-bold text-greenink">✓ Updated</span>
              ) : (
                <>
                  <span className="rounded-full bg-ambersoft px-2.5 py-1 text-xs font-bold text-amberink">Needs update</span>
                  <button
                    onClick={() => toggle(a.id, 'no_show')}
                    disabled={busy}
                    className={toggleBtn(open?.id === a.id && open.kind === 'no_show', 'border-red/50 bg-redsoft text-redink')}
                  >
                    No-show
                  </button>
                  <button
                    onClick={() => toggle(a.id, 'reschedule')}
                    disabled={busy}
                    className={toggleBtn(open?.id === a.id && open.kind === 'reschedule', 'border-blue/50 bg-bluesoft text-blueink')}
                  >
                    Reschedule
                  </button>
                  <button
                    onClick={() => toggle(a.id, 'dq')}
                    disabled={busy}
                    className={toggleBtn(open?.id === a.id && open.kind === 'dq', 'border-amber/50 bg-ambersoft text-amberink')}
                  >
                    DQ
                  </button>
                  <button
                    onClick={() => onOpenLead(a.id)}
                    className="rounded-lg bg-navy px-3 py-1 text-xs font-semibold text-white hover:bg-navydeep"
                  >
                    Log outcome
                  </button>
                </>
              )}
            </span>
          </div>

          {open?.id === a.id && open.kind === 'no_show' && (
            <div className="flex flex-wrap items-end gap-3 bg-redsoft/40 px-4 py-3 pl-11">
              <div className="min-w-56 flex-1">
                <label className="text-[11px] font-medium text-redink">What happened? (note, optional)</label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. texted 10 min before, went quiet"
                  className="field mt-1"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-redink">Follow up again on</label>
                <input type="date" value={fuDate} onChange={(e) => setFuDate(e.target.value)} className="field mt-1 max-w-40" />
              </div>
              <button
                onClick={() => saveNoShow(a.id)}
                disabled={busy}
                className="rounded-lg bg-red px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                Save no-show
              </button>
            </div>
          )}

          {open?.id === a.id && open.kind === 'reschedule' && (
            <div className="flex flex-wrap items-end gap-3 bg-bluesoft/40 px-4 py-3 pl-11">
              <div>
                <label className="text-[11px] font-medium text-blueink">New date</label>
                <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="field mt-1 max-w-40" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-blueink">New time</label>
                <input value={newTime} onChange={(e) => setNewTime(e.target.value)} placeholder="3:00 PM" className="field mt-1 max-w-28" />
              </div>
              <button
                onClick={() => saveReschedule(a.id)}
                disabled={busy}
                className="rounded-lg bg-navy px-4 py-2 text-xs font-bold text-white hover:bg-navydeep disabled:opacity-50"
              >
                Save new time
              </button>
            </div>
          )}

          {open?.id === a.id && open.kind === 'dq' && (
            <div className="flex flex-wrap items-end gap-3 bg-ambersoft/50 px-4 py-3 pl-11">
              <div className="min-w-64 flex-1">
                <label className="text-[11px] font-medium text-amberink">Why is this lead disqualified? (required)</label>
                <input
                  value={dqReason}
                  onChange={(e) => setDqReason(e.target.value)}
                  placeholder="e.g. no budget, out of service area, not a decision maker"
                  className="field mt-1"
                />
              </div>
              <button
                onClick={() => saveDq(a.id)}
                disabled={busy}
                className="rounded-lg bg-amber px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                Disqualify lead
              </button>
              <p className="w-full text-[11px] text-amberink/80">
                Ends all follow-ups, marks the lead Not Qualified, and counts under Disqualified in Stats.
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
