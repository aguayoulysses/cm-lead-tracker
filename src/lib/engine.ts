import { addDays } from './dates';

/**
 * Pure business rules ported 1:1 from the sheet's Apps Script engine
 * (applyStatus_, panelSave, logSelectedTouch, panelGetData, normalizeFollowUps_).
 * No clock or DB access: `now` and `today` are always passed in.
 */

export const FOLLOWUP_DAYS: Record<string, number> = {
  'Attempted - No Answer': 1,
  'Left Voicemail': 2,
  Contacted: 3,
  Nurture: 14,
};
export const DEFAULT_FOLLOWUP_DAYS = 3;

export const CLOSED_STATUSES = ['Closed Won', 'Closed Lost', 'Not Interested', 'Bad Number'];

export const CHANNELS = ['Call', 'Text', 'Email', 'DM'] as const;
export type Channel = (typeof CHANNELS)[number];

export class EngineValidationError extends Error {}

export interface LeadState {
  status: string;
  attempt1At: string | null;
  attempt2At: string | null;
  attempt3At: string | null;
  contactedBy: string;
  apptSet: boolean;
  apptDate: string | null;
  apptTime: string;
  followUpNeeded: boolean;
  followUpDate: string | null;
  dateClosed: string | null;
  qualified: string | null;
  oneTimeValue: number;
  mrrValue: number;
  cashCollected: number;
}

export interface OutcomeInput {
  status: string;
  nextDate?: string | null; // YYYY-MM-DD override for the follow-up date
  note?: string;
  apptDate?: string | null;
  apptTime?: string | null;
  qualified?: string | null; // 'Yes' | 'No' | '' (leave as is)
  channel?: string;
  callTaken?: boolean;
  pickedUp?: boolean;
  actingCloser?: string; // panel's "me" closer for auto-assign
  oneTimeValue?: number | null; // required (with mrrValue) when status is Closed Won
  mrrValue?: number | null;
  cashCollected?: number | null;
}

export interface LeadPatch {
  status: string;
  attempt1At?: string;
  attempt2At?: string;
  attempt3At?: string;
  contactedBy?: string;
  apptSet?: boolean;
  apptDate?: string | null;
  apptTime?: string;
  followUpNeeded: boolean;
  followUpDate: string | null;
  dateClosed?: string;
  qualified?: string;
  oneTimeValue?: number;
  mrrValue?: number;
  cashCollected?: number;
}

export interface TouchRecord {
  at: string;
  what: string;
  by: string;
  nextFollowUp: string | null;
  note: string;
  channel: string;
}

export interface KpiRow {
  salesCallsTaken: number;
  dials: number;
  pickups: number;
}

export function isClosed(status: string): boolean {
  return CLOSED_STATUSES.includes(status);
}

/** Panel's suggestDate(): null for closed statuses, else today + cadence. */
export function suggestFollowUpDate(status: string, today: string): string | null {
  if (isClosed(status)) return null;
  const days = FOLLOWUP_DAYS[status] ?? DEFAULT_FOLLOWUP_DAYS;
  return addDays(today, days);
}

/**
 * applyStatus_ + panelSave merged. Returns the field patch and the touch to log.
 * Throws EngineValidationError on the sheet's hard errors.
 */
export function applyStatus(
  lead: LeadState,
  input: OutcomeInput,
  now: string,
  today: string,
): { patch: LeadPatch; touch: TouchRecord } {
  const status = String(input.status || '').trim();
  if (!status) throw new EngineValidationError('Pick an outcome first.');

  const patch: LeadPatch = {
    status,
    followUpNeeded: lead.followUpNeeded,
    followUpDate: lead.followUpDate,
  };

  // Booked validation happens before anything else (panelSave line 635-641).
  let nextDateStr = input.nextDate || null;
  if (status === 'Booked') {
    const apptDate = input.apptDate || lead.apptDate;
    const apptTime = String(input.apptTime ?? lead.apptTime ?? '').trim();
    if (!apptDate || !apptTime) {
      throw new EngineValidationError('Booked needs an appointment date AND time.');
    }
    patch.apptDate = apptDate;
    patch.apptTime = apptTime;
    nextDateStr = apptDate;
  }

  // Stamp the first empty attempt slot with now (applyStatus_ line 527-531).
  if (!lead.attempt1At) patch.attempt1At = now;
  else if (!lead.attempt2At) patch.attempt2At = now;
  else if (!lead.attempt3At) patch.attempt3At = now;

  if (isClosed(status)) {
    patch.followUpNeeded = false;
    patch.followUpDate = null;
  } else if (status === 'Booked') {
    patch.apptSet = true;
    patch.followUpNeeded = true;
    patch.followUpDate = nextDateStr;
  } else {
    patch.followUpNeeded = true;
    patch.followUpDate = nextDateStr ?? suggestFollowUpDate(status, today);
  }

  // Sheet stamps (overwrites) Date Closed on every won/lost save.
  if (status === 'Closed Won' || status === 'Closed Lost') {
    patch.dateClosed = today;
  }

  // Closed Won requires the deal numbers — stats starve without them.
  if (status === 'Closed Won') {
    const ot = input.oneTimeValue ?? null;
    const mr = input.mrrValue ?? null;
    const alreadyHasDeal = lead.oneTimeValue > 0 || lead.mrrValue > 0;
    if ((ot == null || Number.isNaN(ot) || mr == null || Number.isNaN(mr)) && !alreadyHasDeal) {
      throw new EngineValidationError('Closed Won needs One-Time Value and MRR Value — enter 0 if none.');
    }
    if (ot != null && !Number.isNaN(ot)) patch.oneTimeValue = ot;
    if (mr != null && !Number.isNaN(mr)) patch.mrrValue = mr;
    if (input.cashCollected != null && !Number.isNaN(input.cashCollected)) {
      patch.cashCollected = input.cashCollected;
    }
  }

  if (input.qualified === 'Yes' || input.qualified === 'No') {
    patch.qualified = input.qualified;
  }

  // Auto-claim: whoever logs the first outcome on an unowned lead becomes its
  // closer (broadened from the sheet, which only claimed on Call outcomes).
  let by = lead.contactedBy;
  if (!by && input.actingCloser && input.actingCloser !== 'All') {
    patch.contactedBy = input.actingCloser;
    by = input.actingCloser;
  }

  const touch: TouchRecord = {
    at: now,
    what: status,
    by,
    nextFollowUp: patch.followUpDate,
    note: input.note || '',
    channel: input.channel || '',
  };

  return { patch, touch };
}

