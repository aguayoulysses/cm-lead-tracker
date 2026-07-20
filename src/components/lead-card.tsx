'use client';

import { useEffect, useState } from 'react';
import { api, suggestDate, CLOSED, type LeadDetail } from './api';

const CHANNELS = ['Call', 'Text', 'Email', 'DM'];

export function LeadCard({
  leadId,
  actingCloser,
  today,
  onClose,
  onSaved,
}: {
  leadId: number;
  actingCloser: string;
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [status, setStatus] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [apptDate, setApptDate] = useState('');
  const [apptTime, setApptTime] = useState('');
  const [channel, setChannel] = useState('Call');
  const [pickedUp, setPickedUp] = useState(false);
  const [callTaken, setCallTaken] = useState(false);
  const [qualified, setQualified] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    api<LeadDetail>(`/api/leads/${leadId}`)
      .then((d) => {
        setDetail(d);
        setStatus(d.lead.status === 'New' ? '' : d.lead.status);
        setNextDate(suggestDate(d.lead.status, today));
        setApptDate(d.lead.apptDate ?? '');
        setApptTime(d.lead.apptTime ?? '');
      })
      .catch((e) => setError(e.message));
  }, [leadId, today]);

  function pickStatus(s: string) {
    setStatus(s);
    setNextDate(suggestDate(s, today));
  }

  async function save() {
    if (!status) {
      setError('Pick an outcome first.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api(`/api/leads/${leadId}/outcome`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          nextDate: nextDate || null,
          note,
          apptDate: apptDate || null,
          apptTime: apptTime || null,
          qualified: qualified || null,
          channel,
          callTaken,
          pickedUp,
          actingCloser,
        }),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  async function extraTouch() {
    const n = prompt('What happened? (e.g. "Called, no answer, left text")');
    if (n == null) return;
    setSaving(true);
    try {
      await api(`/api/leads/${leadId}/touch`, { method: 'POST', body: JSON.stringify({ note: n }) });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  const isBooked = status === 'Booked';
  const isClosedStatus = CLOSED.includes(status);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto border-l border-zinc-800 bg-zinc-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="mb-3 text-sm text-zinc-400 hover:text-zinc-200">
          &larr; Back to list
        </button>

        {!detail && !error && <p className="text-zinc-400">Loading&hellip;</p>}
        {error && <p className="mb-3 rounded bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}

        {detail && (
          <>
            <h2 className="text-xl font-bold">
              {detail.lead.firstName} {detail.lead.lastName}
            </h2>

            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm">
              <div className="text-base font-semibold">
                &#9742;{' '}
                <a href={`tel:${detail.lead.phone}`} className="text-emerald-400 hover:underline">
                  {detail.lead.phone || 'no phone'}
                </a>
              </div>
              {detail.lead.email && (
                <a href={`mailto:${detail.lead.email}`} className="text-zinc-400 hover:underline">
                  {detail.lead.email}
                </a>
              )}
              {detail.lead.notes && <p className="mt-2 text-zinc-300">{detail.lead.notes}</p>}
              {(detail.lead.campaignName || detail.lead.adSetName) && (
                <p className="mt-2 text-xs text-zinc-500">
                  From: {detail.lead.campaignName} &gt; {detail.lead.adSetName} &gt; {detail.lead.adName}
                </p>
              )}
              <p className="mt-1 text-xs text-zinc-500">
                Status: <span className="font-semibold text-zinc-300">{detail.lead.status}</span>
                {detail.lead.followUpDate && <> | Next: {detail.lead.followUpDate}</>}
                {detail.lead.apptDate && (
                  <>
                    {' '}
                    | Appt: {detail.lead.apptDate} {detail.lead.apptTime}
                  </>
                )}
                {detail.lead.contactedBy && <> | Closer: {detail.lead.contactedBy}</>}
              </p>
            </div>

            {(detail.attempts.length > 0 || detail.touches.length > 0) && (
              <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <p className="mb-2 text-sm font-semibold">History</p>
                {detail.attempts.map((a) => (
                  <p key={a.n} className="border-l-2 border-zinc-700 pl-2 text-xs text-zinc-400">
                    Attempt {a.n}: {a.at?.replace('T', ' ')}
                  </p>
                ))}
                {detail.touches.map((t, i) => (
                  <p key={i} className="mt-1 border-l-2 border-zinc-700 pl-2 text-xs text-zinc-400">
                    {t.at.replace('T', ' ')} — {t.what}
                    {t.channel && ` (${t.channel})`}
                    {t.by && ` — ${t.by}`}
                    {t.note && `: ${t.note}`}
                  </p>
                ))}
              </div>
            )}

            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <p className="mb-2 text-sm font-semibold">Log outcome</p>

              <label className="text-xs text-zinc-500">Outcome</label>
              <select
                value={status}
                onChange={(e) => pickStatus(e.target.value)}
                className="mb-2 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
              >
                <option value="">Pick an outcome&hellip;</option>
                {detail.statuses
                  .filter((s) => s !== 'New')
                  .map((s) => (
                    <option key={s}>{s}</option>
                  ))}
              </select>

              {!isBooked && !isClosedStatus && status && (
                <>
                  <label className="text-xs text-zinc-500">Next follow-up date</label>
                  <input
                    type="date"
                    value={nextDate}
                    onChange={(e) => setNextDate(e.target.value)}
                    className="mb-2 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
                  />
                </>
              )}

              {isBooked && (
                <>
                  <label className="text-xs text-zinc-500">Appointment date (required)</label>
                  <input
                    type="date"
                    value={apptDate}
                    onChange={(e) => setApptDate(e.target.value)}
                    className="mb-2 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
                  />
                  <label className="text-xs text-zinc-500">Appointment time (required) — e.g. 3:00 PM CST</label>
                  <input
                    value={apptTime}
                    onChange={(e) => setApptTime(e.target.value)}
                    placeholder="3:00 PM"
                    className="mb-2 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
                  />
                </>
              )}

              <label className="text-xs text-zinc-500">Channel</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="mb-2 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
              >
                {CHANNELS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>

              {channel === 'Call' && (
                <>
                  <label className="text-xs text-zinc-500">Did they pick up?</label>
                  <select
                    value={pickedUp ? 'yes' : 'no'}
                    onChange={(e) => setPickedUp(e.target.value === 'yes')}
                    className="mb-2 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
                  >
                    <option value="yes">Picked up</option>
                    <option value="no">No answer</option>
                  </select>
                </>
              )}

              <label className="my-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={callTaken} onChange={(e) => setCallTaken(e.target.checked)} />
                Sales call taken (counts for KPIs)
              </label>

              <label className="text-xs text-zinc-500">Qualified?</label>
              <select
                value={qualified}
                onChange={(e) => setQualified(e.target.value)}
                className="mb-2 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
              >
                <option value="">Leave as is</option>
                <option>Yes</option>
                <option>No</option>
              </select>

              <label className="text-xs text-zinc-500">Note (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="mb-2 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
              />

              <button
                onClick={save}
                disabled={saving}
                className="w-full rounded bg-emerald-600 py-2 text-sm font-bold hover:bg-emerald-500 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={extraTouch}
                disabled={saving}
                className="mt-2 w-full rounded border border-zinc-700 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Log an extra touch (no status change)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
