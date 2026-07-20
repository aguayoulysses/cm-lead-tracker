'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type Buckets, type BucketLead } from '@/components/api';
import { LeadCard } from '@/components/lead-card';
import { CalendarMonth } from '@/components/calendar-month';
import { EodPanel } from '@/components/eod-panel';

type Tab = 'list' | 'calendar' | 'eod';

export default function WorkPage() {
  const [closers, setClosers] = useState<string[]>([]);
  const [closer, setCloser] = useState('All');
  const [tab, setTab] = useState<Tab>('list');
  const [buckets, setBuckets] = useState<Buckets | null>(null);
  const [openLead, setOpenLead] = useState<number | null>(null);
  const [showNewLead, setShowNewLead] = useState(false);

  useEffect(() => {
    api<{ id: number; name: string }[]>('/api/closers').then((rows) => {
      setClosers(['All', ...rows.map((r) => r.name)]);
      const saved = localStorage.getItem('cmCloser');
      if (saved) setCloser(saved);
    });
  }, []);

  const loadBuckets = useCallback(() => {
    api<Buckets>(`/api/leads?view=buckets&closer=${encodeURIComponent(closer)}`).then(setBuckets);
  }, [closer]);

  useEffect(loadBuckets, [loadBuckets]);

  function pickCloser(c: string) {
    setCloser(c);
    localStorage.setItem('cmCloser', c);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500">Closer:</span>
        {closers.map((c) => (
          <button
            key={c}
            onClick={() => pickCloser(c)}
            className={`rounded-full px-3 py-1 text-sm ${
              closer === c ? 'bg-emerald-600 font-bold text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {c}
          </button>
        ))}
        <div className="ml-auto flex gap-1">
          {(
            [
              ['list', 'Follow-Ups'],
              ['calendar', 'Calendar'],
              ['eod', 'End of Day'],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-3 py-1.5 text-sm ${tab === t ? 'bg-zinc-700 font-bold' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setShowNewLead(true)}
            className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-bold hover:bg-emerald-600"
          >
            + New lead
          </button>
        </div>
      </div>

      {tab === 'list' && buckets && (
        <div className="grid gap-4 md:grid-cols-3">
          <Bucket title={`OVERDUE (${buckets.overdue.length})`} color="bg-red-800" leads={buckets.overdue} onOpen={setOpenLead} />
          <Bucket title={`DUE TODAY (${buckets.dueToday.length})`} color="bg-amber-600" leads={buckets.dueToday} onOpen={setOpenLead} />
          <Bucket title={`NEXT 7 DAYS (${buckets.next7.length})`} color="bg-zinc-700" leads={buckets.next7} onOpen={setOpenLead} />
        </div>
      )}

      {tab === 'calendar' && <CalendarMonth closer={closer} onOpenLead={setOpenLead} />}
      {tab === 'eod' && <EodPanel />}

      {openLead != null && buckets && (
        <LeadCard
          leadId={openLead}
          actingCloser={closer}
          today={buckets.today}
          onClose={() => setOpenLead(null)}
          onSaved={() => {
            setOpenLead(null);
            loadBuckets();
          }}
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

function Bucket({
  title,
  color,
  leads,
  onOpen,
}: {
  title: string;
  color: string;
  leads: BucketLead[];
  onOpen: (id: number) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <div className={`${color} px-3 py-2 text-sm font-bold`}>{title}</div>
      {leads.length === 0 && <p className="px-3 py-3 text-sm text-zinc-500">None</p>}
      {leads.map((l) => (
        <button
          key={l.id}
          onClick={() => onOpen(l.id)}
          className="block w-full border-b border-zinc-900 px-3 py-2 text-left hover:bg-zinc-900"
        >
          <span className="flex items-baseline justify-between">
            <b className="text-sm">{l.name}</b>
            <span className="text-xs text-zinc-500">{l.date}</span>
          </span>
          <span className="text-xs text-zinc-500">
            {l.status}
            {l.by && ` · ${l.by}`}
          </span>
        </button>
      ))}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900 p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 font-bold">New lead (manual)</h3>
        {error && <p className="mb-2 rounded bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}
        {(
          [
            ['firstName', 'First name *'],
            ['lastName', 'Last name'],
            ['phone', 'Phone'],
            ['email', 'Email'],
            ['leadSource', 'Lead source (e.g. Referral)'],
          ] as [keyof typeof form, string][]
        ).map(([k, label]) => (
          <input
            key={k}
            placeholder={label}
            value={form[k]}
            onChange={set(k)}
            className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
          />
        ))}
        <textarea
          placeholder="Notes"
          value={form.notes}
          onChange={set('notes')}
          rows={2}
          className="mb-3 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
        />
        <button onClick={create} className="w-full rounded bg-emerald-600 py-2 text-sm font-bold hover:bg-emerald-500">
          Add lead (due today)
        </button>
      </div>
    </div>
  );
}
