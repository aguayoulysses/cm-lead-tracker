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
  const [apptsOnly, setApptsOnly] = useState(false);

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

  if (!data) return <p className="text-muted">Loading&hellip;</p>;

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
  const selectedCount = (selected?.followUps.length ?? 0) + (selected?.appts.length ?? 0);

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <div className="flex-1">
        <div className="mb-3 flex items-center gap-3">
          <button
            onClick={() => load(monthShift(data.month, -1))}
            className="rounded-lg border border-line bg-card px-3 py-1 text-sm text-muted hover:text-navy"
          >
            &larr;
          </button>
          <span className="min-w-36 text-center text-base font-bold text-navydeep">{monthName}</span>
          <button
            onClick={() => load(monthShift(data.month, 1))}
            className="rounded-lg border border-line bg-card px-3 py-1 text-sm text-muted hover:text-navy"
          >
            &rarr;
          </button>
          <span className="ml-4 flex items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue" /> follow-up due
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green" /> appointment
            </span>
          </span>
          <span className="ml-auto flex gap-1 rounded-lg border border-line bg-card p-0.5">
            <button
              onClick={() => setApptsOnly(false)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${!apptsOnly ? 'bg-bluesoft text-blueink' : 'text-muted hover:text-ink'}`}
            >
              Everything
            </button>
            <button
              onClick={() => setApptsOnly(true)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${apptsOnly ? 'bg-greensoft text-greenink' : 'text-muted hover:text-ink'}`}
            >
              Appointments only
            </button>
          </span>
        </div>

        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line">
            {DOW.map((d) => (
              <div key={d} className="eyebrow px-2 py-2 text-center text-faint">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              const entry = day ? data.days[day] : undefined;
              const isToday = day === data.today;
              const isSelected = !!day && selectedDay === day;
              return (
                <div
                  key={i}
                  onClick={() => day && setSelectedDay(day)}
                  className={`min-h-24 border-t border-r border-line p-1.5 text-xs last:border-r-0 [&:nth-child(7n)]:border-r-0 ${
                    day ? 'cursor-pointer hover:bg-bluesoft/40' : 'bg-canvas/60'
                  } ${isSelected ? 'bg-bluesoft/70' : ''}`}
                >
                  {day && (
                    <>
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                          isToday ? 'bg-navy text-white' : 'text-muted'
                        }`}
                      >
                        {Number(day.slice(8))}
                      </span>
                      {!apptsOnly && entry?.followUps.slice(0, 3).map((f) => (
                        <p key={`f${f.leadId}`} className="mt-0.5 truncate text-blueink">
                          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-blue align-middle" />
                          {f.name}
                        </p>
                      ))}
                      {entry?.appts.slice(0, 3).map((a) => (
                        <p key={`a${a.leadId}`} className="mt-0.5 truncate font-medium text-greenink">
                          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-green align-middle" />
                          {a.name}
                          {a.time ? ` · ${a.time}` : ''}
                        </p>
                      ))}
                      {entry && !apptsOnly && entry.followUps.length + entry.appts.length > 6 && (
                        <p className="mt-0.5 text-faint">+{entry.followUps.length + entry.appts.length - 6} more</p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="w-full lg:w-80">
        <div className="card p-4">
          <p className="eyebrow border-b border-line pb-2 text-muted">
            {selectedDay
              ? `${new Date(`${selectedDay}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${selectedCount} lead${selectedCount === 1 ? '' : 's'}`
              : 'Select a day'}
          </p>
          {!selectedDay && <p className="pt-3 text-sm text-faint">Click a day to see its leads here.</p>}
          {selectedDay && !selected && <p className="pt-3 text-sm text-faint">Nothing due this day.</p>}
          {!apptsOnly && selected?.followUps.map((f) => (
            <button
              key={`f${f.leadId}`}
              onClick={() => onOpenLead(f.leadId)}
              className="block w-full rounded-lg px-2 py-2 text-left hover:bg-bluesoft/50"
            >
              <span className="text-sm font-semibold text-ink">{f.name}</span>
              <span className="block text-xs text-muted">
                Follow-up &middot; {f.status} &middot; {f.phone}
              </span>
            </button>
          ))}
          {selected?.appts.map((a) => (
            <button
              key={`a${a.leadId}`}
              onClick={() => onOpenLead(a.leadId)}
              className="block w-full rounded-lg px-2 py-2 text-left hover:bg-greensoft/60"
            >
              <span className="text-sm font-semibold text-greenink">{a.name}</span>
              <span className="block text-xs text-muted">
                Appointment{a.time ? ` ${a.time}` : ''} &middot; {a.status} &middot; {a.phone}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
