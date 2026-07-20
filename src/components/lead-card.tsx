'use client';

import { useEffect, useState } from 'react';
import { api, statusChip, suggestDate, CLOSED, fmtMoney, type LeadDetail } from './api';

const CHANNELS = ['Call', 'Text', 'Email', 'DM'];

export function LeadCard({
  leadId,
  actingCloser,
  today,
  queuePos,
  onClose,
  onSaved,
  onNext,
}: {
  leadId: number;
  actingCloser: string;
  today: string;
  /** position in the work queue, when cycling follow-ups */
  queuePos?: { index: number; total: number };
  onClose: () => void;
  /** called after a successful outcome save (parent advances the queue) */
  onSaved: () => void;
  /** skip to the next lead without saving */
  onNext?: () => void;
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
  const [oneTime, setOneTime] = useState('');
  const [mrr, setMrr] = useState('');
  const [cash, setCash] = useState('');

  const [dealDraft, setDealDraft] = useState<{ oneTime: string; mrr: string; cash: string } | null>(null);

  useEffect(() => {
    setDetail(null);
    setError('');
    setSaving(false);
    setNote('');
    setDealDraft(null);
    api<LeadDetail>(`/api/leads/${leadId}`)
      .then((d) => {
        setDetail(d);
        setStatus(d.lead.status === 'New' ? '' : d.lead.status);
        setNextDate(suggestDate(d.lead.status, today));
        setApptDate(d.lead.apptDate ?? '');
        setApptTime(d.lead.apptTime ?? '');
        setOneTime(d.lead.oneTimeValue ? String(d.lead.oneTimeValue) : '');
        setMrr(d.lead.mrrValue ? String(d.lead.mrrValue) : '');
        setCash(d.lead.cashCollected ? String(d.lead.cashCollected) : '');
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
    if (status === 'Closed Won' && (oneTime.trim() === '' || mrr.trim() === '')) {
      setError('Closed Won needs One-Time Value and MRR Value — enter 0 if none.');
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
          oneTimeValue: status === 'Closed Won' && oneTime.trim() !== '' ? Number(oneTime) : null,
          mrrValue: status === 'Closed Won' && mrr.trim() !== '' ? Number(mrr) : null,
          cashCollected: status === 'Closed Won' && cash.trim() !== '' ? Number(cash) : null,
        }),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  async function saveDeal() {
    if (!dealDraft) return;
    setSaving(true);
    setError('');
    try {
      await api(`/api/leads/${leadId}/deal`, {
        method: 'POST',
        body: JSON.stringify({
          oneTimeValue: Number(dealDraft.oneTime) || 0,
          mrrValue: Number(dealDraft.mrr) || 0,
          cashCollected: Number(dealDraft.cash) || 0,
          actor: actingCloser,
        }),
      });
      const d = await api<LeadDetail>(`/api/leads/${leadId}`);
      setDetail(d);
      setDealDraft(null);
      setSaving(false);
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
  const isWon = status === 'Closed Won';
  const isClosedStatus = CLOSED.includes(status);
  const hasDeal = !!detail && (detail.lead.oneTimeValue > 0 || detail.lead.mrrValue > 0 || detail.lead.cashCollected > 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navydeep/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto border-l border-line bg-canvas p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <button onClick={onClose} className="text-sm font-medium text-muted hover:text-navy">
            &larr; Back
          </button>
          {queuePos && (
            <span className="flex items-center gap-3">
              <span className="text-xs font-semibold text-muted">
                Lead {queuePos.index + 1} of {queuePos.total}
              </span>
              {onNext && queuePos.index + 1 < queuePos.total && (
                <button
                  onClick={onNext}
                  className="rounded-lg border border-line bg-white px-3 py-1 text-xs font-semibold text-blueink hover:bg-bluesoft"
                >
                  Skip &rarr;
                </button>
              )}
            </span>
          )}
        </div>

        {!detail && !error && <p className="text-muted">Loading&hellip;</p>}
        {error && <p className="mb-3 rounded-lg bg-redsoft px-3 py-2 text-sm text-redink">{error}</p>}

        {detail && (
          <>
            {!detail.lead.contactedBy && (
              <div className="mb-3 rounded-lg border border-green/40 bg-greensoft px-3 py-2 text-xs font-medium text-greenink">
                Open lead — whoever makes first contact claims it. Attempts and voicemails don&rsquo;t count.
              </div>
            )}
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-navydeep">
                {detail.lead.firstName} {detail.lead.lastName}
              </h2>
              <span className={`rounded px-2 py-1 text-xs font-semibold ${statusChip(detail.lead.status)}`}>
                {detail.lead.status}
              </span>
            </div>

            <div className="card p-4 text-sm">
              <div className="flex items-center gap-3">
                <a
                  href={`tel:${detail.lead.phone}`}
                  className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navydeep"
                >
                  Call {detail.lead.phone || '—'}
                </a>
                {detail.lead.email && (
                  <a href={`mailto:${detail.lead.email}`} className="truncate text-blueink hover:underline">
                    {detail.lead.email}
                  </a>
                )}
              </div>
              {detail.lead.notes && <p className="mt-3 text-ink">{detail.lead.notes}</p>}
              <div className="mt-3 space-y-1 border-t border-line pt-2 text-xs text-muted">
                {(detail.lead.campaignName || detail.lead.adSetName) && (
                  <p>
                    Ad: {detail.lead.campaignName} &rsaquo; {detail.lead.adSetName} &rsaquo; {detail.lead.adName}
                  </p>
                )}
                <p>
                  {detail.lead.followUpDate && <>Next follow-up {detail.lead.followUpDate}</>}
                  {detail.lead.apptDate && (
                    <>
                      {' '}
                      &middot; Appt {detail.lead.apptDate} {detail.lead.apptTime}
                    </>
                  )}
                  {detail.lead.contactedBy && <> &middot; Closer {detail.lead.contactedBy}</>}
                </p>
                {detail.lead.firstContactAt && (
                  <p>
                    First contact {detail.lead.firstContactAt.slice(0, 16).replace('T', ' ')}
                    {detail.lead.firstContactBy && <> by {detail.lead.firstContactBy}</>}
                  </p>
                )}
              </div>
            </div>

            {(hasDeal || detail.lead.status === 'Closed Won') && (
              <div className="card mt-3 border-green/40 p-4">
                <div className="flex items-center justify-between">
                  <p className="eyebrow text-greenink">Deal</p>
                  {!dealDraft && (
                    <button
                      onClick={() =>
                        setDealDraft({
                          oneTime: String(detail.lead.oneTimeValue || ''),
                          mrr: String(detail.lead.mrrValue || ''),
                          cash: String(detail.lead.cashCollected || ''),
                        })
                      }
                      className="text-xs font-semibold text-blueink hover:underline"
                    >
                      Edit
                    </button>
                  )}
                </div>
                {!dealDraft ? (
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold text-greenink">{fmtMoney(detail.lead.oneTimeValue)}</p>
                      <p className="text-[11px] text-muted">One-time</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-greenink">{fmtMoney(detail.lead.mrrValue)}/mo</p>
                      <p className="text-[11px] text-muted">MRR</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-greenink">{fmtMoney(detail.lead.cashCollected)}</p>
                      <p className="text-[11px] text-muted">Cash collected</p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2">
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          ['oneTime', 'One-time $'],
                          ['mrr', 'MRR $/mo'],
                          ['cash', 'Cash $'],
                        ] as const
                      ).map(([k, label]) => (
                        <div key={k}>
                          <label className="text-[11px] font-medium text-muted">{label}</label>
                          <input
                            type="number"
                            min={0}
                            value={dealDraft[k]}
                            onChange={(e) => setDealDraft((p) => ({ ...p!, [k]: e.target.value }))}
                            className="field mt-1 px-2"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={saveDeal}
                        disabled={saving}
                        className="rounded-lg bg-green px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        Save deal
                      </button>
                      <button onClick={() => setDealDraft(null)} className="text-xs text-muted hover:text-ink">
                        Cancel
                      </button>
                    </div>
                    <p className="mt-1 text-[11px] text-faint">Every change is logged to the lead&rsquo;s history.</p>
                  </div>
                )}
              </div>
            )}

            {(detail.attempts.length > 0 || detail.touches.length > 0) && (
              <div className="card mt-3 p-4">
                <p className="eyebrow mb-2 text-muted">History</p>
                {detail.attempts.map((a) => (
                  <p key={a.n} className="border-l-2 border-line py-0.5 pl-3 text-xs text-muted">
                    Attempt {a.n} &middot; {a.at?.replace('T', ' ')}
                  </p>
                ))}
                {detail.touches.map((t, i) => (
                  <p key={i} className="border-l-2 border-line py-0.5 pl-3 text-xs text-muted">
                    {t.at.slice(0, 16).replace('T', ' ')} &middot; <span className="font-medium text-ink">{t.what}</span>
                    {t.channel && ` (${t.channel})`}
                    {t.by && ` · ${t.by}`}
                    {t.note && ` — ${t.note}`}
                  </p>
                ))}
              </div>
            )}

            <div className="card mt-3 p-4">
              <p className="eyebrow mb-3 text-muted">Log outcome</p>

              <label className="text-xs font-medium text-muted">Outcome</label>
              <select value={status} onChange={(e) => pickStatus(e.target.value)} className="field mt-1 mb-3">
                <option value="">Pick an outcome&hellip;</option>
                {detail.statuses
                  .filter((s) => s !== 'New')
                  .map((s) => (
                    <option key={s}>{s}</option>
                  ))}
              </select>

              {!isBooked && !isClosedStatus && status && (
                <>
                  <label className="text-xs font-medium text-muted">Next follow-up date</label>
                  <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className="field mt-1 mb-3" />
                </>
              )}

              {isBooked && (
                <div className="mb-3 rounded-lg bg-bluesoft p-3">
                  <label className="text-xs font-medium text-blueink">Appointment date (required)</label>
                  <input type="date" value={apptDate} onChange={(e) => setApptDate(e.target.value)} className="field mt-1 mb-2" />
                  <label className="text-xs font-medium text-blueink">Appointment time (required) — e.g. 3:00 PM CST</label>
                  <input value={apptTime} onChange={(e) => setApptTime(e.target.value)} placeholder="3:00 PM" className="field mt-1" />
                </div>
              )}

              {isWon && (
                <div className="mb-3 rounded-lg bg-greensoft p-3">
                  <p className="mb-2 text-xs font-semibold text-greenink">Deal numbers (required — enter 0 if none)</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[11px] font-medium text-greenink">One-time $</label>
                      <input type="number" min={0} value={oneTime} onChange={(e) => setOneTime(e.target.value)} className="field mt-1 px-2" />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-greenink">MRR $/mo</label>
                      <input type="number" min={0} value={mrr} onChange={(e) => setMrr(e.target.value)} className="field mt-1 px-2" />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-greenink">Cash collected $</label>
                      <input type="number" min={0} value={cash} onChange={(e) => setCash(e.target.value)} className="field mt-1 px-2" />
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted">Channel</label>
                  <select value={channel} onChange={(e) => setChannel(e.target.value)} className="field mt-1">
                    {CHANNELS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  {channel === 'Call' ? (
                    <>
                      <label className="text-xs font-medium text-muted">Did they pick up?</label>
                      <select
                        value={pickedUp ? 'yes' : 'no'}
                        onChange={(e) => setPickedUp(e.target.value === 'yes')}
                        className="field mt-1"
                      >
                        <option value="yes">Picked up</option>
                        <option value="no">No answer</option>
                      </select>
                    </>
                  ) : (
                    <>
                      <label className="text-xs font-medium text-muted">Qualified?</label>
                      <select value={qualified} onChange={(e) => setQualified(e.target.value)} className="field mt-1">
                        <option value="">Leave as is</option>
                        <option>Yes</option>
                        <option>No</option>
                      </select>
                    </>
                  )}
                </div>
              </div>

              {channel === 'Call' && (
                <div className="mb-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted">Qualified?</label>
                    <select value={qualified} onChange={(e) => setQualified(e.target.value)} className="field mt-1">
                      <option value="">Leave as is</option>
                      <option>Yes</option>
                      <option>No</option>
                    </select>
                  </div>
                  <label className="flex items-end gap-2 pb-2 text-sm">
                    <input type="checkbox" checked={callTaken} onChange={(e) => setCallTaken(e.target.checked)} className="accent-navy" />
                    Sales call taken
                  </label>
                </div>
              )}
              {channel !== 'Call' && (
                <label className="mb-3 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={callTaken} onChange={(e) => setCallTaken(e.target.checked)} className="accent-navy" />
                  Sales call taken (counts for KPIs)
                </label>
              )}

              <label className="text-xs font-medium text-muted">Note (optional)</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="field mt-1 mb-3" />

              <button
                onClick={save}
                disabled={saving}
                className="w-full rounded-lg bg-navy py-2.5 text-sm font-semibold text-white hover:bg-navydeep disabled:opacity-50"
              >
                {saving ? 'Saving…' : queuePos && queuePos.index + 1 < queuePos.total ? 'Save & next lead →' : 'Save outcome'}
              </button>
              <button
                onClick={extraTouch}
                disabled={saving}
                className="mt-2 w-full rounded-lg border border-line bg-white py-2 text-xs font-medium text-muted hover:text-navy"
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
