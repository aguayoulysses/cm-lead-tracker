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

/**
 * Today's appointments with mandatory-update tracking. Every appointment needs
 * an outcome logged today: quick No-show / Reschedule here, or a full outcome
 * via the lead card. Updated rows stay visible with a green check.
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
  const [rescheduling, setRescheduling] = useState<number | null>(null);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ date: string; appointments: Appt[] }>(`/api/appointments?closer=${encodeURIComponent(closer)}`).then((d) => {
      setDate(d.date);
      setAppts(d.appointments);
    });
  }, [closer]);

  useEffect(load, [load, tick]);

  async function noShow(id: number) {
    setBusy(true);
    setError('');
    try {
      await api(`/api/leads/${id}/appointment-outcome`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'no_show', actor: closer }),
      });
      load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function reschedule(id: number) {
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
      setRescheduling(null);
      setNewDate('');
      setNewTime('');
      load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  const pending = appts.filter((a) => !a.updated).length;
  if (appts.length === 0) return null;

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
        Every appointment gets an outcome logged today — no-show, reschedule, or open the lead for the full result.
      </p>
      {error && <p className="mx-4 mt-2 rounded-lg bg-redsoft px-3 py-2 text-sm text-redink">{error}</p>}
      {appts.map((a) => (
        <div
          key={a.id}
          className={`flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0 ${
            a.updated ? 'bg-greensoft/30' : ''
          }`}
        >
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
                  onClick={() => noShow(a.id)}
                  disabled={busy}
                  className="rounded-lg border border-red/40 bg-redsoft px-3 py-1 text-xs font-semibold text-redink hover:bg-red hover:text-white disabled:opacity-50"
                >
                  No-show
                </button>
                <button
                  onClick={() => {
                    setRescheduling(rescheduling === a.id ? null : a.id);
                    setError('');
                  }}
                  disabled={busy}
                  className="rounded-lg border border-line bg-white px-3 py-1 text-xs font-semibold text-blueink hover:bg-bluesoft disabled:opacity-50"
                >
                  Reschedule
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
          {rescheduling === a.id && (
            <span className="flex w-full items-center gap-2 pt-1 pl-7">
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="field max-w-40" />
              <input
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                placeholder="3:00 PM"
                className="field max-w-28"
              />
              <button
                onClick={() => reschedule(a.id)}
                disabled={busy}
                className="rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-navydeep disabled:opacity-50"
              >
                Save new time
              </button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
