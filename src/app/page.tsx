'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, statusChip, type Buckets, type BucketLead } from '@/components/api';
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

  const todayLabel = buckets
    ? new Date(`${buckets.today}T12:00:00`).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    : '';

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <div className="flex overflow-hidden rounded-lg border border-line bg-card">
          {closers.map((c) => (
            <button
              key={c}
              onClick={() => pickCloser(c)}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                closer === c ? 'bg-navy text-white' : 'text-muted hover:bg-canvas hover:text-ink'
              }`}
            >
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

      {tab === 'list' && buckets && (
        <div className="grid items-start gap-5 md:grid-cols-3">
          <Bucket tone="red" label="Overdue" leads={buckets.overdue} onOpen={setOpenLead} />
          <Bucket tone="amber" label="Due today" leads={buckets.dueToday} onOpen={setOpenLead} />
          <Bucket tone="blue" label="Next 7 days" leads={buckets.next7} onOpen={setOpenLead} />
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
      <div className="max-h-[65vh] overflow-y-auto">
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
