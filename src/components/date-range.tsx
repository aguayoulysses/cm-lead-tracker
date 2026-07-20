'use client';

import { useEffect, useRef, useState } from 'react';

/** Brand-styled date-range picker: preset ranges + click-start/click-end calendar. */

const TZ = 'America/Chicago';
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function todayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function fmtShort(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`;
}

export function DateRangePicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => (to || todayYmd()).slice(0, 7)); // YYYY-MM
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const today = todayYmd();
  const presets: [string, string, string][] = (() => {
    const monthStart = `${today.slice(0, 7)}-01`;
    const [y, m] = today.split('-').map(Number);
    const lastMonthStart = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
    const lastMonthEnd = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
    const weekStart = addDays(today, -dow);
    return [
      ['Today', today, today],
      ['This week', weekStart, today],
      ['This month', monthStart, today],
      ['Last month', lastMonthStart, lastMonthEnd],
      ['Last 30 days', addDays(today, -29), today],
      ['All time', '2020-01-01', today],
    ];
  })();

  function pick(day: string) {
    if (!pendingStart) {
      setPendingStart(day);
      return;
    }
    const [a, b] = day < pendingStart ? [day, pendingStart] : [pendingStart, day];
    setPendingStart(null);
    onChange(a, b);
    setOpen(false);
  }

  // Calendar grid for the viewed month.
  const [vy, vm] = view.split('-').map(Number);
  const firstDow = new Date(Date.UTC(vy, vm - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(vy, vm, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${view}-${String(i + 1).padStart(2, '0')}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const rangeStart = pendingStart ?? from;
  const rangeEnd = pendingStart ? pendingStart : to;
  const activePreset = presets.find(([, a, b]) => a === from && b === to)?.[0];

  function shiftMonth(delta: number) {
    setView(new Date(Date.UTC(vy, vm - 1 + delta, 1)).toISOString().slice(0, 7));
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium transition-colors ${
          open ? 'border-blue ring-2 ring-bluesoft' : 'border-line hover:border-blue'
        }`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blueink">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 10h18" />
        </svg>
        <span>
          {activePreset ?? (
            <>
              {fmtShort(from)} <span className="text-faint">&ndash;</span> {fmtShort(to)}
            </>
          )}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-faint">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="card absolute top-full left-0 z-50 mt-2 flex w-[430px] overflow-hidden shadow-lg">
          <div className="flex w-32 shrink-0 flex-col gap-0.5 border-r border-line bg-canvas/60 p-2">
            {presets.map(([label, a, b]) => (
              <button
                key={label}
                onClick={() => {
                  setPendingStart(null);
                  onChange(a, b);
                  setOpen(false);
                }}
                className={`rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                  activePreset === label ? 'bg-navy text-white' : 'text-muted hover:bg-bluesoft hover:text-blueink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 p-3">
            <div className="mb-2 flex items-center justify-between">
              <button onClick={() => shiftMonth(-1)} className="rounded-md px-2 py-0.5 text-muted hover:bg-bluesoft hover:text-blueink">
                &larr;
              </button>
              <span className="text-sm font-bold text-navydeep">
                {MONTHS[vm - 1]} {vy}
              </span>
              <button onClick={() => shiftMonth(1)} className="rounded-md px-2 py-0.5 text-muted hover:bg-bluesoft hover:text-blueink">
                &rarr;
              </button>
            </div>
            <div className="grid grid-cols-7">
              {DOW.map((d) => (
                <span key={d} className="py-1 text-center text-[10px] font-semibold tracking-wide text-faint uppercase">
                  {d}
                </span>
              ))}
              {cells.map((day, i) => {
                if (!day) return <span key={i} />;
                const isStart = day === rangeStart;
                const isEnd = day === rangeEnd;
                const inRange = !pendingStart && day > from && day < to;
                const isToday = day === today;
                return (
                  <button
                    key={i}
                    onClick={() => pick(day)}
                    className={`relative m-0.5 flex h-7 items-center justify-center rounded-md text-xs font-medium transition-colors ${
                      isStart || isEnd
                        ? 'bg-navy text-white'
                        : inRange
                          ? 'bg-bluesoft text-blueink'
                          : 'text-ink hover:bg-bluesoft hover:text-blueink'
                    } ${isToday && !isStart && !isEnd ? 'ring-1 ring-blue ring-inset' : ''}`}
                  >
                    {Number(day.slice(8))}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 border-t border-line pt-2 text-[11px] text-faint">
              {pendingStart ? `Start ${fmtShort(pendingStart)} — now pick the end day` : 'Pick a start day, then an end day'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
