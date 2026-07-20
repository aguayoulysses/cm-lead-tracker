import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { kpiLog, leads, touches } from '@/db/schema';
import { addDays, nowInTz, todayInTz, dayOfWeek } from './dates';
import {
  applyExtraTouch,
  applyStatus,
  kpiRowForOutcome,
  type OutcomeInput,
} from './engine';

export class NotFoundError extends Error {}

async function getLeadOrThrow(leadId: number) {
  const row = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!row) throw new NotFoundError(`Lead ${leadId} not found`);
  return row;
}

/** The full outcome save: engine patch + touch + optional KPI row, one transaction. */
export async function logOutcome(leadId: number, input: OutcomeInput) {
  const lead = await getLeadOrThrow(leadId);
  const now = nowInTz();
  const today = todayInTz();

  const { patch, touch } = applyStatus(lead, input, now, today);
  const kpi = kpiRowForOutcome(input);
  // Dials/calls credit whoever did the work, even when the lead is unowned.
  const actor = input.actingCloser && input.actingCloser !== 'All' ? input.actingCloser : '';
  const closerForKpi = actor || patch.contactedBy || lead.contactedBy;

  await db.transaction(async (tx) => {
    await tx.update(leads).set({ ...patch, updatedAt: now }).where(eq(leads.id, leadId));
    await tx.insert(touches).values({
      leadId,
      leadNameSnapshot: `${lead.firstName} ${lead.lastName}`.trim(),
      phoneSnapshot: lead.phone,
      at: touch.at,
      what: touch.what,
      by: touch.by,
      nextFollowUp: touch.nextFollowUp,
      note: touch.note,
      channel: touch.channel,
      createdAt: now,
    });
    if (kpi) {
      await tx.insert(kpiLog).values({
        date: today,
        closer: closerForKpi,
        salesCallsTaken: kpi.salesCallsTaken,
        dials: kpi.dials,
        pickups: kpi.pickups,
        leadId,
        createdAt: now,
      });
    }
  });

  return getLeadOrThrow(leadId);
}

/** Extra 4th/5th/... touch without a status change. */
export async function logExtraTouch(leadId: number, note: string) {
  const lead = await getLeadOrThrow(leadId);
  const now = nowInTz();
  const today = todayInTz();
  const { patch, touch } = applyExtraTouch(lead, note, now, today);

  await db.transaction(async (tx) => {
    if (Object.keys(patch).length > 0) {
      await tx.update(leads).set({ ...patch, updatedAt: now }).where(eq(leads.id, leadId));
    }
    await tx.insert(touches).values({
      leadId,
      leadNameSnapshot: `${lead.firstName} ${lead.lastName}`.trim(),
      phoneSnapshot: lead.phone,
      at: touch.at,
      what: touch.what,
      by: touch.by,
      nextFollowUp: touch.nextFollowUp,
      note: touch.note,
      channel: touch.channel,
      createdAt: now,
    });
  });

  return getLeadOrThrow(leadId);
}

/** End-of-day report: one EOD row per closer per day (upsert semantics). */
export async function saveEod(closer: string, noShows: number, reschedules: number) {
  const now = nowInTz();
  const today = todayInTz();
  const existing = await db.query.kpiLog.findFirst({
    where: and(eq(kpiLog.date, today), eq(kpiLog.closer, closer), eq(kpiLog.marker, 'EOD')),
  });
  if (existing) {
    await db
      .update(kpiLog)
      .set({ noShows, reschedules })
      .where(eq(kpiLog.id, existing.id));
    return existing.id;
  }
  const inserted = await db
    .insert(kpiLog)
    .values({ date: today, closer, noShows, reschedules, marker: 'EOD', createdAt: now })
    .returning({ id: kpiLog.id });
  return inserted[0].id;
}

export interface NewLeadInput {
  firstName: string;
  lastName?: string;
  phone?: string;
  email?: string;
  notes?: string;
  dateSubmitted?: string | null;
  timeSubmitted?: string;
  leadSource?: string;
  leadType?: string;
  serviceInterest?: string;
  campaignName?: string;
  adSetName?: string;
  adName?: string;
  externalId?: string | null;
  source: 'manual' | 'webhook';
}

