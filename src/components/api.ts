'use client';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  return body as T;
}

export interface BucketLead {
  id: number;
  name: string;
  status: string;
  phone: string;
  by: string;
  date: string;
}

export interface FreshLead extends BucketLead {
  dateSubmitted: string | null;
  timeSubmitted: string;
  attempted: boolean;
}

export interface AttemptedLead extends BucketLead {
  attempts: number;
  lastAttemptAt: string | null;
}

export interface Buckets {
  today: string;
  fresh: FreshLead[];
  attempted: AttemptedLead[];
  overdue: BucketLead[];
  dueToday: BucketLead[];
  next7: BucketLead[];
}

export interface LeadDetail {
  lead: {
    id: number;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    notes: string;
    campaignName: string;
    adSetName: string;
    adName: string;
    status: string;
    contactedBy: string;
    firstContactAt: string | null;
    firstContactBy: string;
    followUpDate: string | null;
    apptDate: string | null;
    apptTime: string;
    qualified: string | null;
    oneTimeValue: number;
    mrrValue: number;
    cashCollected: number;
  };
  attempts: { n: number; at: string | null }[];
  touches: { at: string; what: string; note: string; channel: string; by: string }[];
  statuses: string[];
}

export const CADENCE: Record<string, number> = {
  'Attempted - No Answer': 1,
  'Left Voicemail': 2,
  Contacted: 3,
  Nurture: 14,
};
export const CLOSED = ['Closed Won', 'Closed Lost', 'Not Interested', 'Bad Number'];

export function suggestDate(status: string, today: string): string {
  if (CLOSED.includes(status)) return '';
  const days = CADENCE[status] ?? 3;
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Soft-tinted chip classes per status, Cavenaugh palette. */
export function statusChip(status: string): string {
  if (status === 'Closed Won') return 'bg-greensoft text-greenink';
  if (status === 'Booked') return 'bg-bluesoft text-blueink';
  if (CLOSED.includes(status)) return 'bg-redsoft text-redink';
  if (status === 'New') return 'bg-ambersoft text-amberink';
  return 'bg-canvas text-muted';
}

export function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export function fmtPct(x: number | null): string {
  return x == null ? 'n/a' : `${Math.round(x * 100)}%`;
}
