'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

interface EodRow {
  closer: string;
  salesCallsToday: number;
  done: boolean;
  noShows: number | null;
  reschedules: number | null;
}

export function EodPanel() {
  const [date, setDate] = useState('');
  const [rows, setRows] = useState<EodRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { noShows: string; reschedules: string }>>({});
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<{ date: string; closers: EodRow[] }>('/api/eod').then((d) => {
      setDate(d.date);
      setRows(d.closers);
    });
  }, []);

  useEffect(load, [load]);

  async function save(closer: string) {
    const d = drafts[closer] ?? { noShows: '0', reschedules: '0' };
    setError('');
    try {
      await api('/api/eod', {
        method: 'POST',
        body: JSON.stringify({
          closer,
          noShows: Number(d.noShows) || 0,
          reschedules: Number(d.reschedules) || 0,
        }),
      });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-3 rounded-lg bg-violet-950/60 px-4 py-3 text-sm text-violet-200">
        <b>END OF DAY REPORT — {date}.</b> For today&rsquo;s sales calls, enter No-Shows &amp; Reschedules, then Save.
        OPEN until done, then DONE (resets each morning).
      </div>
      {error && <p className="mb-3 rounded bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-700 text-left text-xs text-zinc-400">
            <th className="py-2">Closer</th>
            <th className="text-center">Sales Calls Today</th>
            <th className="text-center">No-Shows</th>
            <th className="text-center">Reschedules</th>
            <th></th>
            <th className="text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.closer} className="border-b border-zinc-800">
              <td className="py-2 font-semibold">{r.closer}</td>
              <td className="text-center text-zinc-400">{r.salesCallsToday}</td>
              <td className="text-center">
                <input
                  type="number"
                  min={0}
                  className="w-16 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-center"
                  value={drafts[r.closer]?.noShows ?? (r.noShows != null ? String(r.noShows) : '')}
                  onChange={(e) =>
                    setDrafts((p) => ({
                      ...p,
                      [r.closer]: { noShows: e.target.value, reschedules: p[r.closer]?.reschedules ?? String(r.reschedules ?? '') },
                    }))
                  }
                />
              </td>
              <td className="text-center">
                <input
                  type="number"
                  min={0}
                  className="w-16 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-center"
                  value={drafts[r.closer]?.reschedules ?? (r.reschedules != null ? String(r.reschedules) : '')}
                  onChange={(e) =>
                    setDrafts((p) => ({
                      ...p,
                      [r.closer]: { noShows: p[r.closer]?.noShows ?? String(r.noShows ?? ''), reschedules: e.target.value },
                    }))
                  }
                />
              </td>
              <td className="px-2">
                <button
                  onClick={() => save(r.closer)}
                  className="rounded bg-emerald-600 px-3 py-1 text-xs font-bold hover:bg-emerald-500"
                >
                  Save
                </button>
              </td>
              <td className={`text-center text-xs font-bold ${r.done ? 'text-emerald-400' : 'text-red-400'}`}>
                {r.done ? '✅ DONE' : '⬜ OPEN'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