/** panelSave's KPI condition: a row is written iff callTaken || channel === 'Call'. */
export function kpiRowForOutcome(input: OutcomeInput): KpiRow | null {
  const isCall = input.channel === 'Call';
  if (!input.callTaken && !isCall) return null;
  return {
    salesCallsTaken: input.callTaken ? 1 : 0,
    dials: isCall ? 1 : 0,
    pickups: isCall && input.pickedUp ? 1 : 0,
  };
}

/** logSelectedTouch: extra 4th/5th/... touch without changing status. */
export function applyExtraTouch(
  lead: LeadState,
  note: string,
  now: string,
  today: string,
): { patch: Partial<LeadPatch>; touch: TouchRecord } {
  const status = String(lead.status || '').trim();
  const patch: Partial<LeadPatch> = {};
  let nextFollowUp = lead.followUpDate;
  if (!isClosed(status)) {
    const days = FOLLOWUP_DAYS[status] ?? DEFAULT_FOLLOWUP_DAYS;
    patch.followUpNeeded = true;
    patch.followUpDate = addDays(today, days);
    nextFollowUp = patch.followUpDate;
  }
  const touch: TouchRecord = {
    at: now,
    what: `Extra touch (${status || 'no status'})`,
    by: lead.contactedBy,
    nextFollowUp,
    note: note || '',
    channel: '',
  };
  return { patch, touch };
}

export interface BucketItem {
  id: number;
  name: string;
  status: string;
  date: string;
  by: string;
  phone: string;
}

/** panelGetData bucketing: overdue / due today / next 7 days. */
export function bucketize<T extends { followUpNeeded: boolean; followUpDate: string | null }>(
  leads: T[],
  today: string,
): { overdue: T[]; dueToday: T[]; next7: T[] } {
  const overdue: T[] = [];
  const dueToday: T[] = [];
  const next7: T[] = [];
  const weekEnd = addDays(today, 6);
  for (const l of leads) {
    if (!l.followUpNeeded || !l.followUpDate) continue;
    if (l.followUpDate < today) overdue.push(l);
    else if (l.followUpDate === today) dueToday.push(l);
    else if (l.followUpDate <= weekEnd) next7.push(l);
  }
  const byDate = (a: T, b: T) => (a.followUpDate! < b.followUpDate! ? -1 : 1);
  overdue.sort(byDate);
  next7.sort(byDate);
  return { overdue, dueToday, next7 };
}

/**
 * normalizeFollowUps_: import/repair invariant. Closed leads lose their
 * follow-up; open leads with a missing or non-future date get today.
 */
export function normalizeFollowUp(
  lead: Pick<LeadState, 'status' | 'followUpDate'>,
  today: string,
): { followUpNeeded: boolean; followUpDate: string | null } | null {
  const st = String(lead.status || '').trim();
  if (!st) return null; // sheet skips rows with no status
  if (isClosed(st)) return { followUpNeeded: false, followUpDate: null };
  const tomorrow = addDays(today, 1);
  const cur = lead.followUpDate;
  if (!cur || cur < tomorrow) {
    // Anything missing, stale, or today gets pinned to today (sheet line 269).
    return { followUpNeeded: true, followUpDate: today };
  }
  return { followUpNeeded: true, followUpDate: cur };
}
