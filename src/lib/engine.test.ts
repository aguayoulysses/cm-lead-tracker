import { describe, it, expect } from 'vitest';
import {
  applyStatus,
  applyExtraTouch,
  bucketize,
  kpiRowForOutcome,
  normalizeFollowUp,
  suggestFollowUpDate,
  EngineValidationError,
  type LeadState,
} from './engine';
import { addDays, parseSheetDate, parseSheetTimestamp, speedToLeadMinutes, dayOfWeek } from './dates';

const TODAY = '2026-07-20';
const NOW = '2026-07-20T10:30:00';

function lead(overrides: Partial<LeadState> = {}): LeadState {
  return {
    status: 'New',
    attempt1At: null,
    attempt2At: null,
    attempt3At: null,
    contactedBy: '',
    apptSet: false,
    apptDate: null,
    apptTime: '',
    followUpNeeded: true,
    followUpDate: TODAY,
    dateClosed: null,
    qualified: null,
    ...overrides,
  };
}

describe('suggestFollowUpDate cadence', () => {
  it('matches the sheet cadence table', () => {
    expect(suggestFollowUpDate('Attempted - No Answer', TODAY)).toBe('2026-07-21');
    expect(suggestFollowUpDate('Left Voicemail', TODAY)).toBe('2026-07-22');
    expect(suggestFollowUpDate('Contacted', TODAY)).toBe('2026-07-23');
    expect(suggestFollowUpDate('Nurture', TODAY)).toBe('2026-08-03');
  });
  it('defaults unknown open statuses to +3', () => {
    expect(suggestFollowUpDate('Some Custom Status', TODAY)).toBe('2026-07-23');
  });
  it('returns null for closed statuses', () => {
    for (const s of ['Closed Won', 'Closed Lost', 'Not Interested', 'Bad Number']) {
      expect(suggestFollowUpDate(s, TODAY)).toBeNull();
    }
  });
});