/** New lead: status New, due today — every open lead always has a follow-up. */
export async function createLead(input: NewLeadInput) {
  const now = nowInTz();
  const today = todayInTz();
  const dateSubmitted = input.dateSubmitted || today;
  const inserted = await db
    .insert(leads)
    .values({
      source: input.source,
      externalId: input.externalId || null,
      firstName: input.firstName,
      lastName: input.lastName ?? '',
      phone: input.phone ?? '',
      email: input.email ?? '',
      notes: input.notes ?? '',
      dateSubmitted,
      timeSubmitted: input.timeSubmitted ?? '',
      dayOfWeek: dayOfWeek(dateSubmitted),
      leadSource: input.leadSource ?? '',
      leadType: input.leadType ?? '',
      serviceInterest: input.serviceInterest ?? '',
      campaignName: input.campaignName ?? '',
      adSetName: input.adSetName ?? '',
      adName: input.adName ?? '',
      status: 'New',
      followUpNeeded: true,
      followUpDate: today,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: leads.id });
  return inserted[0].id;
}

/** Appointment no-show: KPI no-show for the closer, chase again tomorrow. */
export async function logNoShow(leadId: number, actor?: string) {
  const lead = await getLeadOrThrow(leadId);
  const now = nowInTz();
  const today = todayInTz();
  const by = actor && actor !== 'All' ? actor : lead.contactedBy;
  const nextDate = addDays(today, 1);
  await db.transaction(async (tx) => {
    await tx
      .update(leads)
      .set({ followUpNeeded: true, followUpDate: nextDate, updatedAt: now })
      .where(eq(leads.id, leadId));
    await tx.insert(touches).values({
      leadId,
      leadNameSnapshot: `${lead.firstName} ${lead.lastName}`.trim(),
      phoneSnapshot: lead.phone,
      at: now,
      what: 'No-show',
      by,
      nextFollowUp: nextDate,
      note: `Missed appointment ${lead.apptDate ?? ''} ${lead.apptTime ?? ''}`.trim(),
      channel: '',
      createdAt: now,
    });
    await tx.insert(kpiLog).values({ date: today, closer: by, noShows: 1, leadId, createdAt: now });
  });
  return getLeadOrThrow(leadId);
}

/** Appointment rescheduled: move the appointment, follow-up rides along. */
export async function rescheduleAppt(leadId: number, newDate: string, newTime: string, actor?: string) {
  const lead = await getLeadOrThrow(leadId);
  const now = nowInTz();
  const today = todayInTz();
  const by = actor && actor !== 'All' ? actor : lead.contactedBy;
  await db.transaction(async (tx) => {
    await tx
      .update(leads)
      .set({
        apptSet: true,
        apptDate: newDate,
        apptTime: newTime,
        followUpNeeded: true,
        followUpDate: newDate,
        updatedAt: now,
      })
      .where(eq(leads.id, leadId));
    await tx.insert(touches).values({
      leadId,
      leadNameSnapshot: `${lead.firstName} ${lead.lastName}`.trim(),
      phoneSnapshot: lead.phone,
      at: now,
      what: 'Rescheduled',
      by,
      nextFollowUp: newDate,
      note: `Appointment moved to ${newDate} ${newTime}`,
      channel: '',
      createdAt: now,
    });
    await tx.insert(kpiLog).values({ date: today, closer: by, reschedules: 1, leadId, createdAt: now });
  });
  return getLeadOrThrow(leadId);
}

/** Update the deal numbers on any lead, logged as a touch for the paper trail. */
export async function updateDeal(
  leadId: number,
  deal: { oneTimeValue: number; mrrValue: number; cashCollected: number },
  actor?: string,
) {
  const lead = await getLeadOrThrow(leadId);
  const now = nowInTz();
  await db.transaction(async (tx) => {
    await tx
      .update(leads)
      .set({
        oneTimeValue: deal.oneTimeValue,
        mrrValue: deal.mrrValue,
        cashCollected: deal.cashCollected,
        updatedAt: now,
      })
      .where(eq(leads.id, leadId));
    await tx.insert(touches).values({
      leadId,
      leadNameSnapshot: `${lead.firstName} ${lead.lastName}`.trim(),
      phoneSnapshot: lead.phone,
      at: now,
      what: 'Deal updated',
      by: actor && actor !== 'All' ? actor : lead.contactedBy,
      nextFollowUp: lead.followUpDate,
      note: `1x $${deal.oneTimeValue} · MRR $${deal.mrrValue}/mo · cash collected $${deal.cashCollected}`,
      channel: '',
      createdAt: now,
    });
  });
  return getLeadOrThrow(leadId);
}

/** Lead card payload: lead + attempts + recent touches. */
export async function getLeadCard(leadId: number) {
  const lead = await getLeadOrThrow(leadId);
  const recent = await db.query.touches.findMany({
    where: eq(touches.leadId, leadId),
    orderBy: [desc(touches.at)],
    limit: 5,
  });
  const attempts = [lead.attempt1At, lead.attempt2At, lead.attempt3At]
    .map((at, i) => ({ n: i + 1, at }))
    .filter((a) => a.at);
  return { lead, attempts, touches: recent };
}
