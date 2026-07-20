/**
 * All date-only values are 'YYYY-MM-DD' strings; all timestamps are naive
 * wall-clock strings 'YYYY-MM-DDTHH:mm:ss' in APP_TZ (America/Chicago).
 * The old sheet burned itself on script-vs-sheet timezone drift (sheetDate_()),
 * so nothing here ever parses a date-only string with `new Date(str)`.
 */

export const APP_TZ = process.env.APP_TZ || 'America/Chicago';

const ymdFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const tsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** Current date in APP_TZ as YYYY-MM-DD. */
export function todayInTz(): string {
  return ymdFmt.format(new Date());
}

/** Current wall-clock timestamp in APP_TZ as YYYY-MM-DDTHH:mm:ss. */
export function nowInTz(): string {
  const parts = Object.fromEntries(tsFmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}`;
}

/** Add n days to a YYYY-MM-DD string (calendar arithmetic, no TZ involved). */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Day of week name for a YYYY-MM-DD string. */
export function dayOfWeek(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return names[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/**
 * Parse a sheet-displayed date: 'M/d/yyyy', 'M/d/yy', or already 'YYYY-MM-DD'.
 * Two-digit years pivot to 2000s. Returns null for blank/unparseable.
 */
export function parseSheetDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return t;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let [, mo, d, y] = m;
  let year = Number(y);
  if (y.length <= 2) year += 2000;
  const month = Number(mo), day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Parse a sheet-displayed timestamp like '6/12/26 14:03' or '6/12/26 2:03 PM'
 * (attempt columns use 'm/d/yy h:mm am/pm'). Returns naive 'YYYY-MM-DDTHH:mm:ss' or null.
 */
export function parseSheetTimestamp(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|AM|PM)?$/);
  if (!m) {
    // Date-only fallback: midnight.
    const d = parseSheetDate(t);
    return d ? `${d}T00:00:00` : null;
  }
  const date = parseSheetDate(m[1]);
  if (!date) return null;
  let hour = Number(m[2]);
  const min = m[3];
  const sec = m[4] ?? '00';
  const ampm = m[5]?.toLowerCase();
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  return `${date}T${String(hour).padStart(2, '0')}:${min}:${sec}`;
}

/** Parse '3:14 PM' / '15:14' text to minutes since midnight, or null. */
export function parseTimeOfDay(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm|AM|PM)?/);
  if (!m) return null;
  let hour = Number(m[1]);
  const ampm = m[3]?.toLowerCase();
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  return hour * 60 + Number(m[2]);
}

/** Naive timestamp string -> minutes since epoch-like origin (for diffs only). */
function naiveMinutes(ts: string): number | null {
  const m = ts.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) / 60000;
}

/** Speed to lead in minutes: first attempt minus (date submitted + time submitted). */
export function speedToLeadMinutes(
  dateSubmitted: string | null,
  timeSubmitted: string | null,
  attempt1At: string | null,
): number | null {
  if (!dateSubmitted || !attempt1At) return null;
  const tod = parseTimeOfDay(timeSubmitted);
  if (tod == null) return null;
  const a = naiveMinutes(attempt1At);
  if (a == null) return null;
  const [y, m, d] = dateSubmitted.split('-').map(Number);
  const sub = Date.UTC(y, m - 1, d) / 60000 + tod;
  return Math.round((a - sub) * 10) / 10;
}

/** Compare helper: is a YYYY-MM-DD before another. */
export function ymdLt(a: string, b: string): boolean {
  return a < b;
}