describe('applyStatus', () => {
  it('requires a status', () => {
    expect(() => applyStatus(lead(), { status: '  ' }, NOW, TODAY)).toThrow(EngineValidationError);
  });

  it('stamps the first empty attempt slot', () => {
    const { patch: p1 } = applyStatus(lead(), { status: 'Contacted' }, NOW, TODAY);
    expect(p1.attempt1At).toBe(NOW);
    const { patch: p2 } = applyStatus(lead({ attempt1At: 'x' }), { status: 'Contacted' }, NOW, TODAY);
    expect(p2.attempt1At).toBeUndefined();
    expect(p2.attempt2At).toBe(NOW);
    const { patch: p3 } = applyStatus(lead({ attempt1At: 'x', attempt2At: 'y', attempt3At: 'z' }), { status: 'Contacted' }, NOW, TODAY);
    expect(p3.attempt1At).toBeUndefined();
    expect(p3.attempt2At).toBeUndefined();
    expect(p3.attempt3At).toBeUndefined();
  });

  it('schedules the cadence follow-up for open statuses', () => {
    const { patch, touch } = applyStatus(lead(), { status: 'Left Voicemail' }, NOW, TODAY);
    expect(patch.followUpNeeded).toBe(true);
    expect(patch.followUpDate).toBe('2026-07-22');
    expect(touch.nextFollowUp).toBe('2026-07-22');
    expect(touch.what).toBe('Left Voicemail');
  });

  it('honors an explicit next date', () => {
    const { patch } = applyStatus(lead(), { status: 'Contacted', nextDate: '2026-08-01' }, NOW, TODAY);
    expect(patch.followUpDate).toBe('2026-08-01');
  });

  it('clears follow-up and stamps dateClosed on closed statuses', () => {
    const { patch } = applyStatus(lead(), { status: 'Closed Won' }, NOW, TODAY);
    expect(patch.followUpNeeded).toBe(false);
    expect(patch.followUpDate).toBeNull();
    expect(patch.dateClosed).toBe(TODAY);
    const { patch: p2 } = applyStatus(lead(), { status: 'Not Interested' }, NOW, TODAY);
    expect(p2.dateClosed).toBeUndefined();
    expect(p2.followUpNeeded).toBe(false);
  });

  it('Booked requires appt date AND time', () => {
    expect(() => applyStatus(lead(), { status: 'Booked', apptDate: '2026-07-25' }, NOW, TODAY)).toThrow(
      'Booked needs an appointment date AND time.',
    );
    expect(() => applyStatus(lead(), { status: 'Booked', apptTime: '3:00 PM' }, NOW, TODAY)).toThrow();
    const { patch } = applyStatus(lead(), { status: 'Booked', apptDate: '2026-07-25', apptTime: '3:00 PM' }, NOW, TODAY);
    expect(patch.apptSet).toBe(true);
    expect(patch.apptDate).toBe('2026-07-25');
    expect(patch.apptTime).toBe('3:00 PM');
    expect(patch.followUpDate).toBe('2026-07-25');
    expect(patch.followUpNeeded).toBe(true);
  });

  it('Booked falls back to appt already on the lead', () => {
    const { patch } = applyStatus(lead({ apptDate: '2026-07-30', apptTime: '1:00 PM' }), { status: 'Booked' }, NOW, TODAY);
    expect(patch.followUpDate).toBe('2026-07-30');
  });

  it('writes qualified only for Yes/No', () => {
    expect(applyStatus(lead(), { status: 'Contacted', qualified: 'Yes' }, NOW, TODAY).patch.qualified).toBe('Yes');
    expect(applyStatus(lead(), { status: 'Contacted', qualified: '' }, NOW, TODAY).patch.qualified).toBeUndefined();
  });

  it('auto-assigns the acting closer on unowned leads for KPI-worthy outcomes', () => {
    const { patch, touch } = applyStatus(lead(), { status: 'Contacted', channel: 'Call', actingCloser: 'Jack' }, NOW, TODAY);
    expect(patch.contactedBy).toBe('Jack');
    expect(touch.by).toBe('Jack');
    // Not for Text without callTaken:
    const r2 = applyStatus(lead(), { status: 'Contacted', channel: 'Text', actingCloser: 'Jack' }, NOW, TODAY);
    expect(r2.patch.contactedBy).toBeUndefined();
    // Never overwrites an owner:
    const r3 = applyStatus(lead({ contactedBy: 'Cody' }), { status: 'Contacted', channel: 'Call', actingCloser: 'Jack' }, NOW, TODAY);
    expect(r3.patch.contactedBy).toBeUndefined();
    expect(r3.touch.by).toBe('Cody');
    // 'All' is not a closer:
    const r4 = applyStatus(lead(), { status: 'Contacted', channel: 'Call', actingCloser: 'All' }, NOW, TODAY);
    expect(r4.patch.contactedBy).toBeUndefined();
  });
});

describe('kpiRowForOutcome', () => {
  it('call picked up + taken', () => {
    expect(kpiRowForOutcome({ status: 'x', channel: 'Call', callTaken: true, pickedUp: true })).toEqual({
      salesCallsTaken: 1,
      dials: 1,
      pickups: 1,
    });
  });
  it('call no pickup', () => {
    expect(kpiRowForOutcome({ status: 'x', channel: 'Call', callTaken: false, pickedUp: false })).toEqual({
      salesCallsTaken: 0,
      dials: 1,
      pickups: 0,
    });
  });
  it('text with call taken counts the call but no dial', () => {
    expect(kpiRowForOutcome({ status: 'x', channel: 'Text', callTaken: true })).toEqual({
      salesCallsTaken: 1,
      dials: 0,
      pickups: 0,
    });
  });
  it('text alone writes nothing', () => {
    expect(kpiRowForOutcome({ status: 'x', channel: 'Text' })).toBeNull();
    expect(kpiRowForOutcome({ status: 'x', channel: 'DM', pickedUp: true })).toBeNull();
  });
});

