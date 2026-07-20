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
      <div className="card p-5">
        <p className="eyebrow text-muted">End of day report &middot; {date}</p>
        <p className="mt-1 mb-4 text-sm text-muted">
          For today&rsquo;s sales calls, enter no-shows and reschedules, then save. Resets each morning.
        </p>
        {error && <p className="mb-3 rounded-lg bg-redsoft px-3 py-2 text-sm text-redink">{error}</p>}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold text-muted">
              <th className="py-2">Closer</th>
              <th className="text-center">Calls today</th>
              <th className="text-center">No-shows</th>
              <th className="text-center">Reschedules</th>
              <th></th>
              <th className="text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.closer} className="border-b border-line last:border-b-0">
                <td className="py-3 font-semibold">{r.closer}</td>
                <td className="text-center text-muted">{r.salesCallsToday}</td>
                <td className="text-center">
                  <input
                    type="number"
                    min={0}
                    className="field w-16 text-center"
                    value={drafts[r.closer]?.noShows ?? (r.noShows != null ? String(r.noShows) : '')}
                    onChange={(e) =>
                      setDrafts((p) => ({
                        ...p,
                        [r.closer]: {
                          noShows: e.target.value,
                          reschedules: p[r.closer]?.reschedules ?? String(r.reschedules ?? ''),
                        },
                      }))
                    }
                  />
                </td>
                <td className="text-center">
                  <input
                    type="number"
                    min={0}
                    className="field w-16 text-center"
                    value={drafts[r.closer]?.reschedules ?? (r.reschedules != null ? String(r.reschedules) : '')}
                    onChange={(e) =>
                      setDrafts((p) => ({
                        ...p,
                        [r.closer]: {
                          noShows: p[r.closer]?.noShows ?? String(r.noShows ?? ''),
                          reschedules: e.target.value,
                        },
                      }))
                    }
                  />
                </td>
                <td className="px-3">
                  <button
                    onClick={() => save(r.closer)}
                    className="rounded-lg bg-navy px-4 py-1.5 text-xs font-semibold text-white hover:bg-navydeep"
                  >
                    Save
                  </button>
                </td>
                <td className="text-right">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      r.done ? 'bg-greensoft text-greenink' : 'bg-ambersoft text-amberink'
                    }`}
                  >
                    {r.done ? 'Done' : 'Open'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
