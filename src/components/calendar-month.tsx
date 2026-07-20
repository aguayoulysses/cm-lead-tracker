'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

interface DayEntry {
  followUps: { leadId: number; name: string; status: string; phone: string }[];
  appts: { leadId: number; name: string; time: string; status: string; phone: string }[];
}

interface CalendarData {
  month: string;
  today: string;
  days: Record<string, DayEntry>;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function monthShift(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function CalendarMonth({ closer, onOpenLead }: { closer: string; onOpenLead: (id: number) => void }) {
  const [month, setMonth] = useState('');
  const [data, setData] = useState<CalendarData | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const load = useCallback(
    (m: string) => {
      api<CalendarData>(`/api/calendar?closer=${encodeURIComponent(closer)}${m ? `&month=${m}` : ''}`).then((d) => {
        setData(d);
        setMonth(d.month);
      });
    },
    [closer],
  );

  useEffect(() => {
    load(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closer]);

  if (!data) return <p className="text-zinc-400">Loading&hellip;</p>;

  const [y, m] = data.month.split('-').map(Number);
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${data.month}-${String(i + 1).padStart(2, '0')}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const selected = selectedDay ? data.days[selectedDay] : null;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex-1">
        <div className="mb-2 flex items-center gap-3">
          <button onClick={() => load(monthShift(data.month, -1))} className="rounded border border-zinc-700 px-2 py-1 text-sm hover:bg-zinc-800">
            &larr;
          </button>
          <span className="min-w-40 text-center font-semibold">{monthName}</span>
          <button onClick={() => load(monthShift(data.month, 1))} className="rounded border border-zinc-700 px-2 py-1 text-sm hover:bg-zinc-800">
            &rarr;
          </button>
          <span className="ml-4 text-xs text-zinc-500">&#9742; follow-up due &nbsp; &#9733; appointment</span>
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800">
          {DOW.map((d) => (
            <div key={d} className="bg-zinc-900 px-2 py-1 text-center text-xs font-bold text-zinc-400">
              {d}
            </div>
          ))}
          {cells.map((day, i) => {
            const entry = day ? data.days[day] : undefined;
            const isToday = day === data.today;
            return (
              <div
                key={i}
                onClick={() => day && setSelectedDay(day)}
                className={`min-h-20 cursor-pointer bg-zinc-950 p-1.5 text-xs hover:bg-zinc-900 ${
                  day && selectedDay === day ? 'ring-2 ring-inset ring-emerald-500' : ''
                }`}
              >
                {day && (
                  <>
                    <span className={`text-[11px] font-semibold ${isToday ? 'rounded bg-emerald-600 px-1 text-white' : 'text-zinc-500'}`}>
                      {Number(day.slice(8))}
                    </span>
                    {entry?.followUps.slice(0, 3).map((f) => (
                      <p key={`f${f.leadId}`} className="truncate text-zinc-300">
                        &#9742; {f.name}
                      </p>
                    ))}
                    {entry?.appts.slice(0, 3).map((a) => (
                      <p key={`a${a.leadId}`} className="truncate text-amber-300">
                        &#9733; {a.name}
                        {a.time ? ` ${a.time}` : ''}
                      </p>
                    ))}
                    {entry && entry.followUps.length + entry.appts.length > 6 && (
                      <p className="text-zinc-500">+{entry.followUps.length + entry.appts.length - 6} more</p>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="w-full lg:w-72">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className="mb-2 border-b border-zinc-800 pb-2 text-sm font-bold">
            {selectedDay
              ? `${selectedDay}  —  ${(selected?.followUps.length ?? 0) + (selected?.appts.length ?? 0)} lead${
                  (selected?.followUps.length ?? 0) + (selected?.appts.length ?? 0) === 1 ? '' : 's'
                }`
              : 'Click a day → that day’s leads appear here'}
          </p>
          {selectedDay && !selected && <p className="text-sm text-zinc-500">Nothing due this day</p>}
          {selected?.followUps.map((f) => (
            <button
              key={`f${f.leadId}`}
              onClick={() => onOpenLead(f.leadId)}
              className="block w-full rounded px-1 py-1 text-left text-sm hover:bg-zinc-800"
            >
              &#9742; {f.name}
              <span className="block text-xs text-zinc-500">
                {f.status} &nbsp; {f.phone}
              </span>
            </button>
          ))}
          {selected?.appts.map((a) => (
            <button
              key={`a${a.leadId}`}
              onClick={() => onOpenLead(a.leadId)}
              className="block w-full rounded px-1 py-1 text-left text-sm text-amber-300 hover:bg-zinc-800"
            >
              &#9733; {a.name}
              <span className="block text-xs text-zinc-500">
                {a.status}
                {a.time ? ` ${a.time}` : ''} &nbsp; {a.phone}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