describe('applyExtraTouch', () => {
  it('reschedules open leads by cadence', () => {
    const { patch, touch } = applyExtraTouch(lead({ status: 'Left Voicemail' }), 'tried again', NOW, TODAY);
    expect(patch.followUpDate).toBe('2026-07-22');
    expect(touch.what).toBe('Extra touch (Left Voicemail)');
    expect(touch.note).toBe('tried again');
  });
  it('leaves closed leads alone', () => {
    const { patch, touch } = applyExtraTouch(lead({ status: 'Closed Won', followUpDate: null }), '', NOW, TODAY);
    expect(patch.followUpDate).toBeUndefined();
    expect(touch.what).toBe('Extra touch (Closed Won)');
  });
});

describe('bucketize', () => {
  it('splits and sorts', () => {
    const mk = (fu: string | null, needed = true) => ({ followUpNeeded: needed, followUpDate: fu });
    const r = bucketize(
      [mk('2026-07-18'), mk('2026-07-20'), mk('2026-07-19'), mk('2026-07-26'), mk('2026-07-27'), mk('2026-07-21'), mk(null), mk('2026-07-15', false)],
      TODAY,
    );
    expect(r.overdue.map((x) => x.followUpDate)).toEqual(['2026-07-18', '2026-07-19']);
    expect(r.dueToday.length).toBe(1);
    expect(r.next7.map((x) => x.followUpDate)).toEqual(['2026-07-21', '2026-07-26']);
  });
});

describe('normalizeFollowUp', () => {
  it('closes out closed statuses', () => {
    expect(normalizeFollowUp({ status: 'Closed Lost', followUpDate: '2026-07-25' }, TODAY)).toEqual({
      followUpNeeded: false,
      followUpDate: null,
    });
  });
  it('pins missing/stale/today dates to today, keeps future', () => {
    expect(normalizeFollowUp({ status: 'Contacted', followUpDate: null }, TODAY)!.followUpDate).toBe(TODAY);
    expect(normalizeFollowUp({ status: 'Contacted', followUpDate: '2026-07-01' }, TODAY)!.followUpDate).toBe(TODAY);
    expect(normalizeFollowUp({ status: 'Contacted', followUpDate: TODAY }, TODAY)!.followUpDate).toBe(TODAY);
    expect(normalizeFollowUp({ status: 'Contacted', followUpDate: '2026-07-25' }, TODAY)!.followUpDate).toBe('2026-07-25');
  });
  it('skips statusless rows', () => {
    expect(normalizeFollowUp({ status: '', followUpDate: null }, TODAY)).toBeNull();
  });
});

describe('dates', () => {
  it('addDays crosses months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-07-20', 14)).toBe('2026-08-03');
  });
  it('parseSheetDate handles sheet formats', () => {
    expect(parseSheetDate('6/11/2026')).toBe('2026-06-11');
    expect(parseSheetDate('6/1/26')).toBe('2026-06-01');
    expect(parseSheetDate('2026-06-11')).toBe('2026-06-11');
    expect(parseSheetDate('')).toBeNull();
    expect(parseSheetDate('garbage')).toBeNull();
  });
  it('parseSheetTimestamp handles attempt format', () => {
    expect(parseSheetTimestamp('6/12/26 2:03 PM')).toBe('2026-06-12T14:03:00');
    expect(parseSheetTimestamp('6/12/26 12:03 AM')).toBe('2026-06-12T00:03:00');
    expect(parseSheetTimestamp('6/12/2026 14:03:22')).toBe('2026-06-12T14:03:22');
    expect(parseSheetTimestamp('6/12/2026')).toBe('2026-06-12T00:00:00');
  });
  it('speedToLeadMinutes', () => {
    expect(speedToLeadMinutes('2026-06-12', '2:00 PM', '2026-06-12T14:30:00')).toBe(30);
    expect(speedToLeadMinutes('2026-06-12', '', '2026-06-12T14:30:00')).toBeNull();
  });
  it('dayOfWeek', () => {
    expect(dayOfWeek('2026-07-20')).toBe('Monday');
  });
});
