import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, isNotNull, lte, ne, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { leads } from '@/db/schema';
import { todayInTz } from '@/lib/dates';

interface DayEntry {
  followUps: { leadId: number; name: string; status: string; phone: string }[];
  appts: { leadId: number; name: string; time: string; status: string; phone: string }[];
}

// Month grid data: follow-ups (open leads) and appointments (any lead, matching
// the sheet's rebuildCalendarGrid_ which shows appts regardless of status).
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month') || todayInTz().slice(0, 7);
  const closer = req.nextUrl.searchParams.get('closer') || 'All';
  const from = `${month}-01`;
  const to = `${month}-31`;
  const closerCond = closer !== 'All' ? [eq(leads.contactedBy, closer)] : [];

  const rows = await db
    .select({
      id: leads.id,
      firstName: leads.firstName,
      lastName: leads.lastName,
      status: leads.status,
      phone: leads.phone,
      followUpNeeded: leads.followUpNeeded,
      followUpDate: leads.followUpDate,
      apptDate: leads.apptDate,
      apptTime: leads.apptTime,
    })
    .from(leads)
    .where(
      and(
        or(
          // New leads live in the open pool on the Work screen, not here.
          and(
            eq(leads.followUpNeeded, true),
            ne(leads.status, 'New'),
            isNotNull(leads.followUpDate),
            gte(leads.followUpDate, from),
            lte(leads.followUpDate, to),
          ),
          and(isNotNull(leads.apptDate), gte(leads.apptDate, from), lte(leads.apptDate, to)),
        ),
        ...closerCond,
      ),
    );

  const days: Record<string, DayEntry> = {};
  const entry = (d: string) => (days[d] ??= { followUps: [], appts: [] });
  for (const l of rows) {
    const name = `${l.firstName} ${l.lastName}`.trim();
    if (l.followUpNeeded && l.followUpDate && l.followUpDate >= from && l.followUpDate <= to) {
      entry(l.followUpDate).followUps.push({ leadId: l.id, name, status: l.status, phone: l.phone });
    }
    if (l.apptDate && l.apptDate >= from && l.apptDate <= to) {
      entry(l.apptDate).appts.push({ leadId: l.id, name, time: l.apptTime, status: l.status, phone: l.phone });
    }
  }
  return NextResponse.json({ month, today: todayInTz(), days });
}
